import { roomDefinition } from '../../data/furnitureCatalog';
import { createRoomWallPanels, type OpenWallIds } from '../roomView';

type RoomShellProps = {
  openWallIds: OpenWallIds;
};

export function RoomShell({ openWallIds }: RoomShellProps) {
  const wallPanels = createRoomWallPanels(roomDefinition);
  const openWallIdSet = new Set(openWallIds);

  return (
    <group name="Room">
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <boxGeometry args={[roomDefinition.width, 0.08, roomDefinition.depth]} />
        <meshStandardMaterial color="#d7b98f" roughness={0.72} metalness={0.02} />
      </mesh>
      {wallPanels.filter((wall) => !openWallIdSet.has(wall.id)).map((wall) => (
        <mesh key={wall.id} name={`${wall.id} wall`} position={wall.position}>
          <boxGeometry args={wall.size} />
          <meshStandardMaterial color={wall.color} roughness={wall.roughness} />
        </mesh>
      ))}
    </group>
  );
}
