export type FurnitureId = 'sofa' | 'coffee-table' | 'lounge-chair' | 'bookshelf' | 'planter' | 'rug';
export type RoomWallId = 'front' | 'back' | 'left' | 'right';
export type WallObjectId = 'window' | 'wall-art';

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
  blocksPlacement: boolean;
  artifactId?: string;
  defaultPosition: Vector3Data;
  defaultRotationYDegrees: number;
  baseSize: Size3Data;
}

export interface FurnitureLayoutItem {
  id: FurnitureId;
  name: string;
  movable: boolean;
  blocksPlacement: boolean;
  artifactId?: string;
  position: Vector3Data;
  rotation: { yDegrees: number };
  baseSize: Size3Data;
}

export type FurnitureLayoutMap = Record<FurnitureId, FurnitureLayoutItem>;

export interface WallObjectPosition {
  u: number;
  y: number;
}

export interface WallObjectMovePatch {
  wallId?: RoomWallId;
  position: WallObjectPosition;
}

export interface WallObjectDefinition {
  id: WallObjectId;
  name: string;
  wallId: RoomWallId;
  movable: boolean;
  artifactId?: string;
  defaultPosition: WallObjectPosition;
  size: Size3Data;
  normalOffset: number;
}

export interface WallObjectLayoutItem {
  id: WallObjectId;
  name: string;
  wallId: RoomWallId;
  movable: boolean;
  artifactId?: string;
  position: WallObjectPosition;
  size: Size3Data;
  normalOffset: number;
}

export type WallObjectLayoutMap = Record<WallObjectId, WallObjectLayoutItem>;

export type DragMeasurementTarget =
  | { type: 'furniture'; id: FurnitureId }
  | { type: 'wallObject'; id: WallObjectId };

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

export interface ApplyWallObjectMoveResult {
  applied: boolean;
  clamped: boolean;
  reason: 'applied' | 'missing-wall-object';
  wallObjects: WallObjectLayoutMap;
}

export interface LayoutExportItem {
  id: string;
  name: string;
  movable: boolean;
  blocksPlacement: boolean;
  artifactId?: string;
  position: Vector3Data;
  rotation: {
    yDegrees: number;
  };
  size: Size3Data;
  footprint: Footprint;
}

export interface WallObjectLayoutExportItem {
  id: string;
  name: string;
  wallId: RoomWallId;
  movable: boolean;
  artifactId?: string;
  position: WallObjectPosition;
  size: Size3Data;
}

export interface RoomLayoutExport {
  schemaVersion: 1;
  app: 'webgpu-room-composer';
  units: 'meters';
  coordinateSystem: {
    origin: 'room-center-floor';
    x: 'left-right';
    y: 'up';
    z: 'front-back';
  };
  constraints: {
    keepInsideRoom: true;
    preventFurnitureOverlap: true;
    rotationStepDegrees: 45;
  };
  room: RoomDefinition;
  furniture: LayoutExportItem[];
  wallObjects?: WallObjectLayoutExportItem[];
}

export interface ImportResult {
  applied: number;
  layout: FurnitureLayoutMap;
  wallObjects?: WallObjectLayoutMap;
}
