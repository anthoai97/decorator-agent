import { Html } from '@react-three/drei';

import { roomDefinition } from '../../data/furnitureCatalog';
import { createFootprint, rotationAwareSize } from '../../domain/collision';
import {
  createFurnitureDragMeasurements,
  createWallObjectDragMeasurements,
  formatMeasurementValue,
} from '../../domain/dragMeasurements';
import type { FurnitureLayoutItem, WallObjectLayoutItem } from '../../domain/types';
import {
  createWallObjectBounds,
  getWallObjectWorldTransform,
} from '../../domain/wallObjectPlacement';
import { useRoomStore } from '../../state/useRoomStore';

type Vector3Tuple = [number, number, number];

export const MEASUREMENT_GUIDE_GEOMETRY_SIZE = [1, 1, 1] as const;

interface MeasurementGuide {
  id: string;
  label: string;
  position: Vector3Tuple;
  size: Vector3Tuple;
}

export function DragMeasurements() {
  const activeTarget = useRoomStore((state) => state.activeDragMeasurementTarget);
  const furniture = useRoomStore((state) => state.furniture);
  const wallObjects = useRoomStore((state) => state.wallObjects);

  if (!activeTarget) {
    return null;
  }

  if (activeTarget.type === 'furniture') {
    const item = furniture[activeTarget.id];
    return item ? <MeasurementGuides guides={createFurnitureGuides(item)} /> : null;
  }

  const wallObject = wallObjects[activeTarget.id];
  return wallObject ? <MeasurementGuides guides={createWallObjectGuides(wallObject)} /> : null;
}

function MeasurementGuides({ guides }: { guides: MeasurementGuide[] }) {
  return (
    <group name="Drag measurements">
      {guides.map((guide) => (
        <group key={guide.id}>
          <mesh position={guide.position} scale={createMeasurementGuideMeshProps(guide).scale} renderOrder={20}>
            <boxGeometry args={MEASUREMENT_GUIDE_GEOMETRY_SIZE} />
            <meshBasicMaterial color="#17202f" transparent opacity={0.84} depthTest={false} toneMapped={false} />
          </mesh>
          <Html
            center
            className="drag-measurement"
            position={labelPositionForGuide(guide)}
            zIndexRange={[8, 0]}
          >
            <span className="drag-measurement__label">{guide.label}</span>
          </Html>
        </group>
      ))}
    </group>
  );
}

export function createMeasurementGuideMeshProps(guide: MeasurementGuide) {
  return {
    geometrySize: MEASUREMENT_GUIDE_GEOMETRY_SIZE,
    scale: guide.size,
  };
}

function createFurnitureGuides(item: FurnitureLayoutItem): MeasurementGuide[] {
  const size = rotationAwareSize(item.baseSize, item.rotation.yDegrees);
  const footprint = createFootprint(item.position, size);
  const measurements = createFurnitureDragMeasurements(item, roomDefinition);
  const y = 0.055;

  return [
    {
      id: 'left',
      label: formatMeasurementValue(measurements.left),
      position: [(roomDefinition.bounds.minX + footprint.minX) / 2, y, item.position.z],
      size: [Math.max(0.001, measurements.left), 0.018, 0.018],
    },
    {
      id: 'right',
      label: formatMeasurementValue(measurements.right),
      position: [(footprint.maxX + roomDefinition.bounds.maxX) / 2, y, item.position.z],
      size: [Math.max(0.001, measurements.right), 0.018, 0.018],
    },
    {
      id: 'back',
      label: formatMeasurementValue(measurements.back),
      position: [item.position.x, y, (roomDefinition.bounds.minZ + footprint.minZ) / 2],
      size: [0.018, 0.018, Math.max(0.001, measurements.back)],
    },
    {
      id: 'front',
      label: formatMeasurementValue(measurements.front),
      position: [item.position.x, y, (footprint.maxZ + roomDefinition.bounds.maxZ) / 2],
      size: [0.018, 0.018, Math.max(0.001, measurements.front)],
    },
  ];
}

function createWallObjectGuides(item: WallObjectLayoutItem): MeasurementGuide[] {
  const bounds = createWallObjectBounds(roomDefinition, item.wallId);
  const measurements = createWallObjectDragMeasurements(item, roomDefinition);
  const halfWidth = item.size.width / 2;
  const halfHeight = item.size.height / 2;
  const minU = item.position.u - halfWidth;
  const maxU = item.position.u + halfWidth;
  const minY = item.position.y - halfHeight;
  const maxY = item.position.y + halfHeight;

  return [
    createWallHorizontalGuide('left', item, bounds.minU, minU, item.position.y, measurements.left),
    createWallHorizontalGuide('right', item, maxU, bounds.maxU, item.position.y, measurements.right),
    createWallVerticalGuide('bottom', item, item.position.u, bounds.minY, minY, measurements.bottom),
    createWallVerticalGuide('top', item, item.position.u, maxY, bounds.maxY, measurements.top),
  ];
}

function createWallHorizontalGuide(
  id: string,
  item: WallObjectLayoutItem,
  startU: number,
  endU: number,
  y: number,
  value: number,
): MeasurementGuide {
  const midpointU = (startU + endU) / 2;
  const position = wallLocalGuidePosition(item, midpointU, y);
  const isFrontBack = item.wallId === 'front' || item.wallId === 'back';

  return {
    id,
    label: formatMeasurementValue(value),
    position,
    size: isFrontBack
      ? [Math.max(0.001, value), 0.018, 0.018]
      : [0.018, 0.018, Math.max(0.001, value)],
  };
}

function createWallVerticalGuide(
  id: string,
  item: WallObjectLayoutItem,
  u: number,
  startY: number,
  endY: number,
  value: number,
): MeasurementGuide {
  const midpointY = (startY + endY) / 2;

  return {
    id,
    label: formatMeasurementValue(value),
    position: wallLocalGuidePosition(item, u, midpointY),
    size: [0.018, Math.max(0.001, value), 0.018],
  };
}

function wallLocalGuidePosition(item: WallObjectLayoutItem, u: number, y: number): Vector3Tuple {
  const transform = getWallObjectWorldTransform(
    {
      ...item,
      position: { u, y },
    },
    roomDefinition,
  );

  return transform.position;
}

function labelPositionForGuide(guide: MeasurementGuide): Vector3Tuple {
  return [
    guide.position[0],
    guide.position[1] + 0.09,
    guide.position[2],
  ];
}
