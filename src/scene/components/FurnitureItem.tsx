import type { ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { Vector3 } from 'three';

import { radiansFromDegrees } from '../../domain/math';
import type { FurnitureLayoutItem } from '../../domain/types';
import { useRoomStore } from '../../state/useRoomStore';
import type { FurnitureDragApi } from '../interactions/useFurnitureDrag';
import { SelectionBounds } from './SelectionBounds';

interface FurnitureItemProps {
  item: FurnitureLayoutItem;
  drag: FurnitureDragApi;
  children: ReactNode;
}

type FurniturePointerEvent = ThreeEvent<PointerEvent>;

interface PointerCaptureTarget {
  hasPointerCapture: (pointerId: number) => boolean;
  setPointerCapture: (pointerId: number) => void;
  releasePointerCapture: (pointerId: number) => void;
}

function getPointerCaptureTarget(event: FurniturePointerEvent): PointerCaptureTarget {
  return event.target as unknown as PointerCaptureTarget;
}

export function FurnitureItem({ item, drag, children }: FurnitureItemProps) {
  const selectedId = useRoomStore((state) => state.selectedId);
  const hoveredId = useRoomStore((state) => state.hoveredId);
  const selectFurniture = useRoomStore((state) => state.selectFurniture);
  const hoverFurniture = useRoomStore((state) => state.hoverFurniture);
  const isEmphasized = selectedId === item.id || hoveredId === item.id;

  function handlePointerDown(event: FurniturePointerEvent) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    selectFurniture(item.id);
    drag.beginDrag(
      item.id,
      new Vector3(item.position.x, item.position.y, item.position.z),
      event.ray,
    );

    if (drag.isDragging()) {
      getPointerCaptureTarget(event).setPointerCapture(event.pointerId);
    }
  }

  function handlePointerMove(event: FurniturePointerEvent) {
    event.stopPropagation();
    drag.updateDrag(event.ray);
  }

  function releasePointerCapture(event: FurniturePointerEvent) {
    const captureTarget = getPointerCaptureTarget(event);

    if (captureTarget.hasPointerCapture(event.pointerId)) {
      captureTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handlePointerEnd(event: FurniturePointerEvent) {
    event.stopPropagation();
    releasePointerCapture(event);
    drag.endDrag();
  }

  function handleLostPointerCapture(event: FurniturePointerEvent) {
    event.stopPropagation();
    drag.endDrag();
  }

  function handlePointerOver(event: FurniturePointerEvent) {
    event.stopPropagation();
    hoverFurniture(item.id);
  }

  function handlePointerOut(event: FurniturePointerEvent) {
    event.stopPropagation();
    hoverFurniture(null);
  }

  return (
    <group
      name={item.name}
      position={[item.position.x, item.position.y, item.position.z]}
      rotation={[0, radiansFromDegrees(item.rotation.yDegrees), 0]}
      userData={{ layoutId: item.id, label: item.name, movable: item.movable }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handleLostPointerCapture}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {children}
      {isEmphasized ? <SelectionBounds baseSize={item.baseSize} /> : null}
    </group>
  );
}
