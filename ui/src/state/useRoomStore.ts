import { create } from 'zustand';

import type { Artifact, ArtifactBatchResponse } from '../api/artifacts';
import type { Objective, ServerStateResponse, ServerStreamEvent } from '../api/serverEvents';
import { createInitialFurnitureLayout, roomDefinition } from '../data/furnitureCatalog';
import { createInitialWallObjectLayout } from '../data/wallObjectCatalog';
import { applyTransformPatch, cloneLayout, hasAnyOverlap } from '../domain/collision';
import { createLayoutExport, importLayoutFromUnknown } from '../domain/layoutSchema';
import {
  applyWallObjectPositionPatch,
  cloneWallObjectItem,
  cloneWallObjectLayout,
} from '../domain/wallObjectPlacement';
import type {
  ApplyTransformResult,
  ApplyWallObjectMoveResult,
  DragMeasurementTarget,
  FurnitureId,
  FurnitureLayoutItem,
  FurnitureLayoutMap,
  ImportResult,
  RoomLayoutExport,
  TransformPatch,
  WallObjectId,
  WallObjectLayoutItem,
  WallObjectLayoutMap,
  WallObjectMovePatch,
  WallObjectPosition,
} from '../domain/types';

type CameraMode = 'orbit' | 'top';

interface RoomStore {
  furniture: FurnitureLayoutMap;
  initialFurniture: FurnitureLayoutMap;
  wallObjects: WallObjectLayoutMap;
  initialWallObjects: WallObjectLayoutMap;
  objectives: Objective[];
  artifactMetadataById: Record<string, Artifact>;
  missingArtifactIds: string[];
  serverRevision: number;
  lastEventId: number;
  selectedId: FurnitureId | null;
  layoutStatus: string;
  cameraMode: CameraMode;
  activeDragMeasurementTarget: DragMeasurementTarget | null;
  selectFurniture: (id: FurnitureId | null) => void;
  moveFurniture: (id: FurnitureId, nextPosition: { x: number; z: number }) => ApplyTransformResult;
  moveWallObject: (id: WallObjectId, patch: WallObjectMovePatch | WallObjectPosition) => ApplyWallObjectMoveResult;
  rotateSelected: () => ApplyTransformResult | null;
  setFurnitureTransform: (id: FurnitureId, patch: TransformPatch) => ApplyTransformResult;
  setTransformFromInspector: (id: FurnitureId, patch: TransformPatch) => ApplyTransformResult;
  resetLayout: () => void;
  createLayoutExport: () => RoomLayoutExport;
  importLayout: (layout: unknown) => ImportResult;
  hydrateServerState: (snapshot: ServerStateResponse) => void;
  applyServerEvent: (event: ServerStreamEvent) => void;
  hydrateArtifactMetadata: (response: ArtifactBatchResponse) => void;
  setCameraMode: (mode: CameraMode) => void;
  setActiveDragMeasurementTarget: (target: DragMeasurementTarget | null) => void;
  showLayoutStatus: (message: string) => void;
  hasAnyOverlap: () => boolean;
}

const initialFurniture = createInitialFurnitureLayout();
const initialWallObjects = createInitialWallObjectLayout();

