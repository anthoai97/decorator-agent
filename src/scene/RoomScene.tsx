import { OrbitControls } from '@react-three/drei';

import { useRoomStore } from '../state/useRoomStore';
import { Bookshelf } from './components/Bookshelf';
import { CoffeeTable } from './components/CoffeeTable';
import { FurnitureItem } from './components/FurnitureItem';
import { LoungeChair } from './components/LoungeChair';
import { Planter } from './components/Planter';
import { RoomShell } from './components/RoomShell';
import { Sofa } from './components/Sofa';

export function RoomScene() {
  const furniture = useRoomStore((state) => state.furniture);
  const selectFurniture = useRoomStore((state) => state.selectFurniture);

  return (
    <>
      <color attach="background" args={['#cfd8e3']} />
      <hemisphereLight args={['#f6fbff', '#b2a28d', 2.2]} />
      <directionalLight position={[2.4, 5.2, 2.8]} intensity={2.4} />
      <directionalLight position={[-4, 3, -3]} color="#bfd7ff" intensity={0.8} />
      <group onPointerMissed={() => selectFurniture(null)}>
        <RoomShell />
        <FurnitureItem item={furniture.sofa}>
          <Sofa />
        </FurnitureItem>
        <FurnitureItem item={furniture['coffee-table']}>
          <CoffeeTable />
        </FurnitureItem>
        <FurnitureItem item={furniture['lounge-chair']}>
          <LoungeChair />
        </FurnitureItem>
        <FurnitureItem item={furniture.bookshelf}>
          <Bookshelf />
        </FurnitureItem>
        <FurnitureItem item={furniture.planter}>
          <Planter />
        </FurnitureItem>
      </group>
      <OrbitControls
        enableDamping
        minDistance={4.4}
        maxDistance={11}
        maxPolarAngle={Math.PI * 0.48}
        target={[0, 1.05, 0]}
      />
    </>
  );
}
