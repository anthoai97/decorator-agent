export const DEFAULT_PACKAGE_VERSION = '4.4.0';

const defaultConfig = {
  compress: 'quantize',
  texture: 'webp',
  textureSize: 1024,
  simplify: true,
  ratio: 0.35,
  error: 0.002,
  packageVersion: DEFAULT_PACKAGE_VERSION,
  dryRun: false,
  help: false,
};

const validCompressMethods = new Set(['draco', 'meshopt', 'quantize', 'false']);
const validTextureMethods = new Set(['ktx2', 'webp', 'avif', 'auto', 'false']);

export function parseArgs(argv) {
  const config = { ...defaultConfig };
  const paths = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '-h' || token === '--help') {
      config.help = true;
      continue;
    }

    if (token === '--dry-run') {
      config.dryRun = true;
      continue;
    }

    if (token === '--no-simplify') {
      config.simplify = false;
      continue;
    }

    if (token === '--ratio') {
      config.ratio = parseBoundedNumber(readValue(argv, index, token), 'ratio', 0, 1);
      index += 1;
      continue;
    }

    if (token === '--error') {
      config.error = parseBoundedNumber(readValue(argv, index, token), 'error', 0, Number.POSITIVE_INFINITY);
      index += 1;
      continue;
    }

    if (token === '--compress') {
      config.compress = parseEnum(readValue(argv, index, token), 'compress', validCompressMethods);
      index += 1;
      continue;
    }

    if (token === '--texture') {
      config.texture = parseEnum(readValue(argv, index, token), 'texture', validTextureMethods);
      index += 1;
      continue;
    }

    if (token === '--texture-size') {
      config.textureSize = parseInteger(readValue(argv, index, token), 'texture-size', 1);
      index += 1;
      continue;
    }

    if (token === '--package-version') {
      config.packageVersion = readValue(argv, index, token);
      index += 1;
      continue;
    }

    if (token.startsWith('-')) {
      throw new Error(`Unknown option: ${token}`);
    }

    paths.push(token);
  }

  if (config.help) {
    return config;
  }

  if (!paths[0]) {
    throw new Error('Missing input path.');
  }

  if (!paths[1]) {
    throw new Error('Missing output path.');
  }

  if (paths.length > 2) {
    throw new Error(`Unexpected extra path: ${paths[2]}`);
  }

  return {
    ...config,
    inputPath: paths[0],
    outputPath: paths[1],
  };
}

export function buildGltfTransformArgs(config) {
  const args = [
    '--yes',
    `@gltf-transform/cli@${config.packageVersion}`,
    'optimize',
    config.inputPath,
    config.outputPath,
    '--compress',
    config.compress,
    '--texture-compress',
    config.texture,
    '--texture-size',
    String(config.textureSize),
    '--weld',
    'true',
    '--simplify',
    String(config.simplify),
  ];

  if (config.simplify) {
    args.push(
      '--simplify-ratio',
      String(config.ratio),
      '--simplify-error',
      String(config.error),
    );
  }

  return args;
}

export function formatCommand(command, args) {
  return [command, ...args].map(shellQuote).join(' ');
}

export function usage() {
  return `Usage:
  node tools/glb-compress/bin/compress-glb.mjs <input.glb> <output.glb> [options]

Options:
  --ratio <0-1>              Vertex ratio to keep during simplification. Default: 0.35
  --error <number>           Simplification error tolerance. Default: 0.002
  --compress <method>        draco | meshopt | quantize | false. Default: quantize
  --texture <method>         ktx2 | webp | avif | auto | false. Default: webp
  --texture-size <pixels>    Max texture dimension. Default: 1024
  --no-simplify              Skip mesh simplification and only optimize bytes.
  --package-version <version> @gltf-transform/cli version. Default: ${DEFAULT_PACKAGE_VERSION}
  --dry-run                  Print the gltf-transform command without running it.
  -h, --help                 Show this help.
`;
}

function readValue(argv, index, option) {
  const value = argv[index + 1];

  if (!value || value.startsWith('-')) {
    throw new Error(`Missing value for ${option}.`);
  }

  return value;
}

function parseBoundedNumber(value, label, min, max) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be a number between ${min} and ${max}.`);
  }

  return parsed;
}

function parseInteger(value, label, min) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min) {
    throw new Error(`${label} must be an integer greater than or equal to ${min}.`);
  }

  return parsed;
}

function parseEnum(value, label, validValues) {
  if (!validValues.has(value)) {
    throw new Error(`${label} must be one of: ${Array.from(validValues).join(', ')}.`);
  }

  return value;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

