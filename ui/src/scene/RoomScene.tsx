import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import { sendServerCommand } from '../api/serverEvents';
import { roomDefinition } from '../data/furnitureCatalog';
import { useRoomStore } from '../state/useRoomStore';
import { Bookshelf } from './components/Bookshelf';
import { CoffeeTable } from './components/CoffeeTable';
import { DragMeasurements } from './components/DragMeasurements';
import { FurnitureItem } from './components/FurnitureItem';
import { LoungeChair } from './components/LoungeChair';
import { Planter } from './components/Planter';
import { RoomShell } from './components/RoomShell';
import { Rug } from './components/Rug';
import { Sofa } from './components/Sofa';
import { WallObjectsLayer } from './components/WallObjectsLayer';
import { useFurnitureDrag, type FurnitureMoveCommit } from './interactions/useFurnitureDrag';
import { useWallObjectDrag, type WallObjectMoveCommit } from './interactions/useWallObjectDrag';
import {
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_DISTANCE,
  DEFAULT_CAMERA_POSITION,
  DEFAULT_CAMERA_TARGET,
  getOpenWallIdsForCamera,
  type OpenWallIds,
  TOP_VIEW_CAMERA_POSITION,
} from './roomView';
import type { RoomWallId } from '../domain/types';

const allWallIds: RoomWallId[] = ['front', 'back', 'left', 'right'];

export function RoomScene() {
  const { camera } = useThree();
  const [openWallIds, setOpenWallIds] = useState<OpenWallIds>(() =>
    getOpenWallIdsForCamera(
      { x: DEFAULT_CAMERA_POSITION[0], z: DEFAULT_CAMERA_POSITION[2] },
      { x: DEFAULT_CAMERA_TARGET[0], z: DEFAULT_CAMERA_TARGET[2] },
    ),
  );
  const openWallIdsRef = useRef(openWallIds);
  const furniture = useRoomStore((state) => state.furniture);
  const selectFurniture = useRoomStore((state) => state.selectFurniture);
  const showLayoutStatus = useRoomStore((state) => state.showLayoutStatus);
  const cameraMode = useRoomStore((state) => state.cameraMode);
  const setCameraMode = useRoomStore((state) => state.setCameraMode);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const targetWallIds = useMemo(
    () => allWallIds.filter((wallId) => !openWallIds.includes(wallId)),
    [openWallIds],
  );

  const setControlsEnabled = useCallback((enabled: boolean) => {
    if (controlsRef.current) {
      controlsRef.current.enabled = enabled;
    }
  }, []);

  const commitFurnitureMove = useCallback(
    (commit: FurnitureMoveCommit) => {
      void (async () => {
        try {
          await sendServerCommand({
            type: 'MOVE_FURNITURE',
            payload: {
              furnitureId: commit.id,
              position: commit.position,
            },
          });
          showLayoutStatus('Position saved to server');
        } catch (error) {
          showLayoutStatus(getMoveCommitErrorMessage(error));
          console.warn(error);
        }
      })();
    },
    [showLayoutStatus],
  );

  const commitWallObjectMove = useCallback(
    (commit: WallObjectMoveCommit) => {
      void (async () => {
        try {
          await sendServerCommand({
            type: 'MOVE_WALL_OBJECT',
            payload: {
              wallObjectId: commit.id,
              wallId: commit.wallId,
              position: commit.position,
            },
          });
          showLayoutStatus('Position saved to server');
        } catch (error) {
          showLayoutStatus(getMoveCommitErrorMessage(error));
          console.warn(error);
        }
      })();
    },
    [showLayoutStatus],
  );

  const drag = useFurnitureDrag({
    onDragStart: () => setControlsEnabled(false),
    onDragEnd: () => setControlsEnabled(true),
    onDragCommit: commitFurnitureMove,
  });
  const wallObjectDrag = useWallObjectDrag({
    targetWallIds,
    onDragStart: () => setControlsEnabled(false),
    onDragEnd: () => setControlsEnabled(true),
    onDragCommit: commitWallObjectMove,
  });

  useEffect(() => {
    if (cameraMode !== 'top') {
      return;
    }

    camera.position.set(...TOP_VIEW_CAMERA_POSITION);
    camera.lookAt(...DEFAULT_CAMERA_TARGET);

    if (controlsRef.current) {
      controlsRef.current.target.set(...DEFAULT_CAMERA_TARGET);
      controlsRef.current.update();
    }

    setCameraMode('orbit');
  }, [camera, cameraMode, setCameraMode]);

  useFrame(() => {
    const nextOpenWallIds = getOpenWallIdsForCamera(
      { x: camera.position.x, z: camera.position.z },
      { x: DEFAULT_CAMERA_TARGET[0], z: DEFAULT_CAMERA_TARGET[2] },
    );

    if (openWallIdsRef.current[0] !== nextOpenWallIds[0] || openWallIdsRef.current[1] !== nextOpenWallIds[1]) {
      openWallIdsRef.current = nextOpenWallIds;
      setOpenWallIds(nextOpenWallIds);
    }
  });

  function handleDragPlanePointerDown() {
    selectFurniture(null);
  }

  return (
    <>
      <color attach="background" args={['#9aa6b2']} />
      <hemisphereLight args={['#f6fbff', '#b2a28d', 2.2]} />
      <directionalLight position={[2.4, 5.2, 2.8]} intensity={2.4} />
      <directionalLight position={[-4, 3, -3]} color="#bfd7ff" intensity={0.8} />
      <RoomShell openWallIds={openWallIds} />
      <WallObjectsLayer openWallIds={openWallIds} drag={wallObjectDrag} />
      <DragMeasurements />
      <group onPointerMissed={() => selectFurniture(null)}>
        {furniture.sofa ? (
          <FurnitureItem item={furniture.sofa} drag={drag}>
            <Suspense fallback={null}>
              <Sofa />
            </Suspense>
          </FurnitureItem>
        ) : null}
        {furniture['coffee-table'] ? (
          <FurnitureItem item={furniture['coffee-table']} drag={drag}>
            <CoffeeTable />
          </FurnitureItem>
        ) : null}
        {furniture['lounge-chair'] ? (
          <FurnitureItem item={furniture['lounge-chair']} drag={drag}>
            <LoungeChair />
          </FurnitureItem>
        ) : null}
        {furniture.bookshelf ? (
          <FurnitureItem item={furniture.bookshelf} drag={drag}>
            <Bookshelf />
          </FurnitureItem>
        ) : null}
        {furniture.planter ? (
          <FurnitureItem item={furniture.planter} drag={drag}>
            <Planter />
          </FurnitureItem>
        ) : null}
        {furniture.rug ? (
          <FurnitureItem item={furniture.rug} drag={drag}>
            <Rug />
          </FurnitureItem>
        ) : null}
      </group>
      <mesh
        position={[0, 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handleDragPlanePointerDown}
      >
        <planeGeometry args={[roomDefinition.width, roomDefinition.depth]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <OrbitControls
        ref={controlsRef}
        enableDamping
        minDistance={CAMERA_MIN_DISTANCE}
        maxDistance={CAMERA_MAX_DISTANCE}
        maxPolarAngle={Math.PI * 0.48}
        target={DEFAULT_CAMERA_TARGET}
      />
    </>
  );
}

function getMoveCommitErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'Agent server URL is not configured') {
      return 'Server bridge disabled; kept local position';
    }

    if (error.message.startsWith('Command rejected')) {
      return error.message;
    }
  }

  return 'Server unavailable; kept local position';
}
