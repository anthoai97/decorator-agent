import './styles.css';

import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import WebGPU from 'three/addons/capabilities/WebGPU.js';

const viewport = document.querySelector('#viewport');
const webgpuMessage = document.querySelector('#webgpu-message');
const selectedName = document.querySelector('#selected-name');
const selectedPosition = document.querySelector('#selected-position');
const layoutStatus = document.querySelector('#layout-status');
const rotateObjectButton = document.querySelector('#rotate-object');
const exportLayoutButton = document.querySelector('#export-layout');
const importLayoutButton = document.querySelector('#import-layout');
const layoutFileInput = document.querySelector('#layout-file');
const resetButton = document.querySelector('#reset-layout');
const topViewButton = document.querySelector('#top-view');

const room = {
  halfWidth: 4.8,
  halfDepth: 3.4,
  wallHeight: 2.75,
};
const layoutSchemaVersion = 1;
const collisionPadding = 0.04;

const draggableObjects = [];
const pickableMeshes = [];
const initialTransforms = new Map();

const pointer = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const floorHit = new THREE.Vector3();
const dragOffset = new THREE.Vector3();

const dragState = {
  active: false,
  object: null,
};

let hoveredObject = null;
let selectedObject = null;
let selectionBox = null;
let renderer;
let scene;
let camera;
let controls;
let animationFrame = 0;

if (!WebGPU.isAvailable()) {
  webgpuMessage.hidden = false;
  webgpuMessage.textContent =
    'WebGPU is not available in this browser. Open this demo in a current Chrome or Edge browser on localhost.';
} else {
  init();
}

async function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcfd8e3);

  camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(5.8, 4.2, 6.4);

  renderer = new THREE.WebGPURenderer({
    antialias: true,
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  await renderer.init();
  viewport.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 4.4;
  controls.maxDistance = 11;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(0, 1.05, 0);
  controls.update();

  buildScene();
  registerDebugHooks();
  bindEvents();
  setSelected(null);

  renderer.setAnimationLoop(render);
}

function buildScene() {
  const ambient = new THREE.HemisphereLight(0xf6fbff, 0xb2a28d, 2.2);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(2.4, 5.2, 2.8);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xbfd7ff, 0.8);
  fill.position.set(-4, 3, -3);
  scene.add(fill);

  const roomGroup = new THREE.Group();
  roomGroup.name = 'Room';
  scene.add(roomGroup);

  addRoom(roomGroup);
  addFurniture();
}

function addRoom(parent) {
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7b98f,
    roughness: 0.72,
    metalness: 0.02,
  });
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xf4f0e8,
    roughness: 0.85,
  });
  const accentWallMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8e7ea,
    roughness: 0.84,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.68,
  });

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(room.halfWidth * 2, 0.08, room.halfDepth * 2),
    floorMaterial,
  );
  floor.position.y = -0.04;
  floor.receiveShadow = true;
  parent.add(floor);

  const rug = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 0.025, 1.75),
    new THREE.MeshStandardMaterial({ color: 0x54748a, roughness: 0.9 }),
  );
  rug.position.set(0.45, 0.018, 0.3);
  rug.name = 'Area rug';
  parent.add(rug);

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(room.halfWidth * 2, room.wallHeight, 0.12),
    accentWallMaterial,
  );
  backWall.position.set(0, room.wallHeight / 2, -room.halfDepth);
  parent.add(backWall);

  const leftWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, room.wallHeight, room.halfDepth * 2),
    wallMaterial,
  );
  leftWall.position.set(-room.halfWidth, room.wallHeight / 2, 0);
  parent.add(leftWall);

  const rightWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, room.wallHeight, room.halfDepth * 2),
    wallMaterial,
  );
  rightWall.position.set(room.halfWidth, room.wallHeight / 2, 0);
  parent.add(rightWall);

  const baseboards = [
    [0, 0.14, -room.halfDepth + 0.08, room.halfWidth * 2, 0.12, 0.08],
    [-room.halfWidth + 0.08, 0.14, 0, 0.08, 0.12, room.halfDepth * 2],
    [room.halfWidth - 0.08, 0.14, 0, 0.08, 0.12, room.halfDepth * 2],
  ];

  baseboards.forEach(([x, y, z, width, height, depth]) => {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), trimMaterial);
    trim.position.set(x, y, z);
    parent.add(trim);
  });

  const windowFrame = new THREE.Group();
  windowFrame.position.set(-2.1, 1.7, -room.halfDepth + 0.071);
  parent.add(windowFrame);

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.85, 0.025),
    new THREE.MeshStandardMaterial({
      color: 0xaed8f2,
      roughness: 0.2,
      metalness: 0,
      transparent: true,
      opacity: 0.62,
    }),
  );
  windowFrame.add(glass);

  [
    [0, 0.47, 1.46, 0.08],
    [0, -0.47, 1.46, 0.08],
    [-0.72, 0, 0.08, 0.95],
    [0.72, 0, 0.08, 0.95],
    [0, 0, 0.08, 0.95],
  ].forEach(([x, y, width, height]) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.05), trimMaterial);
    frame.position.set(x, y, 0.02);
    windowFrame.add(frame);
  });

  const art = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.72, 0.045),
    new THREE.MeshStandardMaterial({ color: 0xee8b6d, roughness: 0.78 }),
  );
  art.position.set(1.85, 1.55, -room.halfDepth + 0.09);
  parent.add(art);

  const artInset = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.44, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x25364a, roughness: 0.8 }),
  );
  artInset.position.set(1.85, 1.55, -room.halfDepth + 0.12);
  parent.add(artInset);
}

