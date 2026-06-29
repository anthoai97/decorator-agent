import { useCallback, useRef } from 'react';
import type { Ray } from 'three';
import { Plane, Vector3 } from 'three';

import type { FurnitureId } from '../../domain/types';
import { useRoomStore } from '../../state/useRoomStore';

export interface FurnitureMoveCommit {
  id: FurnitureId;
  position: FurnitureMovePosition;
}

type FurnitureMovePosition = { x: number; z: number };

interface DragSession {
  id: FurnitureId;
  offset: Vector3;
  startPosition: FurnitureMovePosition;
  lastPosition: FurnitureMovePosition;
}

interface UseFurnitureDragOptions {
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragCommit?: (commit: FurnitureMoveCommit) => void;
}

export interface FurnitureDragApi {
  beginDrag: (id: FurnitureId, objectPosition: Vector3, ray: Ray) => void;
  updateDrag: (ray: Ray) => void;
  endDrag: () => void;
  isDragging: () => boolean;
}

const floorPlane = new Plane(new Vector3(0, 1, 0), 0);
const movementThreshold = 0.0001;

export function useFurnitureDrag({
  onDragStart,
  onDragEnd,
  onDragCommit,
}: UseFurnitureDragOptions = {}): FurnitureDragApi {
  const session = useRef<DragSession | null>(null);
  const floorHit = useRef(new Vector3());
  const selectFurniture = useRoomStore((state) => state.selectFurniture);
  const moveFurniture = useRoomStore((state) => state.moveFurniture);
  const setActiveDragMeasurementTarget = useRoomStore((state) => state.setActiveDragMeasurementTarget);

  const beginDrag = useCallback(
    (id: FurnitureId, objectPosition: Vector3, ray: Ray) => {
      selectFurniture(id);

      if (ray.intersectPlane(floorPlane, floorHit.current)) {
        const wasDragging = session.current !== null;
        session.current = {
          id,
          offset: objectPosition.clone().sub(floorHit.current),
          startPosition: { x: objectPosition.x, z: objectPosition.z },
          lastPosition: { x: objectPosition.x, z: objectPosition.z },
        };
        setActiveDragMeasurementTarget({ type: 'furniture', id });

        if (!wasDragging) {
          onDragStart?.();
        }
      }
    },
    [onDragStart, selectFurniture, setActiveDragMeasurementTarget],
  );

  const updateDrag = useCallback(
    (ray: Ray) => {
      if (!session.current || !ray.intersectPlane(floorPlane, floorHit.current)) {
        return;
      }

      const nextPosition = floorHit.current.clone().add(session.current.offset);
      const result = moveFurniture(session.current.id, { x: nextPosition.x, z: nextPosition.z });
      const movedItem = result.layout[session.current.id];

      if (result.applied && movedItem) {
        session.current.lastPosition = {
          x: movedItem.position.x,
          z: movedItem.position.z,
        };
      }
    },
    [moveFurniture],
  );

  const endDrag = useCallback(() => {
    const commit = createFurnitureMoveCommitFromSession(session.current);
    const wasDragging = session.current !== null;
    session.current = null;

    if (wasDragging) {
      setActiveDragMeasurementTarget(null);
      onDragEnd?.();
    }

    if (commit) {
      onDragCommit?.(commit);
    }
  }, [onDragCommit, onDragEnd, setActiveDragMeasurementTarget]);

  const isDragging = useCallback(() => session.current !== null, []);

  return {
    beginDrag,
    updateDrag,
    endDrag,
    isDragging,
  };
}

function createFurnitureMoveCommitFromSession(session: DragSession | null): FurnitureMoveCommit | null {
  if (!session) {
    return null;
  }

  return createFurnitureMoveCommit(session.id, session.startPosition, session.lastPosition);
}

export function createFurnitureMoveCommit(
  id: FurnitureId,
  startPosition: FurnitureMovePosition,
  lastPosition: FurnitureMovePosition,
): FurnitureMoveCommit | null {
  if (!hasPositionChanged(startPosition, lastPosition)) {
    return null;
  }

  return {
    id,
    position: { ...lastPosition },
  };
}

function hasPositionChanged(
  startPosition: FurnitureMovePosition,
  lastPosition: FurnitureMovePosition,
): boolean {
  return (
    Math.abs(startPosition.x - lastPosition.x) > movementThreshold ||
    Math.abs(startPosition.z - lastPosition.z) > movementThreshold
  );
}
