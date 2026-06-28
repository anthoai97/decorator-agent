import type { ChangeEvent } from 'react';

import type { FurnitureId } from '../domain/types';
import { useRoomStore } from '../state/useRoomStore';

type InspectorField = 'x' | 'z' | 'rotation';

export function InspectorPanel() {
  const selectedId = useRoomStore((state) => state.selectedId);
  const selected = useRoomStore((state) => (state.selectedId ? state.furniture[state.selectedId] : null));
  const setTransformFromInspector = useRoomStore((state) => state.setTransformFromInspector);

  function updateNumber(id: FurnitureId, field: InspectorField, event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);

    if (!Number.isFinite(value)) {
      return;
    }

    if (field === 'rotation') {
      setTransformFromInspector(id, { rotation: { yDegrees: value } });
      return;
    }

    setTransformFromInspector(id, { position: { [field]: value } });
  }

  return (
    <aside className="inspector" aria-label="Furniture inspector">
      <div className="inspector__section">
        <h2>Inspector</h2>
        {selected && selectedId ? (
          <div className="field-grid">
            <label>
              <span>Name</span>
              <input value={selected.name} readOnly />
            </label>
            <label>
              <span>X</span>
              <input
                type="number"
                step="0.1"
                value={selected.position.x}
                onChange={(event) => updateNumber(selectedId, 'x', event)}
              />
            </label>
            <label>
              <span>Z</span>
              <input
                type="number"
                step="0.1"
                value={selected.position.z}
                onChange={(event) => updateNumber(selectedId, 'z', event)}
              />
            </label>
            <label>
              <span>Rotation</span>
              <input
                type="number"
                step="45"
                value={selected.rotation.yDegrees}
                onChange={(event) => updateNumber(selectedId, 'rotation', event)}
              />
            </label>
          </div>
        ) : (
          <p className="inspector__empty">Select furniture to inspect it.</p>
        )}
      </div>
    </aside>
  );
}
