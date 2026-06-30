import type { FurnitureLayoutMap, WallObjectLayoutMap } from './types';

interface RoomArtifactReferenceState {
  furniture?: FurnitureLayoutMap;
  wallObjects?: WallObjectLayoutMap;
}

interface ArtifactBackedRoomItem {
  artifactId?: string;
}

interface ArtifactUrlMetadata {
  url: string;
}

export function collectUniqueArtifactIds(state: RoomArtifactReferenceState): string[] {
  const artifactIds: string[] = [];
  const seenArtifactIds = new Set<string>();

  for (const item of Object.values(state.furniture ?? {})) {
    collectArtifactId(item.artifactId, artifactIds, seenArtifactIds);
  }

  for (const item of Object.values(state.wallObjects ?? {})) {
    collectArtifactId(item.artifactId, artifactIds, seenArtifactIds);
  }

  return artifactIds;
}

function collectArtifactId(
  artifactId: string | undefined,
  artifactIds: string[],
  seenArtifactIds: Set<string>,
): void {
  if (!artifactId || seenArtifactIds.has(artifactId)) {
    return;
  }

  seenArtifactIds.add(artifactId);
  artifactIds.push(artifactId);
}

export function readArtifactUrlForItem(
  item: ArtifactBackedRoomItem | undefined,
  artifactMetadataById: Record<string, ArtifactUrlMetadata | undefined>,
): string | undefined {
  const artifactId = item?.artifactId;

  if (!artifactId) {
    return undefined;
  }

  return artifactMetadataById[artifactId]?.url;
}
