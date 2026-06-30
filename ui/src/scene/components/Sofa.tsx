import { Suspense } from 'react';

import {
  MODEL_ARTIFACT_USE_DRACO,
  MODEL_ARTIFACT_USE_MESHOPT,
  ModelArtifact,
} from './ModelArtifact';

type Vector3Tuple = [number, number, number];

interface SofaProps {
  modelUrl?: string;
}

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

export const SOFA_ARTIFACT_ID = 'seed-sofa-01';
export const SOFA_USE_DRACO = MODEL_ARTIFACT_USE_DRACO;
export const SOFA_USE_MESHOPT = MODEL_ARTIFACT_USE_MESHOPT;
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

export function Sofa({ modelUrl }: SofaProps) {
  return (
    <group name="Sofa geometry">
      <mesh name="Sofa interaction bounds" position={SOFA_INTERACTION_BOUNDS.position}>
        <boxGeometry args={SOFA_INTERACTION_BOUNDS.size} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
      </mesh>
      {modelUrl ? (
        <Suspense fallback={null}>
          <ModelArtifact
            url={modelUrl}
            name="Sofa model"
            position={SOFA_MODEL_TRANSFORM.position}
            rotation={SOFA_MODEL_TRANSFORM.rotation}
            scale={SOFA_MODEL_TRANSFORM.scale}
            useDraco={SOFA_USE_DRACO}
            useMeshopt={SOFA_USE_MESHOPT}
          />
        </Suspense>
      ) : null}
    </group>
  );
}

function roundMeters(value: number) {
  return Number(value.toFixed(2));
}
