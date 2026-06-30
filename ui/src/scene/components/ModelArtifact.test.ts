import { Object3D } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useGltfMock } = vi.hoisted(() => ({
  useGltfMock: Object.assign(vi.fn(), { preload: vi.fn() }),
}));

vi.mock('@react-three/drei', () => ({
  useGLTF: useGltfMock,
}));

vi.mock('react', async (importActual) => {
  const actual = await importActual<typeof import('react')>();

  return {
    ...actual,
    useMemo: (factory: () => unknown) => factory(),
  };
});

import {
  MODEL_ARTIFACT_USE_DRACO,
  MODEL_ARTIFACT_USE_MESHOPT,
  ModelArtifact,
  preloadModelArtifact,
} from './ModelArtifact';

describe('ModelArtifact', () => {
  beforeEach(() => {
    useGltfMock.mockReset();
    useGltfMock.preload.mockReset();
  });

  it('loads any model artifact URL with Meshopt enabled by default', () => {
    const scene = new Object3D();
    useGltfMock.mockReturnValue({ scene });

    const element = ModelArtifact({ url: 'http://127.0.0.1:8787/api/artifacts/seed-table-01/content' });

    expect(MODEL_ARTIFACT_USE_DRACO).toBe(false);
    expect(MODEL_ARTIFACT_USE_MESHOPT).toBe(true);
    expect(useGltfMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/api/artifacts/seed-table-01/content',
      false,
      true,
    );
    expect(element.type).toBe('primitive');
    expect(element.props.object).not.toBe(scene);
  });

  it('passes transforms to the rendered primitive', () => {
    useGltfMock.mockReturnValue({ scene: new Object3D() });

    const element = ModelArtifact({
      url: 'http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content',
      name: 'Artifact model',
      position: [1, 2, 3],
      rotation: [0, Math.PI, 0],
      scale: [2, 2, 2],
    });

    expect(element.props.name).toBe('Artifact model');
    expect(element.props.position).toEqual([1, 2, 3]);
    expect(element.props.rotation).toEqual([0, Math.PI, 0]);
    expect(element.props.scale).toEqual([2, 2, 2]);
  });

  it('allows loader options to be overridden', () => {
    useGltfMock.mockReturnValue({ scene: new Object3D() });

    ModelArtifact({
      url: 'http://127.0.0.1:8787/api/artifacts/generated-chair-01/content',
      useDraco: true,
      useMeshopt: false,
    });

    expect(useGltfMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/api/artifacts/generated-chair-01/content',
      true,
      false,
    );
  });

  it('clones model scenes as shadow-casting, non-pickable geometry', () => {
    const scene = new Object3D();
    const child = new Object3D();
    scene.add(child);
    useGltfMock.mockReturnValue({ scene });

    const element = ModelArtifact({ url: 'http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content' });
    const clone = element.props.object as Object3D;
    const clonedChild = clone.children[0];

    expect(clonedChild).not.toBe(child);
    expect(clonedChild.castShadow).toBe(true);
    expect(clonedChild.receiveShadow).toBe(true);
    expect(clonedChild.raycast).not.toBe(child.raycast);
  });

  it('preloads artifact URLs with the same default loader settings', () => {
    preloadModelArtifact('http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content');

    expect(useGltfMock.preload).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/api/artifacts/seed-sofa-01/content',
      false,
      true,
    );
  });
});
