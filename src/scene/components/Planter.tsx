export function Planter() {
  return (
    <group name="Planter geometry">
      <mesh position={[0, 0.21, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.28, 0.36, 0.42, 28]} />
        <meshStandardMaterial color="#ba6b47" roughness={0.76} />
      </mesh>
      <mesh position={[0, 0.44, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.25, 0.25, 0.035, 28]} />
        <meshStandardMaterial color="#49382f" roughness={0.95} />
      </mesh>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => {
        const angle = (index / 9) * Math.PI * 2;
        const radius = 0.16 + (index % 3) * 0.045;

        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * radius, 0.75 + (index % 2) * 0.15, Math.sin(angle) * radius]}
            rotation={[0.45, angle, -0.38 + (index % 3) * 0.25]}
            scale={[0.58, 1.45, 0.24]}
            castShadow
            receiveShadow
          >
            <sphereGeometry args={[0.15, 16, 10]} />
            <meshStandardMaterial color="#2f8f58" roughness={0.72} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.68, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.04, 0.06, 0.52, 10]} />
        <meshStandardMaterial color="#6a4a31" roughness={0.8} />
      </mesh>
    </group>
  );
}
