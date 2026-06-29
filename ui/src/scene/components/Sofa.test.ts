import { describe, expect, it } from 'vitest';

import { SOFA_MODEL_TRANSFORM, SOFA_MODEL_URL, getScaledSofaModelSize } from './Sofa';

describe('Sofa model contract', () => {
  it('uses the supplied sofa GLB from public assets', () => {
    expect(SOFA_MODEL_URL).toBe('/assets/models/sofa-01.glb');
  });

  it('rotates and scales the source model into the existing sofa footprint', () => {
    expect(SOFA_MODEL_TRANSFORM.rotation).toEqual([0, Math.PI / 2, 0]);
    expect(getScaledSofaModelSize()).toEqual({
      width: 2.49,
      height: 0.8,
      depth: 0.91,
    });
    expect(SOFA_MODEL_TRANSFORM.position[1]).toBeCloseTo(0.4, 2);
  });
});

