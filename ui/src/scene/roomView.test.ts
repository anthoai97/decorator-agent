import { describe, expect, it } from 'vitest';

import { roomDefinition } from '../data/furnitureCatalog';
import { createRoomWallPanels, DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET } from './roomView';

describe('room view defaults', () => {
  it('starts the default camera on the open side of the room', () => {
    expect(DEFAULT_CAMERA_POSITION[0]).toBe(0);
    expect(DEFAULT_CAMERA_POSITION[1]).toBeGreaterThan(roomDefinition.height);
    expect(DEFAULT_CAMERA_POSITION[2]).toBeGreaterThan(roomDefinition.bounds.maxZ);
    expect(DEFAULT_CAMERA_TARGET[2]).toBeLessThan(DEFAULT_CAMERA_POSITION[2]);
  });

  it('keeps the wall facing the default camera open', () => {
    const wallPanels = createRoomWallPanels(roomDefinition);

    expect(wallPanels.map((wall) => wall.id)).toEqual(['back', 'left', 'right']);
    expect(wallPanels).not.toContainEqual(
      expect.objectContaining({
        id: 'front',
      }),
    );
  });
});
