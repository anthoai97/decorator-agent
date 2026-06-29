import { describe, expect, it } from 'vitest';

import { roomDefinition } from '../data/furnitureCatalog';
import {
  CAMERA_MAX_DISTANCE,
  createRoomWallPanels,
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
  getOpenWallIdsForCamera,
  TOP_VIEW_CAMERA_POSITION,
} from './roomView';

describe('room view defaults', () => {
  it('starts the default camera on the open side of the room', () => {
    expect(DEFAULT_CAMERA_POSITION[0]).toBe(0);
    expect(DEFAULT_CAMERA_POSITION[1]).toBeGreaterThan(roomDefinition.height);
    expect(DEFAULT_CAMERA_POSITION[2]).toBeGreaterThan(roomDefinition.bounds.maxZ);
    expect(DEFAULT_CAMERA_TARGET[2]).toBeLessThan(DEFAULT_CAMERA_POSITION[2]);
  });

  it('places top view at the maximum orbit zoom distance', () => {
    const distanceFromTarget = Math.hypot(
      TOP_VIEW_CAMERA_POSITION[0] - DEFAULT_CAMERA_TARGET[0],
      TOP_VIEW_CAMERA_POSITION[1] - DEFAULT_CAMERA_TARGET[1],
      TOP_VIEW_CAMERA_POSITION[2] - DEFAULT_CAMERA_TARGET[2],
    );

    expect(distanceFromTarget).toBeCloseTo(CAMERA_MAX_DISTANCE, 4);
  });

  it('includes every wall so the open side can follow the camera', () => {
    const wallPanels = createRoomWallPanels(roomDefinition);

    expect(wallPanels.map((wall) => wall.id)).toEqual(['front', 'back', 'left', 'right']);
  });

  it('opens two walls from the camera side of the room', () => {
    expect(
      getOpenWallIdsForCamera(
        { x: DEFAULT_CAMERA_POSITION[0], z: DEFAULT_CAMERA_POSITION[2] },
        { x: DEFAULT_CAMERA_TARGET[0], z: DEFAULT_CAMERA_TARGET[2] },
      ),
    ).toEqual(['front', 'right']);
    expect(getOpenWallIdsForCamera({ x: -8, z: -8 }, { x: 0, z: 0 })).toEqual(['back', 'left']);
    expect(getOpenWallIdsForCamera({ x: 8, z: -8 }, { x: 0, z: 0 })).toEqual(['back', 'right']);
    expect(getOpenWallIdsForCamera({ x: -8, z: 8 }, { x: 0, z: 0 })).toEqual(['front', 'left']);
    expect(getOpenWallIdsForCamera({ x: 8, z: 8 }, { x: 0, z: 0 })).toEqual(['front', 'right']);
  });
});
