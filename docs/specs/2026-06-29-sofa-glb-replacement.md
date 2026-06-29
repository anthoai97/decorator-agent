# Spec: Sofa GLB Replacement

## Objective

Replace the current hand-built sofa mesh with `sofa-01.glb` so the room renders the supplied model while keeping the existing sofa layout behavior unchanged.

## Tech Stack

- React 19 with React Three Fiber.
- Three.js and `@react-three/drei` for GLB loading.
- Vite public assets for serving the model.

## Commands

- Test: `cd ui && npm run test -- --run`
- Build: `cd ui && npm run build`
- Smoke: `cd ui && SMOKE_URL=http://127.0.0.1:5173 PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run smoke`

## Project Structure

- `ui/public/assets/models/sofa-01.glb` stores the runtime model asset.
- `ui/src/scene/components/Sofa.tsx` owns sofa rendering.
- `ui/src/scene/components/Sofa.test.ts` verifies the asset contract and transform constants.

## Code Style

```tsx
export const SOFA_MODEL_URL = '/assets/models/sofa-01.glb';

export function Sofa() {
  const gltf = useGLTF(SOFA_MODEL_URL);
  return <primitive object={gltf.scene} />;
}
```

Keep the component focused on rendering. Preserve the existing `FurnitureItem` wrapper for selection, dragging, rotation, and collision.

## Testing Strategy

Use a small Vitest unit test for the sofa model URL and transform contract, then run the existing UI test suite and build.

## Boundaries

- Always: Keep sofa ID, footprint, drag behavior, collision, server state, and import/export schemas unchanged.
- Ask first: Changing the sofa dimensions, adding compression pipelines, or adding runtime dependencies.
- Never: Remove the existing furniture interaction wrapper or persist model-specific transient state.

## Success Criteria

- The rendered sofa uses `sofa-01.glb` instead of the fake box/cylinder geometry.
- The model is scaled and rotated to fit the existing sofa footprint.
- The model sits on the room floor.
- UI tests and build pass.

