import { afterEach, describe, expect, it, vi } from 'vitest';

import { getArtifactContentUrl, getArtifactsByIds, searchArtifacts } from './artifacts';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('artifacts API', () => {
  it('searches artifacts with supported filters', async () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787/');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          artifacts: [{ id: 'seed-sofa-01', kind: 'model3d', objectType: 'sofa' }],
          pagination: { page: 2, pageSize: 12, totalItems: 1, totalPages: 1 },
        }),
        { status: 200 },
      ),
    );

    const response = await searchArtifacts({
      kind: 'model3d',
      type: 'sofa',
      objectType: 'chair',
      placement: 'floor',
      tag: 'wood',
      q: 'modern',
      page: 2,
      pageSize: 12,
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);

    expect(url.origin).toBe('http://127.0.0.1:8787');
    expect(url.pathname).toBe('/api/artifacts');
    expect(url.searchParams.get('kind')).toBe('model3d');
    expect(url.searchParams.get('type')).toBe('sofa');
    expect(url.searchParams.get('objectType')).toBe('chair');
    expect(url.searchParams.get('placement')).toBe('floor');
    expect(url.searchParams.get('tag')).toBe('wood');
    expect(url.searchParams.get('q')).toBe('modern');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('pageSize')).toBe('12');
    expect(response.artifacts[0].id).toBe('seed-sofa-01');
  });

  it('batch fetches artifacts by id and returns missing ids', async () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          artifacts: [{ id: 'seed-sofa-01', kind: 'model3d', objectType: 'sofa' }],
          missingIds: ['missing-artifact'],
        }),
        { status: 200 },
      ),
    );

    const response = await getArtifactsByIds(['seed-sofa-01', 'missing-artifact']);
    const url = new URL(fetchMock.mock.calls[0][0] as string);

    expect(url.pathname).toBe('/api/artifacts');
    expect(url.searchParams.get('ids')).toBe('seed-sofa-01,missing-artifact');
    expect(response.missingIds).toEqual(['missing-artifact']);
  });

  it('builds artifact content URLs from the server URL', () => {
    vi.stubEnv('VITE_AGENT_SERVER_URL', 'http://127.0.0.1:8787/');

    expect(getArtifactContentUrl('seed-sofa-01')).toBe(
      'http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content',
    );
  });

  it('requires an explicit server URL before artifact requests', async () => {
    await expect(searchArtifacts({ kind: 'model3d' })).rejects.toThrow('Agent server URL is not configured');
    expect(() => getArtifactContentUrl('seed-sofa-01')).toThrow('Agent server URL is not configured');
  });
});
