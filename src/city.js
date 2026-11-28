import * as THREE from 'three';
import {
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
} from './config.js';
import { solid, windowMat } from './materials.js';
import { buildingHeight, createBuilding } from './building.js';
import { insidePolygon } from './collision.js';
import { buildDumpster, buildHydrant, buildLamp, buildTrash, buildTree } from './props.js';
import { ColliderList } from './spatial.js';
import { createTerrain, surfaceAreas } from './terrain.js';
import { buildFeatureMeshes, createLandform, flat, ramp, slope } from './landform.js';
import { createVehicle } from './vehicle.js';

const SIGNS = MAP.signs;

// How far the ends of the hill's climbs are rounded off, in metres. A climb
// that starts and stops at full grade meets the flat ground at a crease; this
// is how much of each end is spent easing the grade in and out instead.
const HILL_EASE = 8;
// The arms are shorter and steeper, so they get a shorter round.
const ARM_EASE = 3;

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
  const colliders = new ColliderList();
  // The street furniture a car can throw out of the way. The game hands these
  // to the physics engine, which does the throwing.
  const knockables = [];
  const buildings = [];
  const roads = [];
  // The ground types laid over the map: roads, pavements, and whatever the
  // map itself names. terrain.js answers with these.
  const surfaces = [];
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
    // A road is asphalt to drive on, and it is a rectangle, so the surface
    // query is a handful of comparisons rather than a point in a polygon.
    surfaces.push({
      kind: 'asphalt',
      rect: { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 },
    });
  }

  function addWalk(x, z, w, d) {
    box(w, WALK_TOP, d, walkMat, x, WALK_TOP / 2, z, { receive: true });
    surfaces.push({
      kind: 'walk',
      rect: { minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 },
    });
  }

  // The building itself lives in building.js so the collection gallery can
  // show samples; the city places it and keeps the collider bookkeeping.
  function addHouse(opts) {
    const { x, z, w, d, face, shop, style, safehouse: isSafe } = opts;
    const height = buildingHeight(opts);
    const sign = style !== 'industrial' && shop ? SIGNS[shopCount++ % SIGNS.length] : null;
    group.add(createBuilding({ ...opts, sign }));

    const swap = face === 'east' || face === 'west';
    const hw = (swap ? d : w) / 2;
    const hd = (swap ? w : d) / 2;
    const bounds = { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
    if (face === 'south') bounds.maxZ += 0.25;
    if (face === 'north') bounds.minZ -= 0.25;
    colliders.push(bounds);
    buildings.push({
      x,
      z,
      w: hw * 2,
      d: hd * 2,
      safehouse: !!isSafe,
      kind: style ?? 'house',
      top: (opts.baseY ?? 0) + height,
    });

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

  // Hand-placed buildings, like the safehouse: the map data gives a spot on a
  // street frontage and the same building builder does the rest.
  function addPlacedBuilding(spec, style) {
    const { x, z, w, d, face, color } = spec;
    const baseY = groundHeight(x, z);
    const house = createBuilding({
      ...spec,
      style,
      color: color == null ? undefined : colorOf(color),
      baseY,
    });
    group.add(house);

    const swap = face === 'east' || face === 'west';
    const hw = (swap ? d : w) / 2;
    const hd = (swap ? w : d) / 2;
    const bounds = { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
    if (face === 'south') bounds.maxZ += 0.25;
    if (face === 'north') bounds.minZ -= 0.25;
    colliders.push(bounds);
    buildings.push({
      x,
      z,
      w: hw * 2,
      d: hd * 2,
      kind: style,
      top: baseY + buildingHeight({ ...spec, style }),
    });
  }

  function addStore(spec) {
    addPlacedBuilding(spec, 'store');
  }

  // Hospitals and police stations are placed the same way; the entry's `type`
  // picks the building style.
  function addLandmark(spec) {
    addPlacedBuilding(spec, spec.type);
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
    const { group: dump, collider, body } = buildDumpster({ x, z, rot });
    dump.position.y = WALK_TOP + groundHeight(x, z);
    group.add(dump);
    colliders.push(collider);
    if (body) knockables.push({ group: dump, collider, spec: body });
  }

  function addLamp(x, z, roadX, roadZ) {
    const dx = roadX - x;
    const dz = roadZ - z;
    const len = Math.hypot(dx, dz) || 1;
    // The arm leans over the road, so the post turns to face it.
    const rot = Math.atan2(-dz / len, dx / len);
    const { group: lamp, collider, body, light, mesh } = buildLamp({ x, z, rot });
    lamp.position.y = WALK_TOP + groundHeight(x, z);
    group.add(lamp);
    colliders.push(collider);
    // A post is bolted down: it does not fly, it falls over, and the live
    // cable in it sparks once it is down. The lamp head is carried with the
    // prop so the sparks come out of the end that is on the ground.
    if (body) {
      knockables.push({
        group: lamp,
        collider,
        spec: body,
        light,
        mesh,
      });
    }
  }

  function hillSpec() {
    return MAP.hill;
  }

  // The hill, as pieces of ground.
  //
  // Each piece says how high the ground is at its four corners, and that same
  // description draws the mesh. Before this, the height was a chain of ifs and
  // the mesh was a set of hand-rotated boxes, and they had drifted apart: the
  // east arm's deck was drawn as one straight slope while the ground under it
  // stayed level for its first three metres, so the road and the ground a car
  // stood on were nearly a metre apart.
  //
  // The pieces cover the hill without overlapping, so the order they are in
  // does not matter: the way up, the top, the way down, and the two arms.
  function hillFeatures() {
    const h = hillSpec();
    if (!h) return [];
    const { roadX, zLow, zHigh, rise, taper } = h;
    const zTop = h.zTop;
    const zNorth = zHigh - ROAD_W;
    const hw = ROAD_W / 2 + WALK;
    const westReach = h.west ?? taper;
    const out = [];

    // The way up, from the level of the street to the top. Its ends are
    // rounded so the grade eases in from the flat street and out onto the top
    // instead of folding sharply at both seams.
    out.push(ramp({
      axis: 'z',
      from: zLow, to: zHigh,
      cross0: roadX - hw, cross1: roadX + hw,
      y0: 0, y1: rise,
      ease: HILL_EASE,
      opts: { material: 'hill', skirt: -0.1 },
    }));

    // The top, between the top of the climb and the start of the far side.
    out.push(flat(
      roadX - hw, zNorth,
      roadX + hw, zHigh,
      rise, { material: 'hill', skirt: -0.1 },
    ));

    // The way down on the far side.
    out.push(ramp({
      axis: 'z',
      from: zNorth, to: zNorth - taper,
      cross0: roadX - hw, cross1: roadX + hw,
      y0: rise, y1: 0,
      ease: HILL_EASE,
      opts: { material: 'hill', skirt: -0.1 },
    }));

    // The two arms, which run out sideways from the top along the cross road.
    // They are level along the road and fall away to nothing at their ends.
    // The two arms, which run out sideways from the top along the cross road.
    // They are level along the road and fall away to nothing at their ends,
    // and like the climb their ends are rounded so they meet the level top and
    // the flat ground at the bottom without a fold.
    const armZ0 = zTop - ROAD_W / 2;
    const armZ1 = zTop + ROAD_W / 2;
    const westArm = ramp({
      axis: 'x',
      from: roadX - hw, to: roadX - westReach,
      cross0: armZ0, cross1: armZ1,
      y0: rise, y1: 0,
      ease: ARM_EASE,
      opts: { material: 'hill', skirt: -0.1 },
    });
    const eastArm = ramp({
      axis: 'x',
      from: roadX + hw, to: roadX + taper,
      cross0: armZ0, cross1: armZ1,
      y0: rise, y1: 0,
      ease: ARM_EASE,
      opts: { material: 'hill', skirt: -0.1 },
    });
    out.push(westArm, eastArm);

    // The shelf the safehouse stands on. It is a piece of level ground set into
    // the way up, at the height the road has reached by its door, so the house
    // does not sit on a slope.
    if (h.pad) {
      const pad = h.pad;
      if (pad.y === undefined) {
        pad.y = rise * (zLow - pad.doorZ) / (zLow - zHigh);
      }
      out.push(flat(
        pad.minX, pad.minZ,
        pad.maxX, pad.maxZ,
        pad.y, { material: 'pad' },
      ));
    }

    return out;
  }

  // The ground of the hill, as one thing that answers where it is high.
  const hill = createLandform(hillFeatures());

  // The height of the ground, everywhere. The hill is the only ground that is
  // not level; everything else is the flat of the island.
  function groundHeight(x, z) {
    return hill.heightAt(x, z);
  }

  // Whether a point is on the hill, for the roads and walks that must not be
  // laid across it.
  function hillCovers(x, z) {
    return hill.covers(x, z);
  }

  // A strip of surface that follows the ground under it. `heightAt` is asked
  // along the strip and the strip is bent to it, so the surface a car drives on
  // and the ground it stands on are the same shape by construction: there is no
  // pitch worked out by hand for the mesh and a different one worked out for
  // the physics.
  //
  // `lateral` is how far off the centre line each side of the strip sits, so a
  // road and its two pavements can be laid as three strips and still follow the
  // same slope.
  function addRibbonOnGround(x, z0, z1, halfWidth, lift, mat, opts = {}) {
    const steps = Math.max(2, Math.ceil(Math.abs(z1 - z0) / 2));
    const positions = [];
    const uvs = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const z = z0 + (z1 - z0) * t;
      const y = groundHeight(x, z) + lift;
      positions.push(
        x - halfWidth, y, z,
        x + halfWidth, y, z,
      );
      uvs.push(0, t * Math.abs(z1 - z0) / 4, 1, t * Math.abs(z1 - z0) / 4);
    }
    const indices = [];
    for (let i = 0; i < steps; i += 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    // The underside is drawn too, so a strip bent over a crest does not show
    // daylight through it from below.
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: opts.color ?? 0x3a3d42,
      roughness: 0.96,
      side: THREE.DoubleSide,
    }));
    mesh.material.map = mat?.map ?? null;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function addHill() {
    const h = hillSpec();
    if (!h) return;
    const { roadX, zLow, zHigh, rise, taper } = h;
    const zNorth = zHigh - ROAD_W;
    const half = ROAD_W / 2;
    const walkOff = half + WALK / 2;
    const walkHalf = WALK / 2;
    const hw = half + WALK;

    // The ground of the hill itself, once, from the same description the height
    // comes from.
    const ground = buildFeatureMeshes(hill.features, {
      hill: new THREE.MeshStandardMaterial({ color: 0x3e3a34, roughness: 1, side: THREE.DoubleSide }),
      pad: solid(0x3e3a34, 1),
      ground: solid(0x3e3a34, 1),
    });
    group.add(ground);

    // The road and its pavements up the hill, and down the far side.
    addRibbonOnGround(roadX, zLow, zHigh, half, ROAD_TOP, asphaltMat, { color: 0x3a3d42 });
    addRibbonOnGround(roadX, zNorth, zNorth - taper, half, ROAD_TOP, asphaltMat, { color: 0x3a3d42 });
    for (const side of [-1, 1]) {
      const wx = roadX + side * walkOff;
      addRibbonOnGround(wx, zLow, zHigh, walkHalf, WALK_TOP, walkMat, { color: 0xa3988c });
      addRibbonOnGround(wx, zNorth, zNorth - taper, walkHalf, WALK_TOP, walkMat, { color: 0xa3988c });
    }
    // The cross road over the top. It is level, and only as long as the top
    // is: the arms beyond it fall away and are drawn by addArmOnGround, bent
    // to the ground. Drawing the whole cross road level here was what made the
    // road float above the falling ground of the arms.
    box(hw * 2, 0.3, ROAD_W, asphaltMat, roadX, rise + ROAD_TOP - 0.15, h.zTop, { receive: true });
    for (const side of [-1, 1]) {
      const wz = h.zTop + side * walkOff;
      box(hw * 2, 0.2, WALK, walkMat, roadX, rise + WALK_TOP - 0.1, wz, { receive: true });
    }

    // Lane markings up the climb, laid on the surface that was just bent.
    const heading = 0;
    for (let z = zHigh + 2.4; z < zLow - 1.2; z += 5.2) {
      stripes.push({ x: roadX, z, sx: 0.16, sz: 1.6, rot: heading, y: groundHeight(roadX, z) + ROAD_TOP + 0.04 });
    }
    for (let z = zNorth - 2.4; z > zNorth - taper + 1.2; z -= 5.2) {
      stripes.push({ x: roadX, z, sx: 0.16, sz: 1.6, rot: heading, y: groundHeight(roadX, z) + ROAD_TOP + 0.04 });
    }

    // The two arms, which run out sideways from the top along the cross road.
    for (const side of [-1, 1]) {
      const armReach = side < 0 ? (h.west ?? taper) : taper;
      const x0 = roadX + side * half;
      const x1 = roadX + side * armReach;
      addArmOnGround(x0, x1, h.zTop, ROAD_W / 2, ROAD_TOP, asphaltMat, 0x3a3d42);
      for (const s2 of [-1, 1]) {
        addArmOnGround(
          x0, x1,
          h.zTop + s2 * walkOff, walkHalf, WALK_TOP, walkMat, 0xa3988c,
        );
      }
    }

    // Sidewalks on the approach and on the far slope, so people walk the hill.
    for (const side of [-1, 1]) {
      const wx = roadX + side * walkOff;
      walkways.push(
        { x0: wx, z0: zLow, x1: wx, z1: zHigh },
        { x0: wx, z0: zNorth, x1: wx, z1: zNorth - taper },
      );
    }

    roads.push({ x: roadX, z: (zLow + zNorth - taper) / 2, w: ROAD_W, d: zLow - (zNorth - taper) });
  }

  // A strip running along X, bent to the ground under it, for the arms of the
  // cross road.
  function addArmOnGround(x0, x1, z, halfWidth, lift, mat, color) {
    const steps = Math.max(2, Math.ceil(Math.abs(x1 - x0) / 2));
    const positions = [];
    const uvs = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = groundHeight(x, z) + lift;
      positions.push(
        x, y, z - halfWidth,
        x, y, z + halfWidth,
      );
      const u = t * Math.abs(x1 - x0) / 4;
      uvs.push(u, 0, u, 1);
    }
    const indices = [];
    for (let i = 0; i < steps; i += 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color, roughness: 0.96, side: THREE.DoubleSide, map: mat?.map ?? null,
    }));
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
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
    const { group: tree, collider } = buildTree({ x, z, scale });
    tree.position.y = WALK_TOP + groundHeight(x, z);
    group.add(tree);
    colliders.push(collider);
  }

  function addHydrant(x, z) {
    const { group: hydrant, collider, body } = buildHydrant({ x, z });
    hydrant.position.y = WALK_TOP + groundHeight(x, z);
    group.add(hydrant);
    colliders.push(collider);
    if (body) knockables.push({ group: hydrant, collider, spec: body });
  }

  function addTrash(x, z) {
    const { group: trash, collider, body } = buildTrash({ x, z });
    trash.position.y = WALK_TOP + groundHeight(x, z);
    group.add(trash);
    colliders.push(collider);
    if (body) knockables.push({ group: trash, collider, spec: body });
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
  for (const store of MAP.stores ?? []) addStore(store);
  for (const landmark of MAP.landmarks ?? []) addLandmark(landmark);
  addShape(MAP.island, 0, 0x3e3a34);
  if (MAP.beach) addShape(MAP.beach, 0.03, 0xc6b48a);
  if (MAP.landing) addShape(MAP.landing, 0.02, 0x4a463c);
  // The sand is ground like any other now, not just a colour laid on top: a
  // car that drives onto it loses grip and bogs down. It goes to the front of
  // the list, because a beach is drawn over everything the city laid down and
  // the map says what is underfoot, not the rectangle a road happens to be.
  if (MAP.beach) surfaces.unshift({ kind: 'sand', ring: MAP.beach });
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
    if (prop.type === 'hydrant') addHydrant(x, z);
    else if (prop.type === 'trash') addTrash(x, z);
  }

  for (const tree of MAP.trees) {
    addTree(placeX(tree, 0), placeZ(tree, 0), tree.scale ?? 1);
  }

  const vehicles = [];

  function placeVehicle(vehicle, x, z, heading) {
    vehicle.x = x;
    vehicle.z = z;
    vehicle.heading = heading;
    // The terrain is not built yet while the map is being laid out, so a
    // parked car is stood on the raw height here; the first frame it is asked
    // about, the terrain takes over and leans it against the slope.
    vehicle.y = groundHeight(x, z);
    vehicle.groundRoll = 0;
    vehicle.pitch = 0;
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

  // The ground as one object. It answers with the height, which is what the
  // rest of the game asked for before, and with the lean and the material,
  // which is what a vehicle on a slope needs.
  //
  // Surfaces named by the map are searched before the roads and pavements the
  // city laid itself, so a map can put a patch of sand over a corner of road
  // and have it win.
  const terrain = createTerrain({
    height: groundHeight,
    kinds: [...surfaceAreas(MAP.surfaces), ...surfaces],
  });

  return {
    group,
    colliders,
    knockables,
    buildings,
    roads,
    vehicles,
    pedestrians,
    walkways,
    trafficLoops,
    spawn,
    safehouse,
    // The old name, kept because most of the game only ever wanted a height.
    ground: terrain.heightAt,
    terrain,
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
