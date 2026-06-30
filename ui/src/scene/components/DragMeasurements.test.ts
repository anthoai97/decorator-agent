import { describe, expect, it } from 'vitest';

import {
  MEASUREMENT_GUIDE_GEOMETRY_SIZE,
  createMeasurementGuideMeshProps,
} from './DragMeasurements';

describe('DragMeasurements render geometry', () => {
  it('keeps measurement guide geometry buffers stable while size changes', () => {
    const leftGuide = createMeasurementGuideMeshProps({
      id: 'left',
      label: '1.2m',
      position: [0, 0.055, -1],
      size: [1.2, 0.018, 0.018],
    });
    const rightGuide = createMeasurementGuideMeshProps({
      id: 'right',
      label: '0.4m',
      position: [1, 0.055, -1],
      size: [0.4, 0.018, 0.018],
    });

    expect(MEASUREMENT_GUIDE_GEOMETRY_SIZE).toEqual([1, 1, 1]);
    expect(leftGuide.geometrySize).toBe(MEASUREMENT_GUIDE_GEOMETRY_SIZE);
    expect(rightGuide.geometrySize).toBe(MEASUREMENT_GUIDE_GEOMETRY_SIZE);
    expect(leftGuide.scale).toEqual([1.2, 0.018, 0.018]);
    expect(rightGuide.scale).toEqual([0.4, 0.018, 0.018]);
  });
});
