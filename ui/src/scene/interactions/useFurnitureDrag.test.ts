import { describe, expect, it } from 'vitest';

import { createFurnitureMoveCommit } from './useFurnitureDrag';

describe('createFurnitureMoveCommit', () => {
  it('does not create a server commit when the pointer did not move furniture', () => {
    expect(
      createFurnitureMoveCommit('coffee-table', { x: 0.55, z: 0.25 }, { x: 0.55, z: 0.25 }),
    ).toBeNull();
  });

  it('creates a server commit with the final valid furniture position after movement', () => {
    expect(
      createFurnitureMoveCommit('coffee-table', { x: 0.55, z: 0.25 }, { x: 1.2, z: 1.6 }),
    ).toEqual({
      id: 'coffee-table',
      position: { x: 1.2, z: 1.6 },
    });
  });
});
