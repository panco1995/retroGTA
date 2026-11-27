import * as THREE from 'three';
import { glow, solid } from './materials.js';
import { createActor, setPose } from './actor.js';
import { createBuilding } from './building.js';
import { PED_KINDS } from './npc.js';
import { createVehicle, VEHICLE_COLORS, VEHICLE_TYPES } from './vehicle.js';
import { onLangChange, t } from './i18n.js';
import { codesFor, keyVars, onBindingsChange } from './bindings.js';
import { onPageChange } from './menu.js';

const EXTERIOR_FOV = 45;
// The same vertical field of view the game uses for the driver's seat.
const INTERIOR_FOV = 58;

// A model gallery shared by the main menu and the pause menu. The panel is a
// fixed overlay outside both menus; it gets its own small renderer so the
// game's scene and camera are never disturbed, and the render loop only runs
// while the page is open.

// ---- street props -------------------------------------------------------

function buildLamp() {
  const group = new THREE.Group();
  const metal = solid(0x2c2e32, 0.48, 0.45);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.5, 8), metal);
  pole.position.y = 2.25;
  pole.castShadow = true;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.08), metal);
  arm.position.set(0.38, 4.45, 0);
  arm.castShadow = true;
  group.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.22), glow(0xffe6b0, 0.45));
  head.position.set(0.72, 4.32, 0);
  group.add(head);
  return group;
}

function buildHydrant() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.48, 10), solid(0x8d2a24, 0.55));
  body.position.y = 0.24;
  body.castShadow = true;
  group.add(body);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), solid(0xb7b2a8, 0.4, 0.4));
  cap.position.y = 0.52;
  cap.castShadow = true;
  group.add(cap);
  for (const side of [-1, 1]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 8), solid(0x6f211c, 0.6));
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(side * 0.17, 0.3, 0);
    nozzle.castShadow = true;
    group.add(nozzle);
  }
  return group;
}

function buildTrash() {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const bag = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 + (i % 2) * 0.05, 8, 6),
      solid(0x2a2c28, 0.85),
    );
    bag.position.set((i - 1) * 0.28, 0.16, (i - 1) * 0.12);
    bag.scale.y = 0.8;
    bag.castShadow = true;
    group.add(bag);
  }
  return group;
}

function buildTree() {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.3, 8), solid(0x5a4030, 0.9));
  trunk.position.y = 0.65;
  trunk.castShadow = true;
  group.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1.05, 10, 8), solid(0x2e4632, 0.95));
  crown.position.y = 1.9;
  crown.castShadow = true;
  group.add(crown);
  return group;
}

function buildDumpster() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 1.05), solid(0x24362c, 0.7));
  body.position.y = 0.7;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.08, 1.12), solid(0x1c2c24, 0.55));
  lid.position.y = 1.3;
  lid.rotation.x = -0.15;
  lid.castShadow = true;
  group.add(lid);
  return group;
}

// ---- catalog ------------------------------------------------------------

// People reuse the crowd's outfit tables: every kind gets one look, rolled
// once so switching back and forth shows the same person.
const looks = new Map();

function pedLook(kind) {
  let look = looks.get(kind.id);
  if (!look) {
    look = kind.make();
    looks.set(kind.id, look);
  }
  return look;
}

const PEOPLE = PED_KINDS.map((kind) => ({
  id: kind.id,
  nameKey: `ped_${kind.id}`,
  build() {
    const actor = createActor(pedLook(kind));
    setPose(actor, 'stand');
    return actor.group;
  },
}));

const PROPS = [
  { id: 'lamp', nameKey: 'prop_lamp', build: buildLamp },
  { id: 'hydrant', nameKey: 'prop_hydrant', build: buildHydrant },
  { id: 'trash', nameKey: 'prop_trash', build: buildTrash },
  { id: 'tree', nameKey: 'prop_tree', build: buildTree },
  { id: 'dumpster', nameKey: 'prop_dumpster', build: buildDumpster },
];

