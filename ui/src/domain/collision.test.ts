import { describe, expect, it } from 'vitest';

import {
  createInitialFurnitureLayout,
  furnitureCatalog,
  roomDefinition,
} from '../data/furnitureCatalog';
import {
  applyTransformPatch,
  clampTransformInsideRoom,
  createFootprint,
  findOverlap,
  rotationAwareSize,
} from './collision';
import type { FurnitureId } from './types';

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

  it('rounds footprint edges', () => {
    expect(
      createFootprint(
        { x: 0.3, y: 0, z: -0.3 },
        { width: 0.2, height: 1, depth: 0.2 },
      ),
    ).toEqual({
      minX: 0.2,
      maxX: 0.4,
      minZ: -0.4,
      maxZ: -0.2,
    });
  });

  it('swaps width and depth at 90 degree rotation', () => {
    expect(rotationAwareSize({ width: 2, height: 1, depth: 0.5 }, 90)).toEqual({
      width: 0.5,
      height: 1,
      depth: 2,
    });
  });

  it('creates a complete non-overlapping initial layout', () => {
    const layout = createInitialFurnitureLayout();

    expect(roomDefinition).toEqual({
      width: 5.8,
      depth: 4.4,
      height: 2.65,
      bounds: { minX: -2.9, maxX: 2.9, minZ: -2.2, maxZ: 2.2 },
    });
    expect(Object.keys(layout)).toEqual(furnitureCatalog.map((item) => item.id));
    expect(layout.rug.name).toBe('Area rug');
    expect(layout.rug.movable).toBe(true);
    expect(layout.rug.blocksPlacement).toBe(false);
    expect(layout['lounge-chair'].rotation.yDegrees).toBe(315);
    expect(findOverlap(layout)).toBeNull();
  });

  it('moves the area rug without treating floor-covering overlap as furniture collision', () => {
    const layout = createInitialFurnitureLayout();
    const result = applyTransformPatch(layout, roomDefinition, 'rug', {
      position: { x: 0.55, z: 0.25 },
    });

    expect(result.applied).toBe(true);
    expect(result.layout.rug.position.x).toBe(0.55);
    expect(result.layout.rug.position.z).toBe(0.25);
    expect(findOverlap(result.layout)).toBeNull();
  });

  it('clamps furniture inside room bounds', () => {
    const sofa = createInitialFurnitureLayout().sofa;
    const clamped = clampTransformInsideRoom(
      {
        ...sofa,
        position: { x: -99, y: 0, z: 99 },
      },
      roomDefinition,
    );

    const size = rotationAwareSize(clamped.baseSize, clamped.rotation.yDegrees);
    const footprint = createFootprint(clamped.position, size);
    const minX = Number((roomDefinition.bounds.minX + 0.18).toFixed(3));
    const maxX = Number((roomDefinition.bounds.maxX - 0.18).toFixed(3));
    const minZ = Number((roomDefinition.bounds.minZ + 0.18).toFixed(3));
    const maxZ = Number((roomDefinition.bounds.maxZ - 0.18).toFixed(3));

    expect(footprint.minX).toBeGreaterThanOrEqual(minX);
    expect(footprint.maxX).toBeLessThanOrEqual(maxX);
    expect(footprint.minZ).toBeGreaterThanOrEqual(minZ);
    expect(footprint.maxZ).toBeLessThanOrEqual(maxZ);
  });

  it('clamps furniture height inside room bounds', () => {
    const sofa = createInitialFurnitureLayout().sofa;

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

  it('uses the catalog room definition by default when clamping furniture', () => {
    const sofa = createInitialFurnitureLayout().sofa;
    const clamped = clampTransformInsideRoom({
      ...sofa,
      position: { x: -99, y: -2, z: 99 },
    });
    const size = rotationAwareSize(clamped.baseSize, clamped.rotation.yDegrees);
    const footprint = createFootprint(clamped.position, size);

    expect(clamped.position.y).toBe(0);
    expect(footprint.minX).toBeGreaterThanOrEqual(-2.72);
    expect(footprint.maxZ).toBeLessThanOrEqual(2.02);
  });

  it('detects overlapping furniture', () => {
    const layout = createInitialFurnitureLayout();
    layout['coffee-table'] = {
      ...layout['coffee-table'],
      position: { ...layout.sofa.position },
    };

    expect(findOverlap(layout)).toEqual(['sofa', 'coffee-table']);
  });

  it('uses footprint overlap for rotated furniture', () => {
    const layout = createInitialFurnitureLayout();
    layout['coffee-table'] = {
      ...layout['coffee-table'],
      position: { x: 1.2, y: 0, z: 0.3 },
      rotation: { yDegrees: 45 },
    };

    expect(findOverlap(layout)).toEqual(['coffee-table', 'lounge-chair']);
  });

  it('applies valid transform patches without mutating the input layout', () => {
    const layout = createInitialFurnitureLayout();
    const result = applyTransformPatch(layout, roomDefinition, 'coffee-table', {
      position: { x: -0.2, z: 1.0 },
      rotation: { yDegrees: 45 },
    });

    expect(result.applied).toBe(true);
    expect(result.layout['coffee-table'].position.x).toBe(-0.2);
    expect(result.layout['coffee-table'].position.z).toBe(1.0);
    expect(result.layout['coffee-table'].rotation.yDegrees).toBe(45);
    expect(layout['coffee-table'].position.x).not.toBe(1.2);
  });

  it('reports successful clamping when applying a valid transform patch', () => {
    const layout = createInitialFurnitureLayout();
    const result = applyTransformPatch(layout, roomDefinition, 'coffee-table', {
      position: { x: 99, z: 1.6 },
    });

    expect(result.applied).toBe(true);
    expect(result.clamped).toBe(true);
    expect(result.reason).toBe('applied');
    expect(result.layout['coffee-table'].position.x).toBeLessThan(99);
  });

  it('rejects clamped overlap patches without reporting clamping', () => {
    const layout = createInitialFurnitureLayout();
    layout.sofa = clampTransformInsideRoom(
      {
        ...layout.sofa,
        position: { x: 99, y: 0, z: 1.4 },
      },
      roomDefinition,
    );

    const result = applyTransformPatch(layout, roomDefinition, 'coffee-table', {
      position: { x: 99, z: 1.4 },
    });

    expect(result.applied).toBe(false);
    expect(result.clamped).toBe(false);
    expect(result.reason).toBe('overlap');
    expect(result.layout).toBe(layout);
  });

  it('returns missing-furniture when applying a patch to an unknown item', () => {
    const layout = createInitialFurnitureLayout();
    const result = applyTransformPatch(layout, roomDefinition, 'missing' as FurnitureId, {
      position: { x: 0 },
    });

    expect(result.applied).toBe(false);
    expect(result.clamped).toBe(false);
    expect(result.reason).toBe('missing-furniture');
    expect(result.layout).toBe(layout);
  });

  it('snaps existing rotation when applying a position-only patch', () => {
    const layout = createInitialFurnitureLayout();
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

  it('keeps every initial rotation stable for position-only patches', () => {
    const layout = createInitialFurnitureLayout();

    for (const item of furnitureCatalog) {
      const result = applyTransformPatch(layout, roomDefinition, item.id, {
        position: { ...layout[item.id].position },
      });

      expect(result.applied).toBe(true);
      expect(result.layout[item.id].rotation.yDegrees).toBe(layout[item.id].rotation.yDegrees);
    }
  });
});
