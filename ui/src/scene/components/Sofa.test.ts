import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  SOFA_INTERACTION_BOUNDS,
  SOFA_MODEL_TRANSFORM,
  SOFA_MODEL_URL,
  SOFA_USE_DRACO,
  SOFA_USE_MESHOPT,
  getScaledSofaModelSize,
} from './Sofa';

type GlbJson = {
  bufferViews?: { byteLength: number }[];
  extensionsUsed?: string[];
  images?: { bufferView?: number; mimeType?: string }[];
};

const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const SOFA_ASSET_PATH = resolve(process.cwd(), 'public/assets/models/sofa-01.glb');

describe('Sofa model contract', () => {
  it('uses the supplied sofa GLB from public assets', () => {
    expect(SOFA_MODEL_URL).toBe('/assets/models/sofa-01.glb');
  });

  it('loads the compressed sofa with Meshopt and no Draco decoder', () => {
    expect(SOFA_USE_DRACO).toBe(false);
    expect(SOFA_USE_MESHOPT).toBe(true);
  });

  it('keeps the balanced Meshopt asset with source-quality textures', () => {
    const glb = readSofaGlbMetadata();
    const textureBytes = glb.json.images?.reduce((total, image) => {
      if (image.bufferView === undefined) {
        return total;
      }

      return total + (glb.json.bufferViews?.[image.bufferView]?.byteLength ?? 0);
    }, 0);

    expect(glb.kilobytes).toBeLessThan(1100);
    expect(glb.json.extensionsUsed).toContain('EXT_meshopt_compression');
    expect(glb.json.extensionsUsed).not.toContain('EXT_texture_webp');
    expect(glb.json.images?.map((image) => image.mimeType)).toEqual([
      'image/jpeg',
      'image/jpeg',
      'image/jpeg',
    ]);
    expect(textureBytes).toBeGreaterThan(100_000);
  });

  it('uses a simple interaction box for sofa picking and dragging', () => {
    expect(SOFA_INTERACTION_BOUNDS).toEqual({
      size: [2.49, 1.21, 0.93],
      position: [0, 0.605, 0],
    });
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

function readSofaGlbMetadata() {
  const data = readFileSync(SOFA_ASSET_PATH);
  const json = readGlbJson(data);

  return {
    json,
    kilobytes: statSync(SOFA_ASSET_PATH).size / 1024,
  };
}

function readGlbJson(data: Buffer): GlbJson {
  let offset = 12;

  while (offset < data.length) {
    const byteLength = data.readUInt32LE(offset);
    const chunkType = data.readUInt32LE(offset + 4);
    offset += 8;
    const chunk = data.subarray(offset, offset + byteLength);
    offset += byteLength;

    if (chunkType === GLB_JSON_CHUNK_TYPE) {
      return JSON.parse(chunk.toString('utf8')) as GlbJson;
    }
  }

  throw new Error('Missing JSON chunk in sofa GLB');
}