// One sample per kind of building the city generates. Buildings bake texture
// copies into each house, so they are built once and cached rather than
// rebuilt every time the list moves.
const BUILDINGS = [
  {
    id: 'rowhouse',
    nameKey: 'building_rowhouse',
    cache: true,
    build: () => createBuilding({
      x: 0, z: 0, w: 8.1, d: 10, floors: 3, face: 'south',
      color: 0x8d5c45, fireEscape: true, seed: 311,
    }),
  },
  {
    id: 'shopfront',
    nameKey: 'building_shopfront',
    cache: true,
    build: () => createBuilding({
      x: 0, z: 0, w: 8.2, d: 10, floors: 4, face: 'south',
      color: 0x7c4a3e, shop: true, fireEscape: true, seed: 152,
      sign: ['CAFE', '#1f4a3a'],
    }),
  },
  {
    id: 'store',
    nameKey: 'building_store',
    cache: true,
    build: () => createBuilding({
      x: 0, z: 0, w: 12, d: 8, floors: 1, face: 'south',
      color: 0xe6dfd0, style: 'store', seed: 401,
      sign: ['MART', '#2f6b4f'],
    }),
  },
  {
    id: 'watertower',
    nameKey: 'building_watertower',
    cache: true,
    build: () => createBuilding({
      x: 0, z: 0, w: 8.6, d: 10, floors: 5, face: 'south',
      color: 0x7a5a48, fireEscape: true, waterTower: true, seed: 153,
    }),
  },
  {
    id: 'warehouse',
    nameKey: 'building_warehouse',
    cache: true,
    build: () => createBuilding({
      x: 0, z: 0, w: 16, d: 14, floors: 2, face: 'south',
      color: 0x6a6e72, style: 'industrial', seed: 301,
    }),
  },
  {
    id: 'safehouse',
    nameKey: 'building_safehouse',
    cache: true,
    build: () => createBuilding({
      x: 0, z: 0, w: 11, d: 10, floors: 3, face: 'south',
      color: 0xc4b49a, fireEscape: true, safehouse: true, seed: 7,
    }),
  },
];

const builtCache = new Map();

const CATEGORIES = [
  {
    id: 'vehicles',
    labelKey: 'collectionVehicles',
    items: VEHICLE_TYPES.map((type) => ({
      id: type,
      nameKey: `vehicle_${type}`,
      // The whole vehicle state is kept, so the interior camera can use the
      // same seat and hide the same windshield the game does.
      build: () => createVehicle({
        type,
        color: VEHICLE_COLORS[type] ?? 0x8a8f92,
        x: 0,
        z: 0,
        heading: 0,
      }),
    })),
  },
  { id: 'people', labelKey: 'collectionPeople', items: PEOPLE },
  { id: 'props', labelKey: 'collectionProps', items: PROPS },
  { id: 'buildings', labelKey: 'collectionBuildings', items: BUILDINGS },
];

// ---- viewer state -------------------------------------------------------

let canvasEl = null;
let listEl = null;
let nameEl = null;
let countEl = null;
let hintEl = null;
let tabEls = [];
let itemEls = [];
let interiorBtn = null;
let renderer = null;
let scene = null;
let camera = null;
let pivot = null;
let plate = null;
let keyLight = null;
let cabinLight = null;
let viewer = null;
let frameHandle = 0;
let lastTime = 0;
let open = false;
let interior = false;
let category = 0;
let index = 0;
let dist = 8;
let baseDist = 8;
let targetY = 1;
let dragging = false;
let dragX = 0;
let dragY = 0;
// Free look from the driver's seat, in the car's own axes.
let lookYaw = 0;
let lookPitch = -0.1;

const eyePoint = new THREE.Vector3();
const forwardDir = new THREE.Vector3();
const lampPoint = new THREE.Vector3();

function itemsOf(catIndex) {
  return CATEGORIES[catIndex].items;
}

