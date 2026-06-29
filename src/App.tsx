import { useEffect } from 'react';

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
    };

    return () => {
      delete window.__roomComposerDebug;
    };
  }, []);

  return null;
}

export function App() {
  return (
    <main id="app">
      <DebugHooks />
      <RoomCanvas />
      <PlaygroundShell />
    </main>
  );
}
