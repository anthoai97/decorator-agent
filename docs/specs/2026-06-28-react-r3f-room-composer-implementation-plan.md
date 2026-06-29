# React R3F Room Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the current WebGPU Room Composer as a React, TypeScript, React Three Fiber, and Zustand app while preserving room behavior, layout JSON compatibility, and smoke-test coverage.

**Architecture:** Use a single-pass data-driven R3F rewrite. Zustand owns layout, selection, hover, status, and camera-mode state; pure domain modules own math, collision, and import/export schema behavior; R3F renders room and furniture components from store state.

**Tech Stack:** Vite, React, TypeScript, React Three Fiber, Drei OrbitControls, Three.js WebGPU, Zustand, Vitest, Playwright smoke tests.

---

## Reference Inputs

- Approved design: `docs/specs/2026-06-28-react-r3f-room-composer-design.md`
- Current app entry: `src/main.js`
- Current styles: `src/styles.css`
- Current smoke test: `scripts/smoke.mjs`
- Sample import shape: `asd.json`
- R3F Canvas WebGPU docs: https://r3f.docs.pmnd.rs/api/canvas

## Scope Check

This plan implements one coherent migration: React/R3F rendering, Zustand state, TypeScript domain modules, compact playground UI, WebGPU-only renderer policy, and smoke coverage. It intentionally leaves real AI layout generation, persistence, WebGL fallback, furniture catalog authoring, and multi-room support outside this implementation.

## Target File Structure

Create or modify these files:

```text
index.html
package.json
package-lock.json
tsconfig.json
tsconfig.node.json
vite.config.ts
scripts/smoke.mjs
src/App.tsx
src/main.tsx
src/styles.css
src/vite-env.d.ts
src/data/furnitureCatalog.ts
src/domain/collision.test.ts
src/domain/collision.ts
src/domain/layoutSchema.test.ts
src/domain/layoutSchema.ts
src/domain/math.ts
src/domain/types.ts
src/scene/RoomCanvas.tsx
src/scene/RoomScene.tsx
src/scene/components/Bookshelf.tsx
src/scene/components/CoffeeTable.tsx
src/scene/components/FurnitureItem.tsx
src/scene/components/LoungeChair.tsx
src/scene/components/Planter.tsx
src/scene/components/RoomShell.tsx
src/scene/components/SelectionBounds.tsx
src/scene/components/Sofa.tsx
src/scene/interactions/useFurnitureDrag.ts
src/scene/r3f-webgpu.ts
src/state/useRoomStore.test.ts
src/state/useRoomStore.ts
src/ui/AiAssistantStub.tsx
src/ui/InspectorPanel.tsx
src/ui/PlaygroundShell.tsx
src/ui/Toolbar.tsx
```

Delete after React entry is working:

```text
src/main.js
```

## Task 1: Install React, R3F, Zustand, TypeScript, And Test Tooling

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `src/vite-env.d.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Modify: `index.html`

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install react react-dom @react-three/fiber @react-three/drei zustand
npm install -D @vitejs/plugin-react typescript @types/react @types/react-dom vitest
```

Expected: `package.json` and `package-lock.json` update with the new runtime and dev dependencies.

- [ ] **Step 2: Update scripts in `package.json`**

Ensure the scripts section is exactly:

```json
{
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "vite build",
    "preview": "vite preview --host 127.0.0.1",
    "smoke": "node scripts/smoke.mjs",
    "test": "vitest run --passWithNoTests"
  }
}
```

Keep existing package metadata and dependencies that are not part of the scripts object.

- [ ] **Step 3: Add TypeScript config**

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Add Vite React config**

Create `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
  },
});
```

- [ ] **Step 5: Add Vite env declarations**

Create `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 6: Add temporary React entry**

Create `src/App.tsx`:

```tsx
export function App() {
  return (
    <main id="app">
      <div id="viewport" />
      <section className="hud" aria-label="Room controls">
        <div className="brand">
          <span className="brand__mark" />
          <span>Room Composer</span>
        </div>
        <div className="status" aria-live="polite">
          <span id="selected-name">React migration ready</span>
          <span id="selected-position" />
          <span id="layout-status" />
        </div>
      </section>
      <div id="webgpu-message" className="webgpu-message" role="status" hidden />
    </main>
  );
}
```

Create `src/main.tsx`:

```tsx
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

const rootElement = document.querySelector('#app-root');

