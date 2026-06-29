import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Intersection, Object3D, Raycaster } from 'three';

type Vector3Tuple = [number, number, number];

const SOFA_SOURCE_SIZE = {
  width: 0.363525390625,
  height: 0.2578582763671875,
  depth: 1,
};
const SOFA_SOURCE_MIN_Y = -0.1289215087890625;
const SOFA_TARGET_WIDTH = 2.49;
const SOFA_TARGET_HEIGHT = 0.8;
const SOFA_MODEL_XZ_SCALE = SOFA_TARGET_WIDTH / SOFA_SOURCE_SIZE.depth;
const SOFA_MODEL_Y_SCALE = SOFA_TARGET_HEIGHT / SOFA_SOURCE_SIZE.height;

export const SOFA_MODEL_URL = '/assets/models/sofa-01.glb';
export const SOFA_USE_DRACO = false;
export const SOFA_USE_MESHOPT = true;
export const SOFA_INTERACTION_BOUNDS = {
  size: [2.49, 1.21, 0.93] as Vector3Tuple,
  position: [0, 0.605, 0] as Vector3Tuple,
};
export const SOFA_MODEL_TRANSFORM: {
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
} = {
  position: [0, -SOFA_SOURCE_MIN_Y * SOFA_MODEL_Y_SCALE, 0],
  rotation: [0, Math.PI / 2, 0],
  scale: [SOFA_MODEL_XZ_SCALE, SOFA_MODEL_Y_SCALE, SOFA_MODEL_XZ_SCALE],
};

export function getScaledSofaModelSize() {
  return {
    width: roundMeters(SOFA_SOURCE_SIZE.depth * SOFA_MODEL_TRANSFORM.scale[2]),
    height: roundMeters(SOFA_SOURCE_SIZE.height * SOFA_MODEL_TRANSFORM.scale[1]),
    depth: roundMeters(SOFA_SOURCE_SIZE.width * SOFA_MODEL_TRANSFORM.scale[0]),
  };
}

export function Sofa() {
  const gltf = useGLTF(SOFA_MODEL_URL, SOFA_USE_DRACO, SOFA_USE_MESHOPT);
  const sofaScene = useMemo(() => cloneWithShadows(gltf.scene), [gltf.scene]);

  return (
    <group name="Sofa geometry">
      <mesh name="Sofa interaction bounds" position={SOFA_INTERACTION_BOUNDS.position}>
        <boxGeometry args={SOFA_INTERACTION_BOUNDS.size} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
      </mesh>
      <primitive
        object={sofaScene}
        position={SOFA_MODEL_TRANSFORM.position}
        rotation={SOFA_MODEL_TRANSFORM.rotation}
        scale={SOFA_MODEL_TRANSFORM.scale}
      />
    </group>
  );
}

function cloneWithShadows(scene: Object3D) {
  const clone = scene.clone(true);

  clone.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
    child.raycast = disabledRaycast;
  });

  return clone;
}

function disabledRaycast(_raycaster: Raycaster, _intersections: Intersection[]) {}

function roundMeters(value: number) {
  return Number(value.toFixed(2));
}

useGLTF.preload(SOFA_MODEL_URL, SOFA_USE_DRACO, SOFA_USE_MESHOPT);
