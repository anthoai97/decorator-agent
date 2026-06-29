export function Sofa() {
  return (
    <group name="Sofa geometry">
      <mesh position={[0, 0.38, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.05, 0.34, 0.78]} />
        <meshStandardMaterial color="#3d6f84" roughness={0.86} />
      </mesh>
      <mesh position={[0, 0.78, -0.39]} castShadow receiveShadow>
        <boxGeometry args={[2.15, 0.86, 0.22]} />
        <meshStandardMaterial color="#2c5364" roughness={0.9} />
      </mesh>
      {[
        [-1.13, 0.62, 0.02],
        [1.13, 0.62, 0.02],
      ].map(([x, y, z]) => (
        <mesh key={x} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[0.23, 0.62, 0.82]} />
          <meshStandardMaterial color="#2c5364" roughness={0.9} />
        </mesh>
      ))}
      {[-0.52, 0.52].map((x) => (
        <mesh key={x} position={[x, 0.61, 0.08]} castShadow receiveShadow>
          <boxGeometry args={[0.88, 0.12, 0.68]} />
          <meshStandardMaterial color="#3d6f84" roughness={0.86} />
        </mesh>
      ))}
      {[
        [-0.82, 0.13, 0.32],
        [0.82, 0.13, 0.32],
        [-0.82, 0.13, -0.32],
        [0.82, 0.13, -0.32],
      ].map(([x, y, z]) => (
        <mesh key={`${x}-${z}`} position={[x, y, z]} castShadow receiveShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.26, 10]} />
          <meshStandardMaterial color="#46372f" roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}
