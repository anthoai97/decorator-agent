import { describe, expect, it } from 'vitest';

import { createInitialFurnitureLayout } from '../data/furnitureCatalog';
import { createInspectorServerCommand } from './InspectorPanel';

describe('createInspectorServerCommand', () => {
  it('creates a move command with the full current position for X and Z edits', () => {
    const furniture = createInitialFurnitureLayout();
    const coffeeTable = {
      ...furniture['coffee-table'],
      position: { ...furniture['coffee-table'].position, x: 1.2, z: 1.6 },
    };

    expect(createInspectorServerCommand('coffee-table', coffeeTable, 'x')).toEqual({
      type: 'MOVE_FURNITURE',
      payload: {
        furnitureId: 'coffee-table',
        position: { x: 1.2, z: 1.6 },
      },
    });

    expect(createInspectorServerCommand('coffee-table', coffeeTable, 'z')).toEqual({
      type: 'MOVE_FURNITURE',
      payload: {
        furnitureId: 'coffee-table',
        position: { x: 1.2, z: 1.6 },
      },
    });
  });

  it('creates a rotation command with current position for rotation edits', () => {
    const furniture = createInitialFurnitureLayout();
    const sofa = {
      ...furniture.sofa,
      position: { ...furniture.sofa.position, x: -1.1, z: -1.3 },
      rotation: { yDegrees: 90 },
    };

    expect(createInspectorServerCommand('sofa', sofa, 'rotation')).toEqual({
      type: 'SET_FURNITURE_ROTATION',
      payload: {
        furnitureId: 'sofa',
        rotationYDegrees: 90,
        position: { x: -1.1, z: -1.3 },
      },
    });
  });
});
