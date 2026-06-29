import { beforeEach, describe, expect, it } from 'vitest';

import { createInitialFurnitureLayout, roomDefinition } from '../data/furnitureCatalog';
import { createInitialWallObjectLayout } from '../data/wallObjectCatalog';
import { useRoomStore } from './useRoomStore';

beforeEach(() => {
  useRoomStore.getState().resetLayout();
  useRoomStore.getState().selectFurniture(null);
});

describe('useRoomStore', () => {
  it('selects furniture and rotates it by 45 degrees', () => {
    useRoomStore.getState().selectFurniture('planter');
    useRoomStore.getState().rotateSelected();

    expect(useRoomStore.getState().selectedId).toBe('planter');
    expect(useRoomStore.getState().furniture.planter.rotation.yDegrees).toBe(45);
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
    expect(exported.wallObjects?.map((item) => item.id)).toEqual(['window', 'wall-art']);
    expect(result.applied).toBe(exported.furniture.length + (exported.wallObjects?.length ?? 0));
    expect(useRoomStore.getState().layoutStatus).toBe(`Imported ${result.applied} objects`);
  });

  it('moves and clamps wall objects separately from furniture', () => {
    const result = useRoomStore.getState().moveWallObject('wall-art', {
      wallId: 'right',
      position: { u: 99, y: -99 },
    });

    expect(result.applied).toBe(true);
    expect(result.clamped).toBe(true);
    expect(useRoomStore.getState().wallObjects['wall-art'].wallId).toBe('right');
    expect(useRoomStore.getState().wallObjects['wall-art'].position).toEqual({ u: 1.7, y: 0.36 });
    expect(useRoomStore.getState().furniture['wall-art' as never]).toBeUndefined();
  });

  it('resets wall objects with the layout', () => {
    useRoomStore.getState().moveWallObject('window', { u: 0, y: 1.1 });
    useRoomStore.getState().resetLayout();

    expect(useRoomStore.getState().wallObjects.window.position).toEqual({ u: -2.1, y: 1.7 });
  });

  it('tracks the active drag measurement target for any object type', () => {
    useRoomStore.getState().setActiveDragMeasurementTarget({ type: 'furniture', id: 'sofa' });
    expect(useRoomStore.getState().activeDragMeasurementTarget).toEqual({ type: 'furniture', id: 'sofa' });

    useRoomStore.getState().setActiveDragMeasurementTarget({ type: 'wallObject', id: 'window' });
    expect(useRoomStore.getState().activeDragMeasurementTarget).toEqual({ type: 'wallObject', id: 'window' });

    useRoomStore.getState().setActiveDragMeasurementTarget(null);
    expect(useRoomStore.getState().activeDragMeasurementTarget).toBeNull();
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
        wallObjects: {
          ...createInitialWallObjectLayout(),
          window: {
            ...createInitialWallObjectLayout().window,
            position: { u: 0.4, y: 1.4 },
          },
        },
        objectives: [{ id: 'objective-1', title: 'Keep walking paths open' }],
      },
      revision: 7,
      lastEventId: 11,
    });

    expect(useRoomStore.getState().furniture.sofa.rotation.yDegrees).toBe(90);
    expect(useRoomStore.getState().wallObjects.window.position).toEqual({ u: 0.4, y: 1.4 });
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
        wallObjects: createInitialWallObjectLayout(),
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

  it('applies wall object patches without replacing unchanged wall object branches', () => {
    const before = useRoomStore.getState().wallObjects;
    const nextWindow = {
      ...before.window,
      position: { u: -1.2, y: 1.35 },
    };

    useRoomStore.getState().applyServerEvent({
      id: 15,
      type: 'room.state.patch',
      revision: 11,
      patch: { wallObjects: { window: nextWindow } },
    });

    const after = useRoomStore.getState().wallObjects;

    expect(after.window.position).toEqual({ u: -1.2, y: 1.35 });
    expect(after['wall-art']).toBe(before['wall-art']);
    expect(after).not.toBe(before);
    expect(useRoomStore.getState().lastEventId).toBe(15);
  });

  it('applies furniture removal patches and clears stale selection state', () => {
    useRoomStore.getState().selectFurniture('planter');

    useRoomStore.getState().applyServerEvent({
      id: 14,
      type: 'room.state.patch',
      revision: 10,
      patch: { furniture: { planter: null } },
    });

    expect(useRoomStore.getState().furniture.planter).toBeUndefined();
    expect(useRoomStore.getState().selectedId).toBeNull();
  });
});
