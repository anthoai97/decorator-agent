import { describe, expect, it } from 'vitest';

import { createInitialWallObjectLayout } from '../../data/wallObjectCatalog';
import { getVisibleWallObjects } from './WallObjectsLayer';

describe('WallObjectsLayer helpers', () => {
  it('shows wall objects when their mounted wall is visible', () => {
    const wallObjects = createInitialWallObjectLayout();

    expect(getVisibleWallObjects(wallObjects, ['front', 'right']).map((item) => item.id)).toEqual([
      'window',
      'wall-art',
    ]);
  });

  it('hides wall objects when their mounted wall is open', () => {
    const wallObjects = createInitialWallObjectLayout();

    expect(getVisibleWallObjects(wallObjects, ['back', 'right'])).toEqual([]);
  });
});
