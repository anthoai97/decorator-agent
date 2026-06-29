export function LoungeChair() {
  return (
    <group name="Lounge chair geometry">
      <mesh position={[0, 0.42, 0.08]} castShadow receiveShadow>
        <boxGeometry args={[0.88, 0.24, 0.78]} />
        <meshStandardMaterial color="#c15d4c" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.82, -0.34]} rotation={[-0.22, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.78, 0.18]} />
        <meshStandardMaterial color="#c15d4c" roughness={0.82} />
      </mesh>
      {[
        [-0.34, 0.2, -0.23, 0.12],
        [0.34, 0.2, -0.23, 0.12],
        [-0.34, 0.2, 0.35, -0.12],
        [0.34, 0.2, 0.35, -0.12],
      ].map(([x, y, z, rotationX]) => (
        <mesh key={`${x}-${z}`} position={[x, y, z]} rotation={[rotationX, 0, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.42, 10]} />
          <meshStandardMaterial color="#3a3130" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}
