import * as THREE from 'three';
import {
  BRICKS,
  FLOOR_H,
  HOUSE_DEPTH,
  MAP,
  ROAD_TOP,
  ROAD_W,
  ROADS_X,
  ROADS_Z,
  SETBACK,
  WALK,
  WALK_TOP,
  colorOf,
  deg,
  hash,
  shade,
} from './config.js';
import {
  brickMaterial,
  glow,
  signMaterial,
  solid,
  windowLitMat,
  windowMat,
} from './materials.js';
import { insidePolygon } from './collision.js';
import { createVehicle } from './vehicle.js';

const SIGNS = MAP.signs;
const YAW = { south: 0, north: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 };

function housePreset(raw) {
  return {
    ...raw,
    color: raw.color ? colorOf(raw.color) : undefined,
  };
}

function laneZ(lane) {
  const half = ROAD_W / 2;
  const { curbInset, pedInset } = MAP.lanes;
  switch (lane) {
    case 'curbNorth': return -(half - curbInset);
    case 'curbSouth': return half - curbInset;
    case 'pedNorth': return -(half + pedInset);
    case 'pedSouth': return half + pedInset;
    case 'sidewalkNorth': return -(half + WALK / 2);
    case 'sidewalkSouth': return half + WALK / 2;
    default: return 0;
  }
}

function laneX(lane, roadIndex = 0) {
  const road = ROADS_X[roadIndex];
  const half = ROAD_W / 2;
  if (lane === 'sidewalkWest') return road - half - WALK / 2;
  if (lane === 'sidewalkEast') return road + half + WALK / 2;
  if (lane === 'curbWest') return road - (half - MAP.lanes.curbInset);
  return road + (half - MAP.lanes.curbInset);
}

function placeX(spec, originX = 0) {
  if (spec.laneX) return laneX(spec.laneX, spec.roadIndex ?? 0);
  if (spec.along) return laneX(spec.along.side === 'west' ? 'curbWest' : 'curbEast', spec.along.index);
  if (typeof spec.x === 'number') return spec.x;
  return originX + (spec.dx ?? 0);
}

function placeZ(spec, originZ = 0) {
  if (spec.lane) return laneZ(spec.lane);
  if (typeof spec.z === 'number') return spec.z;
  return originZ + (spec.dz ?? 0);
}