function addFurniture() {
  addDraggable(createSofa(), 'Sofa', -1.5, 0, -1.55, 0);
  addDraggable(createCoffeeTable(), 'Coffee table', 0.55, 0, 0.25, 0);
  addDraggable(createLoungeChair(), 'Lounge chair', 2.1, 0, -0.65, -0.55);
  addDraggable(createBookshelf(), 'Bookshelf', 3.65, 0, -2.15, 0);
  addDraggable(createPlant(), 'Planter', -3.55, 0, -2.25, 0);
}

function addDraggable(object, name, x, y, z, rotationY) {
  object.name = name;
  object.userData.layoutId = createLayoutId(name);
  object.userData.label = name;
  object.position.set(x, y, z);
  object.rotation.y = rotationY;
  object.userData.draggable = true;
  object.userData.bounds = getLocalBounds(object);

  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.draggableRoot = object;
      pickableMeshes.push(child);
    }
  });

  draggableObjects.push(object);
  initialTransforms.set(object.uuid, {
    position: object.position.clone(),
    rotation: object.rotation.clone(),
  });
  scene.add(object);
}

function createSofa() {
  const group = new THREE.Group();
  const fabric = new THREE.MeshStandardMaterial({ color: 0x3d6f84, roughness: 0.86 });
  const shadowFabric = new THREE.MeshStandardMaterial({ color: 0x2c5364, roughness: 0.9 });
  const legMaterial = new THREE.MeshStandardMaterial({ color: 0x46372f, roughness: 0.72 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.34, 0.78), fabric);
  base.position.set(0, 0.38, 0);
  group.add(base);

  const back = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.86, 0.22), shadowFabric);
  back.position.set(0, 0.78, -0.39);
  group.add(back);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.62, 0.82), shadowFabric);
  leftArm.position.set(-1.13, 0.62, 0.02);
  group.add(leftArm);

  const rightArm = leftArm.clone();
  rightArm.position.x = 1.13;
  group.add(rightArm);

  [-0.52, 0.52].forEach((x) => {
    const cushion = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.12, 0.68), fabric);
    cushion.position.set(x, 0.61, 0.08);
    group.add(cushion);
  });

  [
    [-0.82, 0.13, 0.32],
    [0.82, 0.13, 0.32],
    [-0.82, 0.13, -0.32],
    [0.82, 0.13, -0.32],
  ].forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.26, 10), legMaterial);
    leg.position.set(x, y, z);
    group.add(leg);
  });

  return group;
}

