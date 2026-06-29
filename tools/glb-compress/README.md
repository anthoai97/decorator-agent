# GLB Compression Tool

Standalone wrapper around `@gltf-transform/cli` for reducing large `.glb` and `.gltf`
assets before copying them into the UI.

## Why This Library

Recommended default: `@gltf-transform/cli`.

It gives one CLI with `inspect`, `optimize`, mesh simplification, vertex welding,
quantization, Draco, Meshopt, and texture compression. For this project, the important
piece is simplification: byte compression alone can make a file smaller, but the loaded
model may still have too many triangles for smooth pointer interaction.

Alternative: `gltfpack` from Meshoptimizer is also strong for aggressive size reduction,
but Meshopt-compressed output may require explicit loader decoder setup. This wrapper
defaults to `quantize` to keep output easier to load in Three.js while still supporting
`--compress meshopt` or `--compress draco` when the app has decoder support.

## Usage

From the repository root:

```bash
node tools/glb-compress/bin/compress-glb.mjs samples_artifact/3d/sofa-01.glb /tmp/sofa-01.optimized.glb
```

Dry run:

```bash
node tools/glb-compress/bin/compress-glb.mjs samples_artifact/3d/sofa-01.glb /tmp/sofa-01.optimized.glb --dry-run
```

More aggressive geometry simplification:

```bash
node tools/glb-compress/bin/compress-glb.mjs samples_artifact/3d/sofa-01.glb /tmp/sofa-01.optimized.glb --ratio 0.2 --error 0.01
```

Use Meshopt or Draco when the loader supports the required decoder:

```bash
node tools/glb-compress/bin/compress-glb.mjs input.glb output.glb --compress meshopt
node tools/glb-compress/bin/compress-glb.mjs input.glb output.glb --compress draco
```

## Defaults

- `--ratio 0.35`
- `--error 0.002`
- `--compress quantize`
- `--texture webp`
- `--texture-size 1024`
- simplification enabled
- vertex welding enabled
- `@gltf-transform/cli@4.4.0`

The generated command is:

```bash
npx --yes @gltf-transform/cli@4.4.0 optimize input.glb output.glb --compress quantize --texture-compress webp --texture-size 1024 --weld true --simplify true --simplify-ratio 0.35 --simplify-error 0.002
```

## Tests

```bash
cd tools/glb-compress
npm test
```

