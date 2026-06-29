# Spec: Standalone GLB Compression Tool

## Objective

Create a standalone tool under `tools/` that compresses and simplifies large `.glb` / `.gltf` files before they are copied into the UI. The immediate use case is reducing the heavy sofa model so rendering and drag raycasting stay responsive.

## Tech Stack

- Node.js ESM.
- Node built-in `node:test` for local tool tests.
- `@gltf-transform/cli` executed through `npx` for GLB optimization.

## Commands

- Test tool: `cd tools/glb-compress && npm test`
- Dry run: `node tools/glb-compress/bin/compress-glb.mjs samples_artifact/3d/sofa-01.glb /tmp/sofa-01.optimized.glb --dry-run`
- Compress: `node tools/glb-compress/bin/compress-glb.mjs samples_artifact/3d/sofa-01.glb /tmp/sofa-01.optimized.glb`

## Project Structure

- `tools/glb-compress/bin/compress-glb.mjs` is the executable CLI.
- `tools/glb-compress/src/options.mjs` parses flags and builds the `gltf-transform optimize` invocation.
- `tools/glb-compress/test/options.test.mjs` covers argument parsing and generated commands.
- `tools/glb-compress/README.md` documents usage and library choices.

## Code Style

```js
const config = parseArgs(process.argv.slice(2));
const args = buildGltfTransformArgs(config);
await runCommand('npx', args);
```

Keep file IO and process spawning in the CLI entrypoint. Keep deterministic parsing and command construction in testable pure functions.

## Testing Strategy

Use small `node:test` tests for:

- default optimization flags,
- custom ratio/error/compression flags,
- validation of invalid ratios and missing output paths.

The test suite does not download or execute `@gltf-transform/cli`; runtime compression is a manual/tool execution step.

## Boundaries

- Always: write to an explicit output path and preserve the input file.
- Always: default to geometry simplification because file compression alone does not reduce triangle count after load.
- Ask first: changing UI loader decoder setup for Draco or Meshopt-only output.
- Never: overwrite source model files unless an explicit future `--overwrite` flag is designed.

## Success Criteria

- The tool builds a valid `gltf-transform optimize` command for a GLB input/output pair.
- Default output uses simplification, vertex welding, `quantize` geometry compression, WebP texture compression, and a 1024px texture cap.
- Users can override simplify ratio, error tolerance, compression method, texture method, and texture size.
- Tests pass without network access.
