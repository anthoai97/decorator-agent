import { clamp, round } from './math';
import type {
  ApplyWallObjectMoveResult,
  RoomDefinition,
  RoomWallId,
  WallObjectId,
  WallObjectLayoutItem,
  WallObjectLayoutMap,
  WallObjectMovePatch,
  WallObjectPosition,
} from './types';

export type Vector3Tuple = [number, number, number];

export interface WallObjectBounds {
  minU: number;
  maxU: number;
  minY: number;
  maxY: number;
}

export interface WallObjectEdgeDistances {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export interface WallObjectWorldTransform {
  position: Vector3Tuple;
  rotation: Vector3Tuple;
}

export function createWallObjectBounds(room: RoomDefinition, wallId: RoomWallId): WallObjectBounds {
  const horizontalBounds =
    wallId === 'front' || wallId === 'back'
      ? { minU: room.bounds.minX, maxU: room.bounds.maxX }
      : { minU: room.bounds.minZ, maxU: room.bounds.maxZ };

  return {
    ...horizontalBounds,
    minY: 0,
    maxY: room.height,
  };
}

export function clampWallObjectInsideWall(
  item: WallObjectLayoutItem,
  room: RoomDefinition,
): WallObjectLayoutItem {
  const bounds = createWallObjectBounds(room, item.wallId);
  const halfWidth = item.size.width / 2;
  const halfHeight = item.size.height / 2;

  return {
    ...item,
    position: {
      u: round(clamp(item.position.u, bounds.minU + halfWidth, bounds.maxU - halfWidth)),
      y: round(clamp(item.position.y, bounds.minY + halfHeight, bounds.maxY - halfHeight)),
    },
  };
}

export function cloneWallObjectLayout(layout: WallObjectLayoutMap): WallObjectLayoutMap {
  return Object.fromEntries(
    Object.values(layout).map((item) => [
      item.id,
      cloneWallObjectItem(item),
    ]),
  ) as WallObjectLayoutMap;
}

export function cloneWallObjectItem(item: WallObjectLayoutItem): WallObjectLayoutItem {
  return {
    ...item,
    position: { ...item.position },
    size: { ...item.size },
  };
}

export function applyWallObjectPositionPatch(
  layout: WallObjectLayoutMap,
  room: RoomDefinition,
  wallObjectId: WallObjectId,
  patch: WallObjectMovePatch | WallObjectPosition,
): ApplyWallObjectMoveResult {
  const existing = layout[wallObjectId];

  if (!existing) {
    return {
      applied: false,
      clamped: false,
      reason: 'missing-wall-object',
      wallObjects: layout,
    };
  }

  const nextWallObjects = cloneWallObjectLayout(layout);
  const movePatch = normalizeWallObjectMovePatch(patch);
  const nextItem = {
    ...nextWallObjects[wallObjectId],
    wallId: movePatch.wallId ?? existing.wallId,
    position: { ...movePatch.position },
  };
  const clampedItem = clampWallObjectInsideWall(nextItem, room);

  nextWallObjects[wallObjectId] = clampedItem;

  return {
    applied: true,
    clamped: (
      clampedItem.position.u !== nextItem.position.u ||
      clampedItem.position.y !== nextItem.position.y
    ),
    reason: 'applied',
    wallObjects: nextWallObjects,
  };
}

function normalizeWallObjectMovePatch(patch: WallObjectMovePatch | WallObjectPosition): WallObjectMovePatch {
  if ('position' in patch) {
    return patch;
  }

  return { position: patch };
}

export function createWallObjectEdgeDistances(
  item: WallObjectLayoutItem,
  room: RoomDefinition,
): WallObjectEdgeDistances {
  const bounds = createWallObjectBounds(room, item.wallId);
  const halfWidth = item.size.width / 2;
  const halfHeight = item.size.height / 2;

  return {
    left: round(item.position.u - halfWidth - bounds.minU),
    right: round(bounds.maxU - item.position.u - halfWidth),
    bottom: round(item.position.y - halfHeight - bounds.minY),
    top: round(bounds.maxY - item.position.y - halfHeight),
  };
}

export function getWallObjectWorldTransform(
  item: WallObjectLayoutItem,
  room: RoomDefinition,
): WallObjectWorldTransform {
  const halfWidth = room.width / 2;
  const halfDepth = room.depth / 2;

  switch (item.wallId) {
    case 'front':
      return {
        position: [round(item.position.u), round(item.position.y), round(halfDepth - item.normalOffset)],
        rotation: [0, Math.PI, 0],
      };
    case 'back':
      return {
        position: [round(item.position.u), round(item.position.y), round(-halfDepth + item.normalOffset)],
        rotation: [0, 0, 0],
      };
    case 'left':
      return {
        position: [round(-halfWidth + item.normalOffset), round(item.position.y), round(item.position.u)],
        rotation: [0, Math.PI / 2, 0],
      };
    case 'right':
      return {
        position: [round(halfWidth - item.normalOffset), round(item.position.y), round(item.position.u)],
        rotation: [0, -Math.PI / 2, 0],
      };
  }
}
