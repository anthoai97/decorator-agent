export interface Artifact {
  id: string;
  kind: 'model3d' | 'image' | 'material';
  objectType: string;
  displayName: string;
  placement: 'floor' | 'wall' | 'ceiling' | 'surface' | 'reference';
  contentType: string;
  url: string;
  thumbnailUrl: string | null;
  tags: string[];
  dimensionsMeters?: { width: number; height: number; depth: number };
  source?: 'seeded' | 'uploaded' | 'generated' | 'external';
  createdAt?: string;
}

export interface ArtifactSearchOptions {
  ids?: string[];
  kind?: Artifact['kind'];
  type?: string;
  objectType?: string;
  placement?: Artifact['placement'];
  tag?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ArtifactSearchResponse {
  artifacts: Artifact[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface ArtifactBatchResponse {
  artifacts: Artifact[];
  missingIds: string[];
}

export async function searchArtifacts(options: ArtifactSearchOptions = {}): Promise<ArtifactSearchResponse> {
  const url = new URL(`${getServerUrl()}/api/artifacts`);
  appendArtifactSearchParams(url, options);

  return getJson<ArtifactSearchResponse>(url);
}

export async function getArtifactsByIds(ids: string[]): Promise<ArtifactBatchResponse> {
  const url = new URL(`${getServerUrl()}/api/artifacts`);
  url.searchParams.set('ids', ids.join(','));

  return getJson<ArtifactBatchResponse>(url);
}

export function getArtifactContentUrl(artifactId: string): string {
  return `${getServerUrl()}/api/artifacts/${encodeURIComponent(artifactId)}/content`;
}

function appendArtifactSearchParams(url: URL, options: ArtifactSearchOptions): void {
  if (options.kind) {
    url.searchParams.set('kind', options.kind);
  }

  if (options.type) {
    url.searchParams.set('type', options.type);
  }

  if (options.objectType) {
    url.searchParams.set('objectType', options.objectType);
  }

  if (options.placement) {
    url.searchParams.set('placement', options.placement);
  }

  if (options.tag) {
    url.searchParams.set('tag', options.tag);
  }

  if (options.q) {
    url.searchParams.set('q', options.q);
  }

  if (options.page !== undefined) {
    url.searchParams.set('page', String(options.page));
  }

  if (options.pageSize !== undefined) {
    url.searchParams.set('pageSize', String(options.pageSize));
  }
}

async function getJson<T>(url: URL): Promise<T> {
  const response = await fetch(url.toString());
  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message ?? `Server request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

function getServerUrl(): string {
  const serverUrl = import.meta.env.VITE_AGENT_SERVER_URL;

  if (!serverUrl) {
    throw new Error('Agent server URL is not configured');
  }

  return serverUrl.replace(/\/$/, '');
}
