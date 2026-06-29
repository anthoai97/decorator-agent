import { describe, expect, it } from 'vitest';
import { Ray, Vector3 } from 'three';

import { createWallObjectMoveCommit, findNearestWallDragHit } from './useWallObjectDrag';

describe('createWallObjectMoveCommit', () => {
  it('does not create a server commit when the pointer did not move the wall object', () => {
    expect(
      createWallObjectMoveCommit('window', 'back', { u: -2.1, y: 1.7 }, 'back', { u: -2.1, y: 1.7 }),
    ).toBeNull();
  });

  it('creates a server commit with the final valid wall-local position after movement', () => {
    expect(
      createWallObjectMoveCommit('window', 'back', { u: -2.1, y: 1.7 }, 'back', { u: 0.5, y: 1.4 }),
    ).toEqual({
      id: 'window',
      wallId: 'back',
      position: { u: 0.5, y: 1.4 },
    });
  });

  it('creates a server commit when only the target wall changes', () => {
    expect(
      createWallObjectMoveCommit('window', 'back', { u: -1.2, y: 1.7 }, 'left', { u: -1.2, y: 1.7 }),
    ).toEqual({
      id: 'window',
      wallId: 'left',
      position: { u: -1.2, y: 1.7 },
    });
  });
});

describe('findNearestWallDragHit', () => {
  it('returns the nearest valid wall plane hit from enabled target walls', () => {
    const ray = new Ray(new Vector3(0, 1.2, 0), new Vector3(-1, 0, 0));
    const hit = findNearestWallDragHit(ray, 0.071, ['back', 'left']);

    expect(hit?.wallId).toBe('left');
    expect(hit?.position).toEqual({ u: 0, y: 1.2 });
  });
});
