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
  rotation: { yDegrees: number };
  baseSize: Size3Data;
}

export type FurnitureLayoutMap = Record<FurnitureId, FurnitureLayoutItem>;

export interface TransformPatch {
  position?: Partial<Vector3Data>;
  rotation?: { yDegrees?: number };
}

export interface ApplyTransformResult {
  applied: boolean;
  clamped: boolean;
  reason: 'applied' | 'overlap' | 'missing-furniture';
  layout: FurnitureLayoutMap;
}
