import { Canvas } from '@react-three/fiber';
import WebGPU from 'three/addons/capabilities/WebGPU.js';

import { RoomScene } from './RoomScene';
import { THREE } from './r3f-webgpu';

export function RoomCanvas() {
  if (!WebGPU.isAvailable()) {
    return (
      <div id="webgpu-message" className="webgpu-message" role="status">
        WebGPU is not available in this browser. Open this demo in a current Chrome or Edge browser
        on localhost.
      </div>
    );
  }

  return (
    <div id="viewport">
      <Canvas
        camera={{ fov: 48, near: 0.1, far: 100, position: [5.8, 4.2, 6.4] }}
        dpr={[1, 1.8]}
        gl={async (props) => {
          const renderer = new THREE.WebGPURenderer({
            ...props,
            antialias: true,
            alpha: false,
          });

          renderer.outputColorSpace = THREE.SRGBColorSpace;
          await renderer.init();

          return renderer;
        }}
      >
        <RoomScene />
      </Canvas>
    </div>
  );
}