function ensureViewer() {
  if (renderer) return;

  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1012);

  camera = new THREE.PerspectiveCamera(EXTERIOR_FOV, 1, 0.05, 200);

  const hemi = new THREE.HemisphereLight(0xd5e0e8, 0x2a2620, 1.05);
  scene.add(hemi);

  keyLight = new THREE.DirectionalLight(0xfff1dc, 2.5);
  keyLight.position.set(6, 10, 7);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -10;
  keyLight.shadow.camera.right = 10;
  keyLight.shadow.camera.top = 10;
  keyLight.shadow.camera.bottom = -10;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 40;
  keyLight.shadow.bias = -0.0004;
  keyLight.shadow.normalBias = 0.03;
  scene.add(keyLight, keyLight.target);

  const fill = new THREE.DirectionalLight(0xc5d4e0, 0.7);
  fill.position.set(-7, 4, -6);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(0xf0d48a, 0.55);
  rim.position.set(-3, 3, 9);
  scene.add(rim);

  // The roof and the body shut the sun out of the cabin, so the driver's seat
  // would be almost black. This lamp hangs above the seat and only comes on
  // for the interior view; its short range keeps it off the paint outside.
  cabinLight = new THREE.PointLight(0xffe6c8, 0, 2.2, 2);
  cabinLight.position.set(0, 1.6, 0);
  scene.add(cabinLight);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(60, 64),
    new THREE.MeshStandardMaterial({ color: 0x0d1214, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.09;
  floor.receiveShadow = true;
  scene.add(floor);

  plate = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1.02, 0.08, 64),
    new THREE.MeshStandardMaterial({ color: 0x1d2426, roughness: 0.85, metalness: 0.1 }),
  );
  plate.position.y = -0.04;
  plate.receiveShadow = true;
  scene.add(plate);

  pivot = new THREE.Group();
  pivot.rotation.y = 0.55;
  scene.add(pivot);
}

function disposeModel(node) {
  node.traverse((obj) => {
    // Materials are cached and shared with the running game, so only the
    // one-off geometries are released here.
    if (obj.isMesh) obj.geometry?.dispose();
  });
}

function updateCamera() {
  const elevation = 0.3;
  const azimuth = 0.9;
  const horizontal = Math.cos(elevation) * dist;
  camera.position.set(
    Math.sin(azimuth) * horizontal,
    targetY + Math.sin(elevation) * dist,
    Math.cos(azimuth) * horizontal,
  );
  camera.lookAt(0, targetY, 0);
}

function frameModel(size) {
  const radius = Math.max(0.5, 0.5 * Math.hypot(size.x, size.y, size.z));
  const halfFov = THREE.MathUtils.degToRad(EXTERIOR_FOV) / 2;
  baseDist = (radius / Math.sin(halfFov)) * 1.12;
  dist = baseDist;
  targetY = Math.max(0.35, size.y * 0.5);
  const plateRadius = Math.max(0.55, Math.max(size.x, size.z) * 0.62 + 0.45);
  plate.scale.set(plateRadius, 1, plateRadius);
  // Buildings are much larger than cars, so the shadow camera follows the
  // model instead of staying at a fixed size.
  const shadowRadius = Math.max(4, radius * 1.3);
  const shadowCam = keyLight.shadow.camera;
  shadowCam.left = -shadowRadius;
  shadowCam.right = shadowRadius;
  shadowCam.top = shadowRadius;
  shadowCam.bottom = -shadowRadius;
  shadowCam.far = 40 + shadowRadius;
  shadowCam.updateProjectionMatrix();
  updateCamera();
}

function mount(item) {
  // Restore the outgoing model before its mesh is released.
  const keepInterior = interior;
  if (viewer?.windshield) viewer.windshield.visible = true;
  for (const child of [...pivot.children]) {
    pivot.remove(child);
    if (!child.userData.cached) disposeModel(child);
  }

  const cached = item.cache ? builtCache.get(item.id) : null;
  let built;
  let size;
  if (cached) {
    built = cached.group;
    size = cached.size;
  } else {
    built = item.build();
    const group = built.isObject3D ? built : built.group;
    group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(group);
    size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    // Sit the model on the plate and spin it about its own centre.
    group.position.x -= center.x;
    group.position.z -= center.z;
    group.position.y -= box.min.y;
    if (item.cache) {
      group.userData.cached = true;
      builtCache.set(item.id, { group, size });
    }
  }

  const group = built.isObject3D ? built : built.group;
  // Only vehicles carry a seat, a windshield and a modelled cabin; the open
  // tractors and the like have none, so they skip the interior view.
  viewer = built.isObject3D
    ? { group, seat: null, windshield: null, cabin: false }
    : {
        group,
        seat: built.seat ?? null,
        windshield: built.windshield ?? null,
        cabin: !!built.steering,
      };

  pivot.add(group);

  interior = false;
  if (cabinLight) cabinLight.intensity = 0;
  camera.fov = EXTERIOR_FOV;
  camera.updateProjectionMatrix();
  frameModel(size);
  if (keepInterior && interiorAvailable()) setInterior(true);
  updateInteriorButton();
  updateHint();
}

