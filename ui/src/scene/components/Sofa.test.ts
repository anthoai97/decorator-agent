import { readFileSync, statSync } from 'node:fs';

import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let sofaModule: Awaited<typeof import('./Sofa')>;

type ReactElementLike = {
  type?: unknown;
  props?: Record<string, unknown>;
};

type GlbJson = {
  bufferViews?: { byteLength: number }[];
  extensionsUsed?: string[];
  images?: { bufferView?: number; mimeType?: string }[];
};

const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const SOFA_ASSET_URL = new URL('../../../../server/assets/seeds/models/sofa-01.glb', import.meta.url);

describe('Sofa model contract', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    sofaModule = await import('./Sofa');
  });

  it('does not resolve a server URL at module import time', () => {
    expect(sofaModule.SOFA_ARTIFACT_ID).toBe('seed-sofa-01');
  });

  it('renders the sofa model from a server-provided artifact URL', () => {
    const modelUrl = 'http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content';
    const sofaElement = sofaModule.Sofa({ modelUrl }) as ReactElementLike;
    const modelArtifact = findModelArtifactChild(sofaElement);

    expect(modelArtifact?.props?.url).toBe(modelUrl);
  });

  it('keeps the interaction fallback when the server model URL is unavailable', () => {
    const sofaElement = sofaModule.Sofa({}) as ReactElementLike;

    expect(findModelArtifactChild(sofaElement)).toBeUndefined();
  });

  it('keeps interaction bounds outside the model suspense boundary', () => {
    const sofaElement = sofaModule.Sofa({
      modelUrl: 'http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content',
    }) as ReactElementLike;
    const directChildren = readElementChildren(sofaElement);
    const interactionBounds = directChildren.find(
      (child) => child.type === 'mesh' && child.props?.name === 'Sofa interaction bounds',
    );
    const modelBoundary = directChildren.find((child) => child.type === Suspense);

    expect(interactionBounds).toBeDefined();
    expect(modelBoundary).toBeDefined();
    expect(findModelArtifactChild(modelBoundary)).toBeDefined();
  });

  it('loads the compressed sofa with Meshopt and no Draco decoder', () => {
    expect(sofaModule.SOFA_USE_DRACO).toBe(false);
    expect(sofaModule.SOFA_USE_MESHOPT).toBe(true);
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
    expect(sofaModule.SOFA_INTERACTION_BOUNDS).toEqual({
      size: [2.49, 1.21, 0.93],
      position: [0, 0.605, 0],
    });
  });

  it('rotates and scales the source model into the existing sofa footprint', () => {
    expect(sofaModule.SOFA_MODEL_TRANSFORM.rotation).toEqual([0, Math.PI / 2, 0]);
    expect(sofaModule.getScaledSofaModelSize()).toEqual({
      width: 2.49,
      height: 0.8,
      depth: 0.91,
    });
    expect(sofaModule.SOFA_MODEL_TRANSFORM.position[1]).toBeCloseTo(0.4, 2);
  });
});

function findModelArtifactChild(element: ReactElementLike | undefined): ReactElementLike | undefined {
  const children = readElementChildren(element);

  for (const child of children) {
    if (!child || typeof child !== 'object') {
      continue;
    }

    const childElement = child as ReactElementLike;
    if (typeof childElement.type === 'function' && childElement.type.name === 'ModelArtifact') {
      return childElement;
    }

    const nestedMatch = findModelArtifactChild(childElement);
    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return undefined;
}

function readElementChildren(element: ReactElementLike | undefined): ReactElementLike[] {
  const children = element?.props?.children;

  if (Array.isArray(children)) {
    return children as ReactElementLike[];
  }

  return children ? [children as ReactElementLike] : [];
}

function readSofaGlbMetadata() {
  const data = readFileSync(SOFA_ASSET_URL) as Buffer;
  const json = readGlbJson(data);

  return {
    json,
    kilobytes: statSync(SOFA_ASSET_URL).size / 1024,
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
