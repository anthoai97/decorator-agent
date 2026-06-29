import { useCallback, useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';

import { roomDefinition } from '../data/furnitureCatalog';
import { useRoomStore } from '../state/useRoomStore';
import { Bookshelf } from './components/Bookshelf';
import { CoffeeTable } from './components/CoffeeTable';
import { FurnitureItem } from './components/FurnitureItem';
import { LoungeChair } from './components/LoungeChair';
import { Planter } from './components/Planter';
import { RoomShell } from './components/RoomShell';
import { Sofa } from './components/Sofa';
import { useFurnitureDrag } from './interactions/useFurnitureDrag';

export function RoomScene() {
  const { camera } = useThree();
  const furniture = useRoomStore((state) => state.furniture);
  const selectFurniture = useRoomStore((state) => state.selectFurniture);
  const cameraMode = useRoomStore((state) => state.cameraMode);
  const setCameraMode = useRoomStore((state) => state.setCameraMode);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const setControlsEnabled = useCallback((enabled: boolean) => {
    if (controlsRef.current) {
      controlsRef.current.enabled = enabled;
    }
  }, []);

  const drag = useFurnitureDrag({
    onDragStart: () => setControlsEnabled(false),
    onDragEnd: () => setControlsEnabled(true),
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
        <FurnitureItem item={furniture.sofa} drag={drag}>
          <Sofa />
        </FurnitureItem>
        <FurnitureItem item={furniture['coffee-table']} drag={drag}>
          <CoffeeTable />
        </FurnitureItem>
        <FurnitureItem item={furniture['lounge-chair']} drag={drag}>
          <LoungeChair />
        </FurnitureItem>
        <FurnitureItem item={furniture.bookshelf} drag={drag}>
          <Bookshelf />
        </FurnitureItem>
        <FurnitureItem item={furniture.planter} drag={drag}>
          <Planter />
        </FurnitureItem>
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
