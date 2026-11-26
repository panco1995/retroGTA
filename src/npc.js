import * as THREE from 'three';
import { WALK_TOP, colorOf } from './config.js';
import { animateActor, createActor } from './actor.js';
import { blocked, moveCircle } from './collision.js';

// The crowd streams around the player: a slot only spawns on a sidewalk that
// is off camera, and only leaves once it is far away and out of view.
const SPAWN_MIN = 22;
const SPAWN_MAX = 80;
const DESPAWN_RANGE = 95;
const MAX_ACTIVE = 36;
const SPAWNS_PER_FRAME = 2;
const SPAWN_TRIES = 24;
const NODE_MERGE = 3;
const NPC_RADIUS = 0.36;
const MIN_SPACING = 2.4;

const SKIN_TONES = [0xf1c9a5, 0xe4b58f, 0xd39c74, 0xbe8359, 0xa06b46, 0x825536, 0x633f27];
const HAIR_TONES = [
  0x14100d, 0x231812, 0x33231a, 0x4a3120,
  0x6a4a2c, 0x98794c, 0xb7a374, 0x8c8c8a, 0xd8d4cb, 0x8a3a22,
];
const GREY_HAIR = [0x9a9a98, 0xc4c2bc, 0xd8d4cb, 0x777674];

const pick = (list) => list[(Math.random() * list.length) | 0];
const rnd = (a, b) => a + Math.random() * (b - a);
const chance = (p) => Math.random() < p;
const c = colorOf;

