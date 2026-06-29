#!/usr/bin/env node

import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';

import {
  buildGltfTransformArgs,
  formatCommand,
  parseArgs,
  usage,
} from '../src/options.mjs';

async function main() {
  let config;

  try {
    config = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('');
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  if (config.help) {
    console.log(usage());
    return;
  }

  const args = buildGltfTransformArgs(config);
  const commandText = formatCommand('npx', args);

  if (config.dryRun) {
    console.log(commandText);
    return;
  }

  const before = await fileSize(config.inputPath);
  console.log(`Compressing ${config.inputPath}`);
  console.log(commandText);
  await runCommand('npx', args);

  const after = await fileSize(config.outputPath);
  console.log(`Wrote ${config.outputPath}`);
  console.log(`Size: ${formatBytes(before)} -> ${formatBytes(after)} (${formatSavings(before, after)} smaller)`);
}

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function fileSize(path) {
  const stats = await stat(path);
  return stats.size;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatSavings(before, after) {
  if (before <= 0) {
    return '0.0%';
  }

  return `${(((before - after) / before) * 100).toFixed(1)}%`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

