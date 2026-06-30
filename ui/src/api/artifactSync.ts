import { collectUniqueArtifactIds } from '../domain/artifacts';
import type { FurnitureLayoutMap, WallObjectLayoutMap } from '../domain/types';
import { useRoomStore } from '../state/useRoomStore';
import { getArtifactsByIds, type ArtifactBatchResponse } from './artifacts';

interface RoomArtifactState {
  furniture: FurnitureLayoutMap;
  wallObjects: WallObjectLayoutMap;
}

interface ArtifactSyncDependencies {
  fetchArtifacts?: (artifactIds: string[]) => Promise<ArtifactBatchResponse>;
  hydrateArtifactMetadata?: (response: ArtifactBatchResponse) => void;
  isCurrentArtifactRequest?: (artifactIds: string[]) => boolean;
  showLayoutStatus?: (message: string) => void;
}

export async function hydrateArtifactsForRoom(
  state: RoomArtifactState,
  dependencies: ArtifactSyncDependencies = {},
): Promise<void> {
  const artifactIds = collectUniqueArtifactIds(state);
  const hydrateArtifactMetadata = dependencies.hydrateArtifactMetadata ?? useRoomStore.getState().hydrateArtifactMetadata;
  const showLayoutStatus = dependencies.showLayoutStatus ?? useRoomStore.getState().showLayoutStatus;

  if (artifactIds.length === 0) {
    hydrateArtifactMetadata({ artifacts: [], missingIds: [] });
    return;
  }

  try {
    const fetchArtifacts = dependencies.fetchArtifacts ?? getArtifactsByIds;
    const response = await fetchArtifacts(artifactIds);

    if (dependencies.isCurrentArtifactRequest && !dependencies.isCurrentArtifactRequest(artifactIds)) {
      return;
    }

    hydrateArtifactMetadata(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'Agent server URL is not configured') {
      return;
    }

    showLayoutStatus('Artifact metadata unavailable');
  }
}