if (!rootElement) {
  throw new Error('Missing #app-root element.');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Point HTML at React entry**

Replace the body in `index.html` with:

```html
<body>
  <div id="app-root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
```

Keep the existing document head.

- [ ] **Step 8: Verify build and tests**

Run:

```bash
npm run build
npm run test
```

Expected:

```text
✓ built
No test files found
```

Vitest may report no test files at this point. That is acceptable for this task.

- [ ] **Step 9: Commit setup**

Run:

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts src/vite-env.d.ts src/main.tsx src/App.tsx index.html
git commit -m "chore: add React TypeScript scaffold"
```

## Task 2: Add Domain Types, Math Helpers, Furniture Catalog, And Collision Tests

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/math.ts`
- Create: `src/domain/collision.ts`
- Create: `src/domain/collision.test.ts`
- Create: `src/data/furnitureCatalog.ts`

- [ ] **Step 1: Write collision tests first**

Create `src/domain/collision.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { furnitureCatalog, roomDefinition } from '../data/furnitureCatalog';
import {
  applyTransformPatch,
  clampTransformInsideRoom,
  createFootprint,
  findOverlap,
  rotationAwareSize,
} from './collision';
import type { FurnitureLayoutMap } from './types';

function initialLayout(): FurnitureLayoutMap {
  return Object.fromEntries(
    furnitureCatalog.map((item) => [
      item.id,
      {
        id: item.id,
        name: item.name,
        movable: item.movable,
        position: { ...item.defaultPosition },
        rotation: { yDegrees: item.defaultRotationYDegrees },
        baseSize: { ...item.baseSize },
      },
    ]),
  );
}

describe('collision helpers', () => {
  it('calculates a footprint from center position and size', () => {
    const footprint = createFootprint(
      { x: 1, y: 0, z: -1 },
      { width: 2, height: 1, depth: 1 },
    );

    expect(footprint).toEqual({
      minX: 0,
      maxX: 2,
      minZ: -1.5,
      maxZ: -0.5,
    });
  });

  it('swaps width and depth at 90 degree rotation', () => {
    expect(rotationAwareSize({ width: 2, height: 1, depth: 0.5 }, 90)).toEqual({
      width: 0.5,
      height: 1,
      depth: 2,
    });
  });

  it('clamps furniture inside room bounds', () => {
    const sofa = initialLayout().sofa;
    const clamped = clampTransformInsideRoom(
      {
        ...sofa,
        position: { x: -99, y: 0, z: 99 },
      },
      roomDefinition,
    );

    const size = rotationAwareSize(clamped.baseSize, clamped.rotation.yDegrees);
    const footprint = createFootprint(clamped.position, size);

    expect(footprint.minX).toBeGreaterThanOrEqual(roomDefinition.bounds.minX + 0.18);
    expect(footprint.maxX).toBeLessThanOrEqual(roomDefinition.bounds.maxX - 0.18);
    expect(footprint.minZ).toBeGreaterThanOrEqual(roomDefinition.bounds.minZ + 0.18);
    expect(footprint.maxZ).toBeLessThanOrEqual(roomDefinition.bounds.maxZ - 0.18);
  });

  it('detects overlapping furniture', () => {
    const layout = initialLayout();
    layout['coffee-table'] = {
      ...layout['coffee-table'],
      position: { ...layout.sofa.position },
    };

    expect(findOverlap(layout)).toEqual(['sofa', 'coffee-table']);
  });

  it('applies valid transform patches without mutating the input layout', () => {
    const layout = initialLayout();
    const result = applyTransformPatch(layout, roomDefinition, 'coffee-table', {
      position: { x: 1.2, z: 0.3 },
      rotation: { yDegrees: 45 },
    });

    expect(result.applied).toBe(true);
    expect(result.layout['coffee-table'].position.x).toBe(1.2);
    expect(result.layout['coffee-table'].position.z).toBe(0.3);
    expect(result.layout['coffee-table'].rotation.yDegrees).toBe(45);
    expect(layout['coffee-table'].position.x).not.toBe(1.2);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- src/domain/collision.test.ts
```

Expected: FAIL because `furnitureCatalog`, `roomDefinition`, and collision helpers do not exist.

- [ ] **Step 3: Add domain types**

Create `src/domain/types.ts`:

```ts
export type FurnitureId = 'sofa' | 'coffee-table' | 'lounge-chair' | 'bookshelf' | 'planter';

export interface Vector3Data {
  x: number;
  y: number;
  z: number;
}

export interface Size3Data {
  width: number;
  height: number;
  depth: number;
}

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RoomBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface RoomDefinition {
  width: number;
  depth: number;
  height: number;
  bounds: RoomBounds;
}

export interface FurnitureDefinition {
  id: FurnitureId;
  name: string;
  movable: boolean;
  defaultPosition: Vector3Data;
  defaultRotationYDegrees: number;
  baseSize: Size3Data;
}

export interface FurnitureLayoutItem {
  id: FurnitureId;
  name: string;
  movable: boolean;
  position: Vector3Data;
  rotation: {
    yDegrees: number;
  };
  baseSize: Size3Data;
}

export type FurnitureLayoutMap = Record<FurnitureId, FurnitureLayoutItem>;

export interface TransformPatch {
  position?: Partial<Vector3Data>;
  rotation?: {
    yDegrees?: number;
  };
}

export interface ApplyTransformResult {
  applied: boolean;
  clamped: boolean;
  reason: 'applied' | 'overlap' | 'missing-furniture';
  layout: FurnitureLayoutMap;
}
```

- [ ] **Step 4: Add math helpers**

Create `src/domain/math.ts`:

```ts
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function snapDegrees(value: number, step = 45): number {
  return normalizeDegrees(Math.round(value / step) * step);
}

export function round(value: number, digits = 3): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function radiansFromDegrees(value: number): number {
  return (normalizeDegrees(value) * Math.PI) / 180;
}
```

- [ ] **Step 5: Add furniture catalog**

Create `src/data/furnitureCatalog.ts`:

```ts
import type { FurnitureDefinition, FurnitureLayoutMap, RoomDefinition } from '../domain/types';

export const roomDefinition: RoomDefinition = {
  width: 9.6,
  depth: 6.8,
  height: 2.75,
  bounds: {
    minX: -4.8,
    maxX: 4.8,
    minZ: -3.4,
    maxZ: 3.4,
  },
};

export const furnitureCatalog: FurnitureDefinition[] = [
  {
    id: 'sofa',
    name: 'Sofa',
    movable: true,
    defaultPosition: { x: -1.5, y: 0, z: -1.55 },
    defaultRotationYDegrees: 0,
    baseSize: { width: 2.49, height: 1.21, depth: 0.93 },
  },
  {
    id: 'coffee-table',
    name: 'Coffee table',
    movable: true,
    defaultPosition: { x: 0.55, y: 0, z: 0.25 },
    defaultRotationYDegrees: 0,
    baseSize: { width: 1.35, height: 0.628, depth: 0.82 },
  },
  {
    id: 'lounge-chair',
    name: 'Lounge chair',
    movable: true,
    defaultPosition: { x: 2.1, y: 0, z: -0.65 },
    defaultRotationYDegrees: -31.5,
    baseSize: { width: 1.273, height: 1.235, depth: 1.303 },
  },
  {
    id: 'bookshelf',
    name: 'Bookshelf',
    movable: true,
    defaultPosition: { x: 3.65, y: 0, z: -2.15 },
    defaultRotationYDegrees: 0,
    baseSize: { width: 0.92, height: 1.56, depth: 0.34 },
  },
  {
    id: 'planter',
    name: 'Planter',
    movable: true,
    defaultPosition: { x: -3.55, y: 0, z: -2.25 },
    defaultRotationYDegrees: 0,
    baseSize: { width: 0.72, height: 1.133, depth: 0.867 },
  },
];

export function createInitialFurnitureLayout(): FurnitureLayoutMap {
  return Object.fromEntries(
    furnitureCatalog.map((item) => [
      item.id,
      {
        id: item.id,
        name: item.name,
        movable: item.movable,
        position: { ...item.defaultPosition },
        rotation: { yDegrees: item.defaultRotationYDegrees },
        baseSize: { ...item.baseSize },
      },
    ]),
  ) as FurnitureLayoutMap;
}
```

- [ ] **Step 6: Add collision implementation**

Create `src/domain/collision.ts`:

```ts
import { roomDefinition } from '../data/furnitureCatalog';
import { clamp, snapDegrees } from './math';
import type {
  ApplyTransformResult,
  Footprint,
  FurnitureId,
  FurnitureLayoutItem,
  FurnitureLayoutMap,
  RoomDefinition,
  Size3Data,
  TransformPatch,
  Vector3Data,
} from './types';

const roomPadding = 0.18;
const collisionPadding = 0.04;

export function cloneLayout(layout: FurnitureLayoutMap): FurnitureLayoutMap {
  return Object.fromEntries(
    Object.entries(layout).map(([id, item]) => [
      id,
      {
        ...item,
        position: { ...item.position },
        rotation: { ...item.rotation },
        baseSize: { ...item.baseSize },
      },
    ]),
  ) as FurnitureLayoutMap;
}

export function rotationAwareSize(size: Size3Data, yDegrees: number): Size3Data {
  const radians = (snapDegrees(yDegrees, 45) * Math.PI) / 180;
  const cosine = Math.abs(Math.cos(radians));
  const sine = Math.abs(Math.sin(radians));

  return {
    width: roundFootprint(size.width * cosine + size.depth * sine),
    height: size.height,
    depth: roundFootprint(size.width * sine + size.depth * cosine),
  };
}

export function createFootprint(position: Vector3Data, size: Size3Data): Footprint {
  return {
    minX: roundFootprint(position.x - size.width / 2),
    maxX: roundFootprint(position.x + size.width / 2),
    minZ: roundFootprint(position.z - size.depth / 2),
    maxZ: roundFootprint(position.z + size.depth / 2),
  };
}

export function furnitureFootprint(item: FurnitureLayoutItem): Footprint {
  const size = rotationAwareSize(item.baseSize, item.rotation.yDegrees);

  return insetFootprint(createFootprint(item.position, size), collisionPadding);
}

export function insetFootprint(footprint: Footprint, padding: number): Footprint {
  return {
    minX: roundFootprint(footprint.minX + padding),
    maxX: roundFootprint(footprint.maxX - padding),
    minZ: roundFootprint(footprint.minZ + padding),
    maxZ: roundFootprint(footprint.maxZ - padding),
  };
}

export function footprintsOverlap(a: Footprint, b: Footprint): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

export function findOverlap(layout: FurnitureLayoutMap): [FurnitureId, FurnitureId] | null {
  const items = Object.values(layout);

  for (let index = 0; index < items.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < items.length; nextIndex += 1) {
      if (footprintsOverlap(furnitureFootprint(items[index]), furnitureFootprint(items[nextIndex]))) {
        return [items[index].id, items[nextIndex].id];
      }
    }
  }

  return null;
}

export function hasAnyOverlap(layout: FurnitureLayoutMap): boolean {
  return findOverlap(layout) !== null;
}

export function clampTransformInsideRoom(
  item: FurnitureLayoutItem,
  room: RoomDefinition = roomDefinition,
): FurnitureLayoutItem {
  const size = rotationAwareSize(item.baseSize, item.rotation.yDegrees);
  const minX = room.bounds.minX + roomPadding + size.width / 2;
  const maxX = room.bounds.maxX - roomPadding - size.width / 2;
  const minZ = room.bounds.minZ + roomPadding + size.depth / 2;
  const maxZ = room.bounds.maxZ - roomPadding - size.depth / 2;

  return {
    ...item,
    position: {
      x: clamp(item.position.x, minX, maxX),
      y: clamp(item.position.y, 0, Math.max(0, room.height - item.baseSize.height)),
      z: clamp(item.position.z, minZ, maxZ),
    },
  };
}

export function applyTransformPatch(
  layout: FurnitureLayoutMap,
  room: RoomDefinition,
  id: FurnitureId,
  patch: TransformPatch,
): ApplyTransformResult {
  const current = layout[id];

  if (!current) {
    return {
      applied: false,
      clamped: false,
      reason: 'missing-furniture',
      layout,
    };
  }

  const candidate = cloneLayout(layout);
  const patched: FurnitureLayoutItem = {
    ...candidate[id],
    position: {
      ...candidate[id].position,
      ...patch.position,
      y: patch.position?.y ?? candidate[id].position.y,
    },
    rotation: {
      yDegrees: snapDegrees(patch.rotation?.yDegrees ?? candidate[id].rotation.yDegrees),
    },
  };
  const clampedItem = clampTransformInsideRoom(patched, room);
  candidate[id] = clampedItem;

  if (hasAnyOverlap(candidate)) {
    return {
      applied: false,
      clamped: false,
      reason: 'overlap',
      layout,
    };
  }

  return {
    applied: true,
    clamped:
      clampedItem.position.x !== patched.position.x ||
      clampedItem.position.y !== patched.position.y ||
      clampedItem.position.z !== patched.position.z,
    reason: 'applied',
    layout: candidate,
  };
}

function roundFootprint(value: number): number {
  return Math.round(value * 1000) / 1000;
}
```

- [ ] **Step 7: Run collision tests**

Run:

```bash
npm run test -- src/domain/collision.test.ts
```

Expected: PASS.

- [ ] **Step 8: Run build**

Run:

```bash
npm run build
```

Expected: PASS. If TypeScript rejects the first catalog return type, use the replacement function shown in Step 5.

- [ ] **Step 9: Commit domain foundation**

Run:

```bash
git add src/domain/types.ts src/domain/math.ts src/domain/collision.ts src/domain/collision.test.ts src/data/furnitureCatalog.ts
git commit -m "feat: add room layout domain foundation"
```

## Task 3: Add Layout Schema Import And Export

**Files:**
- Create: `src/domain/layoutSchema.ts`
- Create: `src/domain/layoutSchema.test.ts`
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add layout schema types to `src/domain/types.ts`**

Append:

```ts
export interface LayoutExportItem {
  id: string;
  name: string;
  movable: boolean;
  position: Vector3Data;
  rotation: {
    yDegrees: number;
  };
  size: Size3Data;
  footprint: Footprint;
}

export interface RoomLayoutExport {
  schemaVersion: 1;
  app: 'webgpu-room-composer';
  units: 'meters';
  coordinateSystem: {
    origin: 'room-center-floor';
    x: 'left-right';
    y: 'up';
    z: 'front-back';
  };
  constraints: {
    keepInsideRoom: true;
    preventFurnitureOverlap: true;
    rotationStepDegrees: 45;
  };
  room: RoomDefinition;
  furniture: LayoutExportItem[];
}

export interface ImportResult {
  applied: number;
  layout: FurnitureLayoutMap;
}
```

- [ ] **Step 2: Write layout schema tests**

Create `src/domain/layoutSchema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createInitialFurnitureLayout, roomDefinition } from '../data/furnitureCatalog';
import { createLayoutExport, importLayoutFromUnknown } from './layoutSchema';

describe('layout schema', () => {
  it('exports schema version 1 with all furniture', () => {
    const exported = createLayoutExport(createInitialFurnitureLayout(), roomDefinition);

    expect(exported.schemaVersion).toBe(1);
    expect(exported.app).toBe('webgpu-room-composer');
    expect(exported.units).toBe('meters');
    expect(exported.constraints.rotationStepDegrees).toBe(45);
    expect(exported.furniture.map((item) => item.id)).toEqual([
      'sofa',
      'coffee-table',
      'lounge-chair',
      'bookshelf',
      'planter',
    ]);
  });

  it('imports compact furniture arrays by id', () => {
    const current = createInitialFurnitureLayout();
    const result = importLayoutFromUnknown(
      [
        {
          id: 'coffee-table',
          position: { x: 1.1, y: 0, z: 0.9 },
          rotation: { yDegrees: 45 },
        },
      ],
      current,
      roomDefinition,
    );

    expect(result.applied).toBe(1);
    expect(result.layout['coffee-table'].position.x).toBe(1.1);
    expect(result.layout['coffee-table'].position.z).toBe(0.9);
    expect(result.layout['coffee-table'].rotation.yDegrees).toBe(45);
  });

  it('imports object arrays by name compatibility alias', () => {
    const current = createInitialFurnitureLayout();
    const result = importLayoutFromUnknown(
      {
        objects: [
          {
            label: 'Planter',
            translation: { x: -3.2, y: 0, z: -2.4 },
            yDegrees: 90,
          },
        ],
      },
      current,
      roomDefinition,
    );

    expect(result.applied).toBe(1);
    expect(result.layout.planter.position.x).toBe(-3.2);
    expect(result.layout.planter.position.z).toBe(-2.4);
    expect(result.layout.planter.rotation.yDegrees).toBe(90);
  });

  it('rejects imports that do not match furniture', () => {
    expect(() =>
      importLayoutFromUnknown({ furniture: [{ id: 'unknown' }] }, createInitialFurnitureLayout(), roomDefinition),
    ).toThrow('Layout JSON did not match any furniture IDs or names.');
  });

  it('rejects imports that create overlap', () => {
    const current = createInitialFurnitureLayout();

    expect(() =>
      importLayoutFromUnknown(
        {
          furniture: [
            { id: 'sofa', position: { x: 0, y: 0, z: 0 } },
            { id: 'coffee-table', position: { x: 0, y: 0, z: 0 } },
          ],
        },
        current,
        roomDefinition,
      ),
    ).toThrow('Imported layout has overlapping furniture.');
  });
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm run test -- src/domain/layoutSchema.test.ts
```

Expected: FAIL because `layoutSchema.ts` does not exist.

- [ ] **Step 4: Add layout schema implementation**

Create `src/domain/layoutSchema.ts`:

```ts
import { applyTransformPatch, furnitureFootprint, rotationAwareSize } from './collision';
import { round } from './math';
import type {
  FurnitureId,
  FurnitureLayoutItem,
  FurnitureLayoutMap,
  ImportResult,
  LayoutExportItem,
  RoomDefinition,
  RoomLayoutExport,
  TransformPatch,
} from './types';

export function createLayoutExport(
  layout: FurnitureLayoutMap,
  room: RoomDefinition,
): RoomLayoutExport {
  return {
    schemaVersion: 1,
    app: 'webgpu-room-composer',
    units: 'meters',
    coordinateSystem: {
      origin: 'room-center-floor',
      x: 'left-right',
      y: 'up',
      z: 'front-back',
    },
    constraints: {
      keepInsideRoom: true,
      preventFurnitureOverlap: true,
      rotationStepDegrees: 45,
    },
    room: {
      width: round(room.width),
      depth: round(room.depth),
      height: round(room.height),
      bounds: {
        minX: round(room.bounds.minX),
        maxX: round(room.bounds.maxX),
        minZ: round(room.bounds.minZ),
        maxZ: round(room.bounds.maxZ),
      },
    },
    furniture: Object.values(layout).map(createExportItem),
  };
}

export function importLayoutFromUnknown(
  source: unknown,
  currentLayout: FurnitureLayoutMap,
  room: RoomDefinition,
): ImportResult {
  const items = normalizeLayoutItems(source);

  if (items.length === 0) {
    throw new Error('Layout JSON does not contain a furniture array.');
  }

  let nextLayout = currentLayout;
  let applied = 0;

  for (const item of items) {
    const id = findFurnitureId(item, currentLayout);

    if (!id) {
      continue;
    }

    const result = applyTransformPatch(nextLayout, room, id, readTransformPatch(item));

    if (!result.applied) {
      throw new Error('Imported layout has overlapping furniture.');
    }

    nextLayout = result.layout;
    applied += 1;
  }

  if (applied === 0) {
    throw new Error('Layout JSON did not match any furniture IDs or names.');
  }

  return { applied, layout: nextLayout };
}

function createExportItem(item: FurnitureLayoutItem): LayoutExportItem {
  const size = rotationAwareSize(item.baseSize, item.rotation.yDegrees);
  const footprint = furnitureFootprint(item);

  return {
    id: item.id,
    name: item.name,
    movable: item.movable,
    position: {
      x: round(item.position.x),
      y: round(item.position.y),
      z: round(item.position.z),
    },
    rotation: {
      yDegrees: round(item.rotation.yDegrees, 1),
    },
    size: {
      width: round(size.width),
      height: round(size.height),
      depth: round(size.depth),
    },
    footprint: {
      minX: round(footprint.minX),
      maxX: round(footprint.maxX),
      minZ: round(footprint.minZ),
      maxZ: round(footprint.maxZ),
    },
  };
}

function normalizeLayoutItems(source: unknown): Record<string, unknown>[] {
  if (Array.isArray(source)) {
    return source.filter(isRecord);
  }

  if (!isRecord(source)) {
    return [];
  }

  if (Array.isArray(source.furniture)) {
    return source.furniture.filter(isRecord);
  }

  if (Array.isArray(source.objects)) {
    return source.objects.filter(isRecord);
  }

  return [];
}

function findFurnitureId(
  item: Record<string, unknown>,
  layout: FurnitureLayoutMap,
): FurnitureId | null {
  const candidateId = String(item.id ?? item.layoutId ?? '').toLowerCase();
  const candidateName = String(item.name ?? item.label ?? '').toLowerCase();

  return (
    Object.values(layout).find((furniture) => {
      return furniture.id === candidateId || furniture.name.toLowerCase() === candidateName;
    })?.id ?? null
  );
}

function readTransformPatch(item: Record<string, unknown>): TransformPatch {
  const position = readRecord(item.position) ?? readRecord(item.translation) ?? {};
  const rotation = readRecord(item.rotation) ?? {};
  const rawDegrees = item.rotationYDegrees ?? item.yDegrees ?? rotation.yDegrees ?? rotation.degreesY;
  const rawRadians = item.rotationY ?? rotation.y ?? rotation.yRadians;
  const yDegrees = readNumber(rawDegrees, null) ?? radiansToDegrees(readNumber(rawRadians, 0));

  return {
    position: {
      x: readNumber(position.x, undefined),
      y: readNumber(position.y, undefined),
      z: readNumber(position.z, undefined),
    },
    rotation: {
      yDegrees,
    },
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNumber<TFallback extends number | undefined | null>(
  value: unknown,
  fallback: TFallback,
): number | TFallback {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
```

- [ ] **Step 5: Run layout schema tests**

Run:

```bash
npm run test -- src/domain/layoutSchema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run all domain tests and build**

Run:

```bash
npm run test -- src/domain
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit layout schema**

Run:

```bash
git add src/domain/types.ts src/domain/layoutSchema.ts src/domain/layoutSchema.test.ts
git commit -m "feat: add layout import export schema"
```

## Task 4: Add Zustand Room Store

**Files:**
- Create: `src/state/useRoomStore.ts`
- Create: `src/state/useRoomStore.test.ts`

- [ ] **Step 1: Write store tests**

Create `src/state/useRoomStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { useRoomStore } from './useRoomStore';

beforeEach(() => {
  useRoomStore.getState().resetLayout();
  useRoomStore.getState().selectFurniture(null);
});

describe('useRoomStore', () => {
  it('selects furniture and rotates it by 45 degrees', () => {
    useRoomStore.getState().selectFurniture('sofa');
    useRoomStore.getState().rotateSelected();

    expect(useRoomStore.getState().selectedId).toBe('sofa');
    expect(useRoomStore.getState().furniture.sofa.rotation.yDegrees).toBe(45);
  });

  it('moves furniture through collision validation', () => {
    const result = useRoomStore.getState().moveFurniture('coffee-table', { x: 1.2, z: 0.4 });

    expect(result.applied).toBe(true);
    expect(useRoomStore.getState().furniture['coffee-table'].position.x).toBe(1.2);
    expect(useRoomStore.getState().furniture['coffee-table'].position.z).toBe(0.4);
  });

  it('rejects overlapping inspector transforms', () => {
    const sofaPosition = useRoomStore.getState().furniture.sofa.position;
    const result = useRoomStore.getState().setTransformFromInspector('coffee-table', {
      position: sofaPosition,
    });

    expect(result.applied).toBe(false);
    expect(useRoomStore.getState().layoutStatus).toBe('Move rejected: furniture would overlap');
  });

  it('exports and imports layout state', () => {
    const exported = useRoomStore.getState().createLayoutExport();
    const result = useRoomStore.getState().importLayout(exported);

    expect(exported.schemaVersion).toBe(1);
    expect(result.applied).toBe(5);
    expect(useRoomStore.getState().layoutStatus).toBe('Imported 5 objects');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm run test -- src/state/useRoomStore.test.ts
```

Expected: FAIL because `useRoomStore.ts` does not exist.

- [ ] **Step 3: Add Zustand store**

Create `src/state/useRoomStore.ts`:

```ts
import { create } from 'zustand';

import { createInitialFurnitureLayout, roomDefinition } from '../data/furnitureCatalog';
import { applyTransformPatch, cloneLayout, hasAnyOverlap } from '../domain/collision';
import { createLayoutExport, importLayoutFromUnknown } from '../domain/layoutSchema';
import type {
  ApplyTransformResult,
  FurnitureId,
  FurnitureLayoutMap,
  ImportResult,
  RoomLayoutExport,
  TransformPatch,
} from '../domain/types';

type CameraMode = 'orbit' | 'top';

interface RoomStore {
  furniture: FurnitureLayoutMap;
  initialFurniture: FurnitureLayoutMap;
  selectedId: FurnitureId | null;
  hoveredId: FurnitureId | null;
  layoutStatus: string;
  cameraMode: CameraMode;
  selectFurniture: (id: FurnitureId | null) => void;
  hoverFurniture: (id: FurnitureId | null) => void;
  moveFurniture: (id: FurnitureId, nextPosition: { x: number; z: number }) => ApplyTransformResult;
  rotateSelected: () => ApplyTransformResult | null;
  setFurnitureTransform: (id: FurnitureId, patch: TransformPatch) => ApplyTransformResult;
  setTransformFromInspector: (id: FurnitureId, patch: TransformPatch) => ApplyTransformResult;
  resetLayout: () => void;
  createLayoutExport: () => RoomLayoutExport;
  importLayout: (layout: unknown) => ImportResult;
  setCameraMode: (mode: CameraMode) => void;
  showLayoutStatus: (message: string) => void;
  hasAnyOverlap: () => boolean;
}

const initialFurniture = createInitialFurnitureLayout();

export const useRoomStore = create<RoomStore>((set, get) => ({
  furniture: cloneLayout(initialFurniture),
  initialFurniture: cloneLayout(initialFurniture),
  selectedId: null,
  hoveredId: null,
  layoutStatus: '',
  cameraMode: 'orbit',

  selectFurniture: (id) => set({ selectedId: id }),
  hoverFurniture: (id) => set({ hoveredId: id }),

  moveFurniture: (id, nextPosition) => {
    return get().setFurnitureTransform(id, {
      position: { x: nextPosition.x, z: nextPosition.z },
    });
  },

  rotateSelected: () => {
    const selectedId = get().selectedId;

    if (!selectedId) {
      return null;
    }

    const selected = get().furniture[selectedId];
    return get().setFurnitureTransform(selectedId, {
      rotation: { yDegrees: selected.rotation.yDegrees + 45 },
    });
  },

  setFurnitureTransform: (id, patch) => {
    const result = applyTransformPatch(get().furniture, roomDefinition, id, patch);

    if (result.applied) {
      set({ furniture: result.layout });
    }

    return result;
  },

  setTransformFromInspector: (id, patch) => {
    const result = get().setFurnitureTransform(id, patch);

    if (!result.applied && result.reason === 'overlap') {
      set({ layoutStatus: 'Move rejected: furniture would overlap' });
    } else if (result.applied && result.clamped) {
      set({ layoutStatus: 'Adjusted to stay inside room' });
    }

    return result;
  },

  resetLayout: () =>
    set((state) => ({
      furniture: cloneLayout(state.initialFurniture),
      layoutStatus: 'Layout reset',
    })),

  createLayoutExport: () => createLayoutExport(get().furniture, roomDefinition),

  importLayout: (layout) => {
    const result = importLayoutFromUnknown(layout, get().furniture, roomDefinition);
    set({ furniture: result.layout, layoutStatus: `Imported ${result.applied} objects` });
    return result;
  },

  setCameraMode: (mode) => set({ cameraMode: mode }),
  showLayoutStatus: (message) => set({ layoutStatus: message }),
  hasAnyOverlap: () => hasAnyOverlap(get().furniture),
}));
```

- [ ] **Step 4: Run store tests**

Run:

```bash
npm run test -- src/state/useRoomStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run all tests and build**

Run:

```bash
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit store**

Run:

```bash
git add src/state/useRoomStore.ts src/state/useRoomStore.test.ts
git commit -m "feat: add room layout store"
```

## Task 5: Build Compact React Playground Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/ui/Toolbar.tsx`
- Create: `src/ui/InspectorPanel.tsx`
- Create: `src/ui/AiAssistantStub.tsx`
- Create: `src/ui/PlaygroundShell.tsx`

- [ ] **Step 1: Add toolbar component**

Create `src/ui/Toolbar.tsx`:

```tsx
import type { ChangeEvent } from 'react';
import { useRef } from 'react';

import { useRoomStore } from '../state/useRoomStore';

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedId = useRoomStore((state) => state.selectedId);
  const selected = useRoomStore((state) => (state.selectedId ? state.furniture[state.selectedId] : null));
  const layoutStatus = useRoomStore((state) => state.layoutStatus);
  const rotateSelected = useRoomStore((state) => state.rotateSelected);
  const resetLayout = useRoomStore((state) => state.resetLayout);
  const createLayoutExport = useRoomStore((state) => state.createLayoutExport);
  const importLayout = useRoomStore((state) => state.importLayout);
  const showLayoutStatus = useRoomStore((state) => state.showLayoutStatus);
  const setCameraMode = useRoomStore((state) => state.setCameraMode);

  function exportLayoutFile() {
    const layout = createLayoutExport();
    const blob = new Blob([`${JSON.stringify(layout, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'room-layout.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showLayoutStatus('Layout exported');
  }

  async function importLayoutFile(event: ChangeEvent<HTMLInputElement>) {
    const [file] = event.target.files ?? [];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      importLayout(JSON.parse(await file.text()));
    } catch (error) {
      showLayoutStatus('Import failed');
      console.warn(error);
    }
  }

  const selectedPosition = selected
    ? `x ${selected.position.x.toFixed(1)} / z ${selected.position.z.toFixed(1)} / r ${selected.rotation.yDegrees.toFixed(0)}deg`
    : '';

  return (
    <section className="hud" aria-label="Room controls">
      <div className="brand">
        <span className="brand__mark" />
        <span>Room Composer</span>
      </div>
      <div className="status" aria-live="polite">
        <span id="selected-name">{selected?.name ?? 'Nothing selected'}</span>
        <span id="selected-position">{selectedPosition}</span>
        <span id="layout-status">{layoutStatus}</span>
      </div>
      <div className="actions">
        <button id="rotate-object" type="button" disabled={!selectedId} onClick={rotateSelected}>
          Rotate
        </button>
        <button id="export-layout" type="button" onClick={exportLayoutFile}>
          Export
        </button>
        <button id="import-layout" type="button" onClick={() => fileInputRef.current?.click()}>
          Import
        </button>
        <input
          id="layout-file"
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={importLayoutFile}
        />
        <button id="top-view" type="button" onClick={() => setCameraMode('top')}>
          Top view
        </button>
        <button id="reset-layout" type="button" onClick={resetLayout}>
          Reset
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Add inspector component**

Create `src/ui/InspectorPanel.tsx`:

```tsx
import type { ChangeEvent } from 'react';

import { useRoomStore } from '../state/useRoomStore';
import type { FurnitureId } from '../domain/types';

export function InspectorPanel() {
  const selectedId = useRoomStore((state) => state.selectedId);
  const selected = useRoomStore((state) => (state.selectedId ? state.furniture[state.selectedId] : null));
  const setTransformFromInspector = useRoomStore((state) => state.setTransformFromInspector);

  function updateNumber(id: FurnitureId, field: 'x' | 'z' | 'rotation', event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);

    if (!Number.isFinite(value)) {
      return;
    }

    if (field === 'rotation') {
      setTransformFromInspector(id, { rotation: { yDegrees: value } });
      return;
    }

    setTransformFromInspector(id, { position: { [field]: value } });
  }

  return (
    <aside className="inspector" aria-label="Furniture inspector">
      <div className="inspector__section">
        <h2>Inspector</h2>
        {selected && selectedId ? (
          <div className="field-grid">
            <label>
              <span>Name</span>
              <input value={selected.name} readOnly />
            </label>
            <label>
              <span>X</span>
              <input
                type="number"
                step="0.1"
                value={selected.position.x}
                onChange={(event) => updateNumber(selectedId, 'x', event)}
              />
            </label>
            <label>
              <span>Z</span>
              <input
                type="number"
                step="0.1"
                value={selected.position.z}
                onChange={(event) => updateNumber(selectedId, 'z', event)}
              />
            </label>
            <label>
              <span>Rotation</span>
              <input
                type="number"
                step="45"
                value={selected.rotation.yDegrees}
                onChange={(event) => updateNumber(selectedId, 'rotation', event)}
              />
            </label>
          </div>
        ) : (
          <p className="inspector__empty">Select furniture to inspect it.</p>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Add AI assistant stub**

Create `src/ui/AiAssistantStub.tsx`:

```tsx
export function AiAssistantStub() {
  return (
    <section className="ai-stub" aria-label="AI layout assistant">
      <h2>Layout Assistant</h2>
      <button type="button" disabled>
        Arrange with AI
      </button>
    </section>
  );
}
```

- [ ] **Step 4: Add shell component**

Create `src/ui/PlaygroundShell.tsx`:

```tsx
import { AiAssistantStub } from './AiAssistantStub';
import { InspectorPanel } from './InspectorPanel';
import { Toolbar } from './Toolbar';

export function PlaygroundShell() {
  return (
    <>
      <Toolbar />
      <div className="side-panel">
        <InspectorPanel />
        <AiAssistantStub />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Wire shell in `src/App.tsx`**

Replace `src/App.tsx` with:

```tsx
import { PlaygroundShell } from './ui/PlaygroundShell';

export function App() {
  return (
    <main id="app">
      <div id="viewport" />
      <PlaygroundShell />
      <div id="webgpu-message" className="webgpu-message" role="status" hidden />
    </main>
  );
}
```

- [ ] **Step 6: Extend CSS for compact shell**

Append to `src/styles.css`:

```css
.side-panel {
  position: fixed;
  top: 84px;
  right: 16px;
  z-index: 5;
  display: grid;
  width: min(320px, calc(100vw - 32px));
  gap: 10px;
}

.inspector,
.ai-stub {
  border: 1px solid var(--panel-border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(14px);
}

.inspector__section,
.ai-stub {
  padding: 12px;
}

.inspector h2,
.ai-stub h2 {
  margin: 0 0 10px;
  color: var(--ink);
  font-size: 0.9rem;
  line-height: 1.2;
}

.field-grid {
  display: grid;
  gap: 8px;
}

.field-grid label {
  display: grid;
  gap: 4px;
  color: var(--muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.field-grid input {
  width: 100%;
  min-height: 32px;
  border: 1px solid rgba(23, 32, 47, 0.14);
  border-radius: 7px;
  padding: 0 9px;
  color: var(--ink);
  font: inherit;
  font-size: 0.84rem;
  font-weight: 650;
}

.inspector__empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.84rem;
  line-height: 1.4;
}

.ai-stub button {
  width: 100%;
}

@media (max-width: 720px) {
  .side-panel {
    top: auto;
    right: 10px;
    bottom: 10px;
    left: 10px;
    width: auto;
    grid-template-columns: minmax(0, 1fr) minmax(120px, 0.45fr);
  }
}

@media (max-width: 430px) {
  .side-panel {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Verify UI shell builds**

Run:

```bash
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit UI shell**

Run:

```bash
git add src/App.tsx src/styles.css src/ui/Toolbar.tsx src/ui/InspectorPanel.tsx src/ui/AiAssistantStub.tsx src/ui/PlaygroundShell.tsx
git commit -m "feat: add React playground shell"
```

## Task 6: Add WebGPU R3F Canvas And Static Room Scene

**Files:**
- Modify: `src/App.tsx`
- Create: `src/scene/r3f-webgpu.ts`
- Create: `src/scene/RoomCanvas.tsx`
- Create: `src/scene/RoomScene.tsx`
- Create: `src/scene/components/RoomShell.tsx`

- [ ] **Step 1: Add R3F WebGPU setup**

Create `src/scene/r3f-webgpu.ts`:

```ts
import { extend } from '@react-three/fiber';
import * as THREE from 'three/webgpu';

extend(THREE as never);

export { THREE };
```

- [ ] **Step 2: Add RoomCanvas**

Create `src/scene/RoomCanvas.tsx`:

```tsx
import { Canvas } from '@react-three/fiber';
import WebGPU from 'three/addons/capabilities/WebGPU.js';

import { RoomScene } from './RoomScene';
import { THREE } from './r3f-webgpu';

export function RoomCanvas() {
  if (!WebGPU.isAvailable()) {
    return (
      <div id="webgpu-message" className="webgpu-message" role="status">
        WebGPU is not available in this browser. Open this demo in a current Chrome or Edge browser on localhost.
      </div>
    );
  }

  return (
    <div id="viewport">
      <Canvas
        camera={{ fov: 48, near: 0.1, far: 100, position: [5.8, 4.2, 6.4] }}
        dpr={[1, 1.8]}
        gl={async (props) => {
          const renderer = new THREE.WebGPURenderer({
            ...props,
            antialias: true,
            alpha: false,
          });
          renderer.outputColorSpace = THREE.SRGBColorSpace;
          await renderer.init();
          return renderer;
        }}
      >
        <RoomScene />
      </Canvas>
    </div>
  );
}
```

- [ ] **Step 3: Add static room shell**

Create `src/scene/components/RoomShell.tsx`:

```tsx
import { roomDefinition } from '../../data/furnitureCatalog';

export function RoomShell() {
  const halfWidth = roomDefinition.width / 2;
  const halfDepth = roomDefinition.depth / 2;
  const wallHeight = roomDefinition.height;

  return (
    <group name="Room">
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <boxGeometry args={[roomDefinition.width, 0.08, roomDefinition.depth]} />
        <meshStandardMaterial color="#d7b98f" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh name="Area rug" position={[0.45, 0.018, 0.3]}>
        <boxGeometry args={[2.7, 0.025, 1.75]} />
        <meshStandardMaterial color="#54748a" roughness={0.9} />
      </mesh>
      <mesh position={[0, wallHeight / 2, -halfDepth]}>
        <boxGeometry args={[roomDefinition.width, wallHeight, 0.12]} />
        <meshStandardMaterial color="#d8e7ea" roughness={0.84} />
      </mesh>
      <mesh position={[-halfWidth, wallHeight / 2, 0]}>
        <boxGeometry args={[0.12, wallHeight, roomDefinition.depth]} />
        <meshStandardMaterial color="#f4f0e8" roughness={0.85} />
      </mesh>
      <mesh position={[halfWidth, wallHeight / 2, 0]}>
        <boxGeometry args={[0.12, wallHeight, roomDefinition.depth]} />
        <meshStandardMaterial color="#f4f0e8" roughness={0.85} />
      </mesh>
      {[
        [0, 0.14, -halfDepth + 0.08, roomDefinition.width, 0.12, 0.08],
        [-halfWidth + 0.08, 0.14, 0, 0.08, 0.12, roomDefinition.depth],
        [halfWidth - 0.08, 0.14, 0, 0.08, 0.12, roomDefinition.depth],
      ].map(([x, y, z, width, height, depth], index) => (
        <mesh key={index} position={[x, y, z]}>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color="#ffffff" roughness={0.68} />
        </mesh>
      ))}
      <group position={[-2.1, 1.7, -halfDepth + 0.071]}>
        <mesh>
          <boxGeometry args={[1.35, 0.85, 0.025]} />
          <meshStandardMaterial color="#aed8f2" roughness={0.2} transparent opacity={0.62} />
        </mesh>
        {[
          [0, 0.47, 1.46, 0.08],
          [0, -0.47, 1.46, 0.08],
          [-0.72, 0, 0.08, 0.95],
          [0.72, 0, 0.08, 0.95],
          [0, 0, 0.08, 0.95],
        ].map(([x, y, width, height], index) => (
          <mesh key={index} position={[x, y, 0.02]}>
            <boxGeometry args={[width, height, 0.05]} />
            <meshStandardMaterial color="#ffffff" roughness={0.68} />
          </mesh>
        ))}
      </group>
      <mesh position={[1.85, 1.55, -halfDepth + 0.09]}>
        <boxGeometry args={[1.0, 0.72, 0.045]} />
        <meshStandardMaterial color="#ee8b6d" roughness={0.78} />
      </mesh>
      <mesh position={[1.85, 1.55, -halfDepth + 0.12]}>
        <boxGeometry args={[0.68, 0.44, 0.05]} />
        <meshStandardMaterial color="#25364a" roughness={0.8} />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 4: Add RoomScene**

Create `src/scene/RoomScene.tsx`:

```tsx
import { OrbitControls } from '@react-three/drei';

import { RoomShell } from './components/RoomShell';

export function RoomScene() {
  return (
    <>
      <color attach="background" args={['#cfd8e3']} />
      <hemisphereLight args={['#f6fbff', '#b2a28d', 2.2]} />
      <directionalLight position={[2.4, 5.2, 2.8]} intensity={2.4} />
      <directionalLight position={[-4, 3, -3]} color="#bfd7ff" intensity={0.8} />
      <RoomShell />
      <OrbitControls
        enableDamping
        minDistance={4.4}
        maxDistance={11}
        maxPolarAngle={Math.PI * 0.48}
        target={[0, 1.05, 0]}
      />
    </>
  );
}
```

- [ ] **Step 5: Wire canvas in App**

Replace `src/App.tsx` with:

```tsx
import { RoomCanvas } from './scene/RoomCanvas';
import { PlaygroundShell } from './ui/PlaygroundShell';

export function App() {
  return (
    <main id="app">
      <RoomCanvas />
      <PlaygroundShell />
    </main>
  );
}
```

- [ ] **Step 6: Verify static scene build**

Run:

```bash
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit static scene**

Run:

```bash
git add src/App.tsx src/scene/r3f-webgpu.ts src/scene/RoomCanvas.tsx src/scene/RoomScene.tsx src/scene/components/RoomShell.tsx
git commit -m "feat: add WebGPU R3F room scene"
```

## Task 7: Add Furniture Components, Selection, Hover, And Bounds

**Files:**
- Create: `src/scene/components/Sofa.tsx`
- Create: `src/scene/components/CoffeeTable.tsx`
- Create: `src/scene/components/LoungeChair.tsx`
- Create: `src/scene/components/Bookshelf.tsx`
- Create: `src/scene/components/Planter.tsx`
- Create: `src/scene/components/SelectionBounds.tsx`
- Create: `src/scene/components/FurnitureItem.tsx`
- Modify: `src/scene/RoomScene.tsx`

- [ ] **Step 1: Create furniture geometry components**

Create each geometry component by translating the matching factory function from `src/main.js` into JSX. Use these component names and root elements:

```tsx
// src/scene/components/Sofa.tsx
export function Sofa() {
  return (
    <group>
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[2.05, 0.34, 0.78]} />
        <meshStandardMaterial color="#3d6f84" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.78, -0.39]}>
        <boxGeometry args={[2.15, 0.86, 0.22]} />
        <meshStandardMaterial color="#2c5364" roughness={0.9} />
      </mesh>
      <mesh position={[-1.13, 0.62, 0.02]}>
        <boxGeometry args={[0.23, 0.62, 0.82]} />
        <meshStandardMaterial color="#2c5364" roughness={0.9} />
      </mesh>
      <mesh position={[1.13, 0.62, 0.02]}>
        <boxGeometry args={[0.23, 0.62, 0.82]} />
        <meshStandardMaterial color="#2c5364" roughness={0.9} />
      </mesh>
      {[-0.52, 0.52].map((x) => (
        <mesh key={x} position={[x, 0.61, 0.08]}>
          <boxGeometry args={[0.88, 0.12, 0.68]} />
          <meshStandardMaterial color="#3d6f84" roughness={0.86} />
        </mesh>
      ))}
      {[
        [-0.82, 0.13, 0.32],
        [0.82, 0.13, 0.32],
        [-0.82, 0.13, -0.32],
        [0.82, 0.13, -0.32],
      ].map(([x, y, z]) => (
        <mesh key={`${x}-${z}`} position={[x, y, z]}>
          <cylinderGeometry args={[0.045, 0.055, 0.26, 10]} />
          <meshStandardMaterial color="#46372f" roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}
```

Use the exact dimensions and colors from `src/main.js` for `CoffeeTable`, `LoungeChair`, `Bookshelf`, and `Planter`. Keep each component stateless.

- [ ] **Step 2: Add selection bounds component**

Create `src/scene/components/SelectionBounds.tsx`:

```tsx
import { Box } from '@react-three/drei';

import type { FurnitureLayoutItem } from '../../domain/types';

export function SelectionBounds({ item }: { item: FurnitureLayoutItem }) {
  const size = item.baseSize;

  return (
    <Box args={[size.width + 0.08, size.height + 0.08, size.depth + 0.08]} position={[0, size.height / 2, 0]}>
      <meshBasicMaterial color="#276ef1" wireframe />
    </Box>
  );
}
```

- [ ] **Step 3: Add FurnitureItem wrapper**

Create `src/scene/components/FurnitureItem.tsx`:

```tsx
import type { ThreeEvent } from '@react-three/fiber';
import type { ReactNode } from 'react';

import { radiansFromDegrees } from '../../domain/math';
import type { FurnitureLayoutItem as FurnitureLayoutItemData } from '../../domain/types';
import { useRoomStore } from '../../state/useRoomStore';
import { SelectionBounds } from './SelectionBounds';

interface FurnitureItemProps {
  item: FurnitureLayoutItemData;
  children: ReactNode;
}

export function FurnitureItem({ item, children }: FurnitureItemProps) {
  const selectedId = useRoomStore((state) => state.selectedId);
  const hoveredId = useRoomStore((state) => state.hoveredId);
  const selectFurniture = useRoomStore((state) => state.selectFurniture);
  const hoverFurniture = useRoomStore((state) => state.hoverFurniture);
  const isEmphasized = selectedId === item.id || hoveredId === item.id;

  function stopAndSelect(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    selectFurniture(item.id);
  }

  return (
    <group
      name={item.name}
      position={[item.position.x, item.position.y, item.position.z]}
      rotation={[0, radiansFromDegrees(item.rotation.yDegrees), 0]}
      onPointerDown={stopAndSelect}
      onPointerOver={(event) => {
        event.stopPropagation();
        hoverFurniture(item.id);
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        hoverFurniture(null);
      }}
    >
      {children}
      {isEmphasized ? <SelectionBounds item={item} /> : null}
    </group>
  );
}
```

- [ ] **Step 4: Render furniture in `RoomScene`**

Replace `src/scene/RoomScene.tsx` with:

```tsx
import { OrbitControls } from '@react-three/drei';

import { useRoomStore } from '../state/useRoomStore';
import { Bookshelf } from './components/Bookshelf';
import { CoffeeTable } from './components/CoffeeTable';
import { FurnitureItem } from './components/FurnitureItem';
import { LoungeChair } from './components/LoungeChair';
import { Planter } from './components/Planter';
import { RoomShell } from './components/RoomShell';
import { Sofa } from './components/Sofa';

const furnitureComponents = {
  sofa: <Sofa />,
  'coffee-table': <CoffeeTable />,
  'lounge-chair': <LoungeChair />,
  bookshelf: <Bookshelf />,
  planter: <Planter />,
};

export function RoomScene() {
  const furniture = useRoomStore((state) => state.furniture);
  const selectFurniture = useRoomStore((state) => state.selectFurniture);

  return (
    <>
      <color attach="background" args={['#cfd8e3']} />
      <hemisphereLight args={['#f6fbff', '#b2a28d', 2.2]} />
      <directionalLight position={[2.4, 5.2, 2.8]} intensity={2.4} />
      <directionalLight position={[-4, 3, -3]} color="#bfd7ff" intensity={0.8} />
      <group onPointerMissed={() => selectFurniture(null)}>
        <RoomShell />
        {Object.values(furniture).map((item) => (
          <FurnitureItem key={item.id} item={item}>
            {furnitureComponents[item.id]}
          </FurnitureItem>
        ))}
      </group>
      <OrbitControls
        enableDamping
        minDistance={4.4}
        maxDistance={11}
        maxPolarAngle={Math.PI * 0.48}
        target={[0, 1.05, 0]}
      />
    </>
  );
}
```

- [ ] **Step 5: Verify furniture build**

Run:

```bash
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit furniture scene**

Run:

```bash
git add src/scene/RoomScene.tsx src/scene/components
git commit -m "feat: render furniture as R3F components"
```

## Task 8: Add Dragging And Camera Mode Behavior

**Files:**
- Create: `src/scene/interactions/useFurnitureDrag.ts`
- Modify: `src/scene/components/FurnitureItem.tsx`
- Modify: `src/scene/RoomScene.tsx`

- [ ] **Step 1: Add drag hook**

Create `src/scene/interactions/useFurnitureDrag.ts`:

```ts
import { useCallback, useRef } from 'react';
import { Plane, Vector3 } from 'three';

import type { FurnitureId } from '../../domain/types';
import { useRoomStore } from '../../state/useRoomStore';

interface DragSession {
  id: FurnitureId;
  offset: Vector3;
}

const floorPlane = new Plane(new Vector3(0, 1, 0), 0);

export function useFurnitureDrag() {
  const session = useRef<DragSession | null>(null);
  const floorHit = useRef(new Vector3());
  const selectFurniture = useRoomStore((state) => state.selectFurniture);
  const moveFurniture = useRoomStore((state) => state.moveFurniture);

  const beginDrag = useCallback(
    (id: FurnitureId, objectPosition: Vector3, ray: { intersectPlane: (plane: Plane, target: Vector3) => Vector3 | null }) => {
      selectFurniture(id);

      if (ray.intersectPlane(floorPlane, floorHit.current)) {
        session.current = {
          id,
          offset: objectPosition.clone().sub(floorHit.current),
        };
      }
    },
    [selectFurniture],
  );

  const updateDrag = useCallback(
    (ray: { intersectPlane: (plane: Plane, target: Vector3) => Vector3 | null }) => {
      if (!session.current || !ray.intersectPlane(floorPlane, floorHit.current)) {
        return;
      }

      const next = floorHit.current.clone().add(session.current.offset);
      moveFurniture(session.current.id, { x: next.x, z: next.z });
    },
    [moveFurniture],
  );

  const endDrag = useCallback(() => {
    session.current = null;
  }, []);

  return {
    beginDrag,
    updateDrag,
    endDrag,
    isDragging: () => session.current !== null,
  };
}
```

- [ ] **Step 2: Wire drag hook into scene**

Modify `RoomScene` so it creates one drag hook and passes it to each `FurnitureItem`. Add a transparent floor-sized drag plane:

```tsx
const drag = useFurnitureDrag();

<mesh
  position={[0, 0.01, 0]}
  rotation={[-Math.PI / 2, 0, 0]}
  onPointerMove={(event) => drag.updateDrag(event.ray)}
  onPointerUp={drag.endDrag}
  onPointerCancel={drag.endDrag}
>
  <planeGeometry args={[9.6, 6.8]} />
  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
</mesh>
```

Pass `drag` into each `FurnitureItem`.

- [ ] **Step 3: Update FurnitureItem props for drag start**

Modify `src/scene/components/FurnitureItem.tsx`:

```tsx
import { Vector3 } from 'three';

interface FurnitureDragApi {
  beginDrag: (
    id: FurnitureLayoutItemData['id'],
    objectPosition: Vector3,
    ray: ThreeEvent<PointerEvent>['ray'],
  ) => void;
}

interface FurnitureItemProps {
  item: FurnitureLayoutItemData;
  drag: FurnitureDragApi;
  children: ReactNode;
}
```

In `stopAndSelect`, call:

```ts
drag.beginDrag(item.id, new Vector3(item.position.x, item.position.y, item.position.z), event.ray);
```

- [ ] **Step 4: Add camera mode effect**

In `RoomScene`, read `cameraMode`, `setCameraMode`, and use `useThree` to move the camera when `cameraMode === 'top'`:

```tsx
const { camera } = useThree();
const cameraMode = useRoomStore((state) => state.cameraMode);
const setCameraMode = useRoomStore((state) => state.setCameraMode);

useEffect(() => {
  if (cameraMode !== 'top') {
    return;
  }

  camera.position.set(0, 8.8, 0.001);
  camera.lookAt(0, 0, 0);
  setCameraMode('orbit');
}, [camera, cameraMode, setCameraMode]);
```

- [ ] **Step 5: Verify drag build**

Run:

```bash
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit interactions**

Run:

```bash
git add src/scene/interactions/useFurnitureDrag.ts src/scene/components/FurnitureItem.tsx src/scene/RoomScene.tsx
git commit -m "feat: add room furniture interactions"
```

## Task 9: Add Debug Hooks And Remove Legacy Entry

**Files:**
- Modify: `src/state/useRoomStore.ts`
- Modify: `src/App.tsx`
- Delete: `src/main.js`

- [ ] **Step 1: Add debug hook registration in `App.tsx`**

Append this component in `src/App.tsx` and render it inside `<main>`:

```tsx
import { useEffect } from 'react';
import { useRoomStore } from './state/useRoomStore';

function DebugHooks() {
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    window.__roomComposerDebug = {
      hasAnyOverlap: () => useRoomStore.getState().hasAnyOverlap(),
      exportLayout: () => useRoomStore.getState().createLayoutExport(),
      importLayout: (layout: unknown) => useRoomStore.getState().importLayout(layout),
      furniture: () =>
        Object.values(useRoomStore.getState().furniture).map((item) => ({
          id: item.id,
          name: item.name,
          x: Number(item.position.x.toFixed(3)),
          z: Number(item.position.z.toFixed(3)),
          rotation: Number(item.rotation.yDegrees.toFixed(1)),
        })),
    };
  }, []);

  return null;
}
```

Final `App` render:

```tsx
export function App() {
  return (
    <main id="app">
      <RoomCanvas />
      <PlaygroundShell />
      <DebugHooks />
    </main>
  );
}
```

- [ ] **Step 2: Add global debug type in `src/vite-env.d.ts`**

Append:

```ts
interface Window {
  __roomComposerDebug?: {
    hasAnyOverlap: () => boolean;
    exportLayout: () => import('./domain/types').RoomLayoutExport;
    importLayout: (layout: unknown) => import('./domain/types').ImportResult;
    furniture: () => Array<{
      id: string;
      name: string;
      x: number;
      z: number;
      rotation: number;
    }>;
  };
}
```

- [ ] **Step 3: Delete legacy imperative entry**

Run:

```bash
git rm src/main.js
```

- [ ] **Step 4: Verify build**

Run:

```bash
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 5: Commit debug and cleanup**

Run:

```bash
git add src/App.tsx src/vite-env.d.ts
git commit -m "chore: remove legacy three entry"
```

## Task 10: Update Smoke Test For React Playground

**Files:**
- Modify: `scripts/smoke.mjs`

- [ ] **Step 1: Preserve existing PNG analyzer**

Keep `analyzePng`, `unfilter`, and `paeth` unchanged in `scripts/smoke.mjs`.

- [ ] **Step 2: Update browser assertions**

In the main viewport loop, keep the same launch args. Update the page evaluation checks so they also validate `.side-panel`:

```js
const result = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const hud = document.querySelector('.hud');
  const sidePanel = document.querySelector('.side-panel');
  const webgpuMessage = document.querySelector('#webgpu-message');
  const selectedName = document.querySelector('#selected-name');
  const selectedPosition = document.querySelector('#selected-position');
  const rotateButton = document.querySelector('#rotate-object');
  const debug = window.__roomComposerDebug;

  if (!canvas) {
    return { ok: false, reason: 'missing canvas' };
  }

  const canvasBox = canvas.getBoundingClientRect();
  const hudBox = hud.getBoundingClientRect();
  const sidePanelBox = sidePanel.getBoundingClientRect();
  const messageVisible = webgpuMessage && !webgpuMessage.hidden;
  const exported = debug.exportLayout();
  const validImport = debug.importLayout(exported);
  const invalid = structuredClone(exported);
  invalid.furniture[1].position = { ...invalid.furniture[0].position };
  let invalidRejected = false;

  try {
    debug.importLayout(invalid);
  } catch {
    invalidRejected = true;
  }

  return {
    ok: !messageVisible,
    canvas: {
      width: Math.round(canvasBox.width),
      height: Math.round(canvasBox.height),
    },
    hud: {
      top: Math.round(hudBox.top),
      left: Math.round(hudBox.left),
      right: Math.round(hudBox.right),
      bottom: Math.round(hudBox.bottom),
    },
    sidePanel: {
      top: Math.round(sidePanelBox.top),
      left: Math.round(sidePanelBox.left),
      right: Math.round(sidePanelBox.right),
      bottom: Math.round(sidePanelBox.bottom),
    },
    messageVisible,
    selectedName: selectedName.textContent,
    selectedPosition: selectedPosition.textContent,
    rotateDisabled: rotateButton.disabled,
    hasAnyOverlap: debug.hasAnyOverlap(),
    interchange: {
      schemaVersion: exported.schemaVersion,
      furnitureCount: exported.furniture.length,
      validApplied: validImport.applied,
      invalidRejected,
      hasAnyOverlap: debug.hasAnyOverlap(),
    },
  };
});
```

- [ ] **Step 3: Keep interaction flow**

Keep the existing mouse click, rotate, and drag sequence. If the click target no longer selects furniture, use the debug furniture positions to pick a reliable center-screen target and update only these coordinates:

```js
const clickTarget = {
  x: Math.round(viewport.width * 0.53),
  y: Math.round(viewport.height * 0.62),
};
```

- [ ] **Step 4: Add side panel fit assertion**

After the HUD fit assertion, add:

```js
const sidePanelFits =
  result.sidePanel.left >= 0 &&
  result.sidePanel.right <= viewport.width &&
  result.sidePanel.bottom <= viewport.height;

if (!sidePanelFits) {
  throw new Error(`${viewport.name}: side panel layout escapes viewport: ${JSON.stringify(result.sidePanel)}`);
}
```

- [ ] **Step 5: Run smoke with dev server**

Start the dev server:

```bash
npm run dev
```

In another shell, run:

```bash
npm run smoke
```

Expected:

```text
desktop: canvas ...
mobile: canvas ...
```

No browser console errors, no missing canvas, no overlap, and no viewport fit failures.

- [ ] **Step 6: Commit smoke update**

Run:

```bash
git add scripts/smoke.mjs
git commit -m "test: update smoke coverage for React room composer"
```

## Task 11: Final Styling Pass, Verification, And Documentation Check

**Files:**
- Modify: `src/styles.css`
- Modify: any React file that fails verification

- [ ] **Step 1: Run full verification**

Run:

```bash
npm run test
npm run build
npm run smoke
```

Expected: PASS for all commands.

- [ ] **Step 2: Inspect CSS color balance and responsive constraints**

Run:

```bash
rg -n "#[0-9a-fA-F]{3,8}|rgba?\\(" src/styles.css
```

Expected: colors are not dominated by one hue family, UI text has stable dimensions, and mobile rules keep the toolbar and bottom inspector within the viewport.

- [ ] **Step 3: Check working tree for generated screenshots**

Run:

```bash
git status --short
```

If smoke screenshots are untracked, leave them uncommitted unless the repository already tracks them.

- [ ] **Step 4: Commit final refinements if any files changed**

If Step 1 or Step 2 required code or CSS fixes, run:

```bash
git add src scripts package.json package-lock.json
git commit -m "fix: polish React room composer migration"
```

If no files changed, do not create an empty commit.

## Final Acceptance Checklist

- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] `npm run smoke` passes on desktop and mobile.
- [ ] App starts from `src/main.tsx`.
- [ ] `src/main.js` is removed.
- [ ] R3F Canvas uses WebGPU async renderer setup.
- [ ] WebGPU unavailable state shows a blocking message.
- [ ] Zustand is the source of truth for furniture transforms.
- [ ] Top toolbar, right inspector, and AI assistant stub are visible.
- [ ] Mobile view uses a compact bottom panel at or below `720px`.
- [ ] Users can select, hover, drag, rotate, reset, import, export, and use top view.
- [ ] Inspector can edit selected furniture `x`, `z`, and rotation.
- [ ] Invalid overlap transforms are rejected.
- [ ] Layout export remains schema version `1`.
- [ ] Imports restore previous layout on failure.
- [ ] `skills/room-layout-ai-agent/references/layout-schema.md` remains compatible with the exported shape.
