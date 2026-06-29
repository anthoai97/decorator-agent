import {
  clampTransformInsideRoom,
  cloneLayout,
  furnitureFootprint,
  hasAnyOverlap,
  rotationAwareSize,
} from './collision';
import { round, snapDegrees } from './math';
import {
  clampWallObjectInsideWall,
  cloneWallObjectLayout,
} from './wallObjectPlacement';
import type {
  Footprint,
  FurnitureId,
  FurnitureLayoutItem,
  FurnitureLayoutMap,
  ImportResult,
  LayoutExportItem,
  RoomBounds,
  RoomDefinition,
  RoomWallId,
  RoomLayoutExport,
  Size3Data,
  TransformPatch,
  Vector3Data,
  WallObjectId,
  WallObjectLayoutItem,
  WallObjectLayoutMap,
  WallObjectLayoutExportItem,
  WallObjectPosition,
} from './types';

interface ImportMatch {
  id: FurnitureId;
  patch: TransformPatch;
}

interface WallObjectImportMatch {
  id: WallObjectId;
  position: Partial<WallObjectPosition>;
  wallId?: RoomWallId;
}

export function createLayoutExport(
  layout: FurnitureLayoutMap,
  room: RoomDefinition,
  wallObjects?: WallObjectLayoutMap,
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
      bounds: roundRoomBounds(room.bounds),
    },
    furniture: Object.values(layout).map(createExportItem),
    ...(wallObjects ? { wallObjects: Object.values(wallObjects).map(createWallObjectExportItem) } : {}),
  };
}

export function importLayoutFromUnknown(
  source: unknown,
  currentLayout: FurnitureLayoutMap,
  room: RoomDefinition,
  currentWallObjects?: WallObjectLayoutMap,
): ImportResult {
  const items = normalizeLayoutItems(source);
  const wallObjectItems = normalizeWallObjectLayoutItems(source);

  if (items.length === 0 && wallObjectItems.length === 0) {
    throw new Error('Layout JSON does not contain a furniture array.');
  }

  const matches = items.reduce<ImportMatch[]>((matchedItems, item) => {
    const id = findFurnitureId(item, currentLayout);

    if (id) {
      matchedItems.push({ id, patch: readTransformPatch(item) });
    }

    return matchedItems;
  }, []);
  const wallObjectMatches = currentWallObjects
    ? wallObjectItems.reduce<WallObjectImportMatch[]>((matchedItems, item) => {
        const id = findWallObjectId(item, currentWallObjects);

        if (id) {
          const patch = readWallObjectImportPatch(item);

          if (patch) {
            matchedItems.push({ id, ...patch });
          }
        }

        return matchedItems;
      }, [])
    : [];

  if (matches.length === 0 && wallObjectMatches.length === 0) {
    throw new Error('Layout JSON did not match any furniture IDs or names.');
  }

  const layout = applyImport(matches, currentLayout, room);

  if (!layout) {
    throw new Error('Imported layout has overlapping furniture.');
  }

  const wallObjects = currentWallObjects
    ? applyWallObjectImport(wallObjectMatches, currentWallObjects, room)
    : undefined;

  return {
    applied: matches.length + wallObjectMatches.length,
    layout,
    ...(wallObjects ? { wallObjects } : {}),
  };
}

function applyImport(
  matches: ImportMatch[],
  currentLayout: FurnitureLayoutMap,
  room: RoomDefinition,
): FurnitureLayoutMap | null {
  const nextLayout = cloneLayout(currentLayout);

  for (const match of matches) {
    const item = nextLayout[match.id];

    nextLayout[match.id] = clampTransformInsideRoom(
      {
        ...item,
        position: {
          ...item.position,
          ...match.patch.position,
        },
        rotation: {
          yDegrees: snapDegrees(match.patch.rotation?.yDegrees ?? item.rotation.yDegrees),
        },
      },
      room,
    );
  }

  return hasAnyOverlap(nextLayout) ? null : nextLayout;
}

function createExportItem(item: FurnitureLayoutItem): LayoutExportItem {
  const size = rotationAwareSize(item.baseSize, item.rotation.yDegrees);
  const footprint = furnitureFootprint(item);

  return {
    id: item.id,
    name: item.name,
    movable: item.movable,
    blocksPlacement: item.blocksPlacement,
    position: roundVector3(item.position),
    rotation: {
      yDegrees: round(item.rotation.yDegrees, 1),
    },
    size: roundSize(size),
    footprint: roundFootprint(footprint),
  };
}

