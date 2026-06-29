import type { Size3Data } from '../../domain/types';

interface SelectionBoundsProps {
  baseSize: Size3Data;
}

export function SelectionBounds({ baseSize }: SelectionBoundsProps) {
  return (
    <mesh name="Selection bounds" position={[0, baseSize.height / 2, 0]} renderOrder={10}>
      <boxGeometry args={[baseSize.width, baseSize.height, baseSize.depth]} />
      <meshBasicMaterial color="#2563eb" wireframe transparent opacity={0.95} depthTest={false} toneMapped={false} />
    </mesh>
  );
}
