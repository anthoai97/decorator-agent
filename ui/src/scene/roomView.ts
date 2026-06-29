import type { RoomDefinition } from '../domain/types';

export type Vector3Tuple = [number, number, number];

type RoomWallId = 'back' | 'left' | 'right';

export type RoomWallPanel = {
  id: RoomWallId;
  position: Vector3Tuple;
  size: Vector3Tuple;
  color: string;
  roughness: number;
};

export const DEFAULT_CAMERA_FOV = 42;
export const DEFAULT_CAMERA_POSITION: Vector3Tuple = [0, 5.6, 8.4];
export const DEFAULT_CAMERA_TARGET: Vector3Tuple = [0, 1.05, 0];
export const TOP_VIEW_CAMERA_POSITION: Vector3Tuple = [0, 8.8, 0.001];

export function createRoomWallPanels(room: RoomDefinition): RoomWallPanel[] {
  const halfWidth = room.width / 2;
  const halfDepth = room.depth / 2;

  return [
    {
      id: 'back',
      position: [0, room.height / 2, -halfDepth],
      size: [room.width, room.height, 0.12],
      color: '#d8e7ea',
      roughness: 0.84,
    },
    {
      id: 'left',
      position: [-halfWidth, room.height / 2, 0],
      size: [0.12, room.height, room.depth],
      color: '#f4f0e8',
      roughness: 0.85,
    },
    {
      id: 'right',
      position: [halfWidth, room.height / 2, 0],
      size: [0.12, room.height, room.depth],
      color: '#f4f0e8',
      roughness: 0.85,
    },
  ];
}