// Kinds stand in for the groups of people on a city street. Weight is how
// often the kind appears; make() rolls one look and one walking speed.
const KINDS = [
  {
    id: 'businessman',
    weight: 7,
    make() {
      return {
        height: rnd(0.98, 1.05),
        build: pick(['normal', 'slim', 'normal', 'heavy']),
        speed: rnd(1.25, 1.55),
        skin: pick(SKIN_TONES),
        hair: pick([0x14100d, 0x231812, 0x33231a, 0x4a3120, 0x8c8c8a]),
        shirt: c(pick(['#2b3440', '#3a3f47', '#1f2a33', '#4a4d52', '#3c2f2a'])),
        pants: c(pick(['#232a33', '#2b2b2e', '#33363b', '#1e2329'])),
        shoes: c(pick(['#1b1b1e', '#2a2222', '#33261c'])),
        tie: c(pick(['#8c2f2f', '#2f4a6b', '#5a4a2a', '#3a3a3a', '#6b2f5a'])),
        briefcase: c(pick(['#3a2a1e', '#22242a', '#4a3a2a'])),
        hat: chance(0.1) ? { type: 'cap', color: c('#2b2b2e') } : undefined,
      };
    },
  },
  {
    id: 'businesswoman',
    weight: 6,
    make() {
      const skin = pick(SKIN_TONES);
      return {
        height: rnd(0.92, 1.01),
        build: pick(['slim', 'slim', 'normal']),
        speed: rnd(1.2, 1.5),
        skin,
        hair: pick([...HAIR_TONES, 0xc9a86a, 0xe0d4b8]),
        hairLong: chance(0.75),
        shirt: c(pick(['#3d3a4a', '#6b4a52', '#2f3a44', '#7a6a58', '#4a3a44'])),
        skirt: true,
        skirtColor: c(pick(['#2b2b33', '#3a3340', '#4a4048', '#26262c'])),
        legs: chance(0.65) ? 0x2b2428 : skin,
        shoes: c(pick(['#2a2222', '#3a2a2a', '#202024'])),
        handbag: c(pick(['#5a2f2f', '#2f3a4a', '#4a3a2a', '#222226'])),
        glasses: chance(0.2) ? true : undefined,
      };
    },
  },
  {
    id: 'student',
    weight: 12,
    make() {
      const skin = pick(SKIN_TONES);
      const shorts = chance(0.35);
      return {
        height: rnd(0.93, 1.03),
        build: pick(['slim', 'normal', 'normal']),
        speed: rnd(1.35, 1.7),
        skin,
        hair: pick(HAIR_TONES),
        hairLong: chance(0.45),
        shirt: c(pick(['#4a5a6b', '#6b3a3a', '#3a4a3a', '#5a4a6b', '#2f3238', '#6a5a3a'])),
        pants: c(pick(['#2f3a4a', '#3a4a5a', '#2a2a30', '#4a4a52'])),
        legs: shorts ? skin : undefined,
        shorts,
        shoes: c(pick(['#d8d4cc', '#2a2a2e', '#8a2a24', '#3a4a6b'])),
        backpack: c(pick(['#2f3a5a', '#5a2a2a', '#3a5a3a', '#22242a', '#6a4a2a'])),
        hat: chance(0.35) ? {
          type: chance(0.7) ? 'cap' : 'beanie',
          color: c(pick(['#2a2e36', '#4a3a3a', '#2f4a3a', '#5a4a2a'])),
        } : undefined,
        headphones: chance(0.2) ? 0x1c1e24 : undefined,
        glasses: chance(0.15) ? true : undefined,
      };
    },
  },
  {
    id: 'schoolkid',
    weight: 5,
    make() {
      return {
        height: rnd(0.7, 0.8),
        headScale: 1.12,
        build: 'slim',
        speed: rnd(1.5, 1.9),
        skin: pick(SKIN_TONES),
        hair: pick(HAIR_TONES),
        shirt: c(pick(['#c25a3a', '#3a7a9a', '#d8b43a', '#6a4a8a', '#3a8a5a', '#d8d0c0'])),
        legs: pick(SKIN_TONES),
        shorts: true,
        shoes: c(pick(['#d8d4cc', '#2a2a2e', '#c23a2a', '#2a4a8a'])),
        backpack: c(pick(['#d84a3a', '#3a6ad8', '#3aa85a', '#e0c23a'])),
        hat: chance(0.5) ? {
          type: 'cap',
          color: c(pick(['#2a4a8a', '#c23a2a', '#2a2a2e', '#3a8a5a'])),
        } : undefined,
      };
    },
  },
  {
    id: 'tourist',
    weight: 8,
    make() {
      const skin = pick(SKIN_TONES);
      const shorts = chance(0.7);
      return {
        height: rnd(0.92, 1.06),
        build: pick(['normal', 'heavy', 'normal']),
        speed: rnd(0.9, 1.15),
        skin,
        hair: pick(HAIR_TONES),
        hairLong: chance(0.4),
        shirt: c(pick(['#d98a3a', '#3a8a9a', '#c4b05a', '#8a3a6a', '#e0d8c8', '#4a9a7a'])),
        pants: c(pick(['#b0a06a', '#8a8a7a', '#4a5a6a'])),
        legs: shorts ? skin : undefined,
        shorts,
        shoes: c(pick(['#6a4a2a', '#d8d4cc', '#3a3a3a'])),
        hat: chance(0.65) ? {
          type: 'sunhat',
          color: c(pick(['#e0d8b8', '#c8b48a'])),
        } : undefined,
        backpack: chance(0.5) ? c(pick(['#3a5a8a', '#8a4a2a', '#4a4a4a'])) : undefined,
        tote: chance(0.35) ? c(pick(['#c25a3a', '#3a6a8a', '#6a8a4a'])) : undefined,
        glasses: chance(0.35) ? 0x14161a : undefined,
      };
    },
  },
  {
    id: 'jogger',
    weight: 7,
    make() {
      const skin = pick(SKIN_TONES);
      return {
        height: rnd(0.94, 1.04),
        build: 'slim',
        speed: rnd(2.5, 3.3),
        skin,
        hair: pick(HAIR_TONES),
        hairLong: chance(0.35),
        shirt: c(pick(['#d84a3a', '#3a8ad8', '#e0c23a', '#2a2e36', '#3ac27a', '#d86a2a'])),
        sleeveless: true,
        legs: skin,
        shorts: true,
        pants: c(pick(['#2a2e36', '#3a3a44', '#1e2026', '#26405a'])),
        shoes: c(pick(['#d8d4cc', '#e0c23a', '#3a8ad8', '#2a2a2e'])),
        headphones: chance(0.7) ? 0x1c1e24 : undefined,
        glasses: chance(0.15) ? 0x14161a : undefined,
      };
    },
  },
  {
    id: 'constructionWorker',
    weight: 4,
    make() {
      const skin = pick(SKIN_TONES);
      const shorts = chance(0.2);
      return {
        height: rnd(1.0, 1.08),
        build: 'heavy',
        speed: rnd(1.0, 1.25),
        skin,
        hair: pick([0x14100d, 0x231812, 0x33231a, 0x8c8c8a]),
        shirt: c(pick(['#3a4a5a', '#5a4a3a', '#4a5a4a', '#6a5a4a'])),
        pants: c(pick(['#3a3a34', '#4a4a3a', '#2f3338'])),
        legs: shorts ? skin : undefined,
        shorts,
        shoes: c(pick(['#3a2a1c', '#4a3a24', '#2a2420'])),
        vest: c('#d8c22a'),
        hat: { type: 'hardhat', color: c(pick(['#e0b020', '#d05a20', '#e8e4d8'])) },
        glasses: chance(0.1) ? 0x14161a : undefined,
      };
    },
  },
  {
    id: 'elderly',
    weight: 7,
    make() {
      return {
        height: rnd(0.87, 0.96),
        build: pick(['slim', 'normal']),
        speed: rnd(0.62, 0.9),
        hunch: rnd(0.1, 0.2),
        skin: pick(SKIN_TONES),
        hair: pick(GREY_HAIR),
        shirt: c(pick(['#6a5a4a', '#4a4e58', '#7a6a68', '#5a6a5a', '#8a8078', '#5a4a5a'])),
        pants: c(pick(['#4a4640', '#3a3a3a', '#5a5248', '#2f3338'])),
        shoes: c(pick(['#2a2420', '#3a2e26', '#28282a'])),
        cane: c(pick(['#5a3a24', '#3a2a1e', '#6a5030'])),
        hat: chance(0.45) ? {
          type: chance(0.5) ? 'beanie' : 'cap',
          color: c(pick(['#3a3a3a', '#5a4a3a', '#2f3a44', '#6a5a5a'])),
        } : undefined,
        glasses: chance(0.45) ? true : undefined,
      };
    },
  },
  {
    id: 'courier',
    weight: 5,
    make() {
      const uniform = c(pick(['#c26a20', '#2a5a8a', '#8a2a2a', '#2f6b3a']));
      const shorts = chance(0.3);
      const skin = pick(SKIN_TONES);
      return {
        height: rnd(0.96, 1.05),
        build: pick(['normal', 'slim']),
        speed: rnd(1.55, 1.95),
        skin,
        hair: pick(HAIR_TONES),
        shirt: uniform,
        pants: c(pick(['#2a2a30', '#33363b', '#2f3a4a'])),
        legs: shorts ? skin : undefined,
        shorts,
        shoes: c(pick(['#2a2a2e', '#3a2a1c'])),
        backpack: c(pick(['#22242a', '#2a2a30', '#3a3a3a'])),
        hat: { type: 'cap', color: uniform },
        headphones: chance(0.2) ? 0x1c1e24 : undefined,
      };
    },
  },
  {
    id: 'shopper',
    weight: 12,
    make() {
      const skin = pick(SKIN_TONES);
      const shorts = chance(0.3);
      const bag = chance(0.5);
      return {
        height: rnd(0.91, 1.06),
        build: pick(['normal', 'heavy', 'normal', 'slim']),
        speed: rnd(1.0, 1.35),
        skin,
        hair: pick(HAIR_TONES),
        hairLong: chance(0.55),
        shirt: c(pick(['#6a8a9a', '#b05a5a', '#d0b06a', '#4a6a5a', '#8a7a9a', '#d8d0c0', '#2f6a8a'])),
        pants: c(pick(['#3a4a5a', '#2a2e36', '#8a8068', '#4a4a52'])),
        legs: shorts ? skin : undefined,
        shorts,
        shoes: c(pick(['#d8d4cc', '#2a2a2e', '#8a4a3a', '#4a5a6a'])),
        tote: bag ? c(pick(['#c25a3a', '#3a6a8a', '#6a8a4a', '#8a3a6a'])) : undefined,
        handbag: !bag && chance(0.35) ? c(pick(['#5a2f2f', '#2f3a4a', '#222226'])) : undefined,
        hat: chance(0.15) ? { type: 'cap', color: c('#2f3a44') } : undefined,
      };
    },
  },
  {
    id: 'policeOfficer',
    weight: 2,
    make() {
      return {
        height: rnd(1.0, 1.09),
        build: pick(['normal', 'heavy']),
        speed: rnd(1.25, 1.45),
        skin: pick(SKIN_TONES),
        hair: pick([0x14100d, 0x231812, 0x33231a]),
        shirt: 0x26303c,
        pants: 0x1f2832,
        shoes: 0x14161a,
        belt: 0x14161a,
        hat: { type: 'policecap', color: 0x1f2832 },
        vest: chance(0.5) ? 0x1a2a22 : undefined,
      };
    },
  },
  {
    id: 'punk',
    weight: 5,
    make() {
      const skin = pick(SKIN_TONES);
      const shorts = chance(0.2);
      return {
        height: rnd(0.93, 1.03),
        build: pick(['slim', 'normal']),
        speed: rnd(1.1, 1.5),
        skin,
        hair: pick([0x6a2a8a, 0x2a7a5a, 0xb03a2a, 0xd8d0c0, 0x14100d]),
        shirt: c(pick(['#22242a', '#3a2a4a', '#7a2a3a', '#2a3a4a', '#d8d0c0'])),
        pants: c(pick(['#22242a', '#3a3a44', '#4a2a2a', '#2a3a2a'])),
        legs: shorts ? skin : undefined,
        shorts,
        shoes: c(pick(['#141416', '#3a2a2a', '#5a2a2a'])),
        hat: chance(0.55) ? {
          type: 'beanie',
          color: c(pick(['#141416', '#3a2a4a', '#2a3a2a'])),
        } : undefined,
        headphones: chance(0.3) ? 0x1c1e24 : undefined,
      };
    },
  },
];

