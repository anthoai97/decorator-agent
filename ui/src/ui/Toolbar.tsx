import type { ChangeEvent } from 'react';
import { useRef } from 'react';

import { useRoomStore } from '../state/useRoomStore';

export function Toolbar() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedId = useRoomStore((state) => state.selectedId);
  const selected = useRoomStore((state) => (state.selectedId ? state.furniture[state.selectedId] : null));
  const layoutStatus = useRoomStore((state) => state.layoutStatus);
  const rotateSelected = useRoomStore((state) => state.rotateSelected);
  const resetLayout = useRoomStore((state) => state.resetLayout);
  const createLayoutExport = useRoomStore((state) => state.createLayoutExport);
  const importLayout = useRoomStore((state) => state.importLayout);
  const showLayoutStatus = useRoomStore((state) => state.showLayoutStatus);
  const setCameraMode = useRoomStore((state) => state.setCameraMode);

  function exportLayoutFile() {
    const layout = createLayoutExport();
    const blob = new Blob([`${JSON.stringify(layout, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'room-layout.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    showLayoutStatus('Layout exported');
  }

  async function importLayoutFile(event: ChangeEvent<HTMLInputElement>) {
    const [file] = event.target.files ?? [];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      importLayout(JSON.parse(await file.text()));
    } catch (error) {
      showLayoutStatus('Import failed');
      console.warn(error);
    }
  }

  const selectedPosition = selected
    ? `x ${selected.position.x.toFixed(1)} / z ${selected.position.z.toFixed(1)} / r ${selected.rotation.yDegrees.toFixed(0)}deg`
    : '';

  return (
    <section className="hud" aria-label="Room controls">
      <div className="brand">
        <span className="brand__mark" />
        <span>Room Composer</span>
      </div>
      <div className="status" aria-live="polite">
        <span id="selected-name">{selected?.name ?? 'Nothing selected'}</span>
        <span id="selected-position">{selectedPosition}</span>
        <span id="layout-status">{layoutStatus}</span>
      </div>
      <div className="actions">
        <button id="rotate-object" type="button" disabled={!selectedId} onClick={rotateSelected}>
          Rotate
        </button>
        <button id="export-layout" type="button" onClick={exportLayoutFile}>
          Export
        </button>
        <button id="import-layout" type="button" onClick={() => fileInputRef.current?.click()}>
          Import
        </button>
        <input
          id="layout-file"
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={importLayoutFile}
        />
        <button id="top-view" type="button" onClick={() => setCameraMode('top')}>
          Top view
        </button>
        <button id="reset-layout" type="button" onClick={resetLayout}>
          Reset
        </button>
      </div>
    </section>
  );
}