function createCoffeeTable() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a633d, roughness: 0.58 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x61432f, roughness: 0.7 });

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.14, 0.82), wood);
  top.position.y = 0.52;
  group.add(top);

  const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 0.62), darkWood);
  shelf.position.y = 0.27;
  group.add(shelf);

  [
    [-0.52, 0.25, -0.28],
    [0.52, 0.25, -0.28],
    [-0.52, 0.25, 0.28],
    [0.52, 0.25, 0.28],
  ].forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), darkWood);
    leg.position.set(x, y, z);
    group.add(leg);
  });

  const tray = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.22, 0.035, 28),
    new THREE.MeshStandardMaterial({ color: 0xefe3cd, roughness: 0.64 }),
  );
  tray.position.set(0.26, 0.61, 0.08);
  group.add(tray);

  return group;
}

function createLoungeChair() {
  const group = new THREE.Group();
  const seatMaterial = new THREE.MeshStandardMaterial({ color: 0xc15d4c, roughness: 0.82 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3130, roughness: 0.7 });

  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.24, 0.78), seatMaterial);
  seat.position.set(0, 0.42, 0.08);
  group.add(seat);

  const back = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.78, 0.18), seatMaterial);
  back.position.set(0, 0.82, -0.34);
  back.rotation.x = -0.22;
  group.add(back);

  [
    [-0.34, 0.2, -0.23],
    [0.34, 0.2, -0.23],
    [-0.34, 0.2, 0.35],
    [0.34, 0.2, 0.35],
  ].forEach(([x, y, z]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.42, 10), frameMaterial);
    leg.position.set(x, y, z);
    leg.rotation.x = z > 0 ? -0.12 : 0.12;
    group.add(leg);
  });

  return group;
}

function createBookshelf() {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x74583e, roughness: 0.72 });
  const bookMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x276ef1, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xf4b740, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x22a06b, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0xb44a61, roughness: 0.8 }),
  ];

  const sides = [
    [-0.42, 0.78, 0, 0.08, 1.56, 0.34],
    [0.42, 0.78, 0, 0.08, 1.56, 0.34],
    [0, 1.52, 0, 0.92, 0.08, 0.34],
    [0, 0.04, 0, 0.92, 0.08, 0.34],
  ];

  sides.forEach(([x, y, z, width, height, depth]) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), frameMaterial);
    panel.position.set(x, y, z);
    group.add(panel);
  });

  [0.48, 0.92].forEach((y) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.06, 0.3), frameMaterial);
    shelf.position.set(0, y, 0);
    group.add(shelf);
  });

  for (let row = 0; row < 3; row += 1) {
    for (let i = 0; i < 5; i += 1) {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.08 + (i % 2) * 0.035, 0.24 + (i % 3) * 0.035, 0.18),
        bookMaterials[(row + i) % bookMaterials.length],
      );
      book.position.set(-0.27 + i * 0.13, 0.22 + row * 0.45, -0.03);
      group.add(book);
    }
  }

  return group;
}

function createPlant() {
  const group = new THREE.Group();
  const potMaterial = new THREE.MeshStandardMaterial({ color: 0xba6b47, roughness: 0.76 });
  const soilMaterial = new THREE.MeshStandardMaterial({ color: 0x49382f, roughness: 0.95 });
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2f8f58, roughness: 0.72 });

  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.42, 28), potMaterial);
  pot.position.y = 0.21;
  group.add(pot);

  const soil = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.035, 28), soilMaterial);
  soil.position.y = 0.44;
  group.add(soil);

  for (let i = 0; i < 9; i += 1) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10), leafMaterial);
    const angle = (i / 9) * Math.PI * 2;
    const radius = 0.16 + (i % 3) * 0.045;
    leaf.position.set(Math.cos(angle) * radius, 0.75 + (i % 2) * 0.15, Math.sin(angle) * radius);
    leaf.scale.set(0.58, 1.45, 0.24);
    leaf.rotation.set(0.45, angle, -0.38 + (i % 3) * 0.25);
    group.add(leaf);
  }

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.06, 0.52, 10),
    new THREE.MeshStandardMaterial({ color: 0x6a4a31, roughness: 0.8 }),
  );
  trunk.position.y = 0.68;
  group.add(trunk);

  return group;
}

