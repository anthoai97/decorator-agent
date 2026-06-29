import { roomDefinition } from '../../data/furnitureCatalog';

export function RoomShell() {
  const halfWidth = roomDefinition.width / 2;
  const halfDepth = roomDefinition.depth / 2;
  const wallHeight = roomDefinition.height;

  return (
    <group name="Room">
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <boxGeometry args={[roomDefinition.width, 0.08, roomDefinition.depth]} />
        <meshStandardMaterial color="#d7b98f" roughness={0.72} metalness={0.02} />
      </mesh>
      <mesh position={[0, wallHeight / 2, -halfDepth]}>
        <boxGeometry args={[roomDefinition.width, wallHeight, 0.12]} />
        <meshStandardMaterial color="#d8e7ea" roughness={0.84} />
      </mesh>
      <mesh position={[-halfWidth, wallHeight / 2, 0]}>
        <boxGeometry args={[0.12, wallHeight, roomDefinition.depth]} />
        <meshStandardMaterial color="#f4f0e8" roughness={0.85} />
      </mesh>
      <mesh position={[halfWidth, wallHeight / 2, 0]}>
        <boxGeometry args={[0.12, wallHeight, roomDefinition.depth]} />
        <meshStandardMaterial color="#f4f0e8" roughness={0.85} />
      </mesh>
      {[
        [0, 0.14, -halfDepth + 0.08, roomDefinition.width, 0.12, 0.08],
        [-halfWidth + 0.08, 0.14, 0, 0.08, 0.12, roomDefinition.depth],
        [halfWidth - 0.08, 0.14, 0, 0.08, 0.12, roomDefinition.depth],
      ].map(([x, y, z, width, height, depth], index) => (
        <mesh key={index} position={[x, y, z]}>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color="#ffffff" roughness={0.68} />
        </mesh>
      ))}
      <group position={[-2.1, 1.7, -halfDepth + 0.071]}>
        <mesh>
          <boxGeometry args={[1.35, 0.85, 0.025]} />
          <meshStandardMaterial color="#aed8f2" roughness={0.2} transparent opacity={0.62} />
        </mesh>
        {[
          [0, 0.47, 1.46, 0.08],
          [0, -0.47, 1.46, 0.08],
          [-0.72, 0, 0.08, 0.95],
          [0.72, 0, 0.08, 0.95],
          [0, 0, 0.08, 0.95],
        ].map(([x, y, width, height], index) => (
          <mesh key={index} position={[x, y, 0.02]}>
            <boxGeometry args={[width, height, 0.05]} />
            <meshStandardMaterial color="#ffffff" roughness={0.68} />
          </mesh>
        ))}
      </group>
      <mesh position={[1.85, 1.55, -halfDepth + 0.09]}>
        <boxGeometry args={[1.0, 0.72, 0.045]} />
        <meshStandardMaterial color="#ee8b6d" roughness={0.78} />
      </mesh>
      <mesh position={[1.85, 1.55, -halfDepth + 0.12]}>
        <boxGeometry args={[0.68, 0.44, 0.05]} />
        <meshStandardMaterial color="#25364a" roughness={0.8} />
      </mesh>
    </group>
  );
}
