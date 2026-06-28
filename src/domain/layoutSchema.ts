import {
  clampTransformInsideRoom,
  cloneLayout,
  furnitureFootprint,
  hasAnyOverlap,
  rotationAwareSize,
} from './collision';
import { round, snapDegrees } from './math';
import type {
  Footprint,
  FurnitureId,
  FurnitureLayoutItem,
  FurnitureLayoutMap,
  ImportResult,
  LayoutExportItem,
  RoomBounds,
  RoomDefinition,
  RoomLayoutExport,
  Size3Data,
  TransformPatch,
  Vector3Data,
} from './types';

interface ImportMatch {
  id: FurnitureId;
  patch: TransformPatch;
}

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
      bounds: roundRoomBounds(room.bounds),
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

  const matches = items.reduce<ImportMatch[]>((matchedItems, item) => {
    const id = findFurnitureId(item, currentLayout);

    if (id) {
      matchedItems.push({ id, patch: readTransformPatch(item) });
    }

    return matchedItems;
  }, []);

  if (matches.length === 0) {
    throw new Error('Layout JSON did not match any furniture IDs or names.');
  }

  const layout = applyImport(matches, currentLayout, room);

  if (!layout) {
    throw new Error('Imported layout has overlapping furniture.');
  }

  return { applied: matches.length, layout };
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
    position: roundVector3(item.position),
    rotation: {
      yDegrees: round(item.rotation.yDegrees, 1),
    },
    size: roundSize(size),
    footprint: roundFootprint(footprint),
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
