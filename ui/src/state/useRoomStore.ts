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

  moveFurniture: (id, nextPosition) => (
    get().setFurnitureTransform(id, {
      position: { x: nextPosition.x, z: nextPosition.z },
    })
  ),

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

  resetLayout: () => {
    set((state) => ({
      furniture: cloneLayout(state.initialFurniture),
      layoutStatus: 'Layout reset',
    }));
  },

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
