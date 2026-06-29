import type { ChangeEvent, FocusEvent } from 'react';
import { useEffect, useState } from 'react';

import type { FurnitureId, FurnitureLayoutItem } from '../domain/types';
import { useRoomStore } from '../state/useRoomStore';

type InspectorField = 'x' | 'z' | 'rotation';
type InspectorDrafts = Record<InspectorField, string>;

const emptyDrafts: InspectorDrafts = {
  x: '',
  z: '',
  rotation: '',
};

function getFieldValue(item: FurnitureLayoutItem, field: InspectorField): number {
  if (field === 'rotation') {
    return item.rotation.yDegrees;
  }

  return item.position[field];
}

function createDrafts(item: FurnitureLayoutItem | null): InspectorDrafts {
  if (!item) {
    return emptyDrafts;
  }

  return {
    x: String(item.position.x),
    z: String(item.position.z),
    rotation: String(item.rotation.yDegrees),
  };
}

export function InspectorPanel() {
  const selectedId = useRoomStore((state) => state.selectedId);
  const selected = useRoomStore((state) => (state.selectedId ? state.furniture[state.selectedId] : null));
  const setTransformFromInspector = useRoomStore((state) => state.setTransformFromInspector);
  const [drafts, setDrafts] = useState<InspectorDrafts>(emptyDrafts);

  useEffect(() => {
    setDrafts(createDrafts(selected));
  }, [selected, selectedId]);

  function updateNumber(id: FurnitureId, field: InspectorField, event: ChangeEvent<HTMLInputElement>) {
    const draft = event.target.value;
    const value = Number(draft);

    setDrafts((current) => ({ ...current, [field]: draft }));

    if (draft.trim() === '' || !Number.isFinite(value)) {
      return;
    }

    const result = field === 'rotation'
      ? setTransformFromInspector(id, { rotation: { yDegrees: value } })
      : setTransformFromInspector(id, { position: { [field]: value } });
    const nextItem = result.layout[id];

    if (nextItem) {
      setDrafts((current) => ({ ...current, [field]: String(getFieldValue(nextItem, field)) }));
    }
  }

  function resetInvalidDraft(field: InspectorField, event: FocusEvent<HTMLInputElement>) {
    const value = Number(event.target.value);

    if (event.target.value.trim() !== '' && Number.isFinite(value)) {
      return;
    }

    setDrafts((current) => ({
      ...current,
      [field]: selected ? String(getFieldValue(selected, field)) : '',
    }));
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
                type="text"
                inputMode="decimal"
                value={drafts.x}
                onChange={(event) => updateNumber(selectedId, 'x', event)}
                onBlur={(event) => resetInvalidDraft('x', event)}
              />
            </label>
            <label>
              <span>Z</span>
              <input
                type="text"
                inputMode="decimal"
                value={drafts.z}
                onChange={(event) => updateNumber(selectedId, 'z', event)}
                onBlur={(event) => resetInvalidDraft('z', event)}
              />
            </label>
            <label>
              <span>Rotation</span>
              <input
                type="text"
                inputMode="numeric"
                value={drafts.rotation}
                onChange={(event) => updateNumber(selectedId, 'rotation', event)}
                onBlur={(event) => resetInvalidDraft('rotation', event)}
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
