import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const uiRoot = resolve(scriptDir, '..');
const repoRoot = resolve(uiRoot, '..');
const serverRoot = resolve(repoRoot, 'server');

const host = process.env.SMOKE_HOST ?? '127.0.0.1';
const serverPort = process.env.SMOKE_SERVER_PORT ?? '8799';
const uiPort = process.env.SMOKE_UI_PORT ?? '5179';
const serverUrl = process.env.SMOKE_SERVER_URL ?? `http://${host}:${serverPort}`;
const uiUrl = process.env.SMOKE_URL ?? `http://${host}:${uiPort}/`;
const verbose = process.env.SMOKE_VERBOSE === '1';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const serverPython = resolveServerPython();

if (process.env.SMOKE_URL) {
  await runSmokeTarget({
    SMOKE_URL: uiUrl,
    VITE_AGENT_SERVER_URL: process.env.VITE_AGENT_SERVER_URL ?? '',
  });
  process.exit(0);
}

const children = [];
let shuttingDown = false;

process.once('SIGINT', () => {
  void shutdown(130);
});
process.once('SIGTERM', () => {
  void shutdown(143);
});

try {
  spawnManaged(
    'server',
    serverPython,
    ['-m', 'server', '--host', host, '--port', serverPort],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        PYTHONPATH: joinPythonPath('src', process.env.PYTHONPATH),
      },
    },
  );
  await waitForHttp(`${serverUrl}/health`, 'server');

  spawnManaged(
    'vite',
    npmCommand,
    ['run', 'dev', '--', '--port', uiPort, '--host', host],
    {
      cwd: uiRoot,
      env: {
        ...process.env,
        VITE_AGENT_SERVER_URL: serverUrl,
      },
    },
  );
  await waitForHttp(uiUrl, 'ui');

  await runSmokeTarget({
    SMOKE_URL: uiUrl,
    VITE_AGENT_SERVER_URL: serverUrl,
  });
} finally {
  await stopChildren();
}

function resolveServerPython() {
  if (process.env.SMOKE_SERVER_PYTHON) {
    return process.env.SMOKE_SERVER_PYTHON;
  }

  const venvPython =
    process.platform === 'win32'
      ? resolve(serverRoot, '.venv', 'Scripts', 'python.exe')
      : resolve(serverRoot, '.venv', 'bin', 'python');

  return existsSync(venvPython) ? venvPython : 'python3';
}

function spawnManaged(label, command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];

  children.push({ child, label, logs });

  child.stdout.on('data', (chunk) => captureProcessOutput(label, logs, chunk));
  child.stderr.on('data', (chunk) => captureProcessOutput(label, logs, chunk));
  child.on('exit', (code, signal) => {
    if (!shuttingDown && code !== 0) {
      console.error(formatProcessFailure(label, code, signal, logs));
    }
  });

  return child;
}

function captureProcessOutput(label, logs, chunk) {
  const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
  logs.push(...lines);

  while (logs.length > 80) {
    logs.shift();
  }

  if (verbose) {
    for (const line of lines) {
      console.log(`[${label}] ${line}`);
    }
  }
}

async function waitForHttp(url, label) {
  const deadline = Date.now() + readTimeoutMs();
  let lastError;

  while (Date.now() < deadline) {
    const exitedProcess = children.find(({ child }) => child.exitCode !== null);

    if (exitedProcess) {
      throw new Error(formatProcessFailure(
        exitedProcess.label,
        exitedProcess.child.exitCode,
        exitedProcess.child.signalCode,
        exitedProcess.logs,
      ));
    }

    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }

      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(250);
  }

  throw new Error(`Timed out waiting for ${label} at ${url}: ${formatError(lastError)}`);
}

function readTimeoutMs() {
  const timeoutMs = Number(process.env.SMOKE_START_TIMEOUT_MS ?? '30000');

  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
}

function runSmokeTarget(extraEnv) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, ['scripts/smoke.mjs'], {
      cwd: uiRoot,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: 'inherit',
    });

    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`smoke target failed with ${signal ?? `exit code ${code}`}`));
    });
    child.on('error', reject);
  });
}

async function stopChildren() {
  shuttingDown = true;
  const activeChildren = children.filter(({ child }) => child.exitCode === null && child.signalCode === null);

  for (const { child } of activeChildren) {
    child.kill('SIGTERM');
  }

  await Promise.all(activeChildren.map(({ child }) => waitForExit(child, 2500)));
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise();
      return;
    }

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      resolvePromise();
    }, timeoutMs);

    child.once('exit', () => {
      clearTimeout(timeout);
      resolvePromise();
    });
  });
}

async function shutdown(exitCode) {
  await stopChildren();
  process.exit(exitCode);
}

function joinPythonPath(first, rest) {
  return rest ? `${first}${delimiter}${rest}` : first;
}

function formatProcessFailure(label, code, signal, logs) {
  const status = signal ?? `exit code ${code}`;
  const suffix = logs.length > 0 ? `\nLast ${label} output:\n${logs.join('\n')}` : '';

  return `${label} stopped unexpectedly with ${status}.${suffix}`;
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}
