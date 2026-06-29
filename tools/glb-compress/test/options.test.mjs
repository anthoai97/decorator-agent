import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGltfTransformArgs,
  formatCommand,
  parseArgs,
} from '../src/options.mjs';

test('builds a safe default compression command', () => {
  const config = parseArgs(['input sofa.glb', 'output sofa.glb']);

  assert.equal(config.inputPath, 'input sofa.glb');
  assert.equal(config.outputPath, 'output sofa.glb');
  assert.equal(config.dryRun, false);
  assert.deepEqual(buildGltfTransformArgs(config), [
    '--yes',
    '@gltf-transform/cli@4.4.0',
    'optimize',
    'input sofa.glb',
    'output sofa.glb',
    '--compress',
    'quantize',
    '--texture-compress',
    'webp',
    '--texture-size',
    '1024',
    '--weld',
    'true',
    '--simplify',
    'true',
    '--simplify-ratio',
    '0.35',
    '--simplify-error',
    '0.002',
  ]);
});

test('supports explicit optimization settings', () => {
  const config = parseArgs([
    'source.glb',
    'target.glb',
    '--ratio',
    '0.2',
    '--error',
    '0.01',
    '--compress',
    'draco',
    '--texture',
    'auto',
    '--texture-size',
    '2048',
    '--package-version',
    '4.3.0',
    '--dry-run',
  ]);

  assert.equal(config.dryRun, true);
  assert.equal(formatCommand('npx', buildGltfTransformArgs(config)), [
    'npx',
    '--yes',
    '@gltf-transform/cli@4.3.0',
    'optimize',
    'source.glb',
    'target.glb',
    '--compress',
    'draco',
    '--texture-compress',
    'auto',
    '--texture-size',
    '2048',
    '--weld',
    'true',
    '--simplify',
    'true',
    '--simplify-ratio',
    '0.2',
    '--simplify-error',
    '0.01',
  ].join(' '));
});

test('can disable simplification when only byte-size compression is wanted', () => {
  const config = parseArgs(['source.glb', 'target.glb', '--no-simplify']);

  assert.deepEqual(buildGltfTransformArgs(config).slice(-2), ['--simplify', 'false']);
});

test('validates missing paths and invalid ranges', () => {
  assert.throws(() => parseArgs(['source.glb']), /output path/i);
  assert.throws(() => parseArgs(['source.glb', 'target.glb', '--ratio', '1.5']), /ratio/i);
  assert.throws(() => parseArgs(['source.glb', 'target.glb', '--error', '-1']), /error/i);
  assert.throws(() => parseArgs(['source.glb', 'target.glb', '--compress', 'zip']), /compress/i);
});

