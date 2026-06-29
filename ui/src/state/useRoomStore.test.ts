import { beforeEach, describe, expect, it } from 'vitest';

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
    expect(result.applied).toBe(5);
    expect(useRoomStore.getState().layoutStatus).toBe('Imported 5 objects');
  });
});
