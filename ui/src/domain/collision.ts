import { roomDefinition } from '../data/furnitureCatalog';
import { clamp, round, snapDegrees } from './math';
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

function roundFootprint(value: number): number {
  return round(value, 3);
}

export function cloneLayout(layout: FurnitureLayoutMap): FurnitureLayoutMap {
  return Object.fromEntries(
    Object.values(layout).map((item) => [
      item.id,
      {
        id: item.id,
        name: item.name,
        movable: item.movable,
        blocksPlacement: item.blocksPlacement,
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

export function insetFootprint(footprint: Footprint, inset: number): Footprint {
  return {
    minX: roundFootprint(footprint.minX + inset),
    maxX: roundFootprint(footprint.maxX - inset),
    minZ: roundFootprint(footprint.minZ + inset),
    maxZ: roundFootprint(footprint.maxZ - inset),
  };
}

export function furnitureFootprint(item: FurnitureLayoutItem): Footprint {
  return insetFootprint(
    createFootprint(item.position, rotationAwareSize(item.baseSize, item.rotation.yDegrees)),
    collisionPadding,
  );
}

export function footprintsOverlap(first: Footprint, second: Footprint): boolean {
  return (
    first.minX < second.maxX &&
    first.maxX > second.minX &&
    first.minZ < second.maxZ &&
    first.maxZ > second.minZ
  );
}

export function findOverlap(layout: FurnitureLayoutMap): [FurnitureId, FurnitureId] | null {
  const items = Object.values(layout).filter((item) => item.blocksPlacement !== false);

  for (let firstIndex = 0; firstIndex < items.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < items.length; secondIndex += 1) {
      const first = items[firstIndex];
      const second = items[secondIndex];

      if (footprintsOverlap(furnitureFootprint(first), furnitureFootprint(second))) {
        return [first.id, second.id];
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
  const halfWidth = size.width / 2;
  const halfDepth = size.depth / 2;

  const minX = room.bounds.minX + roomPadding + halfWidth;
  const maxX = room.bounds.maxX - roomPadding - halfWidth;
  const minZ = room.bounds.minZ + roomPadding + halfDepth;
  const maxZ = room.bounds.maxZ - roomPadding - halfDepth;

  return {
    ...item,
    position: {
      ...item.position,
      x: roundFootprint(clamp(item.position.x, minX, maxX)),
      y: clamp(item.position.y, 0, Math.max(0, room.height - item.baseSize.height)),
      z: roundFootprint(clamp(item.position.z, minZ, maxZ)),
    },
  };
}

export function applyTransformPatch(
  layout: FurnitureLayoutMap,
  room: RoomDefinition,
  furnitureId: FurnitureId,
  patch: TransformPatch,
): ApplyTransformResult {
  const existing = layout[furnitureId];

  if (!existing) {
    return {
      applied: false,
      clamped: false,
      reason: 'missing-furniture',
      layout,
    };
  }

  const nextLayout = cloneLayout(layout);
  const previousItem = nextLayout[furnitureId];
  const nextItem: FurnitureLayoutItem = {
    ...previousItem,
    position: {
      ...previousItem.position,
      ...patch.position,
    },
    rotation: {
      yDegrees: snapDegrees(patch.rotation?.yDegrees ?? previousItem.rotation.yDegrees),
    },
  };

  const clampedItem = clampTransformInsideRoom(nextItem, room);
  const clamped = (
    clampedItem.position.x !== nextItem.position.x ||
    clampedItem.position.y !== nextItem.position.y ||
    clampedItem.position.z !== nextItem.position.z
  );

  nextLayout[furnitureId] = clampedItem;

  if (hasAnyOverlap(nextLayout)) {
    return {
      applied: false,
      clamped: false,
      reason: 'overlap',
      layout,
    };
  }

  return {
    applied: true,
    clamped,
    reason: 'applied',
    layout: nextLayout,
  };
}
