import { useCallback, useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import { sendServerCommand } from '../api/serverEvents';
import { roomDefinition } from '../data/furnitureCatalog';
import { useRoomStore } from '../state/useRoomStore';
import { Bookshelf } from './components/Bookshelf';
import { CoffeeTable } from './components/CoffeeTable';
import { FurnitureItem } from './components/FurnitureItem';
import { LoungeChair } from './components/LoungeChair';
import { Planter } from './components/Planter';
import { RoomShell } from './components/RoomShell';
import { Rug } from './components/Rug';
import { Sofa } from './components/Sofa';
import { useFurnitureDrag, type FurnitureMoveCommit } from './interactions/useFurnitureDrag';

export function RoomScene() {
  const { camera } = useThree();
  const furniture = useRoomStore((state) => state.furniture);
  const selectFurniture = useRoomStore((state) => state.selectFurniture);
  const showLayoutStatus = useRoomStore((state) => state.showLayoutStatus);
  const cameraMode = useRoomStore((state) => state.cameraMode);
  const setCameraMode = useRoomStore((state) => state.setCameraMode);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

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

  const drag = useFurnitureDrag({
    onDragStart: () => setControlsEnabled(false),
    onDragEnd: () => setControlsEnabled(true),
    onDragCommit: commitFurnitureMove,
  });

  useEffect(() => {
    if (cameraMode !== 'top') {
      return;
    }

    camera.position.set(0, 8.8, 0.001);
    camera.lookAt(0, 0, 0);
    setCameraMode('orbit');
  }, [camera, cameraMode, setCameraMode]);

  function handleDragPlanePointerDown() {
    selectFurniture(null);
  }

  return (
    <>
      <color attach="background" args={['#cfd8e3']} />
      <hemisphereLight args={['#f6fbff', '#b2a28d', 2.2]} />
      <directionalLight position={[2.4, 5.2, 2.8]} intensity={2.4} />
      <directionalLight position={[-4, 3, -3]} color="#bfd7ff" intensity={0.8} />
      <RoomShell />
      <group onPointerMissed={() => selectFurniture(null)}>
        {furniture.sofa ? (
          <FurnitureItem item={furniture.sofa} drag={drag}>
            <Sofa />
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
        minDistance={4.4}
        maxDistance={11}
        maxPolarAngle={Math.PI * 0.48}
        target={[0, 1.05, 0]}
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
