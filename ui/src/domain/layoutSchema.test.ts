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
      'rug',
    ]);
    expect(exported.furniture.find((item) => item.id === 'rug')?.blocksPlacement).toBe(false);
  });

  it('imports compact furniture arrays by id', () => {
    const current = createInitialFurnitureLayout();
    const result = importLayoutFromUnknown(
      [
        {
          id: 'coffee-table',
          position: { x: 0.2, y: 0, z: 1.25 },
          rotation: { yDegrees: 45 },
        },
      ],
      current,
      roomDefinition,
    );

    expect(result.applied).toBe(1);
    expect(result.layout['coffee-table'].position.x).toBe(0.2);
    expect(result.layout['coffee-table'].position.z).toBe(1.25);
    expect(result.layout['coffee-table'].rotation.yDegrees).toBe(45);
  });

  it('imports object arrays by name compatibility alias', () => {
    const current = createInitialFurnitureLayout();
    const result = importLayoutFromUnknown(
      {
        objects: [
          {
            label: 'Planter',
            translation: { x: -2.1, y: 0, z: 1.35 },
            yDegrees: 90,
          },
        ],
      },
      current,
      roomDefinition,
    );

    expect(result.applied).toBe(1);
    expect(result.layout.planter.position.x).toBe(-2.1);
    expect(result.layout.planter.position.z).toBe(1.35);
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
        [{ id: 'sofa', position: { x: -0.55, y: 0, z: -0.25 } }],
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
            position: { x: 0, y: 0, z: 1.3 },
          },
        ],
      },
      createInitialFurnitureLayout(),
      roomDefinition,
    );

    expect(result.applied).toBe(1);
    expect(result.layout.sofa.position.x).toBe(0);
    expect(result.layout.sofa.position.z).toBe(1.3);
  });

  it('imports multi-item swaps transactionally before checking overlap', () => {
    const result = importLayoutFromUnknown(
      {
        furniture: [
          { id: 'coffee-table', position: { x: -1.45, y: 0, z: -0.35 } },
          { id: 'sofa', position: { x: 0, y: 0, z: 1.3 } },
        ],
      },
      createInitialFurnitureLayout(),
      roomDefinition,
    );

    expect(result.applied).toBe(2);
    expect(result.layout['coffee-table'].position.x).toBe(-1.45);
    expect(result.layout['coffee-table'].position.z).toBe(-0.35);
    expect(result.layout.sofa.position.x).toBe(0);
    expect(result.layout.sofa.position.z).toBe(1.3);
  });

  it('prefers id over conflicting lower-priority aliases', () => {
    const result = importLayoutFromUnknown(
      {
        furniture: [
          {
            id: 'coffee-table',
            label: 'Sofa',
            position: { x: 0.2, y: 0, z: 1.25 },
          },
        ],
      },
      createInitialFurnitureLayout(),
      roomDefinition,
    );

    expect(result.applied).toBe(1);
    expect(result.layout['coffee-table'].position.x).toBe(0.2);
    expect(result.layout['coffee-table'].position.z).toBe(1.25);
    expect(result.layout.sofa.position.x).toBe(-0.9);
    expect(result.layout.sofa.position.z).toBe(-1.4);
  });

  it('imports exported layout data as a round trip', () => {
    const original = createInitialFurnitureLayout();
    const exported = createLayoutExport(original, roomDefinition);
    const result = importLayoutFromUnknown(exported, createInitialFurnitureLayout(), roomDefinition);

    expect(result.applied).toBe(exported.furniture.length);
    expect(result.layout.sofa.position).toEqual(original.sofa.position);
    expect(result.layout['coffee-table'].position).toEqual(original['coffee-table'].position);
    expect(result.layout['lounge-chair'].rotation.yDegrees).toBe(original['lounge-chair'].rotation.yDegrees);
  });
});
