import { beforeEach, describe, expect, it } from 'vitest';

import { createInitialFurnitureLayout, roomDefinition } from '../data/furnitureCatalog';
import { useRoomStore } from './useRoomStore';

beforeEach(() => {
  useRoomStore.getState().resetLayout();
  useRoomStore.getState().selectFurniture(null);
});

describe('useRoomStore', () => {
  it('selects furniture and rotates it by 45 degrees', () => {
    useRoomStore.getState().selectFurniture('sofa');
    useRoomStore.getState().rotateSelected();

    expect(useRoomStore.getState().selectedId).toBe('sofa');
    expect(useRoomStore.getState().furniture.sofa.rotation.yDegrees).toBe(45);
  });

  it('moves furniture through collision validation', () => {
    const result = useRoomStore.getState().moveFurniture('coffee-table', { x: 1.2, z: 1.6 });

    expect(result.applied).toBe(true);
    expect(useRoomStore.getState().furniture['coffee-table'].position.x).toBe(1.2);
    expect(useRoomStore.getState().furniture['coffee-table'].position.z).toBe(1.6);
  });

  it('rejects overlapping inspector transforms', () => {
    const sofaPosition = useRoomStore.getState().furniture.sofa.position;
    const result = useRoomStore.getState().setTransformFromInspector('coffee-table', {
      position: sofaPosition,
    });

    expect(result.applied).toBe(false);
    expect(useRoomStore.getState().layoutStatus).toBe('Move rejected: furniture would overlap');
  });

  it('exports and imports layout state', () => {
    const exported = useRoomStore.getState().createLayoutExport();
    const result = useRoomStore.getState().importLayout(exported);

    expect(exported.schemaVersion).toBe(1);
    expect(result.applied).toBe(exported.furniture.length);
    expect(useRoomStore.getState().layoutStatus).toBe(`Imported ${exported.furniture.length} objects`);
  });

  it('hydrates authoritative server state snapshots', () => {
    const furniture = createInitialFurnitureLayout();
    furniture.sofa = {
      ...furniture.sofa,
      rotation: { yDegrees: 90 },
    };

    useRoomStore.getState().hydrateServerState({
      state: {
        revision: 7,
        room: roomDefinition,
        furniture,
        objectives: [{ id: 'objective-1', title: 'Keep walking paths open' }],
      },
      revision: 7,
      lastEventId: 11,
    });

    expect(useRoomStore.getState().furniture.sofa.rotation.yDegrees).toBe(90);
    expect(useRoomStore.getState().objectives).toEqual([{ id: 'objective-1', title: 'Keep walking paths open' }]);
    expect(useRoomStore.getState().serverRevision).toBe(7);
    expect(useRoomStore.getState().lastEventId).toBe(11);
  });

  it('clears stale selection when a server snapshot omits selected furniture', () => {
    const furniture = createInitialFurnitureLayout();
    delete (furniture as Partial<typeof furniture>).planter;
    useRoomStore.getState().selectFurniture('planter');

    useRoomStore.getState().hydrateServerState({
      state: {
        revision: 7,
        room: roomDefinition,
        furniture,
        objectives: [],
      },
      revision: 7,
      lastEventId: 11,
    });

    expect(useRoomStore.getState().selectedId).toBeNull();
  });

  it('applies furniture patches without replacing unchanged furniture branches', () => {
    const before = useRoomStore.getState().furniture;
    const nextSofa = {
      ...before.sofa,
      rotation: { yDegrees: 45 },
    };

    useRoomStore.getState().applyServerEvent({
      id: 12,
      type: 'room.state.patch',
      revision: 8,
      patch: { furniture: { sofa: nextSofa } },
    });

    const after = useRoomStore.getState().furniture;

    expect(after.sofa.rotation.yDegrees).toBe(45);
    expect(after.planter).toBe(before.planter);
    expect(after).not.toBe(before);
    expect(useRoomStore.getState().lastEventId).toBe(12);
  });

  it('applies objective patches', () => {
    useRoomStore.getState().applyServerEvent({
      id: 13,
      type: 'room.state.patch',
      revision: 9,
      patch: { objectives: [{ id: 'objective-2', title: 'Create a reading corner' }] },
    });

    expect(useRoomStore.getState().objectives).toEqual([
      { id: 'objective-2', title: 'Create a reading corner' },
    ]);
    expect(useRoomStore.getState().serverRevision).toBe(9);
  });

  it('applies furniture removal patches and clears stale selection state', () => {
    useRoomStore.getState().selectFurniture('planter');
    useRoomStore.getState().hoverFurniture('planter');

    useRoomStore.getState().applyServerEvent({
      id: 14,
      type: 'room.state.patch',
      revision: 10,
      patch: { furniture: { planter: null } },
    });

    expect(useRoomStore.getState().furniture.planter).toBeUndefined();
    expect(useRoomStore.getState().selectedId).toBeNull();
    expect(useRoomStore.getState().hoveredId).toBeNull();
  });
});
