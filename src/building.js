import * as THREE from 'three';
import { BRICKS, FLOOR_H, WALK_TOP, hash, shade } from './config.js';
import {
  brickMaterial,
  glow,
  signMaterial,
  solid,
  windowLitMat,
  windowMat,
} from './materials.js';

// A building is assembled in code from a handful of parameters, so the city
// and the collection gallery share one builder. The city places the result and
// registers its collider; the gallery shows single samples on a turntable.

const YAW = { south: 0, north: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 };

const metal = solid(0x2c2e32, 0.48, 0.45);
const trimDark = solid(0x3a342e, 0.8);
const winGeo = new THREE.BoxGeometry(0.82, 1.12, 0.08);
const bandGeo = new THREE.BoxGeometry(1, 0.12, 0.16);

function addWindow(parent, x, y, z, sx, sy, lit) {
  const mesh = new THREE.Mesh(winGeo, lit ? windowLitMat : windowMat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, 1);
  parent.add(mesh);
}

function addFireEscape(parent, w, d, floors) {
  const platW = Math.min(w * 0.34, 2.4);
  const px = w * 0.3;
  for (let f = 1; f < floors; f++) {
    const y = f * FLOOR_H + 0.2;
    const z = d / 2 + 0.42;
    const plat = new THREE.Mesh(new THREE.BoxGeometry(platW, 0.06, 0.7), metal);
    plat.position.set(px, y, z);
    parent.add(plat);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(platW, 0.06, 0.04), metal);
    rail.position.set(px, y + 0.38, z + 0.3);
    parent.add(rail);
  }
  const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.12, floors * FLOOR_H - 1.2, 0.08), metal);
  ladder.position.set(px - platW / 2 + 0.12, (floors * FLOOR_H) / 2, d / 2 + 0.42);
  parent.add(ladder);
}

function signColor(css) {
  return Number.parseInt(css.slice(1), 16);
}

export function buildingHeight({ floors, style }) {
  return style === 'industrial' ? 8.4 : floors * FLOOR_H;
}