function updateInteriorCamera() {
  if (!viewer?.seat) return;
  viewer.group.updateWorldMatrix(true, false);
  eyePoint.set(viewer.seat.x, viewer.seat.y, viewer.seat.z);
  viewer.group.localToWorld(eyePoint);
  // Hang the cabin lamp over the middle of the cabin, between the two seats,
  // just below eye level so it lights the dash and the upholstery without
  // burning a hot spot into the headliner.
  lampPoint.set(0, viewer.seat.y - 0.02, viewer.seat.z + 0.12);
  viewer.group.localToWorld(lampPoint);
  cabinLight.position.copy(lampPoint);
  // Look around from the seat. Yaw is measured so that dragging the pointer
  // right swings the view right; pitch is dipped a little by default so the
  // dashboard and the top of the steering wheel sit in frame.
  const cp = Math.cos(lookPitch);
  forwardDir
    .set(-Math.sin(lookYaw) * cp, Math.sin(lookPitch), Math.cos(lookYaw) * cp)
    .transformDirection(viewer.group.matrixWorld);
  camera.position.copy(eyePoint);
  camera.lookAt(
    eyePoint.x + forwardDir.x * 6,
    eyePoint.y + forwardDir.y * 6,
    eyePoint.z + forwardDir.z * 6,
  );
}

function interiorAvailable() {
  return !!(viewer?.seat && viewer.windshield && viewer.cabin);
}

function updateInteriorButton() {
  if (!interiorBtn) return;
  interiorBtn.hidden = !interiorAvailable();
  interiorBtn.setAttribute('aria-pressed', interior ? 'true' : 'false');
}

// The hint names whichever key opens the interior, so a remapped interact
// binding stays accurate.
function updateHint() {
  if (!hintEl) return;
  const key = keyVars().interact;
  hintEl.textContent = t(interiorAvailable() ? 'collectionHintInterior' : 'collectionHint', { key });
}

function setInterior(on) {
  const next = !!(on && viewer?.seat && viewer.windshield && viewer.cabin);
  if (interior === next) {
    updateInteriorButton();
    return;
  }
  interior = next;
  if (viewer.windshield) viewer.windshield.visible = !interior;
  if (cabinLight) cabinLight.intensity = interior ? 1.7 : 0;
  camera.fov = interior ? INTERIOR_FOV : EXTERIOR_FOV;
  camera.updateProjectionMatrix();
  if (interior) {
    lookYaw = 0;
    lookPitch = -0.1;
    updateInteriorCamera();
  } else {
    updateCamera();
  }
  updateInteriorButton();
}

function resize() {
  if (!renderer) return;
  const width = canvasEl.clientWidth;
  const height = canvasEl.clientHeight;
  if (!width || !height) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  if (interior) updateInteriorCamera();
  else updateCamera();
}

function tick(now) {
  if (!open) return;
  const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
  lastTime = now;
  // The car keeps turning on the turntable from outside; from the driver's
  // seat it holds still and dragging swings the view around the cabin.
  if (!dragging && !interior) pivot.rotation.y += dt * 0.32;
  if (interior) updateInteriorCamera();
  renderer.render(scene, camera);
  frameHandle = requestAnimationFrame(tick);
}

// ---- UI -----------------------------------------------------------------

function updateTabs() {
  for (const el of tabEls) {
    el.setAttribute('aria-pressed', el.dataset.collectionTab === CATEGORIES[category].id ? 'true' : 'false');
  }
}

function updateSelection() {
  itemEls.forEach((el, i) => el.setAttribute('aria-current', i === index ? 'true' : 'false'));
  itemEls[index]?.scrollIntoView({ block: 'nearest' });
}

function updateCaption() {
  const items = itemsOf(category);
  if (!items.length) {
    nameEl.textContent = '';
    countEl.textContent = '';
    return;
  }
  nameEl.textContent = t(items[index].nameKey);
  countEl.textContent = `${index + 1} / ${items.length}`;
}

