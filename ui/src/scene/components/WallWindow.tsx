export function WallWindow() {
  return (
    <>
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
    </>
  );
}
