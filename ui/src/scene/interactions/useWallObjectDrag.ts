import { useCallback, useRef } from 'react';
import type { Ray } from 'three';
import { Plane, Vector3 } from 'three';

import { roomDefinition } from '../../data/furnitureCatalog';
import type {
  RoomWallId,
  WallObjectId,
  WallObjectLayoutItem,
  WallObjectPosition,
} from '../../domain/types';
import { createWallObjectBounds } from '../../domain/wallObjectPlacement';
import { useRoomStore } from '../../state/useRoomStore';

export interface WallObjectMoveCommit {
  id: WallObjectId;
  wallId: RoomWallId;
  position: WallObjectPosition;
}

export interface WallDragHit {
  wallId: RoomWallId;
  position: WallObjectPosition;
  distance: number;
}

interface DragSession {
  id: WallObjectId;
  wallId: RoomWallId;
  normalOffset: number;
  offset: WallObjectPosition;
  targetWallIds: RoomWallId[];
  startWallId: RoomWallId;
  startPosition: WallObjectPosition;
  lastWallId: RoomWallId;
  lastPosition: WallObjectPosition;
}

interface UseWallObjectDragOptions {
  targetWallIds?: RoomWallId[];
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragCommit?: (commit: WallObjectMoveCommit) => void;
}

export interface WallObjectDragApi {
  beginDrag: (item: WallObjectLayoutItem, ray: Ray) => void;
  updateDrag: (ray: Ray) => void;
  endDrag: () => void;
  isDragging: () => boolean;
}

const movementThreshold = 0.0001;
const allWallIds: RoomWallId[] = ['front', 'back', 'left', 'right'];
const wallHitEpsilon = 0.001;

