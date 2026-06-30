import { describe, expect, it, vi } from 'vitest';

import type { ArtifactBatchResponse } from './artifacts';
import { hydrateArtifactsForRoom } from './artifactSync';
import { createInitialFurnitureLayout } from '../data/furnitureCatalog';
import { createInitialWallObjectLayout } from '../data/wallObjectCatalog';

describe('artifactSync', () => {
  it('fetches artifact metadata for placed room artifact ids', async () => {
    const response: ArtifactBatchResponse = {
      artifacts: [
        {
          id: 'seed-sofa-01',
          kind: 'model3d',
          objectType: 'sofa',
          displayName: 'Sofa',
          placement: 'floor',
          contentType: 'model/gltf-binary',
          url: 'http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content',
          thumbnailUrl: null,
          tags: ['sofa'],
        },
      ],
      missingIds: [],
    };
    const fetchArtifacts = vi.fn().mockResolvedValue(response);
    const hydrateArtifactMetadata = vi.fn();
    const showLayoutStatus = vi.fn();

    await hydrateArtifactsForRoom(
      { furniture: createInitialFurnitureLayout(), wallObjects: createInitialWallObjectLayout() },
      { fetchArtifacts, hydrateArtifactMetadata, showLayoutStatus },
    );

    expect(fetchArtifacts).toHaveBeenCalledWith(['seed-sofa-01']);
    expect(hydrateArtifactMetadata).toHaveBeenCalledWith(response);
    expect(showLayoutStatus).not.toHaveBeenCalled();
  });

  it('keeps local-only mode quiet when server URL is not configured', async () => {
    const fetchArtifacts = vi.fn().mockRejectedValue(new Error('Agent server URL is not configured'));
    const hydrateArtifactMetadata = vi.fn();
    const showLayoutStatus = vi.fn();

    await hydrateArtifactsForRoom(
      { furniture: createInitialFurnitureLayout(), wallObjects: createInitialWallObjectLayout() },
      { fetchArtifacts, hydrateArtifactMetadata, showLayoutStatus },
    );

    expect(hydrateArtifactMetadata).not.toHaveBeenCalled();
    expect(showLayoutStatus).not.toHaveBeenCalled();
  });

  it('ignores stale artifact metadata responses', async () => {
    const fetchArtifacts = vi.fn().mockResolvedValue({
      artifacts: [
        {
          id: 'seed-sofa-01',
          kind: 'model3d',
          objectType: 'sofa',
          displayName: 'Sofa',
          placement: 'floor',
          contentType: 'model/gltf-binary',
          url: 'http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content',
          thumbnailUrl: null,
          tags: ['sofa'],
        },
      ],
      missingIds: [],
    } satisfies ArtifactBatchResponse);
    const hydrateArtifactMetadata = vi.fn();

    await hydrateArtifactsForRoom(
      { furniture: createInitialFurnitureLayout(), wallObjects: createInitialWallObjectLayout() },
      {
        fetchArtifacts,
        hydrateArtifactMetadata,
        isCurrentArtifactRequest: () => false,
      },
    );

    expect(hydrateArtifactMetadata).not.toHaveBeenCalled();
  });
});
