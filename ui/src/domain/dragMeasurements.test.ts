import { describe, expect, it } from 'vitest';

import { createInitialFurnitureLayout, roomDefinition } from '../data/furnitureCatalog';
import { createInitialWallObjectLayout } from '../data/wallObjectCatalog';
import {
  createFurnitureDragMeasurements,
  createWallObjectDragMeasurements,
  formatMeasurementValue,
} from './dragMeasurements';

describe('drag measurements', () => {
  it('calculates floor furniture distances to room walls', () => {
    const sofa = createInitialFurnitureLayout().sofa;

    expect(createFurnitureDragMeasurements(sofa, roomDefinition)).toEqual({
      left: 0.755,
      right: 2.555,
      back: 0.335,
      front: 3.135,
    });
  });

  it('uses rotation-aware furniture dimensions for room-wall distances', () => {
    const loungeChair = createInitialFurnitureLayout()['lounge-chair'];

    expect(createFurnitureDragMeasurements(loungeChair, roomDefinition)).toEqual({
      left: 3.739,
      right: 0.239,
      back: 0.889,
      front: 1.689,
    });
  });

  it('calculates wall object distances inside the mounted wall', () => {
    const window = createInitialWallObjectLayout().window;

    expect(createWallObjectDragMeasurements(window, roomDefinition)).toEqual({
      left: 0.04,
      right: 4.24,
      bottom: 1.19,
      top: 0.44,
    });
  });

  it('formats meters consistently for scene labels', () => {
    expect(formatMeasurementValue(1)).toBe('1.00 m');
    expect(formatMeasurementValue(1.236)).toBe('1.24 m');
  });
});