export function useWallObjectDrag({
  targetWallIds,
  onDragStart,
  onDragEnd,
  onDragCommit,
}: UseWallObjectDragOptions = {}): WallObjectDragApi {
  const session = useRef<DragSession | null>(null);
  const moveWallObject = useRoomStore((state) => state.moveWallObject);
  const setActiveDragMeasurementTarget = useRoomStore((state) => state.setActiveDragMeasurementTarget);

  const beginDrag = useCallback(
    (item: WallObjectLayoutItem, ray: Ray) => {
      const hit = createWallDragHit(ray, item.wallId, item.normalOffset);

      if (hit) {
        const wasDragging = session.current !== null;
        session.current = {
          id: item.id,
          wallId: item.wallId,
          normalOffset: item.normalOffset,
          targetWallIds: normalizeTargetWallIds(targetWallIds, item.wallId),
          offset: {
            u: item.position.u - hit.position.u,
            y: item.position.y - hit.position.y,
          },
          startWallId: item.wallId,
          startPosition: { ...item.position },
          lastWallId: item.wallId,
          lastPosition: { ...item.position },
        };
        setActiveDragMeasurementTarget({ type: 'wallObject', id: item.id });

        if (!wasDragging) {
          onDragStart?.();
        }
      }
    },
    [onDragStart, setActiveDragMeasurementTarget, targetWallIds],
  );

  const updateDrag = useCallback(
    (ray: Ray) => {
      if (!session.current) {
        return;
      }

      const hit = findNearestWallDragHit(
        ray,
        session.current.normalOffset,
        session.current.targetWallIds,
      );

      if (!hit) {
        return;
      }

      const nextPosition = {
        u: hit.position.u + session.current.offset.u,
        y: hit.position.y + session.current.offset.y,
      };
      const result = moveWallObject(session.current.id, {
        wallId: hit.wallId,
        position: nextPosition,
      });
      const movedItem = result.wallObjects[session.current.id];

      if (result.applied && movedItem) {
        session.current.wallId = movedItem.wallId;
        session.current.lastWallId = movedItem.wallId;
        session.current.lastPosition = { ...movedItem.position };
      }
    },
    [moveWallObject],
  );

  const endDrag = useCallback(() => {
    const commit = createWallObjectMoveCommitFromSession(session.current);
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

function createWallObjectMoveCommitFromSession(session: DragSession | null): WallObjectMoveCommit | null {
  if (!session) {
    return null;
  }

  return createWallObjectMoveCommit(
    session.id,
    session.startWallId,
    session.startPosition,
    session.lastWallId,
    session.lastPosition,
  );
}

export function createWallObjectMoveCommit(
  id: WallObjectId,
  startWallId: RoomWallId,
  startPosition: WallObjectPosition,
  lastWallId: RoomWallId,
  lastPosition: WallObjectPosition,
): WallObjectMoveCommit | null {
  if (!hasMoveChanged(startWallId, startPosition, lastWallId, lastPosition)) {
    return null;
  }

  return {
    id,
    wallId: lastWallId,
    position: { ...lastPosition },
  };
}

function hasMoveChanged(
  startWallId: RoomWallId,
  startPosition: WallObjectPosition,
  lastWallId: RoomWallId,
  lastPosition: WallObjectPosition,
): boolean {
  return (
    startWallId !== lastWallId ||
    Math.abs(startPosition.u - lastPosition.u) > movementThreshold ||
    Math.abs(startPosition.y - lastPosition.y) > movementThreshold
  );
}

function normalizeTargetWallIds(
  targetWallIds: RoomWallId[] | undefined,
  currentWallId: RoomWallId,
): RoomWallId[] {
  const preferredWallIds = targetWallIds && targetWallIds.length > 0 ? targetWallIds : allWallIds;
  return preferredWallIds.includes(currentWallId)
    ? preferredWallIds
    : [currentWallId, ...preferredWallIds];
}

export function findNearestWallDragHit(
  ray: Ray,
  normalOffset: number,
  targetWallIds: RoomWallId[] = allWallIds,
): WallDragHit | null {
  let nearestHit: WallDragHit | null = null;

  for (const wallId of targetWallIds) {
    const hit = createWallDragHit(ray, wallId, normalOffset);

    if (!hit || !isWallLocalPointInsideWall(hit.wallId, hit.position)) {
      continue;
    }

    if (!nearestHit || hit.distance < nearestHit.distance) {
      nearestHit = hit;
    }
  }

  return nearestHit;
}

function createWallDragHit(ray: Ray, wallId: RoomWallId, normalOffset: number): WallDragHit | null {
  const hitPoint = ray.intersectPlane(createWallPlane(wallId, normalOffset), new Vector3());

  if (!hitPoint) {
    return null;
  }

  return {
    wallId,
    position: createWallLocalPosition(wallId, hitPoint),
    distance: ray.origin.distanceTo(hitPoint),
  };
}

function isWallLocalPointInsideWall(wallId: RoomWallId, position: WallObjectPosition): boolean {
  const bounds = createWallObjectBounds(roomDefinition, wallId);

  return (
    position.u >= bounds.minU - wallHitEpsilon &&
    position.u <= bounds.maxU + wallHitEpsilon &&
    position.y >= bounds.minY - wallHitEpsilon &&
    position.y <= bounds.maxY + wallHitEpsilon
  );
}

function createWallPlane(wallId: RoomWallId, normalOffset: number): Plane {
  const halfWidth = roomDefinition.width / 2;
  const halfDepth = roomDefinition.depth / 2;

  if (wallId === 'front') {
    return new Plane(new Vector3(0, 0, 1), -(halfDepth - normalOffset));
  }

  if (wallId === 'back') {
    return new Plane(new Vector3(0, 0, 1), halfDepth - normalOffset);
  }

  if (wallId === 'left') {
    return new Plane(new Vector3(1, 0, 0), halfWidth - normalOffset);
  }

  return new Plane(new Vector3(1, 0, 0), -(halfWidth - normalOffset));
}

function createWallLocalPosition(wallId: RoomWallId, point: Vector3): WallObjectPosition {
  return {
    u: wallId === 'front' || wallId === 'back' ? point.x : point.z,
    y: point.y,
  };
}
