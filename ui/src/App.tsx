import { useEffect } from 'react';

import { startServerStateSync } from './api/serverSync';
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

export function App() {
  return (
    <main id="app">
      <DebugHooks />
      <ServerStateSync />
      <RoomCanvas />
      <PlaygroundShell />
    </main>
  );
}