function createWallObjectExportItem(item: WallObjectLayoutItem): WallObjectLayoutExportItem {
  return {
    id: item.id,
    name: item.name,
    wallId: item.wallId,
    movable: item.movable,
    position: {
      u: round(item.position.u),
      y: round(item.position.y),
    },
    size: roundSize(item.size),
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

function normalizeWallObjectLayoutItems(source: unknown): Record<string, unknown>[] {
  if (!isRecord(source)) {
    return [];
  }

  return Array.isArray(source.wallObjects) ? source.wallObjects.filter(isRecord) : [];
}

function findFurnitureId(
  item: Record<string, unknown>,
  layout: FurnitureLayoutMap,
): FurnitureId | null {
  const candidates = [item.id, item.layoutId, item.name, item.label];

  for (const candidate of candidates) {
    const id = findCandidateFurnitureId(candidate, layout);

    if (id) {
      return id;
    }
  }

  return null;
}

function findCandidateFurnitureId(
  candidate: unknown,
  layout: FurnitureLayoutMap,
): FurnitureId | null {
  const token = normalizeToken(candidate);

  if (token.length === 0) {
    return null;
  }

  return (
    Object.values(layout).find((furniture) => (
      normalizeToken(furniture.id) === token ||
      normalizeToken(furniture.name) === token
    ))?.id ?? null
  );
}

function findWallObjectId(
  item: Record<string, unknown>,
  layout: WallObjectLayoutMap,
): WallObjectId | null {
  const candidates = [item.id, item.layoutId, item.name, item.label];

  for (const candidate of candidates) {
    const id = findCandidateWallObjectId(candidate, layout);

    if (id) {
      return id;
    }
  }

  return null;
}

function findCandidateWallObjectId(
  candidate: unknown,
  layout: WallObjectLayoutMap,
): WallObjectId | null {
  const token = normalizeToken(candidate);

  if (token.length === 0) {
    return null;
  }

  return (
    Object.values(layout).find((wallObject) => (
      normalizeToken(wallObject.id) === token ||
      normalizeToken(wallObject.name) === token
    ))?.id ?? null
  );
}

function applyWallObjectImport(
  matches: WallObjectImportMatch[],
  currentWallObjects: WallObjectLayoutMap,
  room: RoomDefinition,
): WallObjectLayoutMap {
  const nextWallObjects = cloneWallObjectLayout(currentWallObjects);

  for (const match of matches) {
    const item = nextWallObjects[match.id];

    nextWallObjects[match.id] = clampWallObjectInsideWall(
      {
        ...item,
        wallId: match.wallId ?? item.wallId,
        position: {
          ...item.position,
          ...match.position,
        },
      },
      room,
    );
  }

  return nextWallObjects;
}

function readTransformPatch(item: Record<string, unknown>): TransformPatch {
  const patch: TransformPatch = {};
  const position = readRecord(item.position) ?? readRecord(item.translation);
  const positionPatch = position ? readPositionPatch(position) : undefined;

  if (positionPatch) {
    patch.position = positionPatch;
  }

  const yDegrees = readRotationDegrees(item);

  if (yDegrees !== undefined) {
    patch.rotation = { yDegrees };
  }

  return patch;
}

function readWallObjectImportPatch(
  item: Record<string, unknown>,
): Pick<WallObjectImportMatch, 'position' | 'wallId'> | undefined {
  const position = readRecord(item.position) ?? readRecord(item.translation);
  const wallId = readRoomWallId(item.wallId);
  const patch: Pick<WallObjectImportMatch, 'position' | 'wallId'> = { position: {} };

  const u = position ? readNumber(position.u) : undefined;
  const y = position ? readNumber(position.y) : undefined;

  if (u !== undefined) {
    patch.position.u = u;
  }

  if (y !== undefined) {
    patch.position.y = y;
  }

  if (wallId) {
    patch.wallId = wallId;
  }

  return Object.keys(patch.position).length > 0 || patch.wallId ? patch : undefined;
}

function readPositionPatch(position: Record<string, unknown>): Partial<Vector3Data> | undefined {
  const patch: Partial<Vector3Data> = {};
  const x = readNumber(position.x);
  const y = readNumber(position.y);
  const z = readNumber(position.z);

  if (x !== undefined) {
    patch.x = x;
  }

  if (y !== undefined) {
    patch.y = y;
  }

  if (z !== undefined) {
    patch.z = z;
  }

  return Object.keys(patch).length > 0 ? patch : undefined;
}

function readRotationDegrees(item: Record<string, unknown>): number | undefined {
  const rotation = readRecord(item.rotation);
  const rawDegrees = readNumber(
    item.rotationYDegrees ??
      item.yDegrees ??
      rotation?.yDegrees ??
      rotation?.degreesY,
  );

  if (rawDegrees !== undefined) {
    return rawDegrees;
  }

  const rawRadians = readNumber(
    item.rotationY ??
      rotation?.y ??
      rotation?.yRadians,
  );

  return rawRadians === undefined ? undefined : radiansToDegrees(rawRadians);
}

function roundVector3(value: Vector3Data): Vector3Data {
  return {
    x: round(value.x),
    y: round(value.y),
    z: round(value.z),
  };
}

function roundSize(value: Size3Data): Size3Data {
  return {
    width: round(value.width),
    height: round(value.height),
    depth: round(value.depth),
  };
}

function roundFootprint(value: Footprint): Footprint {
  return {
    minX: round(value.minX),
    maxX: round(value.maxX),
    minZ: round(value.minZ),
    maxZ: round(value.maxZ),
  };
}

function roundRoomBounds(value: RoomBounds): RoomBounds {
  return {
    minX: round(value.minX),
    maxX: round(value.maxX),
    minZ: round(value.minZ),
    maxZ: round(value.maxZ),
  };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function readRoomWallId(value: unknown): RoomWallId | undefined {
  const token = normalizeToken(value);

  if (token === 'front' || token === 'back' || token === 'left' || token === 'right') {
    return token;
  }

  return undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return undefined;
  }

  if (typeof value === 'string' && value.trim() === '') {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