function bindEvents() {
  window.addEventListener('resize', onResize);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  renderer.domElement.addEventListener('pointerleave', onPointerLeave);

  rotateObjectButton.addEventListener('click', rotateSelectedObject);
  exportLayoutButton.addEventListener('click', exportLayoutFile);
  importLayoutButton.addEventListener('click', () => layoutFileInput.click());
  layoutFileInput.addEventListener('change', importLayoutFile);
  resetButton.addEventListener('click', resetLayout);
  topViewButton.addEventListener('click', showTopView);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onPointerDown(event) {
  if (event.button !== 0) {
    return;
  }

  updatePointer(event);
  const object = pickObject();

  if (!object) {
    setHovered(null);
    setSelected(null);
    return;
  }

  setSelected(object);
  dragState.active = true;
  dragState.object = object;
  controls.enabled = false;
  renderer.domElement.style.cursor = 'grabbing';
  renderer.domElement.setPointerCapture(event.pointerId);

  if (raycaster.ray.intersectPlane(floorPlane, floorHit)) {
    dragOffset.copy(object.position).sub(floorHit);
  } else {
    dragOffset.set(0, 0, 0);
  }
}

function onPointerMove(event) {
  updatePointer(event);

  if (dragState.active && dragState.object) {
    if (!raycaster.ray.intersectPlane(floorPlane, floorHit)) {
      return;
    }

    const nextPosition = floorHit.add(dragOffset);
    moveObjectToFloorPosition(dragState.object, nextPosition);
    updateSelectionBox();
    updateSelectedPosition(dragState.object);
    return;
  }

  const object = pickObject();
  if (hoveredObject !== object) {
    setHovered(object);
  }
}

function onPointerUp(event) {
  if (!dragState.active) {
    return;
  }

  if (renderer.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }
  dragState.active = false;
  dragState.object = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = hoveredObject ? 'grab' : 'default';
}

function onPointerLeave() {
  if (!dragState.active) {
    setHovered(null);
  }
}

function updatePointer(event) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function pickObject() {
  const intersections = raycaster.intersectObjects(pickableMeshes, false);
  if (intersections.length === 0) {
    return null;
  }

  return intersections[0].object.userData.draggableRoot ?? null;
}

function setHovered(object) {
  if (hoveredObject && hoveredObject !== selectedObject) {
    setObjectEmphasis(hoveredObject, false);
  }

  hoveredObject = object;
  renderer.domElement.style.cursor = object ? 'grab' : 'default';

  if (hoveredObject && hoveredObject !== selectedObject) {
    setObjectEmphasis(hoveredObject, true);
  }
}

function setSelected(object) {
  const previousObject = selectedObject;

  if (previousObject && previousObject !== object) {
    setObjectEmphasis(previousObject, false);
  }

  selectedObject = object;

  if (selectedObject) {
    setObjectEmphasis(selectedObject, true);
    showSelectionBox(selectedObject);
    selectedName.textContent = selectedObject.name;
    updateSelectedPosition(selectedObject);
    rotateObjectButton.disabled = false;
  } else {
    hideSelectionBox();
    selectedName.textContent = 'Nothing selected';
    selectedPosition.textContent = '';
    rotateObjectButton.disabled = true;
  }

  if (hoveredObject && hoveredObject !== selectedObject) {
    setObjectEmphasis(hoveredObject, true);
  }
}

function setObjectEmphasis(object, enabled) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }

    if (!child.userData.baseEmissive && child.material.emissive) {
      child.userData.baseEmissive = child.material.emissive.clone();
    }

    if (child.material.emissive) {
      child.material.emissive.set(enabled ? 0x27466d : child.userData.baseEmissive ?? 0x000000);
      child.material.emissiveIntensity = enabled ? 0.16 : 0;
    }
  });
}