function renderList() {
  listEl.replaceChildren();
  itemEls = [];
  CATEGORIES[category].items.forEach((item, at) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'collection-item';
    button.textContent = t(item.nameKey);
    button.addEventListener('click', () => select(at));
    listEl.append(button);
    itemEls.push(button);
  });
  updateSelection();
}

function select(next) {
  const items = itemsOf(category);
  if (!items.length) return;
  index = ((next % items.length) + items.length) % items.length;
  updateSelection();
  updateCaption();
  mount(items[index]);
}

function openPanel() {
  ensureViewer();
  if (open) return;
  open = true;
  updateTabs();
  renderList();
  if (pivot.children.length) {
    updateSelection();
    updateCaption();
  } else {
    select(index);
  }
  resize();
  lastTime = 0;
  frameHandle = requestAnimationFrame(tick);
}

function closePanel() {
  if (!open) return;
  open = false;
  if (frameHandle) cancelAnimationFrame(frameHandle);
  frameHandle = 0;
}

export function initCollection() {
  canvasEl = document.getElementById('collection-canvas');
  listEl = document.getElementById('collection-list');
  nameEl = document.getElementById('collection-name');
  countEl = document.getElementById('collection-count');
  hintEl = document.getElementById('collection-hint');
  interiorBtn = document.getElementById('collection-interior');
  if (!canvasEl || !listEl || !nameEl || !countEl || !interiorBtn) return;

  interiorBtn.addEventListener('click', () => setInterior(!interior));
  updateHint();

  tabEls = [...document.querySelectorAll('[data-collection-tab]')];
  for (const button of tabEls) {
    button.addEventListener('click', () => {
      const next = CATEGORIES.findIndex((cat) => cat.id === button.dataset.collectionTab);
      if (next < 0 || next === category) return;
      category = next;
      index = 0;
      updateTabs();
      renderList();
      select(0);
    });
  }

  document.getElementById('collection-prev').addEventListener('click', () => select(index - 1));
  document.getElementById('collection-next').addEventListener('click', () => select(index + 1));

  canvasEl.addEventListener('pointerdown', (event) => {
    dragging = true;
    dragX = event.clientX;
    dragY = event.clientY;
    canvasEl.setPointerCapture(event.pointerId);
  });
  canvasEl.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - dragX;
    const dy = event.clientY - dragY;
    dragX = event.clientX;
    dragY = event.clientY;
    if (interior) {
      // Turn the head instead of the car.
      lookYaw += dx * 0.006;
      lookPitch = THREE.MathUtils.clamp(lookPitch - dy * 0.004, -0.85, 0.6);
    } else {
      pivot.rotation.y += dx * 0.01;
    }
  });
  const endDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    if (canvasEl.hasPointerCapture(event.pointerId)) canvasEl.releasePointerCapture(event.pointerId);
  };
  canvasEl.addEventListener('pointerup', endDrag);
  canvasEl.addEventListener('pointercancel', endDrag);
  canvasEl.addEventListener('wheel', (event) => {
    if (!open) return;
    event.preventDefault();
    // The interior camera is anchored to the seat, so zooming does not apply.
    if (interior) return;
    const zoom = Math.exp(event.deltaY * 0.0012);
    dist = THREE.MathUtils.clamp(dist * zoom, baseDist * 0.45, baseDist * 2.4);
    updateCamera();
  }, { passive: false });

  window.addEventListener('resize', () => {
    if (open) resize();
  });

  window.addEventListener('keydown', (event) => {
    if (!open || event.repeat) return;
    if (codesFor('interact').includes(event.code)) {
      // The same key that gets you into a car in the game steps into the
      // cabin here.
      event.preventDefault();
      if (interiorAvailable()) setInterior(!interior);
    } else if (event.code === 'ArrowLeft') {
      event.preventDefault();
      select(index - 1);
    } else if (event.code === 'ArrowRight') {
      event.preventDefault();
      select(index + 1);
    }
  });

  onPageChange(({ page }) => {
    if (page === 'collection') openPanel();
    else closePanel();
  });

  onLangChange(() => {
    updateHint();
    if (!open) return;
    renderList();
    updateTabs();
    updateCaption();
  });

  onBindingsChange(updateHint);
}
