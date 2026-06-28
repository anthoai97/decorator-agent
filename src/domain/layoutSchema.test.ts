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
          position: { x: 0.2, y: 0, z: 1.7 },
          rotation: { yDegrees: 45 },
        },
      ],
      current,
      roomDefinition,
    );

    expect(result.applied).toBe(1);
    expect(result.layout['coffee-table'].position.x).toBe(0.2);
    expect(result.layout['coffee-table'].position.z).toBe(1.7);
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

  it('rejects a single imported item that overlaps existing furniture', () => {
    expect(() =>
      importLayoutFromUnknown(
        [{ id: 'sofa', position: { x: -3.55, y: 0, z: -2.25 } }],
        createInitialFurnitureLayout(),
        roomDefinition,
      ),
    ).toThrow('Imported layout has overlapping furniture.');
  });

  it('matches later aliases when an earlier alias is unknown', () => {
    const result = importLayoutFromUnknown(
      {
        furniture: [
          {
            id: 'unknown',
            layoutId: 'sofa',
            position: { x: -3, y: 0, z: 0.8 },
          },
        ],
      },
      createInitialFurnitureLayout(),
      roomDefinition,
    );

    expect(result.applied).toBe(1);
    expect(result.layout.sofa.position.x).toBe(-3);
    expect(result.layout.sofa.position.z).toBe(0.8);
  });
});
