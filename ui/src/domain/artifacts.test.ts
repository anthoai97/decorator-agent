import { describe, expect, it } from 'vitest';

import { createInitialFurnitureLayout } from '../data/furnitureCatalog';
import { createInitialWallObjectLayout } from '../data/wallObjectCatalog';
import { collectUniqueArtifactIds, readArtifactUrlForItem } from './artifacts';

describe('domain artifact helpers', () => {
  it('collects unique artifact ids from furniture and wall objects', () => {
    const furniture = createInitialFurnitureLayout();
    const wallObjects = createInitialWallObjectLayout();
    furniture['coffee-table'] = {
      ...furniture['coffee-table'],
      artifactId: 'seed-table-01',
    };
    furniture['lounge-chair'] = {
      ...furniture['lounge-chair'],
      artifactId: 'seed-sofa-01',
    };
    wallObjects['wall-art'] = {
      ...wallObjects['wall-art'],
      artifactId: 'seed-wall-art-01',
    };

    expect(collectUniqueArtifactIds({ furniture, wallObjects })).toEqual([
      'seed-sofa-01',
      'seed-table-01',
      'seed-wall-art-01',
    ]);
  });

  it('reads placed item URLs from hydrated server artifact metadata', () => {
    const furniture = createInitialFurnitureLayout();

    expect(
      readArtifactUrlForItem(furniture.sofa, {
        'seed-sofa-01': {
          url: 'http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content',
        },
      }),
    ).toBe('http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content');
    expect(readArtifactUrlForItem(furniture['coffee-table'], {})).toBeUndefined();
    expect(readArtifactUrlForItem({ ...furniture.sofa, artifactId: 'missing-artifact' }, {})).toBeUndefined();
  });
});
