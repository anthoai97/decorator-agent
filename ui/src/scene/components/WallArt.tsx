export function WallArt() {
  return (
    <>
      <mesh>
        <boxGeometry args={[1.0, 0.72, 0.045]} />
        <meshStandardMaterial color="#ee8b6d" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[0.68, 0.44, 0.05]} />
        <meshStandardMaterial color="#25364a" roughness={0.8} />
      </mesh>
    </>
  );
}
