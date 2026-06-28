export function CoffeeTable() {
  return (
    <group name="Coffee table geometry">
      <mesh position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.35, 0.14, 0.82]} />
        <meshStandardMaterial color="#9a633d" roughness={0.58} />
      </mesh>
      <mesh position={[0, 0.27, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.12, 0.08, 0.62]} />
        <meshStandardMaterial color="#61432f" roughness={0.7} />
      </mesh>
      {[
        [-0.52, 0.25, -0.28],
        [0.52, 0.25, -0.28],
        [-0.52, 0.25, 0.28],
        [0.52, 0.25, 0.28],
      ].map(([x, y, z]) => (
        <mesh key={`${x}-${z}`} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[0.1, 0.5, 0.1]} />
          <meshStandardMaterial color="#61432f" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0.26, 0.61, 0.08]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.035, 28]} />
        <meshStandardMaterial color="#efe3cd" roughness={0.64} />
      </mesh>
    </group>
  );
}