// opts:
//   x, z, w, d, floors, face, color, shop, awning, fireEscape, waterTower,
//   safehouse, style, seed, baseY, sign ([label, background]) and doorX/doorZ.
// The sign is picked by the caller so the city can cycle the shop signs while
// the gallery picks one for its sample.
export function createBuilding(opts) {
  const {
    x, z, w, d, floors, face, color, shop, awning, fireEscape, waterTower,
    safehouse: isSafe, style, seed, sign,
  } = opts;
  const yaw = YAW[face];
  const height = buildingHeight(opts);
  const house = new THREE.Group();
  house.position.set(x, opts.baseY ?? 0, z);
  house.rotation.y = yaw;

  const tint = color ?? BRICKS[Math.floor(hash(seed, 2) * BRICKS.length)];
  const wall = brickMaterial(tint, Math.max(w, d), height);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), wall);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  house.add(body);

  const trim = solid(shade(tint, isSafe ? 1.12 : 0.72), 0.85);
  const bands = style === 'industrial' ? 1 : floors;
  for (let f = 1; f <= bands; f++) {
    const band = new THREE.Mesh(bandGeo, trim);
    const y = style === 'industrial' ? height - 0.3 : f * FLOOR_H;
    band.scale.set(w + 0.12, 1, 1);
    band.position.set(0, y, d / 2 + 0.02);
    house.add(band);
  }

  const parapetH = 0.42;
  for (const side of [
    [w + 0.16, parapetH, 0.16, 0, height + parapetH / 2, d / 2],
    [w + 0.16, parapetH, 0.16, 0, height + parapetH / 2, -d / 2],
    [0.16, parapetH, d, w / 2, height + parapetH / 2, 0],
    [0.16, parapetH, d, -w / 2, height + parapetH / 2, 0],
  ]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(side[0], side[1], side[2]), trim);
    p.position.set(side[3], side[4], side[5]);
    house.add(p);
  }

  const zf = d / 2 + 0.06;
  if (style === 'industrial') {
    const doorW = Math.min(w * 0.42, 5.5);
    const garage = new THREE.Mesh(new THREE.BoxGeometry(doorW, 3.4, 0.08), trimDark);
    garage.position.set(0, 1.8, zf);
    house.add(garage);
    for (let i = 0; i < 4; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.92, 0.06, 0.04), metal);
      line.position.set(0, 0.6 + i * 0.7, zf + 0.05);
      house.add(line);
    }
    for (let row = 0; row < 2; row++) {
      const cols = Math.max(2, Math.floor(w / 4));
      for (let c = 0; c < cols; c++) {
        const wx = -w / 2 + (w * (c + 1)) / (cols + 1);
        addWindow(house, wx, 5.3 + row * 1.3, zf, 1.1, 0.7, hash(seed, c + row * 5) < 0.15);
      }
    }
  } else if (shop) {
    const board = sign ?? ['SHOP', '#5a4630'];
    const winW = Math.min(w * 0.62, 5.2);
    addWindow(house, -w * 0.08, 1.7, zf, winW / 0.82, 1.35, false);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.15, 0.08), solid(0x2a2420, 0.7));
    door.position.set(w * 0.32, 1.15, zf);
    house.add(door);
    const awningMat = solid(
      awning ? Number.parseInt(awning.slice(1), 16) : signColor(board[1]),
      0.7,
    );
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w * 0.84, 6.5), 0.08, 1.15), awningMat);
    canopy.position.set(0, 2.85, d / 2 + 0.55);
    house.add(canopy);
    const boardMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w * 0.7, 4.6), 0.62),
      signMaterial(board[0], board[1]),
    );
    boardMesh.position.set(0, 3.35, zf);
    house.add(boardMesh);
  } else {
    const doorMat = solid(isSafe ? 0x4a3028 : 0x2c241e, 0.75);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.08), doorMat);
    door.position.set(0, 1.16, zf);
    house.add(door);
    if (w > 6) {
      addWindow(house, -w * 0.28, 1.45, zf, 0.85, 0.9, false);
      addWindow(house, w * 0.28, 1.45, zf, 0.85, 0.9, false);
    }
  }

  if (style !== 'industrial') {
    const cols = w > 9.4 ? 3 : 2;
    for (let f = 1; f < floors; f++) {
      const y = (f + 0.55) * FLOOR_H;
      for (let c = 0; c < cols; c++) {
        const wx = -w / 2 + (w * (c + 1)) / (cols + 1);
        const lit = hash(seed, f * 13 + c) < (isSafe ? 0.45 : 0.22);
        addWindow(house, wx, y, zf, 1, 1, lit);
      }
    }
    for (let f = 1; f < floors; f++) {
      const y = (f + 0.55) * FLOOR_H;
      const lit = hash(seed, f + 40) < 0.2;
      addWindow(house, w / 2 + 0.05, y, 0, 0.7, 0.85, lit);
      addWindow(house, -w / 2 - 0.05, y, 0, 0.7, 0.85, lit);
      house.children[house.children.length - 1].rotation.y = Math.PI / 2;
      house.children[house.children.length - 2].rotation.y = Math.PI / 2;
    }
  }

  if (fireEscape && style !== 'industrial') addFireEscape(house, w, d, floors);

  const pipe = new THREE.Mesh(new THREE.BoxGeometry(0.1, height, 0.1), solid(shade(tint, 0.55)));
  pipe.position.set(-w / 2 + 0.28, height / 2, zf);
  house.add(pipe);

  if (waterTower) {
    for (const [lx, lz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5), metal);
      leg.position.set(w * 0.18 + lx, height + 0.55, lz);
      house.add(leg);
    }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.15, 10), solid(0x6a5a48, 0.7));
    tank.position.set(w * 0.18, height + 1.35, 0);
    tank.castShadow = true;
    house.add(tank);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.4, 10), solid(0x5a4038, 0.7));
    cone.position.set(w * 0.18, height + 2.05, 0);
    house.add(cone);
  }

  if (isSafe) {
    const stoop = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.18, 1.25), solid(0xb7aa98, 0.9));
    stoop.position.set(0, WALK_TOP + 0.08, d / 2 + 0.7);
    house.add(stoop);
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.42), solid(0xaea292, 0.9));
    step.position.set(0, WALK_TOP + 0.02, d / 2 + 1.35);
    house.add(step);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.18), glow(0xffe1a8, 0.9));
    lamp.position.set(0.85, 2.45, zf);
    house.add(lamp);
    const light = new THREE.PointLight(0xffc48a, 5, 8, 2);
    light.position.set(0.85, 2.5, d / 2 + 0.6);
    house.add(light);
  }

  return house;
}
