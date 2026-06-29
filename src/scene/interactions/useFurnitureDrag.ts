import { useCallback, useRef } from 'react';
import type { Ray } from 'three';
import { Plane, Vector3 } from 'three';

import type { FurnitureId } from '../../domain/types';
import { useRoomStore } from '../../state/useRoomStore';

interface DragSession {
  id: FurnitureId;
  offset: Vector3;
}

interface UseFurnitureDragOptions {
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export interface FurnitureDragApi {
  beginDrag: (id: FurnitureId, objectPosition: Vector3, ray: Ray) => void;
  updateDrag: (ray: Ray) => void;
  endDrag: () => void;
  isDragging: () => boolean;
}

const floorPlane = new Plane(new Vector3(0, 1, 0), 0);

export function useFurnitureDrag({
  onDragStart,
  onDragEnd,
}: UseFurnitureDragOptions = {}): FurnitureDragApi {
  const session = useRef<DragSession | null>(null);
  const floorHit = useRef(new Vector3());
  const selectFurniture = useRoomStore((state) => state.selectFurniture);
  const moveFurniture = useRoomStore((state) => state.moveFurniture);

  const beginDrag = useCallback(
    (id: FurnitureId, objectPosition: Vector3, ray: Ray) => {
      selectFurniture(id);

      if (ray.intersectPlane(floorPlane, floorHit.current)) {
        const wasDragging = session.current !== null;
        session.current = {
          id,
          offset: objectPosition.clone().sub(floorHit.current),
        };

        if (!wasDragging) {
          onDragStart?.();
        }
      }
    },
    [onDragStart, selectFurniture],
  );

  const updateDrag = useCallback(
    (ray: Ray) => {
      if (!session.current || !ray.intersectPlane(floorPlane, floorHit.current)) {
        return;
      }

      const nextPosition = floorHit.current.clone().add(session.current.offset);
      moveFurniture(session.current.id, { x: nextPosition.x, z: nextPosition.z });
    },
    [moveFurniture],
  );

  const endDrag = useCallback(() => {
    const wasDragging = session.current !== null;
    session.current = null;

    if (wasDragging) {
      onDragEnd?.();
    }
  }, [onDragEnd]);

  const isDragging = useCallback(() => session.current !== null, []);

  return {
    beginDrag,
    updateDrag,
    endDrag,
    isDragging,
  };
}
