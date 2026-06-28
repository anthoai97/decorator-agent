import { describe, expect, it } from 'vitest';

import { createInitialFurnitureLayout, roomDefinition } from '../data/furnitureCatalog';
import { createLayoutExport, importLayoutFromUnknown } from './layoutSchema';

describe('layout schema', () => {
  it('exports schema version 1 with all furniture', () => {
    const exported = createLayoutExport(createInitialFurnitureLayout(), roomDefinition);

    expect(exported.schemaVersion).toBe(1);
    expect(exported.app).toBe('webgpu-room-composer');
    expect(exported.units).toBe('meters');
    expect(exported.constraints.rotationStepDegrees).toBe(45);
    expect(exported.furniture.map((item) => item.id)).toEqual([
      'sofa',
      'coffee-table',
      'lounge-chair',
      'bookshelf',
      'planter',
    ]);
  });

  it('imports compact furniture arrays by id', () => {
    const current = createInitialFurnitureLayout();
    const result = importLayoutFromUnknown(
      [
        {
          id: 'coffee-table',
          position: { x: 1.1, y: 0, z: 0.9 },
          rotation: { yDegrees: 45 },
        },
      ],
      current,
      roomDefinition,
    );

    expect(result.applied).toBe(1);
    expect(result.layout['coffee-table'].position.x).toBe(1.1);
    expect(result.layout['coffee-table'].position.z).toBe(0.9);
    expect(result.layout['coffee-table'].rotation.yDegrees).toBe(45);
  });

  it('imports object arrays by name compatibility alias', () => {
    const current = createInitialFurnitureLayout();
    const result = importLayoutFromUnknown(
      {
        objects: [
          {
            label: 'Planter',
            translation: { x: -3.2, y: 0, z: -2.4 },
            yDegrees: 90,
          },
        ],
      },
      current,
      roomDefinition,
    );

    expect(result.applied).toBe(1);
    expect(result.layout.planter.position.x).toBe(-3.2);
    expect(result.layout.planter.position.z).toBe(-2.4);
    expect(result.layout.planter.rotation.yDegrees).toBe(90);
  });

  it('rejects imports that do not match furniture', () => {
    expect(() =>
      importLayoutFromUnknown({ furniture: [{ id: 'unknown' }] }, createInitialFurnitureLayout(), roomDefinition),
    ).toThrow('Layout JSON did not match any furniture IDs or names.');
  });

  it('rejects imports that create overlap', () => {
    const current = createInitialFurnitureLayout();

    expect(() =>
      importLayoutFromUnknown(
        {
          furniture: [
            { id: 'sofa', position: { x: 0, y: 0, z: 0 } },
            { id: 'coffee-table', position: { x: 0, y: 0, z: 0 } },
          ],
        },
        current,
        roomDefinition,
      ),
    ).toThrow('Imported layout has overlapping furniture.');
  });
});
