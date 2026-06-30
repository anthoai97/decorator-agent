import { useEffect, useMemo, useRef } from 'react';

import { hydrateArtifactsForRoom } from './api/artifactSync';
import { startServerStateSync } from './api/serverSync';
import { collectUniqueArtifactIds } from './domain/artifacts';
import { RoomCanvas } from './scene/RoomCanvas';
import { useRoomStore } from './state/useRoomStore';
import { PlaygroundShell } from './ui/PlaygroundShell';

function DebugHooks() {
  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    window.__roomComposerDebug = {
      hasAnyOverlap: () => useRoomStore.getState().hasAnyOverlap(),
      exportLayout: () => useRoomStore.getState().createLayoutExport(),
      importLayout: (layout: unknown) => useRoomStore.getState().importLayout(layout),
      furniture: () =>
        Object.values(useRoomStore.getState().furniture).map((item) => ({
          id: item.id,
          name: item.name,
          x: Number(item.position.x.toFixed(3)),
          z: Number(item.position.z.toFixed(3)),
          rotation: Number(item.rotation.yDegrees.toFixed(1)),
        })),
      wallObjects: () =>
        Object.values(useRoomStore.getState().wallObjects).map((item) => ({
          id: item.id,
          name: item.name,
          wallId: item.wallId,
          u: Number(item.position.u.toFixed(3)),
          y: Number(item.position.y.toFixed(3)),
        })),
    };

    return () => {
      delete window.__roomComposerDebug;
    };
  }, []);

  return null;
}

function ServerStateSync() {
  useEffect(() => {
    const sync = startServerStateSync();
    return sync.stop;
  }, []);

  return null;
}

function ArtifactMetadataSync() {
  const furniture = useRoomStore((state) => state.furniture);
  const wallObjects = useRoomStore((state) => state.wallObjects);
  const hydrateArtifactMetadata = useRoomStore((state) => state.hydrateArtifactMetadata);
  const showLayoutStatus = useRoomStore((state) => state.showLayoutStatus);
  const artifactIdsKey = useMemo(
    () => collectUniqueArtifactIds({ furniture, wallObjects }).join('|'),
    [furniture, wallObjects],
  );
  const latestArtifactIdsKey = useRef(artifactIdsKey);
  latestArtifactIdsKey.current = artifactIdsKey;

  useEffect(() => {
    void hydrateArtifactsForRoom(
      { furniture, wallObjects },
      {
        hydrateArtifactMetadata,
        isCurrentArtifactRequest: (artifactIds) => latestArtifactIdsKey.current === artifactIds.join('|'),
        showLayoutStatus,
      },
    );
  }, [artifactIdsKey, hydrateArtifactMetadata, showLayoutStatus]);

  return null;
}

export function App() {
  return (
    <main id="app">
      <DebugHooks />
      <ServerStateSync />
      <ArtifactMetadataSync />
      <RoomCanvas />
      <PlaygroundShell />
    </main>
  );
}