export const useRoomStore = create<RoomStore>((set, get) => ({
  furniture: cloneLayout(initialFurniture),
  initialFurniture: cloneLayout(initialFurniture),
  wallObjects: cloneWallObjectLayout(initialWallObjects),
  initialWallObjects: cloneWallObjectLayout(initialWallObjects),
  objectives: [],
  artifactMetadataById: {},
  missingArtifactIds: [],
  serverRevision: 0,
  lastEventId: 0,
  selectedId: null,
  layoutStatus: '',
  cameraMode: 'orbit',
  activeDragMeasurementTarget: null,

  selectFurniture: (id) => set({ selectedId: id }),

  moveFurniture: (id, nextPosition) => (
    get().setFurnitureTransform(id, {
      position: { x: nextPosition.x, z: nextPosition.z },
    })
  ),

  moveWallObject: (id, patch) => {
    const result = applyWallObjectPositionPatch(get().wallObjects, roomDefinition, id, patch);

    if (result.applied) {
      set({ wallObjects: result.wallObjects });
    }

    return result;
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

  resetLayout: () => {
    set((state) => ({
      furniture: cloneLayout(state.initialFurniture),
      wallObjects: cloneWallObjectLayout(state.initialWallObjects),
      objectives: [],
      artifactMetadataById: {},
      missingArtifactIds: [],
      serverRevision: 0,
      lastEventId: 0,
      layoutStatus: 'Layout reset',
    }));
  },

  createLayoutExport: () => createLayoutExport(get().furniture, roomDefinition, get().wallObjects),

  importLayout: (layout) => {
    const result = importLayoutFromUnknown(layout, get().furniture, roomDefinition, get().wallObjects);
    set({
      furniture: result.layout,
      wallObjects: result.wallObjects ?? get().wallObjects,
      layoutStatus: `Imported ${result.applied} objects`,
    });
    return result;
  },

  hydrateServerState: (snapshot) => {
    const furniture = cloneLayout(snapshot.state.furniture);
    const wallObjects = cloneWallObjectLayout(snapshot.state.wallObjects ?? get().initialWallObjects);
    set((state) => ({
      furniture,
      wallObjects,
      objectives: cloneObjectives(snapshot.state.objectives),
      serverRevision: snapshot.revision,
      lastEventId: snapshot.lastEventId,
      layoutStatus: 'Synced with server',
      selectedId: hasFurniture(furniture, state.selectedId) ? state.selectedId : null,
    }));
  },

  applyServerEvent: (event) => {
    if (event.type === 'room.state.snapshot' && event.state) {
      const snapshot = event.state;
      const furniture = cloneLayout(snapshot.furniture);
      const wallObjects = cloneWallObjectLayout(snapshot.wallObjects ?? get().initialWallObjects);
      set((state) => ({
        furniture,
        wallObjects,
        objectives: cloneObjectives(snapshot.objectives),
        serverRevision: event.revision ?? snapshot.revision,
        lastEventId: event.id,
        selectedId: hasFurniture(furniture, state.selectedId) ? state.selectedId : null,
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

        for (const [id, item] of Object.entries(event.patch.furniture) as Array<[FurnitureId, FurnitureLayoutItem | null]>) {
          if (item === null) {
            delete (nextFurniture as Partial<FurnitureLayoutMap>)[id];
            selectedId = selectedId === id ? null : selectedId;
          } else {
            nextFurniture[id] = cloneFurnitureItem(item);
          }
        }

        nextState.furniture = nextFurniture;
        nextState.selectedId = selectedId;
      }

      if (event.patch?.wallObjects) {
        const nextWallObjects = { ...state.wallObjects };

        for (const [id, item] of Object.entries(event.patch.wallObjects) as Array<[WallObjectId, WallObjectLayoutItem | null]>) {
          if (item === null) {
            delete (nextWallObjects as Partial<WallObjectLayoutMap>)[id];
          } else {
            nextWallObjects[id] = cloneWallObjectItem(item);
          }
        }

        nextState.wallObjects = nextWallObjects;
      }

      if (event.patch?.objectives) {
        nextState.objectives = cloneObjectives(event.patch.objectives);
      }

      return nextState;
    });
  },

  hydrateArtifactMetadata: (response) => {
    const artifactMetadataById = response.artifacts.reduce<Record<string, Artifact>>((metadataById, artifact) => {
      metadataById[artifact.id] = { ...artifact };
      return metadataById;
    }, {});

    set({
      artifactMetadataById,
      missingArtifactIds: [...response.missingIds],
    });
  },

  setCameraMode: (mode) => set({ cameraMode: mode }),
  setActiveDragMeasurementTarget: (target) => set({ activeDragMeasurementTarget: target }),
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
