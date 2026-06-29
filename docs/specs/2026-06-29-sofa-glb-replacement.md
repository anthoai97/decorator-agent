# Spec: Sofa GLB Replacement

## Objective

Replace the current hand-built sofa mesh with an optimized `sofa-01.glb` so the room renders the supplied model while keeping the existing sofa layout behavior unchanged.

## Tech Stack

- React 19 with React Three Fiber.
- Three.js and `@react-three/drei` for GLB loading, with Meshopt decoding enabled.
- Vite public assets for serving the model.

## Commands

- Test: `cd ui && npm run test -- --run`
- Build: `cd ui && npm run build`
- Smoke: `cd ui && SMOKE_URL=http://127.0.0.1:5173 PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run smoke`

## Project Structure

- `ui/public/assets/models/sofa-01.glb` stores the Meshopt-compressed runtime model asset.
- `ui/src/scene/components/Sofa.tsx` owns sofa rendering.
- `ui/src/scene/components/Sofa.test.ts` verifies the asset contract and transform constants.

## Code Style

```tsx
export const SOFA_MODEL_URL = '/assets/models/sofa-01.glb';
export const SOFA_USE_DRACO = false;
export const SOFA_USE_MESHOPT = true;

export function Sofa() {
  const gltf = useGLTF(SOFA_MODEL_URL, SOFA_USE_DRACO, SOFA_USE_MESHOPT);
  return <primitive object={gltf.scene} />;
}
```

Keep the component focused on rendering. Preserve the existing `FurnitureItem` wrapper for selection, dragging, rotation, and collision.

## Testing Strategy

Use a small Vitest unit test for the sofa model URL, decoder settings, and transform contract, then run the existing UI test suite, build, and browser smoke.

## Boundaries

- Always: Keep sofa ID, footprint, drag behavior, collision, server state, and import/export schemas unchanged.
- Ask first: Changing the sofa dimensions, switching to Draco, or adding runtime dependencies.
- Never: Remove the existing furniture interaction wrapper or persist model-specific transient state.

## Success Criteria

- The rendered sofa uses the optimized `sofa-01.glb` instead of the fake box/cylinder geometry.
- The sofa GLB is Meshopt-compressed and loads without the Draco decoder path.
- The model is scaled and rotated to fit the existing sofa footprint.
- The model sits on the room floor.
- UI tests and build pass.

## Asset Decision

Use the Meshopt-compressed profile generated from the source sofa:

```bash
node tools/glb-compress/bin/compress-glb.mjs \
  samples_artifact/3d/sofa-01.glb \
  /tmp/sofa-01.optimized.glb \
  --ratio 0.5 \
  --error 0.001 \
  --compress meshopt
```

This keeps the runtime model around 949 KB and 132k triangles, while avoiding the Draco loader path. The sofa component should use a simple invisible interaction box for picking and dragging so the detailed GLB is visual-only and does not make pointer raycasts expensive.