const TOTAL_WEIGHT = KINDS.reduce((sum, kind) => sum + kind.weight, 0);

function weightedKind() {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const kind of KINDS) {
    roll -= kind.weight;
    if (roll <= 0) return kind;
  }
  return KINDS[KINDS.length - 1];
}

function buildLineup() {
  const lineup = [];
  for (const kind of KINDS) {
    const count = Math.max(1, Math.round((kind.weight / TOTAL_WEIGHT) * MAX_ACTIVE));
    for (let i = 0; i < count; i += 1) lineup.push(kind);
  }
  for (let i = lineup.length - 1; i > 0; i -= 1) {
    const j = (Math.random() * (i + 1)) | 0;
    [lineup[i], lineup[j]] = [lineup[j], lineup[i]];
  }
  while (lineup.length < MAX_ACTIVE) lineup.push(weightedKind());
  lineup.length = MAX_ACTIVE;
  return lineup;
}

function buildWalkGraph(segments) {
  const nodes = [];
  const edges = [];
  if (!Array.isArray(segments) || segments.length === 0) return { nodes, edges };
  const nodeAt = (x, z) => {
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      if (Math.hypot(node.x - x, node.z - z) <= NODE_MERGE) return i;
    }
    nodes.push({ x, z, edges: [] });
    return nodes.length - 1;
  };
  for (const seg of segments) {
    const a = nodeAt(seg.x0, seg.z0);
    const b = nodeAt(seg.x1, seg.z1);
    if (a === b) continue;
    const len = Math.hypot(nodes[b].x - nodes[a].x, nodes[b].z - nodes[a].z);
    if (len < 1.2) continue;
    const index = edges.length;
    edges.push({ a, b, len });
    nodes[a].edges.push(index);
    nodes[b].edges.push(index);
  }
  return { nodes, edges };
}

