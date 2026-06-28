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

interface RectanglePoint {
  x: number;
  z: number;
}

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
    minX: position.x - size.width / 2,
    maxX: position.x + size.width / 2,
    minZ: position.z - size.depth / 2,
    maxZ: position.z + size.depth / 2,
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

function rectangleCorners(item: FurnitureLayoutItem): RectanglePoint[] {
  const width = Math.max(0, item.baseSize.width - collisionPadding * 2);
  const depth = Math.max(0, item.baseSize.depth - collisionPadding * 2);
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const radians = (snapDegrees(item.rotation.yDegrees, 45) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth },
  ].map((corner) => ({
    x: item.position.x + corner.x * cosine - corner.z * sine,
    z: item.position.z + corner.x * sine + corner.z * cosine,
  }));
}

function projectionOnAxis(points: RectanglePoint[], axis: RectanglePoint): { min: number; max: number } {
  return points.reduce(
    (projection, point) => {
      const value = point.x * axis.x + point.z * axis.z;

      return {
        min: Math.min(projection.min, value),
        max: Math.max(projection.max, value),
      };
    },
    { min: Infinity, max: -Infinity },
  );
}

function rectangleAxes(points: RectanglePoint[]): RectanglePoint[] {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const edgeX = next.x - point.x;
    const edgeZ = next.z - point.z;
    const length = Math.hypot(edgeX, edgeZ);

    return { x: -edgeZ / length, z: edgeX / length };
  });
}

function rotatedRectanglesOverlap(first: FurnitureLayoutItem, second: FurnitureLayoutItem): boolean {
  const firstCorners = rectangleCorners(first);
  const secondCorners = rectangleCorners(second);

  return [...rectangleAxes(firstCorners), ...rectangleAxes(secondCorners)].every((axis) => {
    const firstProjection = projectionOnAxis(firstCorners, axis);
    const secondProjection = projectionOnAxis(secondCorners, axis);

    return firstProjection.max > secondProjection.min && secondProjection.max > firstProjection.min;
  });
}

export function findOverlap(layout: FurnitureLayoutMap): [FurnitureId, FurnitureId] | null {
  const items = Object.values(layout);

  for (let firstIndex = 0; firstIndex < items.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < items.length; secondIndex += 1) {
      const first = items[firstIndex];
      const second = items[secondIndex];

      if (
        footprintsOverlap(furnitureFootprint(first), furnitureFootprint(second)) &&
        rotatedRectanglesOverlap(first, second)
      ) {
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
  room: RoomDefinition,
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
      clamped,
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
