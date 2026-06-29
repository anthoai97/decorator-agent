export function Rug() {
  return (
    <mesh name="Area rug geometry" position={[0, 0.018, 0]} receiveShadow>
      <boxGeometry args={[2.7, 0.025, 1.75]} />
      <meshStandardMaterial color="#54748a" roughness={0.9} />
    </mesh>
  );
}