export function createPedestrianCrowd({ scene, world, camera, getFocus, avoid }) {
  const { nodes, edges } = buildWalkGraph(world.walkways);
  const active = [];
  const slots = [];
  const lineup = buildLineup();

  for (let i = 0; i < MAX_ACTIVE; i += 1) {
    slots.push({
      kind: lineup[i],
      opts: lineup[i].make(),
      actor: null,
      active: false,
      x: 0,
      z: 0,
      speed: 1.2,
      heading: 0,
      target: -1,
      from: -1,
      idle: 0,
      stuck: 0,
      seed: Math.random() * 10,
    });
  }

  const focusPoint = new THREE.Vector3();
  const camPoint = new THREE.Vector3();

  function ensureActor(slot) {
    if (slot.actor) return slot.actor;
    const actor = createActor(slot.opts);
    actor.speed = slot.opts.speed;
    actor.group.visible = false;
    scene.add(actor.group);
    slot.actor = actor;
    return actor;
  }

  function nearestNode(x, z) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const dist = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    return best;
  }

  // True when the point is inside the camera frustum. Spawning and despawning
  // only happen where this is false, so nothing pops in or out on screen.
  function visibleAt(x, z) {
    focusPoint.set(x, WALK_TOP + world.ground(x, z) + 1.1, z);
    camPoint.copy(focusPoint).applyMatrix4(camera.matrixWorldInverse);
    if (camPoint.z > -0.2) return false;
    focusPoint.project(camera);
    return Math.abs(focusPoint.x) < 1.04
      && Math.abs(focusPoint.y) < 1.04
      && focusPoint.z < 1;
  }

  function tooClose(x, z) {
    for (const slot of active) {
      if ((slot.x - x) ** 2 + (slot.z - z) ** 2 < MIN_SPACING * MIN_SPACING) return true;
    }
    if (avoid) {
      for (const actor of avoid()) {
        if ((actor.x - x) ** 2 + (actor.z - z) ** 2 < MIN_SPACING * MIN_SPACING) return true;
      }
    }
    return false;
  }

  function findSpot(focus) {
    const segments = world.walkways;
    if (!segments || segments.length === 0) return null;
    for (let attempt = 0; attempt < SPAWN_TRIES; attempt += 1) {
      const seg = segments[(Math.random() * segments.length) | 0];
      const t = 0.06 + Math.random() * 0.88;
      const x = seg.x0 + (seg.x1 - seg.x0) * t;
      const z = seg.z0 + (seg.z1 - seg.z0) * t;
      const dist = Math.hypot(x - focus.x, z - focus.z);
      if (dist < SPAWN_MIN || dist > SPAWN_MAX) continue;
      if (blocked(x, z, NPC_RADIUS + 0.12, world.colliders)) continue;
      if (tooClose(x, z)) continue;
      if (visibleAt(x, z)) continue;
      return { x, z, seg, t };
    }
    return null;
  }

  function chooseNext(nodeIndex, previous) {
    const node = nodes[nodeIndex];
    if (!node || node.edges.length === 0) return nodeIndex;

    let inX = 0;
    let inZ = 0;
    if (previous >= 0) {
      const prev = nodes[previous];
      inX = node.x - prev.x;
      inZ = node.z - prev.z;
      const len = Math.hypot(inX, inZ) || 1;
      inX /= len;
      inZ /= len;
    }

    const options = [];
    let total = 0;
    for (const edgeIndex of node.edges) {
      const edge = edges[edgeIndex];
      const other = edge.a === nodeIndex ? edge.b : edge.a;
      const next = nodes[other];
      let dx = next.x - node.x;
      let dz = next.z - node.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      let weight = 1 + Math.max(0, inX * dx + inZ * dz) * 2.5;
      if (other === previous) weight *= 0.12;
      total += weight;
      options.push({ node: other, weight });
    }

    let roll = Math.random() * total;
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) return option.node;
    }
    return options[options.length - 1].node;
  }

  function spawn(slot, focus) {
    const spot = findSpot(focus);
    if (!spot) return false;
    const actor = ensureActor(slot);
    const a = nearestNode(spot.seg.x0, spot.seg.z0);
    const b = nearestNode(spot.seg.x1, spot.seg.z1);
    let target = spot.t < 0.5 ? b : a;
    let from = spot.t < 0.5 ? a : b;
    if (target < 0 || target === from) {
      target = nearestNode(spot.x, spot.z);
      from = -1;
    }
    if (target < 0) return false;

    slot.x = spot.x;
    slot.z = spot.z;
    slot.speed = slot.opts.speed;
    slot.target = target;
    slot.from = from;
    slot.idle = 0;
    slot.stuck = 0;
    slot.heading = Math.atan2(nodes[target].x - spot.x, nodes[target].z - spot.z);
    slot.active = true;

    actor.x = slot.x;
    actor.z = slot.z;
    actor.heading = slot.heading;
    actor.group.visible = true;
    actor.group.position.set(slot.x, WALK_TOP + world.ground(slot.x, slot.z), slot.z);
    actor.group.rotation.y = slot.heading;
    active.push(slot);
    return true;
  }

  function despawn(slot) {
    slot.active = false;
    if (slot.actor) slot.actor.group.visible = false;
    const index = active.indexOf(slot);
    if (index >= 0) active.splice(index, 1);
  }

  function step(slot, dt, time) {
    const actor = slot.actor;
    if (slot.idle > 0) {
      slot.idle -= dt;
      animateActor(actor, 0, time + slot.seed, dt);
      actor.group.position.set(slot.x, WALK_TOP + world.ground(slot.x, slot.z), slot.z);
      return;
    }

    const target = nodes[slot.target];
    const dx = target.x - slot.x;
    const dz = target.z - slot.z;
    const dist = Math.hypot(dx, dz);
    const move = slot.speed * dt;

    if (dist <= Math.max(move, 0.06)) {
      slot.x = target.x;
      slot.z = target.z;
      const arrived = slot.target;
      slot.target = chooseNext(arrived, slot.from);
      slot.from = arrived;
      if (chance(0.04)) slot.idle = rnd(0.7, 2.2);
    } else {
      const stepX = (dx / dist) * move;
      const stepZ = (dz / dist) * move;
      const next = moveCircle(slot.x, slot.z, stepX, stepZ, NPC_RADIUS, world.colliders);
      const moved = Math.hypot(next.x - slot.x, next.z - slot.z);
      if (moved < move * 0.3) {
        slot.stuck += dt;
        if (slot.stuck > 0.5) {
          const turn = slot.target;
          slot.target = slot.from;
          slot.from = turn;
          slot.stuck = 0;
        }
      } else {
        slot.stuck = 0;
      }
      slot.x = next.x;
      slot.z = next.z;
    }

    const toward = nodes[slot.target];
    const want = Math.atan2(toward.x - slot.x, toward.z - slot.z);
    let delta = want - slot.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    slot.heading += delta * Math.min(1, dt * 10);

    const y = WALK_TOP + world.ground(slot.x, slot.z);
    actor.x = slot.x;
    actor.z = slot.z;
    actor.heading = slot.heading;
    actor.group.position.set(slot.x, y, slot.z);
    actor.group.rotation.y = slot.heading;
    animateActor(actor, slot.speed, time + slot.seed, dt);
  }

  function update(dt, time) {
    if (edges.length === 0) return;
    const focus = getFocus();
    if (!focus) return;
    camera.updateMatrixWorld();

    for (let i = active.length - 1; i >= 0; i -= 1) {
      const slot = active[i];
      const dist = Math.hypot(slot.x - focus.x, slot.z - focus.z);
      if (dist > DESPAWN_RANGE && !visibleAt(slot.x, slot.z)) despawn(slot);
    }

    for (const slot of active) step(slot, dt, time);

    let budget = SPAWNS_PER_FRAME;
    while (active.length < MAX_ACTIVE && budget > 0) {
      const slot = slots.find((item) => !item.active);
      if (!slot) break;
      if (!spawn(slot, focus)) break;
      budget -= 1;
    }
  }

  function reset() {
    for (const slot of slots) {
      slot.active = false;
      if (slot.actor) slot.actor.group.visible = false;
    }
    active.length = 0;
  }

  return { update, reset };
}
