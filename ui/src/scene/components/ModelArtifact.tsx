import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Intersection, Object3D, Raycaster } from 'three';

type Vector3Tuple = [number, number, number];

interface ModelArtifactLoadOptions {
  useDraco?: boolean;
  useMeshopt?: boolean;
}

interface ModelArtifactProps extends ModelArtifactLoadOptions {
  url: string;
  name?: string;
  position?: Vector3Tuple;
  rotation?: Vector3Tuple;
  scale?: Vector3Tuple;
}

export const MODEL_ARTIFACT_USE_DRACO = false;
export const MODEL_ARTIFACT_USE_MESHOPT = true;

export function ModelArtifact({
  url,
  name,
  position,
  rotation,
  scale,
  useDraco = MODEL_ARTIFACT_USE_DRACO,
  useMeshopt = MODEL_ARTIFACT_USE_MESHOPT,
}: ModelArtifactProps) {
  const gltf = useGLTF(url, useDraco, useMeshopt);
  const scene = useMemo(() => cloneModelArtifactScene(gltf.scene), [gltf.scene]);

  return (
    <primitive
      name={name}
      object={scene}
      position={position}
      rotation={rotation}
      scale={scale}
      dispose={null}
    />
  );
}

export function preloadModelArtifact(
  url: string,
  {
    useDraco = MODEL_ARTIFACT_USE_DRACO,
    useMeshopt = MODEL_ARTIFACT_USE_MESHOPT,
  }: ModelArtifactLoadOptions = {},
) {
  useGLTF.preload(url, useDraco, useMeshopt);
}

export function cloneModelArtifactScene(scene: Object3D) {
  const clone = scene.clone(true);

  clone.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
    child.raycast = disabledRaycast;
  });

  return clone;
}

function disabledRaycast(_raycaster: Raycaster, _intersections: Intersection[]) {}
