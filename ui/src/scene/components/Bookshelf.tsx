const framePanels = [
  [-0.42, 0.78, 0, 0.08, 1.56, 0.34],
  [0.42, 0.78, 0, 0.08, 1.56, 0.34],
  [0, 1.52, 0, 0.92, 0.08, 0.34],
  [0, 0.04, 0, 0.92, 0.08, 0.34],
] as const;

const bookColors = ['#276ef1', '#f4b740', '#22a06b', '#b44a61'] as const;

export function Bookshelf() {
  return (
    <group name="Bookshelf geometry">
      {framePanels.map(([x, y, z, width, height, depth]) => (
        <mesh key={`${x}-${y}`} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color="#74583e" roughness={0.72} />
        </mesh>
      ))}
      {[0.48, 0.92].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.84, 0.06, 0.3]} />
          <meshStandardMaterial color="#74583e" roughness={0.72} />
        </mesh>
      ))}
      {[0, 1, 2].flatMap((row) =>
        [0, 1, 2, 3, 4].map((index) => (
          <mesh
            key={`${row}-${index}`}
            position={[-0.27 + index * 0.13, 0.22 + row * 0.45, -0.03]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.08 + (index % 2) * 0.035, 0.24 + (index % 3) * 0.035, 0.18]} />
            <meshStandardMaterial color={bookColors[(row + index) % bookColors.length]} roughness={0.8} />
          </mesh>
        )),
      )}
    </group>
  );
}
