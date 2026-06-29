import type { ChangeEvent, FocusEvent } from 'react';
import { useEffect, useState } from 'react';

import { sendServerCommand, type ServerCommand } from '../api/serverEvents';
import type { FurnitureId, FurnitureLayoutItem } from '../domain/types';
import { useRoomStore } from '../state/useRoomStore';

export type InspectorField = 'x' | 'z' | 'rotation';
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
  const showLayoutStatus = useRoomStore((state) => state.showLayoutStatus);
  const [drafts, setDrafts] = useState<InspectorDrafts>(emptyDrafts);
  const [focusedField, setFocusedField] = useState<InspectorField | null>(null);
  const [focusedStartValue, setFocusedStartValue] = useState<number | null>(null);

  useEffect(() => {
    if (!selected || focusedField === null) {
      setDrafts(createDrafts(selected));
    }
  }, [focusedField, selected, selectedId]);

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

    if (nextItem && getFieldValue(nextItem, field) !== value) {
      setDrafts((current) => ({ ...current, [field]: String(getFieldValue(nextItem, field)) }));
    }
  }

  function resetInvalidDraft(field: InspectorField, event: FocusEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    const startValue = focusedStartValue;
    setFocusedField(null);
    setFocusedStartValue(null);

    if (event.target.value.trim() !== '' && Number.isFinite(value) && selectedId) {
      const result = field === 'rotation'
        ? setTransformFromInspector(selectedId, { rotation: { yDegrees: value } })
        : setTransformFromInspector(selectedId, { position: { [field]: value } });
      const nextItem = result.layout[selectedId];
      const nextValue = nextItem ? getFieldValue(nextItem, field) : value;

      setDrafts((current) => ({
        ...current,
        [field]: nextItem ? String(nextValue) : event.target.value,
      }));

      if (result.applied && nextItem && hasInspectorValueChanged(startValue, nextValue)) {
        void commitInspectorChange(selectedId, nextItem, field);
      }
      return;
    }

    setDrafts((current) => ({
      ...current,
      [field]: selected ? String(getFieldValue(selected, field)) : '',
    }));
  }

  async function commitInspectorChange(id: FurnitureId, item: FurnitureLayoutItem, field: InspectorField) {
    try {
      await sendServerCommand(createInspectorServerCommand(id, item, field));
      showLayoutStatus(field === 'rotation' ? 'Rotation saved to server' : 'Position saved to server');
    } catch (error) {
      showLayoutStatus(getInspectorCommitErrorMessage(error));
      console.warn(error);
    }
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
                onFocus={() => {
                  setFocusedField('x');
                  setFocusedStartValue(selected ? getFieldValue(selected, 'x') : null);
                }}
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
                onFocus={() => {
                  setFocusedField('z');
                  setFocusedStartValue(selected ? getFieldValue(selected, 'z') : null);
                }}
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
                onFocus={() => {
                  setFocusedField('rotation');
                  setFocusedStartValue(selected ? getFieldValue(selected, 'rotation') : null);
                }}
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

export function createInspectorServerCommand(
  id: FurnitureId,
  item: FurnitureLayoutItem,
  field: InspectorField,
): ServerCommand {
  if (field === 'rotation') {
    return {
      type: 'SET_FURNITURE_ROTATION',
      payload: {
        furnitureId: id,
        rotationYDegrees: item.rotation.yDegrees,
        position: {
          x: item.position.x,
          z: item.position.z,
        },
      },
    };
  }

  return {
    type: 'MOVE_FURNITURE',
    payload: {
      furnitureId: id,
      position: {
        x: item.position.x,
        z: item.position.z,
      },
    },
  };
}

function hasInspectorValueChanged(startValue: number | null, nextValue: number): boolean {
  return startValue === null || Math.abs(startValue - nextValue) > 0.0001;
}

function getInspectorCommitErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'Agent server URL is not configured') {
      return 'Server bridge disabled; kept local change';
    }

    if (error.message.startsWith('Command rejected')) {
      return error.message;
    }
  }

  return 'Server unavailable; kept local change';
}
