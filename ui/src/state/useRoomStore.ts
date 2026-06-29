import { create } from 'zustand';

import type { Objective, ServerStateResponse, ServerStreamEvent } from '../api/serverEvents';
import { createInitialFurnitureLayout, roomDefinition } from '../data/furnitureCatalog';
import { applyTransformPatch, cloneLayout, hasAnyOverlap } from '../domain/collision';
import { createLayoutExport, importLayoutFromUnknown } from '../domain/layoutSchema';
import type {
  ApplyTransformResult,
  FurnitureId,
  FurnitureLayoutItem,
  FurnitureLayoutMap,
  ImportResult,
  RoomLayoutExport,
  TransformPatch,
} from '../domain/types';

type CameraMode = 'orbit' | 'top';

interface RoomStore {
  furniture: FurnitureLayoutMap;
  initialFurniture: FurnitureLayoutMap;
  objectives: Objective[];
  serverRevision: number;
  lastEventId: number;
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
  hydrateServerState: (snapshot: ServerStateResponse) => void;
  applyServerEvent: (event: ServerStreamEvent) => void;
  setCameraMode: (mode: CameraMode) => void;
  showLayoutStatus: (message: string) => void;
  hasAnyOverlap: () => boolean;
}

const initialFurniture = createInitialFurnitureLayout();

export const useRoomStore = create<RoomStore>((set, get) => ({
  furniture: cloneLayout(initialFurniture),
  initialFurniture: cloneLayout(initialFurniture),
  objectives: [],
  serverRevision: 0,
  lastEventId: 0,
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
      objectives: [],
      serverRevision: 0,
      lastEventId: 0,
      layoutStatus: 'Layout reset',
    }));
  },

  createLayoutExport: () => createLayoutExport(get().furniture, roomDefinition),

  importLayout: (layout) => {
    const result = importLayoutFromUnknown(layout, get().furniture, roomDefinition);
    set({ furniture: result.layout, layoutStatus: `Imported ${result.applied} objects` });
    return result;
  },

  hydrateServerState: (snapshot) => {
    const furniture = cloneLayout(snapshot.state.furniture);
    set((state) => ({
      furniture,
      objectives: cloneObjectives(snapshot.state.objectives),
      serverRevision: snapshot.revision,
      lastEventId: snapshot.lastEventId,
      layoutStatus: 'Synced with server',
      selectedId: hasFurniture(furniture, state.selectedId) ? state.selectedId : null,
      hoveredId: hasFurniture(furniture, state.hoveredId) ? state.hoveredId : null,
    }));
  },

  applyServerEvent: (event) => {
    if (event.type === 'room.state.snapshot' && event.state) {
      const furniture = cloneLayout(event.state.furniture);
      set((state) => ({
        furniture,
        objectives: cloneObjectives(event.state.objectives),
        serverRevision: event.revision ?? event.state.revision,
        lastEventId: event.id,
        selectedId: hasFurniture(furniture, state.selectedId) ? state.selectedId : null,
        hoveredId: hasFurniture(furniture, state.hoveredId) ? state.hoveredId : null,
      }));
      return;
    }

    if (event.type !== 'room.state.patch' || !event.patch) {
      set((state) => ({
        serverRevision: event.revision ?? state.serverRevision,
        lastEventId: event.id,
      }));
      return;
    }

    set((state) => {
      const nextState: Partial<RoomStore> = {
        serverRevision: event.revision ?? state.serverRevision,
        lastEventId: event.id,
      };

      if (event.patch?.furniture) {
        const nextFurniture = { ...state.furniture };
        let selectedId = state.selectedId;
        let hoveredId = state.hoveredId;

        for (const [id, item] of Object.entries(event.patch.furniture) as Array<[FurnitureId, FurnitureLayoutItem | null]>) {
          if (item === null) {
            delete (nextFurniture as Partial<FurnitureLayoutMap>)[id];
            selectedId = selectedId === id ? null : selectedId;
            hoveredId = hoveredId === id ? null : hoveredId;
          } else {
            nextFurniture[id] = cloneFurnitureItem(item);
          }
        }

        nextState.furniture = nextFurniture;
        nextState.selectedId = selectedId;
        nextState.hoveredId = hoveredId;
      }

      if (event.patch?.objectives) {
        nextState.objectives = cloneObjectives(event.patch.objectives);
      }

      return nextState;
    });
  },

  setCameraMode: (mode) => set({ cameraMode: mode }),
  showLayoutStatus: (message) => set({ layoutStatus: message }),
  hasAnyOverlap: () => hasAnyOverlap(get().furniture),
}));

function cloneObjectives(objectives: Objective[]): Objective[] {
  return objectives.map((objective) => ({ ...objective }));
}

function cloneFurnitureItem(item: FurnitureLayoutItem): FurnitureLayoutItem {
  return {
    ...item,
    blocksPlacement: item.blocksPlacement,
    position: { ...item.position },
    rotation: { ...item.rotation },
    baseSize: { ...item.baseSize },
  };
}

function hasFurniture(furniture: FurnitureLayoutMap, id: FurnitureId | null): boolean {
  return id === null || furniture[id] !== undefined;
}
