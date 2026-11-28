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
import { solid } from './materials.js';
import { buildingHeight, createBuilding } from './building.js';
import { insidePolygon } from './collision.js';
import { buildDumpster, buildHydrant, buildLamp, buildTrash, buildTree } from './props.js';
import { ColliderList } from './spatial.js';
import { createTerrain, settleOnGround, surfaceAreas } from './terrain.js';
import { buildFeatureMeshes, createLandform, featuresFrom, flat, ramp, slope } from './landform.js';
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
  // The hill, as pieces of ground the map declares.
  //
  // Each entry in `hill.features` is one piece - a ramp, a flat shelf, a slope
  // through four corners - and `featuresFrom` turns it into the same builders
  // the rest of the ground uses. Adding a second hill, or reshaping this one, is
  // a change to the map and not to this file.
  //
  // The one kind the map cannot spell out is the shelf the safehouse stands on:
  // its height has to match the road at its door, so it is worked out here from
  // the hill it is cut into.
  function hillFeatures() {
    const h = hillSpec();
    if (!h) return [];
    const { zLow, zHigh, rise } = h;
    return featuresFrom(h.features ?? [], {
      pad(entry, opts) {
        const pad = h.pad;
        if (!pad) return null;
        // The height the road has reached by the door, so the house does not
        // sit on a slope.
        const y = rise * (zLow - pad.doorZ) / (zLow - zHigh);
        const r = entry.rect ?? [pad.minX, pad.minZ, pad.maxX, pad.maxZ];
        return flat(r[0], r[1], r[2], r[3], y, opts);
      },
    });
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

  // Walls along the edges of the hill, cut into pieces that each know how high
  // they are.
  //
  // The hill's edges are the four sides of the climb and of the far slope, plus
  // the two long sides of each arm. Along each one the ground on the hill
  // starts level with the ground outside it and rises: a piece of edge that is
  // only a few centimetres proud of the street is not a cliff and gets no wall
  // at all, and a piece five metres up does.
  //
  // A piece is a thin oriented box lying along the edge, with `minY` at the
  // outside ground and `maxY` at the hill's own height there. collision.js
  // skips a collider whose heights do not overlap the car's, which is what lets
  // the street beside the climb stay open where the climb is above it.
  function addHillSides(h) {
    const { roadX, zLow, zHigh, rise, taper } = h;
    const zNorth = zHigh - ROAD_W;
    const hw = ROAD_W / 2 + WALK;
    const westReach = h.west ?? taper;
    // How long one piece of edge is. Short enough that the height along it does
    // not vary much, long enough that there are not hundreds of them.
    const piece = 4;
    // How thin the wall is, either side of the line it follows.
    const thick = 0.35;

    // An edge running along Z, at a fixed x, from z0 to z1. `outside` is the
    // ground beside the hill, which for all of these is the level of the street.
    function edgeAlongZ(x, z0, z1, outside) {
      const dir = Math.sign(z1 - z0) || 1;
      const len = Math.abs(z1 - z0);
      const steps = Math.max(1, Math.ceil(len / piece));
      for (let i = 0; i < steps; i += 1) {
        const a = z0 + dir * (len * i) / steps;
        const b = z0 + dir * (len * (i + 1)) / steps;
        const mid = (a + b) / 2;
        const top = groundHeight(x, mid);
        if (top - outside < SIDE_MIN_HEIGHT) continue;
        colliders.push({
          obb: true,
          x,
          z: mid,
          heading: 0,
          halfL: Math.abs(b - a) / 2,
          halfW: thick,
          minY: outside,
          maxY: top,
        });
      }
    }

    // An edge running along X, at a fixed z.
    function edgeAlongX(z, x0, x1, outside) {
      const dir = Math.sign(x1 - x0) || 1;
      const len = Math.abs(x1 - x0);
      const steps = Math.max(1, Math.ceil(len / piece));
      for (let i = 0; i < steps; i += 1) {
        const a = x0 + dir * (len * i) / steps;
        const b = x0 + dir * (len * (i + 1)) / steps;
        const mid = (a + b) / 2;
        const top = groundHeight(mid, z);
        if (top - outside < SIDE_MIN_HEIGHT) continue;
        colliders.push({
          obb: true,
          x: mid,
          z,
          heading: Math.PI / 2,
          halfL: Math.abs(b - a) / 2,
          halfW: thick,
          minY: outside,
          maxY: top,
        });
      }
    }

    // The climb and the far slope: two sides each, running along Z.
    for (const side of [-1, 1]) {
      const x = roadX + side * hw;
      edgeAlongZ(x, zLow, zHigh, 0);
      edgeAlongZ(x, zNorth, zNorth - taper, 0);
    }
    // The two arms: two long sides each, running along X. Their ground falls
    // from the top to the street, so only the near end of each is a cliff.
    const armZ0 = h.zTop - ROAD_W / 2;
    const armZ1 = h.zTop + ROAD_W / 2;
    for (const z of [armZ0, armZ1]) {
      edgeAlongX(z, roadX - hw, roadX - westReach, 0);
      edgeAlongX(z, roadX + hw, roadX + taper, 0);
    }
  }

  // A piece of edge lower than this above the ground beside it is not a cliff:
  // it is the kerb where the hill meets the street, and a wall there would
  // close a street that people drive on.
  const SIDE_MIN_HEIGHT = 0.35;

  // A strip of surface laid along a line of points.
  //
  // It is the one builder for roads, pavements and bridges. The line can go
  // any way - a street on the grid runs straight along an axis, a beach road
  // wanders - and the surface is bent to the ground it crosses, so a road that
  // climbs follows the hill instead of cutting through it.
  //
  // Both of those used to be two functions. One could only run along an axis
  // but followed the ground; the other could go anywhere but was laid flat at
  // road level, so a diagonal over rising ground sank into it.
  //
  //   points   [[x, z], ...] the centre line
  //   width    how wide the surface is
  //   lift     how far above the ground it sits: ROAD_TOP for a road, WALK_TOP
  //            for a pavement
  //   opts.walk   draw a pavement either side
  //   opts.rails  draw parapets along the edges, for a bridge
  //   opts.strips draw the dashed centre line
  function addStrip(points, width, lift, mat, opts = {}) {
    const half = width / 2;
    // How far apart the cross sections are along the line. Close enough that a
    // bend or a slope is followed rather than cut across.
    const STEP = 2;
    const quads = [];
    const strip = { positions: [], uvs: [], indices: [], length: 0 };

    for (let i = 0; i < points.length - 1; i += 1) {
      const [x0, z0] = points[i];
      const [x1, z1] = points[i + 1];
      const frame = segmentFrame(x0, z0, x1, z1);
      const segLen = frame.len;
      const steps = Math.max(1, Math.ceil(segLen / STEP));
      const base = strip.positions.length / 3;

      for (let k = 0; k <= steps; k += 1) {
        const t = k / steps;
        const cx = x0 + (x1 - x0) * t;
        const cz = z0 + (z1 - z0) * t;
        const y = groundHeight(cx, cz) + lift;
        strip.positions.push(
          cx + frame.px * half, y, cz + frame.pz * half,
          cx - frame.px * half, y, cz - frame.pz * half,
        );
        const u = (strip.length + segLen * t) / 4;
        strip.uvs.push(0, u, 1, u);
        if (k < steps) {
          const a = base + k * 2;
          strip.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      strip.length += segLen;

      // The four corners of this piece of surface, for a caller that needs the
      // footprint: the walkable region, the road list.
      quads.push([
        [x0 + frame.px * half, z0 + frame.pz * half],
        [x1 + frame.px * half, z1 + frame.pz * half],
        [x1 - frame.px * half, z1 - frame.pz * half],
        [x0 - frame.px * half, z0 - frame.pz * half],
      ]);

      if (opts.walk) {
        const off = half + WALK / 2;
        for (const side of [-1, 1]) {
          addStripSide(
            x0 + frame.px * off * side, z0 + frame.pz * off * side,
            x1 + frame.px * off * side, z1 + frame.pz * off * side,
            frame, WALK, WALK_TOP, walkMat, 0xa3988c,
          );
        }
      }
      if (opts.rails) {
        const off = half - 0.45;
        for (const side of [-1, 1]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.05, segLen), concrete);
          // A parapet follows the ground too, or it floats where the bridge
          // climbs.
          const gy = groundHeight(frame.x, frame.z);
          rail.position.set(
            frame.x + frame.px * off * side,
            gy + (opts.surface ?? lift) + 0.5,
            frame.z + frame.pz * off * side,
          );
          rail.rotation.y = frame.heading;
          rail.castShadow = true;
          group.add(rail);
        }
      }
      if (opts.strips !== false) {
        for (let t = 2.2; t < segLen - 1.2; t += 5.2) {
          const along = t - segLen / 2;
          const sx = frame.x + Math.sin(frame.heading) * along;
          const sz = frame.z + Math.cos(frame.heading) * along;
          stripes.push({
            x: sx,
            z: sz,
            sx: 0.16,
            sz: 1.6,
            rot: frame.heading,
            y: groundHeight(sx, sz) + lift + 0.02,
          });
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(strip.positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(strip.uvs, 2));
    geo.setIndex(strip.indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: opts.color ?? 0x3a3d42,
      roughness: 0.96,
      // Drawn from below as well, so a strip bent over a crest does not show
      // daylight through it.
      side: THREE.DoubleSide,
      map: mat?.map ?? null,
    }));
    mesh.receiveShadow = true;
    mesh.castShadow = !!opts.cast;
    group.add(mesh);
    return quads;
  }

  // One side of a strip: a pavement, laid along the same line, on the ground
  // under it rather than at the height of the road.
  function addStripSide(x0, z0, x1, z1, frame, width, lift, mat, color) {
    const steps = Math.max(1, Math.ceil(frame.len / 2));
    const half = width / 2;
    const positions = [];
    const indices = [];
    for (let k = 0; k <= steps; k += 1) {
      const t = k / steps;
      const cx = x0 + (x1 - x0) * t;
      const cz = z0 + (z1 - z0) * t;
      const y = groundHeight(cx, cz) + lift;
      positions.push(
        cx + frame.px * half, y, cz + frame.pz * half,
        cx - frame.px * half, y, cz - frame.pz * half,
      );
      if (k < steps) {
        const a = k * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color, roughness: 0.95, side: THREE.DoubleSide, map: mat?.map ?? null,
    }));
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
    // The sides of the hill, as walls that only exist where the hill is above
    // the ground beside it.
    //
    // A car cannot drive through the side of a raised road, but the road is not
    // raised the whole way: at the foot of the climb its edge is level with the
    // street, and a wall put there would block the street for nothing. So the
    // edge is cut into short pieces, and each piece carries the heights it
    // stands between - the ground outside the hill, and the ground on it - and
    // only counts for a car whose own span overlaps.
    addHillSides(h);

    // The road and its pavements up the hill, and down the far side.
    addStrip([[roadX, zLow], [roadX, zHigh]], half * 2, ROAD_TOP, asphaltMat, { color: 0x3a3d42 });
    addStrip([[roadX, zNorth], [roadX, zNorth - taper]], half * 2, ROAD_TOP, asphaltMat, { color: 0x3a3d42 });
    for (const side of [-1, 1]) {
      const wx = roadX + side * walkOff;
      addStrip([[wx, zLow], [wx, zHigh]], walkHalf * 2, WALK_TOP, walkMat, { color: 0xa3988c, strips: false });
      addStrip([[wx, zNorth], [wx, zNorth - taper]], walkHalf * 2, WALK_TOP, walkMat, { color: 0xa3988c, strips: false });
    }
    // The cross road over the top. It is level, and only as long as the top
    // is: the arms beyond it fall away and are drawn as their own strips,
    // bent to the ground.
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
      addStrip([[x0, h.zTop], [x1, h.zTop]], ROAD_W, ROAD_TOP, asphaltMat, { color: 0x3a3d42 });
      for (const s2 of [-1, 1]) {
        addStrip(
          [[x0, h.zTop + s2 * walkOff], [x1, h.zTop + s2 * walkOff]],
          WALK, WALK_TOP, walkMat, { color: 0xa3988c, strips: false },
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
    const deck = addStrip(spec.points, spec.width, ROAD_TOP + 0.02, asphaltMat, {
      rails: true, surface: ROAD_TOP + 0.02,
    });
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
    addStrip(road.points, road.width ?? ROAD_W, ROAD_TOP, asphaltMat, { walk: true });
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
    // parked car is only put at the right height here, level. Once the whole
    // map is laid out, every car is laid on the ground again and leaned to the
    // slope; see the settleOnGround pass after the terrain is built.
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

  // The cars were parked before the ground existed, so they were stood on a
  // height with their bodies level. A car parked on the hill would then sit
  // flat on a slope until the first frame it was driven, and snap to the angle
  // of the hill the moment the player put it in gear. Now that the ground is
  // built, every parked car is laid on it once, so it is already leaning on
  // the slope before anyone gets in.
  for (const vehicle of vehicles) settleOnGround(terrain, vehicle);
  for (const vehicle of vehicles) vehicle.sync();

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
    shore: MAP.island,
    beach: MAP.beach,
    landing: MAP.landing,
    deck,
    water: { x: MAP.water.x, z: MAP.water.z, w: MAP.water.w, d: MAP.water.d },
    spawnVehicle(cfg) {
      return addVehicle(cfg);
    },
  };
}
