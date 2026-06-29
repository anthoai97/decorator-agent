import {
  createFootprint,
  rotationAwareSize,
} from './collision';
import { round } from './math';
import type {
  FurnitureLayoutItem,
  RoomDefinition,
  WallObjectLayoutItem,
} from './types';
import { createWallObjectEdgeDistances, type WallObjectEdgeDistances } from './wallObjectPlacement';

export interface FurnitureDragMeasurements {
  left: number;
  right: number;
  back: number;
  front: number;
}

export type WallObjectDragMeasurements = WallObjectEdgeDistances;

export function createFurnitureDragMeasurements(
  item: FurnitureLayoutItem,
  room: RoomDefinition,
): FurnitureDragMeasurements {
  const size = rotationAwareSize(item.baseSize, item.rotation.yDegrees);
  const footprint = createFootprint(item.position, size);

  return {
    left: round(footprint.minX - room.bounds.minX),
    right: round(room.bounds.maxX - footprint.maxX),
    back: round(footprint.minZ - room.bounds.minZ),
    front: round(room.bounds.maxZ - footprint.maxZ),
  };
}

export function createWallObjectDragMeasurements(
  item: WallObjectLayoutItem,
  room: RoomDefinition,
): WallObjectDragMeasurements {
  return createWallObjectEdgeDistances(item, room);
}

export function formatMeasurementValue(value: number): string {
  return `${round(value, 2).toFixed(2)} m`;
}
