import type { ReactNode } from 'react';

import { roomDefinition } from '../../data/furnitureCatalog';
import type { WallObjectLayoutItem as WallObjectLayoutItemData } from '../../domain/types';
import { getWallObjectWorldTransform } from '../../domain/wallObjectPlacement';
import type { WallObjectDragApi } from '../interactions/useWallObjectDrag';
import type { ThreeEvent } from '@react-three/fiber';

interface WallObjectItemProps {
  item: WallObjectLayoutItemData;
  drag: WallObjectDragApi;
  children: ReactNode;
}

type WallObjectPointerEvent = ThreeEvent<PointerEvent>;

interface PointerCaptureTarget {
  hasPointerCapture: (pointerId: number) => boolean;
  setPointerCapture: (pointerId: number) => void;
  releasePointerCapture: (pointerId: number) => void;
}

function getPointerCaptureTarget(event: WallObjectPointerEvent): PointerCaptureTarget {
  return event.target as unknown as PointerCaptureTarget;
}

export function WallObjectItem({ item, drag, children }: WallObjectItemProps) {
  const transform = getWallObjectWorldTransform(item, roomDefinition);

  function handlePointerDown(event: WallObjectPointerEvent) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    drag.beginDrag(item, event.ray);

    if (drag.isDragging()) {
      getPointerCaptureTarget(event).setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: WallObjectPointerEvent) {
    event.stopPropagation();
    drag.updateDrag(event.ray);
  }

  function releasePointerCapture(event: WallObjectPointerEvent) {
    const captureTarget = getPointerCaptureTarget(event);

    if (captureTarget.hasPointerCapture(event.pointerId)) {
      captureTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointerEnd(event: WallObjectPointerEvent) {
    event.stopPropagation();
    releasePointerCapture(event);
    drag.endDrag();
  }

  function handleLostPointerCapture(event: WallObjectPointerEvent) {
    event.stopPropagation();
    drag.endDrag();
  }

  return (
    <group
      name={item.name}
      position={transform.position}
      rotation={transform.rotation}
      userData={{ layoutId: item.id, label: item.name, movable: item.movable, wallId: item.wallId }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handleLostPointerCapture}
    >
      {children}
    </group>
  );
}