function updateSelectedPosition(object) {
  const rotation = normalizeDegrees(THREE.MathUtils.radToDeg(object.rotation.y));
  selectedPosition.textContent = `x ${object.position.x.toFixed(1)} / z ${object.position.z.toFixed(1)} / r ${rotation.toFixed(0)}deg`;
}

function resetLayout() {
  draggableObjects.forEach((object) => {
    const transform = initialTransforms.get(object.uuid);
    object.position.copy(transform.position);
    object.rotation.copy(transform.rotation);
    object.userData.bounds = getLocalBounds(object);
  });

  if (selectedObject) {
    updateSelectionBox();
    updateSelectedPosition(selectedObject);
  }
}

function rotateSelectedObject() {
  if (!selectedObject) {
    return;
  }

  const previousPosition = selectedObject.position.clone();
  const previousRotation = selectedObject.rotation.clone();

  selectedObject.rotation.y += Math.PI / 4;
  keepObjectInsideRoom(selectedObject);

  if (hasFurnitureOverlap(selectedObject)) {
    selectedObject.position.copy(previousPosition);
    selectedObject.rotation.copy(previousRotation);
    selectedObject.userData.bounds = getLocalBounds(selectedObject);
  }

  updateSelectionBox();
  updateSelectedPosition(selectedObject);
}

