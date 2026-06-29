import { useCallback, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import WebGPU from 'three/addons/capabilities/WebGPU.js';

import { RoomScene } from './RoomScene';
import { THREE } from './r3f-webgpu';
import { DEFAULT_CAMERA_FOV, DEFAULT_CAMERA_POSITION, DEFAULT_CAMERA_TARGET } from './roomView';

type WebGpuRendererProps = {
  canvas: unknown;
  powerPreference?: WebGLPowerPreference;
};

function WebGpuUnavailableMessage() {
  return (
    <div id="webgpu-message" className="webgpu-message" role="status">
      WebGPU is not available in this browser. Open this demo in a current Chrome or Edge browser
      on localhost.
    </div>
  );
}

export function RoomCanvas() {
  const [rendererInitFailed, setRendererInitFailed] = useState(false);

  const createRenderer = useCallback(async (props: WebGpuRendererProps) => {
    const powerPreference =
      props.powerPreference === 'high-performance' || props.powerPreference === 'low-power'
        ? props.powerPreference
        : undefined;

    // R3F may pass its local OffscreenCanvas placeholder type; Three expects the DOM canvas type.
    const rendererParameters: THREE.WebGPURendererParameters = {
      canvas: props.canvas as unknown as HTMLCanvasElement | OffscreenCanvas,
      antialias: true,
      alpha: false,
      ...(powerPreference ? { powerPreference } : {}),
    };

    const renderer = new THREE.WebGPURenderer(rendererParameters);

    renderer.outputColorSpace = THREE.SRGBColorSpace;

    try {
      await renderer.init();
    } catch {
      renderer.dispose();
      setRendererInitFailed(true);
      await new Promise<never>(() => {});
    }

    return renderer;
  }, []);

  if (!WebGPU.isAvailable() || rendererInitFailed) {
    return <WebGpuUnavailableMessage />;
  }

  return (
    <div id="viewport">
      <Canvas
        camera={{ fov: DEFAULT_CAMERA_FOV, near: 0.1, far: 100, position: DEFAULT_CAMERA_POSITION }}
        dpr={[1, 1.8]}
        gl={createRenderer}
        onCreated={({ camera }) => camera.lookAt(...DEFAULT_CAMERA_TARGET)}
      >
        <RoomScene />
      </Canvas>
    </div>
  );
}
