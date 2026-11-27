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
  if (style === 'store') return 4.8;
  if (style === 'hospital') return Math.max(5, floors ?? 5) * FLOOR_H;
  if (style === 'police') return Math.max(2, floors ?? 2) * FLOOR_H;
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
  // Shops, hospitals and police stations are rendered panels rather than
  // brick, so their fronts read differently from the row houses next to them.
  const panelStyle = style === 'store' || style === 'hospital' || style === 'police';
  const wall = panelStyle
    ? solid(tint, 0.88)
    : brickMaterial(tint, Math.max(w, d), height);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), wall);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  house.add(body);

  const trim = solid(shade(tint, isSafe ? 1.12 : 0.72), 0.85);
  const bands = style === 'industrial' ? 1 : panelStyle ? 0 : floors;
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
  if (style === 'store') {
    const board = sign ?? ['MART', '#2f6b4f'];
    // A glazed shop window with mullions and a glass door to the right.
    const glassW = Math.min(w * 0.72, 9);
    const glassH = 2.35;
    const glassX = -w * 0.08;
    const glazing = new THREE.Mesh(new THREE.PlaneGeometry(glassW, glassH), windowLitMat);
    glazing.position.set(glassX, 1.42, zf);
    house.add(glazing);
    for (let i = 0; i <= 4; i++) {
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.07, glassH + 0.1, 0.08), metal);
      mull.position.set(glassX - glassW / 2 + (glassW / 4) * i, 1.42, zf + 0.02);
      house.add(mull);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.35, 0.1), solid(0x233029, 0.6));
    door.position.set(w * 0.36, 1.175, zf);
    house.add(door);
    const doorPane = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.15), windowLitMat);
    doorPane.position.set(w * 0.36, 1.45, zf + 0.06);
    house.add(doorPane);

    // Flat canopy with a lit strip, and the sign band above it.
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.14, 1.5), solid(0xd8d0be, 0.8));
    canopy.position.set(0, 2.95, d / 2 + 0.72);
    canopy.castShadow = true;
    house.add(canopy);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.06, 0.5), glow(0xffe6b0, 0.5));
    strip.position.set(0, 2.87, d / 2 + 0.7);
    house.add(strip);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.95, 0.12), solid(signColor(board[1]), 0.7));
    fascia.position.set(0, 3.75, zf - 0.09);
    house.add(fascia);
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w * 0.62, 6.8), 0.85),
      signMaterial(board[0], board[1]),
    );
    signBoard.position.set(0, 3.75, zf + 0.01);
    house.add(signBoard);

    // A window on each side and the usual roof clutter.
    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(winGeo, windowMat);
      win.position.set(side * (w / 2 + 0.05), 2.0, d * 0.12);
      win.rotation.y = Math.PI / 2;
      win.scale.set(0.8, 0.85, 1);
      house.add(win);
    }
    for (const [ax, az] of [[-w * 0.2, -d * 0.14], [w * 0.18, -d * 0.02]]) {
      const unit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.95), solid(0x9a9a92, 0.8));
      unit.position.set(ax, height + 0.35, az);
      unit.castShadow = true;
      house.add(unit);
    }
  } else if (style === 'hospital') {
    const board = sign ?? ['HOSPITAL', '#b33a3a'];
    // A tall glazed entrance under a wide canopy, then window strips on the
    // upper floors so the block reads as a hospital rather than an office.
    const entryW = Math.min(w * 0.32, 4.6);
    const entry = new THREE.Mesh(new THREE.PlaneGeometry(entryW, 2.9), windowLitMat);
    entry.position.set(0, 1.55, zf);
    house.add(entry);
    for (let i = 0; i <= 3; i += 1) {
      const mull = new THREE.Mesh(new THREE.BoxGeometry(0.07, 3, 0.08), metal);
      mull.position.set(-entryW / 2 + (entryW / 3) * i, 1.55, zf + 0.02);
      house.add(mull);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(entryW + 3, 0.2, 2.6), solid(0xdad4c6, 0.85));
    canopy.position.set(0, 3.35, d / 2 + 1.05);
    canopy.castShadow = true;
    house.add(canopy);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(entryW + 1.4, 0.06, 0.5), glow(0xfff0cc, 0.45));
    strip.position.set(0, 3.22, d / 2 + 1.0);
    house.add(strip);

    // Red cross beside the sign, so the building is obvious from the street.
    const red = solid(0xc22a2a, 0.5);
    const crossX = Math.min(w * 0.3, 7.4);
    const crossY = 4.08;
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.25, 0.08), red);
    crossV.position.set(crossX, crossY, zf + 0.02);
    house.add(crossV);
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.34, 0.08), red);
    crossH.position.set(crossX, crossY, zf + 0.03);
    house.add(crossH);

    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w * 0.5, 7), 0.85),
      signMaterial(board[0], board[1]),
    );
    signBoard.position.set(-w * 0.06, crossY, zf + 0.02);
    house.add(signBoard);

    for (let f = 1; f < floors; f += 1) {
      const y = f * FLOOR_H + 2.1;
      const stripW = w * 0.86;
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(stripW, 1.15), windowMat);
      pane.position.set(0, y, zf);
      house.add(pane);
      const cols = Math.max(3, Math.round(stripW / 2.4));
      for (let i = 0; i <= cols; i += 1) {
        const mull = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.25, 0.08), metal);
        mull.position.set(-stripW / 2 + (stripW / cols) * i, y, zf + 0.02);
        house.add(mull);
      }
      // A couple of lit panes on each floor, so the ward wing reads at night.
      for (let c = 0; c < 2; c += 1) {
        const wx = -stripW / 2 + stripW * (0.3 + c * 0.4);
        const lit = new THREE.Mesh(new THREE.PlaneGeometry(stripW / cols - 0.18, 0.95), windowLitMat);
        lit.position.set(wx, y, zf + 0.03);
        house.add(lit);
      }
    }

    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.24, 1.5), windowMat);
      wing.position.set(side * w * 0.32, 1.85, zf);
      house.add(wing);
    }

    for (const [ax, az] of [[-w * 0.22, -d * 0.1], [0, 0.1], [w * 0.22, -d * 0.16]]) {
      const unit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.2), solid(0x9a9a92, 0.8));
      unit.position.set(ax, height + 0.4, az);
      unit.castShadow = true;
      house.add(unit);
    }
  } else if (style === 'police') {
    const board = sign ?? ['POLICE', '#1d4f9c'];
    const blue = solid(signColor(board[1]), 0.62, 0.08);
    // A police-blue belt under the parapet, an entrance with a canopy and a
    // radio mast on the roof.
    const belt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.5, 0.14), blue);
    belt.position.set(0, height - 0.66, zf + 0.01);
    house.add(belt);

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.1), solid(0x1b2430, 0.55));
    door.position.set(0, 1.16, zf);
    house.add(door);
    const doorPane = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.15), windowLitMat);
    doorPane.position.set(0, 1.5, zf + 0.06);
    house.add(doorPane);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 1.5), solid(0xd6d2c6, 0.85));
    canopy.position.set(0, 2.9, d / 2 + 0.7);
    canopy.castShadow = true;
    house.add(canopy);
    const signBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(w * 0.55, 4.6), 0.66),
      signMaterial(board[0], board[1]),
    );
    signBoard.position.set(0, 3.6, zf + 0.02);
    house.add(signBoard);

    addWindow(house, -w * 0.3, 1.7, zf, 1.9, 1.15, false);
    addWindow(house, w * 0.3, 1.7, zf, 1.9, 1.15, false);
    for (let f = 1; f < floors; f += 1) {
      const y = f * FLOOR_H + 1.7;
      const cols = Math.max(3, Math.floor(w / 4.4));
      for (let c = 0; c < cols; c += 1) {
        const wx = -w / 2 + (w * (c + 1)) / (cols + 1);
        addWindow(house, wx, y, zf, 1, 1, hash(seed, f * 17 + c) < 0.35);
      }
    }

    const unit = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.75, 1.0), solid(0x9a9a92, 0.8));
    unit.position.set(w * 0.2, height + 0.38, -d * 0.1);
    unit.castShadow = true;
    house.add(unit);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.6, 5), metal);
    mast.position.set(-w * 0.26, height + 1.3, -d * 0.2);
    house.add(mast);
    const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), glow(0xff3030, 0.6));
    beacon.position.set(-w * 0.26, height + 2.55, -d * 0.2);
    house.add(beacon);
  } else if (style === 'industrial') {
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

  if (!panelStyle && style !== 'industrial') {
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

  if (fireEscape && !panelStyle && style !== 'industrial') {
    addFireEscape(house, w, d, floors);
  }

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