function exportLayoutFile() {
  const layout = createLayoutExport();
  const blob = new Blob([`${JSON.stringify(layout, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'room-layout.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showLayoutStatus('Layout exported');
}

async function importLayoutFile(event) {
  const [file] = event.target.files;
  event.target.value = '';

  if (!file) {
    return;
  }

  try {
    const layout = JSON.parse(await file.text());
    const result = importLayout(layout);
    showLayoutStatus(`Imported ${result.applied} objects`);
  } catch (error) {
    showLayoutStatus('Import failed');
    console.warn(error);
  }
}

function createLayoutExport() {
  return {
    schemaVersion: layoutSchemaVersion,
    app: 'webgpu-room-composer',
    units: 'meters',
    coordinateSystem: {
      origin: 'room-center-floor',
      x: 'left-right',
      y: 'up',
      z: 'front-back',
    },
    constraints: {
      keepInsideRoom: true,
      preventFurnitureOverlap: true,
      rotationStepDegrees: 45,
    },
    room: {
      width: round(room.halfWidth * 2),
      depth: round(room.halfDepth * 2),
      height: round(room.wallHeight),
      bounds: {
        minX: round(-room.halfWidth),
        maxX: round(room.halfWidth),
        minZ: round(-room.halfDepth),
        maxZ: round(room.halfDepth),
      },
    },
    furniture: draggableObjects.map(createFurnitureLayoutItem),
  };
}

function createFurnitureLayoutItem(object) {
  const box = new THREE.Box3().setFromObject(object);
  const footprint = getFurnitureFootprint(object);

  return {
    id: object.userData.layoutId,
    name: object.name,
    movable: true,
    position: {
      x: round(object.position.x),
      y: round(object.position.y),
      z: round(object.position.z),
    },
    rotation: {
      yDegrees: round(normalizeDegrees(THREE.MathUtils.radToDeg(object.rotation.y)), 1),
    },
    size: {
      width: round(box.max.x - box.min.x),
      height: round(box.max.y - box.min.y),
      depth: round(box.max.z - box.min.z),
    },
    footprint: {
      minX: round(footprint.minX),
      maxX: round(footprint.maxX),
      minZ: round(footprint.minZ),
      maxZ: round(footprint.maxZ),
    },
  };
}

function importLayout(layout) {
  const items = normalizeLayoutItems(layout);
  const snapshot = captureFurnitureTransforms();
  let applied = 0;

  if (items.length === 0) {
    throw new Error('Layout JSON does not contain a furniture array.');
  }

  try {
    items.forEach((item) => {
      const object = findFurnitureForLayoutItem(item);

      if (!object) {
        return;
      }

      applyLayoutItem(object, item);
      applied += 1;
    });

    if (applied === 0) {
      throw new Error('Layout JSON did not match any furniture IDs or names.');
    }

    if (hasAnyFurnitureOverlap()) {
      throw new Error('Imported layout has overlapping furniture.');
    }
  } catch (error) {
    restoreFurnitureTransforms(snapshot);
    throw error;
  }

  if (selectedObject) {
    updateSelectionBox();
    updateSelectedPosition(selectedObject);
  }

  return { applied };
}

function normalizeLayoutItems(layout) {
  if (Array.isArray(layout)) {
    return layout;
  }

  if (Array.isArray(layout?.furniture)) {
    return layout.furniture;
  }

  if (Array.isArray(layout?.objects)) {
    return layout.objects;
  }

  return [];
}

function findFurnitureForLayoutItem(item) {
  const itemId = String(item.id ?? item.layoutId ?? '').toLowerCase();
  const itemName = String(item.name ?? item.label ?? '').toLowerCase();

  return draggableObjects.find((object) => {
    const objectId = object.userData.layoutId.toLowerCase();
    const objectName = object.name.toLowerCase();
    return objectId === itemId || objectName === itemName;
  });
}

function applyLayoutItem(object, item) {
  const position = item.position ?? item.translation ?? {};
  object.position.x = readNumber(position.x, object.position.x);
  object.position.y = readNumber(position.y, object.position.y);
  object.position.z = readNumber(position.z, object.position.z);
  object.rotation.y = readRotationY(item, object.rotation.y);
  keepObjectInsideRoom(object);
}

function readRotationY(item, fallback) {
  const rotation = item.rotation ?? {};
  const degrees = item.rotationYDegrees ?? item.yDegrees ?? rotation.yDegrees ?? rotation.degreesY;

  if (Number.isFinite(Number(degrees))) {
    return THREE.MathUtils.degToRad(Number(degrees));
  }

  return readNumber(item.rotationY ?? rotation.y ?? rotation.yRadians, fallback);
}

function captureFurnitureTransforms() {
  return draggableObjects.map((object) => ({
    object,
    position: object.position.clone(),
    rotation: object.rotation.clone(),
    bounds: object.userData.bounds,
  }));
}

function restoreFurnitureTransforms(snapshot) {
  snapshot.forEach(({ object, position, rotation, bounds }) => {
    object.position.copy(position);
    object.rotation.copy(rotation);
    object.userData.bounds = bounds;
    object.updateMatrixWorld(true);
  });

  updateSelectionBox();
}

function moveObjectToFloorPosition(object, nextPosition) {
  const bounds = object.userData.bounds;
  const startX = object.position.x;
  const startZ = object.position.z;
  const targetX = clamp(
    nextPosition.x,
    -room.halfWidth - bounds.min.x + 0.18,
    room.halfWidth - bounds.max.x - 0.18,
  );
  const targetZ = clamp(
    nextPosition.z,
    -room.halfDepth - bounds.min.z + 0.18,
    room.halfDepth - bounds.max.z - 0.18,
  );
  const preferX = Math.abs(targetX - startX) >= Math.abs(targetZ - startZ);

  if (tryObjectPosition(object, targetX, targetZ)) {
    return true;
  }

  const firstSlide = preferX
    ? [targetX, startZ]
    : [startX, targetZ];
  const secondSlide = preferX
    ? [startX, targetZ]
    : [targetX, startZ];

  if (tryObjectPosition(object, firstSlide[0], firstSlide[1])) {
    return true;
  }

  if (tryObjectPosition(object, secondSlide[0], secondSlide[1])) {
    return true;
  }

  object.position.x = startX;
  object.position.z = startZ;
  object.updateMatrixWorld(true);
  return false;
}

function tryObjectPosition(object, x, z) {
  object.position.x = x;
  object.position.z = z;
  object.updateMatrixWorld(true);
  return !hasFurnitureOverlap(object);
}

function showSelectionBox(object) {
  if (!selectionBox) {
    selectionBox = new THREE.BoxHelper(object, 0x276ef1);
    selectionBox.name = 'Selection bounds';
    scene.add(selectionBox);
  } else {
    selectionBox.setFromObject(object);
  }

  selectionBox.visible = true;
}

function hideSelectionBox() {
  if (selectionBox) {
    selectionBox.visible = false;
  }
}

function updateSelectionBox() {
  if (selectionBox && selectedObject) {
    selectionBox.setFromObject(selectedObject);
  }
}

function hasFurnitureOverlap(object) {
  const footprint = getFurnitureFootprint(object);

  return draggableObjects.some((otherObject) => {
    if (otherObject === object) {
      return false;
    }

    return footprintsOverlap(footprint, getFurnitureFootprint(otherObject));
  });
}

function getFurnitureFootprint(object) {
  const box = new THREE.Box3().setFromObject(object);

  return {
    minX: box.min.x + collisionPadding,
    maxX: box.max.x - collisionPadding,
    minZ: box.min.z + collisionPadding,
    maxZ: box.max.z - collisionPadding,
  };
}

function footprintsOverlap(a, b) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function hasAnyFurnitureOverlap() {
  for (let index = 0; index < draggableObjects.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < draggableObjects.length; nextIndex += 1) {
      if (
        footprintsOverlap(
          getFurnitureFootprint(draggableObjects[index]),
          getFurnitureFootprint(draggableObjects[nextIndex]),
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

function registerDebugHooks() {
  if (!import.meta.env.DEV) {
    return;
  }

  window.__roomComposerDebug = {
    hasAnyOverlap: hasAnyFurnitureOverlap,
    exportLayout: createLayoutExport,
    importLayout,
    furniture: () =>
      draggableObjects.map((object) => ({
        id: object.userData.layoutId,
        name: object.name,
        x: Number(object.position.x.toFixed(3)),
        z: Number(object.position.z.toFixed(3)),
        rotation: Number(normalizeDegrees(THREE.MathUtils.radToDeg(object.rotation.y)).toFixed(1)),
        footprint: getFurnitureFootprint(object),
      })),
  };
}

function keepObjectInsideRoom(object) {
  const box = new THREE.Box3().setFromObject(object);
  const padding = 0.18;
  const adjustment = new THREE.Vector3();

  if (box.min.x < -room.halfWidth + padding) {
    adjustment.x = -room.halfWidth + padding - box.min.x;
  } else if (box.max.x > room.halfWidth - padding) {
    adjustment.x = room.halfWidth - padding - box.max.x;
  }

  if (box.min.y < 0) {
    adjustment.y = -box.min.y;
  } else if (box.max.y > room.wallHeight - 0.08) {
    adjustment.y = room.wallHeight - 0.08 - box.max.y;
  }

  if (box.min.z < -room.halfDepth + padding) {
    adjustment.z = -room.halfDepth + padding - box.min.z;
  } else if (box.max.z > room.halfDepth - padding) {
    adjustment.z = room.halfDepth - padding - box.max.z;
  }

  if (adjustment.lengthSq() > 0) {
    object.position.add(adjustment);
  }

  object.userData.bounds = getLocalBounds(object);
}

function showTopView() {
  camera.position.set(0, 8.8, 0.001);
  controls.target.set(0, 0, 0);
  controls.update();
}

function getLocalBounds(object) {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  return {
    min: box.min.sub(object.position),
    max: box.max.sub(object.position),
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function createLayoutId(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function readNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function showLayoutStatus(message) {
  layoutStatus.textContent = message;

  window.clearTimeout(showLayoutStatus.timeoutId);
  showLayoutStatus.timeoutId = window.setTimeout(() => {
    layoutStatus.textContent = '';
  }, 3200);
}

function render() {
  animationFrame += 1;

  const plant = draggableObjects.find((object) => object.name === 'Planter');
  if (plant && !dragState.active) {
    plant.children.forEach((child, index) => {
      if (child.geometry?.type === 'SphereGeometry') {
        child.rotation.z += Math.sin(animationFrame * 0.01 + index) * 0.0009;
      }
    });
  }

  updateSelectionBox();
  controls.update();
  renderer.render(scene, camera);
}