export function buildCity() {
  const group = new THREE.Group();
  const colliders = [];
  const buildings = [];
  const roads = [];
  const markers = [];
  const stripes = [];
  // Sidewalk center lines. The crowd walks these and spawns on them.
  const walkways = [];
  // Road spans that run unbroken between two intersections, and the clockwise
  // lane loops around each city block that uses four of them.
  const fullSpans = new Set();
  const intersections = new Set();
  const trafficLoops = [];
  let safehouse = null;
  let shopCount = 0;

  const asphaltMat = solid(0x3a3d42, 0.96);
  const walkMat = solid(0xa3988c, 0.95);
  const concrete = solid(0x8f8b84, 0.92);
  const metal = solid(0x2c2e32, 0.48, 0.45);
  const trimDark = solid(0x3a342e, 0.8);

  const winGeo = new THREE.BoxGeometry(0.82, 1.12, 0.08);
  const bandGeo = new THREE.BoxGeometry(1, 0.12, 0.16);

  function box(w, h, d, mat, x, y, z, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = !!opts.cast;
    mesh.receiveShadow = opts.receive !== false;
    (opts.parent ?? group).add(mesh);
    return mesh;
  }

  function addAsphalt(x, z, w, d) {
    box(w, ROAD_TOP, d, asphaltMat, x, ROAD_TOP / 2, z, { receive: true });
    roads.push({ x, z, w, d });
  }

  function addWalk(x, z, w, d) {
    box(w, WALK_TOP, d, walkMat, x, WALK_TOP / 2, z, { receive: true });
  }

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

  function addHouse(opts) {
    const {
      x, z, w, d, floors, face, color, shop, fireEscape, waterTower, safehouse: isSafe, style, seed,
    } = opts;
    const yaw = YAW[face];
    const swap = face === 'east' || face === 'west';
    const height = style === 'industrial' ? 8.4 : floors * FLOOR_H;
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
      const sign = SIGNS[shopCount % SIGNS.length];
      shopCount += 1;
      const winW = Math.min(w * 0.62, 5.2);
      addWindow(house, -w * 0.08, 1.7, zf, winW / 0.82, 1.35, false);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 2.15, 0.08), solid(0x2a2420, 0.7));
      door.position.set(w * 0.32, 1.15, zf);
      house.add(door);
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(Math.min(w * 0.84, 6.5), 0.08, 1.15),
        solid(opts.awning ? parseInt(opts.awning.slice(1), 16) : signColor(sign[1]), 0.7),
      );
      awning.position.set(0, 2.85, d / 2 + 0.55);
      house.add(awning);
      const board = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.7, 4.6), 0.62),
        signMaterial(sign[0], sign[1]),
      );
      board.position.set(0, 3.35, zf);
      house.add(board);
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

    group.add(house);

    const hw = (swap ? d : w) / 2;
    const hd = (swap ? w : d) / 2;
    const bounds = { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
    if (face === 'south') bounds.maxZ += 0.25;
    if (face === 'north') bounds.minZ -= 0.25;
    colliders.push(bounds);
    buildings.push({ x, z, w: hw * 2, d: hd * 2, safehouse: !!isSafe, kind: style ?? 'house' });

    if (isSafe) {
      safehouse = {
        x,
        z,
        frontZ: opts.doorZ ?? z + d / 2,
        doorX: opts.doorX ?? x,
        doorZ: opts.doorZ ?? z + d / 2,
        w,
        d,
      };
    }
  }

  function signColor(css) {
    return parseInt(css.slice(1), 16);
  }

  function placeRow({ x0, x1, zFront, face, depth, presets, seed }) {
    const gap = 0.38;
    let cursor = x0;
    let i = 0;
    while (cursor < x1 - 6) {
      const preset = presets ? presets[i] : null;
      if (presets && !preset) break;
      const rnd = hash(seed, i + 1);
      const w = preset?.w ?? 7.2 + Math.floor(rnd * 3) * 0.85;
      if (cursor + w > x1 + 0.3) break;
      const floors = preset?.floors ?? 3 + Math.floor(hash(seed, i + 5) * 2.6);
      const cx = cursor + w / 2;
      const cz = face === 'south' ? zFront - depth / 2 : zFront + depth / 2;
      const shop = preset ? !!preset.shop : hash(seed, i + 9) < 0.28;
      addHouse({
        x: cx,
        z: cz,
        w,
        d: depth,
        floors,
        face,
        color: preset?.color,
        shop,
        awning: preset?.awning,
        fireEscape: preset ? preset.fireEscape !== false : floors >= 3,
        waterTower: preset?.waterTower ?? (floors >= 5 && hash(seed, i + 4) < 0.55),
        safehouse: !!preset?.safehouse,
        seed: seed * 20 + i,
      });
      cursor += w + gap;
      i += 1;
    }
  }

  function placeIndustrial(x0, x1, zFront, seed) {
    const gap = 4;
    const usable = x1 - x0 - gap;
    const w1 = usable * (0.52 + (hash(seed, 1) - 0.5) * 0.08);
    const w2 = usable - w1;
    const depth = 14;
    const cz = zFront - depth / 2;
    addHouse({
      x: x0 + w1 / 2,
      z: cz,
      w: w1,
      d: depth,
      floors: 2,
      face: 'south',
      style: 'industrial',
      color: hash(seed, 3) > 0.5 ? 0x6a6e72 : 0x7a5a46,
      seed,
    });
    addHouse({
      x: x0 + w1 + gap + w2 / 2,
      z: cz,
      w: w2,
      d: depth,
      floors: 2,
      face: 'south',
      style: 'industrial',
      color: 0x5e6564,
      seed: seed + 8,
    });
  }

  function fillBlocks() {
    for (const block of MAP.blocks) {
      const x0 = ROADS_X[block.col] + SETBACK + (block.insetWest ?? 0);
      const x1 = ROADS_X[block.col + 1] - SETBACK;
      const zNorth = ROADS_Z[block.row] + SETBACK;
      const zSouth = ROADS_Z[block.row + 1] - SETBACK;
      const seed = block.seed;
      if (block.kind === 'industrial') {
        placeIndustrial(x0, x1, zSouth, seed);
        continue;
      }
      const presets = block.south ? MAP.rows[block.south].map(housePreset) : null;
      placeRow({ x0, x1, zFront: zSouth, face: 'south', depth: HOUSE_DEPTH, presets, seed });
      placeRow({ x0, x1, zFront: zNorth, face: 'north', depth: HOUSE_DEPTH, seed: seed + 3 });
      if (block.alley) {
        const az = ((zSouth - HOUSE_DEPTH) + (zNorth + HOUSE_DEPTH)) / 2;
        addDumpster((x0 + x1) / 2 - 3.5, az);
        addDumpster((x0 + x1) / 2 + 5.5, az, 0.4);
      }
    }
  }

  function addDumpster(x, z, rot = 0) {
    const dump = new THREE.Group();
    dump.position.set(x, 0, z);
    dump.rotation.y = rot;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 1.05), solid(0x24362c, 0.7));
    body.position.y = WALK_TOP + 0.7;
    body.castShadow = true;
    dump.add(body);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.08, 1.12), solid(0x1c2c24, 0.55));
    lid.position.y = WALK_TOP + 1.3;
    lid.rotation.x = -0.15;
    dump.add(lid);
    group.add(dump);
    colliders.push({ minX: x - 0.9, maxX: x + 0.9, minZ: z - 0.6, maxZ: z + 0.6 });
  }

  function addLamp(x, z, roadX, roadZ) {
    const dx = roadX - x;
    const dz = roadZ - z;
    const len = Math.hypot(dx, dz) || 1;
    const ux = dx / len;
    const uz = dz / len;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.5, 6), metal);
    pole.position.set(x, WALK_TOP + 2.25, z);
    pole.castShadow = true;
    group.add(pole);
    const arm = box(Math.abs(ux) > 0.5 ? 0.85 : 0.08, 0.06, Math.abs(uz) > 0.5 ? 0.85 : 0.08, metal, x + ux * 0.38, WALK_TOP + 4.45, z + uz * 0.38, { cast: true });
    arm.receiveShadow = false;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.22), glow(0xffe6b0, 0.45));
    head.position.set(x + ux * 0.72, WALK_TOP + 4.32, z + uz * 0.72);
    if (Math.abs(ux) > 0.5) head.rotation.y = Math.PI / 2;
    group.add(head);
  }

  function hillSpec() {
    return MAP.hill;
  }

  function groundHeight(x, z) {
    const h = hillSpec();
    if (!h) return 0;
    const half = ROAD_W / 2 + WALK;
    const { roadX, zLow, zHigh, rise, taper } = h;
    const zNorth = zHigh - ROAD_W;
    if (Math.abs(x - roadX) <= half && z <= zLow && z >= zHigh) {
      return rise * (zLow - z) / (zLow - zHigh);
    }
    if (Math.abs(x - roadX) <= half && z <= zHigh && z >= zNorth) return rise;
    if (Math.abs(x - roadX) <= half && z < zNorth && z >= zNorth - taper) {
      return rise * (1 - (zNorth - z) / taper);
    }
    const limit = x < roadX ? (h.west ?? taper) : taper;
    const dist = Math.abs(x - roadX);
    if (Math.abs(z - h.zTop) <= ROAD_W / 2 && dist > half && dist <= limit) {
      return rise * (1 - (dist - half) / (limit - half));
    }
    if (h.pad && x >= h.pad.minX && x <= h.pad.maxX && z >= h.pad.minZ && z <= h.pad.maxZ) {
      return h.pad.y;
    }
    return 0;
  }

  function hillCovers(x, z) {
    const h = hillSpec();
    if (!h) return false;
    const half = ROAD_W / 2 + WALK + 0.6;
    const { roadX, zLow, zHigh, taper } = h;
    const zNorth = zHigh - ROAD_W;
    const onApproach = Math.abs(x - roadX) <= half && z <= zLow + 0.5 && z >= zNorth - taper - 0.5;
    const onArms = Math.abs(z - h.zTop) <= half && Math.abs(x - roadX) <= taper + 0.5;
    return onApproach || onArms;
  }

  function addRamp(x, zSouth, zNorth, width, ySouth, yNorth, mat) {
    const run = zSouth - zNorth;
    const rise = yNorth - ySouth;
    const len = Math.hypot(run, rise);
    const pitch = Math.atan2(rise, run);
    const thickness = 0.32;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, len), mat);
    mesh.rotation.x = pitch;
    mesh.position.set(x, (ySouth + yNorth) / 2 - (thickness / 2) * Math.cos(pitch), (zSouth + zNorth) / 2);
    mesh.receiveShadow = true;
    group.add(mesh);
    const heading = 0;
    for (let z = zNorth + 2.4; z < zSouth - 1.2; z += 5.2) {
      const y = yNorth + (ySouth - yNorth) * ((z - zNorth) / run);
      stripes.push({ x, z, sx: 0.16, sz: 1.6, rot: heading, y: y + 0.04 });
    }
  }

  function addHill() {
    const h = hillSpec();
    if (!h) return;
    const { roadX, zLow, zHigh, rise, taper } = h;
    const zNorth = zHigh - ROAD_W;
    const half = ROAD_W / 2;
    const walkOff = half + WALK / 2;
    addRamp(roadX, zLow, zHigh, ROAD_W, ROAD_TOP, ROAD_TOP + rise, asphaltMat);
    addRamp(roadX - walkOff, zLow, zHigh, WALK, WALK_TOP, WALK_TOP + rise, walkMat);
    addRamp(roadX + walkOff, zLow, zHigh, WALK, WALK_TOP, WALK_TOP + rise, walkMat);
    box(ROAD_W, 0.32, ROAD_W, asphaltMat, roadX, rise + ROAD_TOP - 0.16, h.zTop, { receive: true });
    addRamp(roadX, zNorth, zNorth - taper, ROAD_W, ROAD_TOP + rise, ROAD_TOP, asphaltMat);
    addRamp(roadX - walkOff, zNorth, zNorth - taper, WALK, WALK_TOP + rise, WALK_TOP, walkMat);
    addRamp(roadX + walkOff, zNorth, zNorth - taper, WALK, WALK_TOP + rise, WALK_TOP, walkMat);
    // Sidewalks on the approach and on the far slope, so people walk the hill.
    for (const side of [-1, 1]) {
      const wx = roadX + side * walkOff;
      walkways.push(
        { x0: wx, z0: zLow, x1: wx, z1: zHigh },
        { x0: wx, z0: zNorth, x1: wx, z1: zNorth - taper },
      );
    }
    for (const side of [-1, 1]) {
      const armReach = side < 0 ? (h.west ?? taper) : taper;
      const x0 = roadX + side * half;
      const x1 = roadX + side * armReach;
      const len = Math.abs(x1 - x0);
      const pitch = Math.atan2(rise, armReach - half);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.32, ROAD_W), asphaltMat);
      deck.rotation.z = -side * pitch;
      deck.position.set((x0 + x1) / 2, rise / 2 + ROAD_TOP - 0.16 * Math.cos(pitch), h.zTop);
      deck.receiveShadow = true;
      group.add(deck);
      const walk = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, WALK), walkMat);
      walk.rotation.z = -side * pitch;
      walk.position.set((x0 + x1) / 2, rise / 2 + WALK_TOP - 0.1, h.zTop + walkOff);
      walk.receiveShadow = true;
      group.add(walk);
      const walk2 = walk.clone();
      walk2.position.z = h.zTop - walkOff;
      group.add(walk2);
    }
    if (h.pad) {
      const pad = h.pad;
      const w = pad.maxX - pad.minX;
      const d = pad.maxZ - pad.minZ;
      box(w, pad.y, d, solid(0x3e3a34, 1), (pad.minX + pad.maxX) / 2, pad.y / 2, (pad.minZ + pad.maxZ) / 2, { receive: true });
    }
    roads.push({ x: roadX, z: (zLow + zNorth - taper) / 2, w: ROAD_W, d: zLow - (zNorth - taper) });
  }

  // A clockwise lane loop around one city block. All four sides are drivable
  // road spans, and the loops of neighbouring blocks give two-way traffic.
  function addTrafficLoops() {
    const lane = ROAD_W / 4 - 0.7;
    const radius = 4.2;
    const arcSteps = 6;
    const dirs = [
      { x: 1, z: 0 },
      { x: 0, z: 1 },
      { x: -1, z: 0 },
      { x: 0, z: -1 },
    ];
    for (const block of MAP.blocks) {
      const { col, row } = block;
      if (!intersections.has(`${col}:${row}`)
        || !intersections.has(`${col + 1}:${row}`)
        || !intersections.has(`${col}:${row + 1}`)
        || !intersections.has(`${col + 1}:${row + 1}`)) continue;
      if (!fullSpans.has(`H:${col}:${row}`)
        || !fullSpans.has(`H:${col}:${row + 1}`)
        || !fullSpans.has(`V:${col}:${row}`)
        || !fullSpans.has(`V:${col + 1}:${row}`)) continue;

      const xL = ROADS_X[col];
      const xR = ROADS_X[col + 1];
      const zN = ROADS_Z[row];
      const zS = ROADS_Z[row + 1];
      if (xR - xL < lane * 2 + radius * 2 + 4) continue;
      if (zS - zN < lane * 2 + radius * 2 + 4) continue;

      const corners = [
        { x: xL + lane, z: zN + lane },
        { x: xR - lane, z: zN + lane },
        { x: xR - lane, z: zS - lane },
        { x: xL + lane, z: zS - lane },
      ];
      const points = [];
      for (let i = 0; i < 4; i += 1) {
        const corner = corners[i];
        const prev = dirs[(i + 3) % 4];
        const dir = dirs[i];
        const start = {
          x: corner.x - prev.x * radius,
          z: corner.z - prev.z * radius,
        };
        const end = {
          x: corner.x + dir.x * radius,
          z: corner.z + dir.z * radius,
        };
        points.push(start);
        for (let k = 1; k <= arcSteps; k += 1) {
          const t = k / arcSteps;
          const mt = 1 - t;
          points.push({
            x: mt * mt * start.x + 2 * mt * t * corner.x + t * t * end.x,
            z: mt * mt * start.z + 2 * mt * t * corner.z + t * t * end.z,
          });
        }
      }
      points.push({ ...points[0] });
      const cum = [0];
      for (let i = 1; i < points.length; i += 1) {
        cum.push(cum[i - 1] + Math.hypot(
          points[i].x - points[i - 1].x,
          points[i].z - points[i - 1].z,
        ));
      }
      trafficLoops.push({ points, cum, total: cum[cum.length - 1] });
    }
  }

  function buildRoads() {
    const half = ROAD_W / 2;
    const onLand = (x, z) => insidePolygon(x, z, MAP.island) && !hillCovers(x, z);
    const spans = (sample) => {
      const steps = 32;
      const found = [];
      let start = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        if (sample(t)) {
          if (start == null) start = t;
        } else if (start != null) {
          found.push([start, t]);
          start = null;
        }
      }
      if (start != null) found.push([start, 1]);
      return found;
    };

    ROADS_X.forEach((x, col) => {
      ROADS_Z.forEach((z, row) => {
        if (!onLand(x, z)) return;
        intersections.add(`${col}:${row}`);
        addAsphalt(x, z, ROAD_W, ROAD_W);
        const o = half + WALK / 2;
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) addWalk(x + sx * o, z + sz * o, WALK, WALK);
        }
        addCrosswalk(x, z, half);
        // Links between the four corners, so the crowd can cross a road.
        walkways.push(
          { x0: x - o, z0: z - o, x1: x + o, z1: z - o, crossing: true },
          { x0: x - o, z0: z + o, x1: x + o, z1: z + o, crossing: true },
          { x0: x - o, z0: z - o, x1: x - o, z1: z + o, crossing: true },
          { x0: x + o, z0: z - o, x1: x + o, z1: z + o, crossing: true },
        );
      });
    });
    ROADS_Z.forEach((z, row) => {
      for (let i = 0; i < ROADS_X.length - 1; i++) {
        const a = ROADS_X[i] + half;
        const b = ROADS_X[i + 1] - half;
        for (const [t0, t1] of spans((t) => onLand(a + (b - a) * t, z))) {
          const x0 = a + (b - a) * t0;
          const x1 = a + (b - a) * t1;
          if (x1 - x0 < 6) continue;
          if (t0 <= 0 && t1 >= 1) fullSpans.add(`H:${i}:${row}`);
          addAsphalt((x0 + x1) / 2, z, x1 - x0, ROAD_W);
          addWalk((x0 + x1) / 2, z - half - WALK / 2, x1 - x0, WALK);
          addWalk((x0 + x1) / 2, z + half + WALK / 2, x1 - x0, WALK);
          // Extend into the corner pads at real intersections; a partial span
          // that ends at the shore is a dead end on the graph.
          const wx0 = t0 <= 0 ? ROADS_X[i] + half + WALK / 2 : x0;
          const wx1 = t1 >= 1 ? ROADS_X[i + 1] - half - WALK / 2 : x1;
          walkways.push(
            { x0: wx0, z0: z - half - WALK / 2, x1: wx1, z1: z - half - WALK / 2 },
            { x0: wx0, z0: z + half + WALK / 2, x1: wx1, z1: z + half + WALK / 2 },
          );
          addDashes(x0, x1, z, 'x');
          for (let t = x0 + 12; t < x1 - 6; t += 26) {
            addLamp(t, z - half - WALK / 2, t, z);
            addLamp(t, z + half + WALK / 2, t, z);
          }
        }
      }
    });
    ROADS_X.forEach((x, col) => {
      for (let i = 0; i < ROADS_Z.length - 1; i++) {
        const a = ROADS_Z[i] + half;
        const b = ROADS_Z[i + 1] - half;
        for (const [t0, t1] of spans((t) => onLand(x, a + (b - a) * t))) {
          const z0 = a + (b - a) * t0;
          const z1 = a + (b - a) * t1;
          if (z1 - z0 < 6) continue;
          if (t0 <= 0 && t1 >= 1) fullSpans.add(`V:${col}:${i}`);
          addAsphalt(x, (z0 + z1) / 2, ROAD_W, z1 - z0);
          addWalk(x - half - WALK / 2, (z0 + z1) / 2, WALK, z1 - z0);
          addWalk(x + half + WALK / 2, (z0 + z1) / 2, WALK, z1 - z0);
          const wz0 = t0 <= 0 ? ROADS_Z[i] + half + WALK / 2 : z0;
          const wz1 = t1 >= 1 ? ROADS_Z[i + 1] - half - WALK / 2 : z1;
          walkways.push(
            { x0: x - half - WALK / 2, z0: wz0, x1: x - half - WALK / 2, z1: wz1 },
            { x0: x + half + WALK / 2, z0: wz0, x1: x + half + WALK / 2, z1: wz1 },
          );
          addDashes(z0, z1, x, 'z');
          for (let t = z0 + 14; t < z1 - 6; t += 28) {
            addLamp(x - half - WALK / 2, t, x, t);
            addLamp(x + half + WALK / 2, t, x, t);
          }
        }
      }
    });
  }

  function addDashes(a, b, fixed, axis) {
    for (let t = a + 2.2; t < b - 1.2; t += 5.2) {
      if (axis === 'x') stripes.push({ x: t, z: fixed, sx: 1.7, sz: 0.16 });
      else stripes.push({ x: fixed, z: t, sx: 0.16, sz: 1.7 });
    }
  }

  function addCrosswalk(cx, cz, half) {
    const count = 5;
    const gap = 0.85;
    const span = (count - 1) * gap;
    for (let i = 0; i < count; i++) {
      const o = -span / 2 + i * gap;
      stripes.push({ x: cx + o, z: cz - half + 0.85, sx: 0.42, sz: 1.5 });
      stripes.push({ x: cx + o, z: cz + half - 0.85, sx: 0.42, sz: 1.5 });
      stripes.push({ x: cx - half + 0.85, z: cz + o, sx: 1.5, sz: 0.42 });
      stripes.push({ x: cx + half - 0.85, z: cz + o, sx: 1.5, sz: 0.42 });
    }
  }

  function commitStripes() {
    if (!stripes.length) return;
    const geo = new THREE.BoxGeometry(1, 0.025, 1);
    const mesh = new THREE.InstancedMesh(geo, solid(0xddd8cc, 0.75), stripes.length);
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    stripes.forEach((s, i) => {
      euler.set(0, s.rot ?? 0, 0);
      q.setFromEuler(euler);
      m.compose(
        new THREE.Vector3(s.x, s.y ?? ROAD_TOP + 0.02, s.z),
        q,
        new THREE.Vector3(s.sx, 1, s.sz),
      );
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  function segmentFrame(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const heading = Math.atan2(dx, dz);
    return {
      len,
      heading,
      x: (x0 + x1) / 2,
      z: (z0 + z1) / 2,
      px: Math.cos(heading),
      pz: -Math.sin(heading),
    };
  }

  function addRibbon(points, width, opts = {}) {
    const thickness = opts.thickness ?? ROAD_TOP;
    const surface = opts.surface ?? ROAD_TOP;
    const mat = opts.mat ?? asphaltMat;
    const quads = [];
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, z0] = points[i];
      const [x1, z1] = points[i + 1];
      const frame = segmentFrame(x0, z0, x1, z1);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, frame.len), mat);
      mesh.position.set(frame.x, surface - thickness / 2, frame.z);
      mesh.rotation.y = frame.heading;
      mesh.receiveShadow = true;
      mesh.castShadow = !!opts.cast;
      group.add(mesh);
      roads.push({ x: frame.x, z: frame.z, w: width, d: frame.len, rot: frame.heading });
      if (opts.walk) {
        const off = width / 2 + WALK / 2;
        for (const side of [-1, 1]) {
          const walkMesh = new THREE.Mesh(new THREE.BoxGeometry(WALK, WALK_TOP, frame.len), walkMat);
          walkMesh.position.set(
            frame.x + frame.px * off * side,
            WALK_TOP / 2,
            frame.z + frame.pz * off * side,
          );
          walkMesh.rotation.y = frame.heading;
          walkMesh.receiveShadow = true;
          group.add(walkMesh);
        }
      }
      if (opts.rails) {
        const off = width / 2 - 0.45;
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.05, frame.len), concrete);
          rail.position.set(
            frame.x + frame.px * off * side,
            surface + 0.5,
            frame.z + frame.pz * off * side,
          );
          rail.rotation.y = frame.heading;
          rail.castShadow = true;
          group.add(rail);
        }
      }
      for (let t = 2.2; t < frame.len - 1.2; t += 5.2) {
        const along = t - frame.len / 2;
        stripes.push({
          x: frame.x + Math.sin(frame.heading) * along,
          z: frame.z + Math.cos(frame.heading) * along,
          sx: 0.16,
          sz: 1.6,
          rot: frame.heading,
          y: surface + 0.02,
        });
      }
      const half = width / 2;
      quads.push([
        [x0 + frame.px * half, z0 + frame.pz * half],
        [x1 + frame.px * half, z1 + frame.pz * half],
        [x1 - frame.px * half, z1 - frame.pz * half],
        [x0 - frame.px * half, z0 - frame.pz * half],
      ]);
    }
    return quads;
  }

  function addShape(points, y, color) {
    const shape = new THREE.Shape();
    points.forEach(([x, z], index) => {
      const sx = x;
      const sy = -z;
      if (index === 0) shape.moveTo(sx, sy);
      else shape.lineTo(sx, sy);
    });
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  function addTree(x, z, scale = 1) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.16 * scale, 1.3 * scale, 6), solid(0x5a4030, 0.9));
    trunk.position.set(x, groundHeight(x, z) + WALK_TOP + 0.65 * scale, z);
    trunk.castShadow = true;
    group.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.05 * scale, 8, 6), solid(0x2e4632, 0.95));
    crown.position.set(x, groundHeight(x, z) + WALK_TOP + 1.9 * scale, z);
    crown.castShadow = true;
    group.add(crown);
  }

  function addHydrant(x, z) {
    const hydrant = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.48, 8), solid(0x8d2a24, 0.55));
    hydrant.position.set(x, groundHeight(x, z) + WALK_TOP + 0.3, z);
    group.add(hydrant);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), solid(0xb7b2a8, 0.4, 0.4));
    cap.position.set(x, groundHeight(x, z) + WALK_TOP + 0.58, z);
    group.add(cap);
  }

  function addTrash(x, z) {
    for (let i = 0; i < 3; i++) {
      const bag = new THREE.Mesh(new THREE.SphereGeometry(0.18 + (i % 2) * 0.05, 6, 5), solid(0x2a2c28, 0.85));
      bag.position.set(x + i * 0.28, groundHeight(x, z) + WALK_TOP + 0.16, z + (i - 1) * 0.12);
      bag.scale.y = 0.8;
      group.add(bag);
    }
  }

  function addSaveMarker(x, z) {
    const marker = new THREE.Group();
    marker.position.set(x, groundHeight(x, z) + WALK_TOP + 0.03, z);
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 20),
      new THREE.MeshStandardMaterial({ color: 0x9ad7e4, emissive: 0x1a6070, emissiveIntensity: 0.45, roughness: 0.4 }),
    );
    pad.rotation.x = -Math.PI / 2;
    marker.add(pad);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.07, 8, 28),
      glow(0x7fe7ff, 1.1),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.28;
    marker.add(ring);
    group.add(marker);
    markers.push(marker);
  }

  function addEl() {
    const { x, z0, z1, deckY, pillarSpacing } = MAP.elevated;
    const deck = box(4.6, 0.48, z1 - z0, concrete, x, deckY, (z0 + z1) / 2, { cast: true });
    deck.receiveShadow = true;
    box(4.8, 0.7, z1 - z0, solid(0x6a675f, 0.9), x, deckY - 0.45, (z0 + z1) / 2, { cast: true });
    box(0.18, 0.55, z1 - z0, metal, x - 1.7, deckY + 0.45, (z0 + z1) / 2);
    box(0.18, 0.55, z1 - z0, metal, x + 1.7, deckY + 0.45, (z0 + z1) / 2);
    for (let z = z0; z <= z1; z += pillarSpacing) {
      box(1.15, deckY - 0.2, 1.15, concrete, x, (deckY - 0.2) / 2, z, { cast: true });
      colliders.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7 });
    }
    const train = new THREE.Group();
    train.position.set(x, deckY + 0.24 + 1.05, -10);
    const carMat = solid(0x5c656c, 0.55, 0.2);
    const stripe = solid(0xb4532a, 0.6);
    for (const oz of [-4.2, 4.2]) {
      const car = new THREE.Mesh(new THREE.BoxGeometry(3.15, 2.05, 7.4), carMat);
      car.position.z = oz;
      car.castShadow = true;
      train.add(car);
      const band = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.28, 7.4), stripe);
      band.position.set(0, -0.15, oz);
      train.add(band);
      for (let k = -2; k <= 2; k++) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.9), windowMat);
        win.position.set(1.6, 0.35, oz + k * 1.2);
        train.add(win);
      }
    }
    group.add(train);
    return { x, z0, z1, train, deckTop: deckY + 0.24 };
  }

  function addWaterfront() {
    const spec = MAP.water;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(spec.w, spec.d),
      new THREE.MeshStandardMaterial({ color: 0x1c3338, roughness: 0.22, metalness: 0.08 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(spec.x, spec.y, spec.z);
    group.add(water);
  }

  function addBridge() {
    const spec = MAP.bridge;
    const deck = addRibbon(spec.points, spec.width, { rails: true, surface: ROAD_TOP + 0.02 });
    for (let i = 1; i < spec.points.length - 1; i++) {
      const [x, z] = spec.points[i];
      const prev = spec.points[i - 1];
      const next = spec.points[i + 1];
      const frame = segmentFrame(prev[0], prev[1], next[0], next[1]);
      const tower = new THREE.Group();
      tower.position.set(x, 0, z);
      tower.rotation.y = frame.heading;
      const off = spec.width / 2 + 1.4;
      for (const side of [-1, 1]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(1.8, 22, 1.8), concrete);
        pier.position.set(off * side, 6.2, 0);
        pier.castShadow = true;
        tower.add(pier);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 8, 1.1, 1.5), solid(0x9aa098, 0.55, 0.35));
      beam.position.set(0, 16.4, 0);
      beam.castShadow = true;
      tower.add(beam);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 2, 0.35, 0.35), metal);
      brace.position.set(0, 12.2, 0);
      tower.add(brace);
      group.add(tower);
    }
    return deck;
  }

  function addGate() {
    const { x, z } = MAP.gate;
    const red = solid(0x7c2f2c, 0.7);
    const gold = solid(0xc6a15e, 0.45, 0.25);
    for (const s of [-1, 1]) {
      const px = x + s * 6.4;
      box(1.15, 5.4, 1.15, red, px, 2.7, z, { cast: true });
      box(1.35, 0.28, 1.35, gold, px, 5.5, z, { cast: true });
      colliders.push({ minX: px - 0.7, maxX: px + 0.7, minZ: z - 0.7, maxZ: z + 0.7 });
    }
    box(14.2, 0.7, 1.25, red, x, 5.15, z, { cast: true });
    box(9.2, 0.85, 1.35, gold, x, 6.0, z, { cast: true });
    const approach = MAP.gate.approach;
    addAsphalt(x, z, approach.w, approach.d);
  }

  function addBounds() {
    for (const wall of MAP.bounds ?? []) colliders.push({ ...wall });
  }

  const deck = [];
  buildRoads();
  addTrafficLoops();
  if (MAP.hill?.pad) {
    const h = MAP.hill;
    h.pad.y = h.rise * (h.zLow - h.pad.doorZ) / (h.zLow - h.zHigh);
  }
  addHill();
  for (const road of MAP.diagonals ?? []) {
    addRibbon(road.points, road.width ?? ROAD_W, { walk: true });
  }
  if (MAP.bridge) deck.push(...addBridge());
  commitStripes();
  fillBlocks();
  addShape(MAP.island, 0, 0x3e3a34);
  if (MAP.beach) addShape(MAP.beach, 0.03, 0xc6b48a);
  if (MAP.landing) addShape(MAP.landing, 0.02, 0x4a463c);
  addWaterfront();
  const el = addEl();
  addGate();
  addBounds();
  const walkable = [MAP.island, ...deck];
  if (MAP.landing) walkable.push(MAP.landing);
  for (const ring of walkable) colliders.push({ keepInside: ring });

  if (MAP.safehouse) {
    const spec = MAP.safehouse;
    const doorX = spec.x - spec.d / 2;
    const doorZ = spec.z;
    addHouse({
      x: spec.x,
      z: spec.z,
      w: spec.w,
      d: spec.d,
      floors: spec.floors,
      face: spec.face,
      color: colorOf(spec.color),
      fireEscape: true,
      safehouse: true,
      seed: 7,
      baseY: MAP.hill?.pad?.y ?? 0,
      doorX,
      doorZ,
    });
  }

  if (!safehouse) throw new Error('safehouse missing');

  const doorX = safehouse.doorX;
  const doorZ = safehouse.doorZ;
  for (const prop of MAP.safehouseProps) {
    const x = doorX - (prop.dz ?? 0);
    const z = doorZ + (prop.dx ?? 0);
    if (prop.type === 'marker') addSaveMarker(x, z);
    else if (prop.type === 'hydrant') addHydrant(x, z);
    else if (prop.type === 'trash') addTrash(x, z);
  }

  for (const tree of MAP.trees) {
    addTree(placeX(tree, 0), placeZ(tree, 0), tree.scale ?? 1);
  }

  const vehicles = [];

  function placeVehicle(vehicle, x, z, heading) {
    const ahead = 3;
    vehicle.x = x;
    vehicle.z = z;
    vehicle.heading = heading;
    vehicle.y = groundHeight(x, z);
    const nose = groundHeight(
      x + Math.sin(heading) * ahead,
      z + Math.cos(heading) * ahead,
    );
    vehicle.pitch = -Math.atan2(nose - vehicle.y, ahead);
    vehicle.sync();
    return vehicle;
  }

  function addVehicle(cfg) {
    const vehicle = createVehicle({ ...cfg, color: colorOf(cfg.color) });
    placeVehicle(vehicle, cfg.x, cfg.z, cfg.heading ?? 0);
    group.add(vehicle.group);
    vehicles.push(vehicle);
    return vehicle;
  }

  for (const spot of MAP.vehicles) {
    const vehicle = addVehicle({
      x: placeX(spot, 0),
      z: placeZ(spot, 0),
      heading: deg(spot.heading),
      type: spot.type,
      color: spot.color,
      driveable: !!spot.driveable,
    });
    // Every parked vehicle is solid; the one being driven is removed from the
    // collider list by the game.
    colliders.push(vehicle.collider());
  }

  const pedestrians = MAP.pedestrians.map((spec) => ({
    x: placeX(spec, 0),
    z: placeZ(spec, 0),
    heading: deg(spec.heading),
    speed: spec.speed,
    shirt: colorOf(spec.shirt),
    pants: colorOf(spec.pants),
    cap: spec.cap ? colorOf(spec.cap) : undefined,
    path: spec.path.map((point) => ({
      x: placeX(point, 0),
      z: placeZ(point, 0),
    })),
  }));

  const spawn = {
    x: doorX - 2.4,
    z: doorZ,
    heading: Math.PI / 2,
  };

  let trainZ = MAP.train.startZ;
  let trainDir = 1;

  return {
    group,
    colliders,
    buildings,
    roads,
    vehicles,
    pedestrians,
    walkways,
    trafficLoops,
    spawn,
    safehouse,
    ground: groundHeight,
    el: { x: el.x, z0: el.z0, z1: el.z1 },
    shore: MAP.island,
    beach: MAP.beach,
    landing: MAP.landing,
    deck,
    water: { x: MAP.water.x, z: MAP.water.z, w: MAP.water.w, d: MAP.water.d },
    spawnVehicle(cfg) {
      return addVehicle(cfg);
    },
    update(dt) {
      for (const marker of markers) marker.rotation.y += dt * 1.3;
      trainZ += trainDir * MAP.train.speed * dt;
      if (trainZ > MAP.train.maxZ) trainDir = -1;
      if (trainZ < MAP.train.minZ) trainDir = 1;
      el.train.position.z = trainZ;
    },
    reset() {
      trainZ = MAP.train.startZ;
      trainDir = 1;
      el.train.position.z = trainZ;
    },
  };
}
