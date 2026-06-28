import { describe, expect, it } from 'vitest';

import { furnitureCatalog, roomDefinition } from '../data/furnitureCatalog';
import {
  applyTransformPatch,
  clampTransformInsideRoom,
  createFootprint,
  findOverlap,
  rotationAwareSize,
} from './collision';
import type { FurnitureLayoutMap } from './types';

function initialLayout(): FurnitureLayoutMap {
  return Object.fromEntries(
    furnitureCatalog.map((item) => [
      item.id,
      {
        id: item.id,
        name: item.name,
        movable: item.movable,
        position: { ...item.defaultPosition },
        rotation: { yDegrees: item.defaultRotationYDegrees },
        baseSize: { ...item.baseSize },
      },
    ]),
  ) as FurnitureLayoutMap;
}

describe('collision helpers', () => {
  it('calculates a footprint from center position and size', () => {
    const footprint = createFootprint(
      { x: 1, y: 0, z: -1 },
      { width: 2, height: 1, depth: 1 },
    );

    expect(footprint).toEqual({
      minX: 0,
      maxX: 2,
      minZ: -1.5,
      maxZ: -0.5,
    });
  });

  it('swaps width and depth at 90 degree rotation', () => {
    expect(rotationAwareSize({ width: 2, height: 1, depth: 0.5 }, 90)).toEqual({
      width: 0.5,
      height: 1,
      depth: 2,
    });
  });

  it('clamps furniture inside room bounds', () => {
    const sofa = initialLayout().sofa;
    const clamped = clampTransformInsideRoom(
      {
        ...sofa,
        position: { x: -99, y: 0, z: 99 },
      },
      roomDefinition,
    );

    const size = rotationAwareSize(clamped.baseSize, clamped.rotation.yDegrees);
    const footprint = createFootprint(clamped.position, size);

    expect(footprint.minX).toBeGreaterThanOrEqual(roomDefinition.bounds.minX + 0.18);
    expect(footprint.maxX).toBeLessThanOrEqual(roomDefinition.bounds.maxX - 0.18);
    expect(footprint.minZ).toBeGreaterThanOrEqual(roomDefinition.bounds.minZ + 0.18);
    expect(footprint.maxZ).toBeLessThanOrEqual(roomDefinition.bounds.maxZ - 0.18);
  });

  it('clamps furniture height inside room bounds', () => {
    const sofa = initialLayout().sofa;

    expect(
      clampTransformInsideRoom(
        {
          ...sofa,
          position: { ...sofa.position, y: -2 },
        },
        roomDefinition,
      ).position.y,
    ).toBe(0);

    expect(
      clampTransformInsideRoom(
        {
          ...sofa,
          position: { ...sofa.position, y: 99 },
        },
        roomDefinition,
      ).position.y,
    ).toBe(roomDefinition.height - sofa.baseSize.height);
  });

  it('detects overlapping furniture', () => {
    const layout = initialLayout();
    layout['coffee-table'] = {
      ...layout['coffee-table'],
      position: { ...layout.sofa.position },
    };

    expect(findOverlap(layout)).toEqual(['sofa', 'coffee-table']);
  });

  it('applies valid transform patches without mutating the input layout', () => {
    const layout = initialLayout();
    const result = applyTransformPatch(layout, roomDefinition, 'coffee-table', {
      position: { x: 1.2, z: 0.3 },
      rotation: { yDegrees: 45 },
    });

    expect(result.applied).toBe(true);
    expect(result.layout['coffee-table'].position.x).toBe(1.2);
    expect(result.layout['coffee-table'].position.z).toBe(0.3);
    expect(result.layout['coffee-table'].rotation.yDegrees).toBe(45);
    expect(layout['coffee-table'].position.x).not.toBe(1.2);
  });

  it('snaps existing rotation when applying a position-only patch', () => {
    const layout = initialLayout();
    layout.planter = {
      ...layout.planter,
      rotation: { yDegrees: 23 },
    };

    const result = applyTransformPatch(layout, roomDefinition, 'planter', {
      position: { x: -3.5 },
    });

    expect(result.applied).toBe(true);
    expect(result.layout.planter.rotation.yDegrees).toBe(45);
    expect(layout.planter.rotation.yDegrees).toBe(23);
  });
});
