import { describe, expect, it } from 'vitest';

import { roomDefinition } from '../data/furnitureCatalog';
import { createInitialWallObjectLayout } from '../data/wallObjectCatalog';
import {
  applyWallObjectPositionPatch,
  clampWallObjectInsideWall,
  createWallObjectEdgeDistances,
  getWallObjectWorldTransform,
} from './wallObjectPlacement';

describe('wall object placement', () => {
  it('creates window and wall art defaults on the back wall', () => {
    const wallObjects = createInitialWallObjectLayout();

    expect(Object.keys(wallObjects)).toEqual(['window', 'wall-art']);
    expect(wallObjects.window).toMatchObject({
      id: 'window',
      name: 'Window',
      wallId: 'back',
      movable: true,
      position: { u: -2.1, y: 1.7 },
    });
    expect(wallObjects['wall-art']).toMatchObject({
      id: 'wall-art',
      name: 'Wall art',
      wallId: 'back',
      movable: true,
      position: { u: 1.85, y: 1.55 },
    });
  });

  it('clamps wall objects inside wall width and height', () => {
    const wallArt = createInitialWallObjectLayout()['wall-art'];
    const clamped = clampWallObjectInsideWall(
      {
        ...wallArt,
        position: { u: 99, y: -99 },
      },
      roomDefinition,
    );

    expect(clamped.position.u).toBe(2.4);
    expect(clamped.position.y).toBe(0.36);
  });

  it('applies wall object moves to a different wall before clamping', () => {
    const wallObjects = createInitialWallObjectLayout();
    const result = applyWallObjectPositionPatch(wallObjects, roomDefinition, 'wall-art', {
      wallId: 'right',
      position: { u: 99, y: 1.4 },
    });

    expect(result.applied).toBe(true);
    expect(result.clamped).toBe(true);
    expect(result.wallObjects['wall-art'].wallId).toBe('right');
    expect(result.wallObjects['wall-art'].position).toEqual({ u: 1.7, y: 1.4 });
    expect(wallObjects['wall-art'].wallId).toBe('back');
  });

  it('calculates wall-local edge distances', () => {
    const wallArt = createInitialWallObjectLayout()['wall-art'];

    expect(createWallObjectEdgeDistances(wallArt, roomDefinition)).toEqual({
      left: 4.25,
      right: 0.55,
      bottom: 1.19,
      top: 0.74,
    });
  });

  it('converts back-wall local coordinates to world transform', () => {
    const window = createInitialWallObjectLayout().window;

    expect(getWallObjectWorldTransform(window, roomDefinition)).toEqual({
      position: [-2.1, 1.7, -2.129],
      rotation: [0, 0, 0],
    });
  });

  it('converts side-wall local coordinates to world transform', () => {
    const wallObject = {
      ...createInitialWallObjectLayout().window,
      wallId: 'right' as const,
      position: { u: -1.25, y: 1.2 },
      normalOffset: 0.08,
    };

    expect(getWallObjectWorldTransform(wallObject, roomDefinition)).toEqual({
      position: [2.82, 1.2, -1.25],
      rotation: [0, -Math.PI / 2, 0],
    });
  });
});
