import * as THREE from 'three';
import { WALK_TOP, colorOf } from './config.js';
import { animateActor, createActor, setPose } from './actor.js';
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
// Traffic reactions: wait before stepping onto a road, hurry across, and
// jump aside when a car heads straight for someone on the pavement.
const CROSS_LOOK = 18;
const CROSS_PATIENCE = 4;
const PANIC_RANGE = 6.5;
const PANIC_SPEED = 4.2;
const TRAFFIC_SIDE = 3.1;

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
    edges.push({ a, b, len, crossing: !!seg.crossing });
    nodes[a].edges.push(index);
    nodes[b].edges.push(index);
  }
  return { nodes, edges };
}

export function createPedestrianCrowd({
  scene, world, camera, getFocus, avoid, getExtraColliders, getNeighbors,
}) {
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
      crossing: false,
      mayWait: false,
      crossWait: 0,
      panic: 0,
      dodgeX: 0,
      dodgeZ: 0,
      idle: 0,
      idleKind: 'look',
      radius: NPC_RADIUS,
      facing: null,
      chatPartner: null,
      chatCooldown: rnd(4, 14),
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

  // The closest moving vehicle that is heading for this point. Parked cars
  // have speed 0, so only traffic on the move counts.
  function trafficNear(x, z, range, minSpeed) {
    let best = null;
    let bestDist = range;
    for (const vehicle of world.vehicles) {
      const speed = Math.abs(vehicle.speed ?? 0);
      if (speed < minSpeed) continue;
      const dx = x - vehicle.x;
      const dz = z - vehicle.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestDist) continue;
      const dir = Math.sign(vehicle.speed) || 1;
      const fx = Math.sin(vehicle.heading) * dir;
      const fz = Math.cos(vehicle.heading) * dir;
      if (dx * fx + dz * fz <= 0.1) continue;
      if (Math.abs(dx * fz - dz * fx) > TRAFFIC_SIDE) continue;
      best = vehicle;
      bestDist = dist;
    }
    return best;
  }

  function nearestBuilding(x, z, range) {
    let best = null;
    let bestDist = range;
    for (const building of world.buildings) {
      const minX = building.x - building.w / 2;
      const maxX = building.x + building.w / 2;
      const minZ = building.z - building.d / 2;
      const maxZ = building.z + building.d / 2;
      const px = Math.min(Math.max(x, minX), maxX);
      const pz = Math.min(Math.max(z, minZ), maxZ);
      const dist = Math.hypot(x - px, z - pz);
      if (dist < bestDist) {
        bestDist = dist;
        best = { x: px, z: pz };
      }
    }
    return best;
  }

  function turnToward(slot, want, dt) {
    let delta = want - slot.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    slot.heading += delta * Math.min(1, dt * 7);
  }

  function beginIdle(slot, seconds) {
    slot.idle = seconds;
    const hasRightHandBag = slot.opts.briefcase != null || slot.opts.handbag != null;
    const roll = Math.random();
    if (roll < 0.4 || (roll < 0.7 && hasRightHandBag)) {
      slot.idleKind = 'look';
      slot.facing = null;
    } else if (roll < 0.7) {
      slot.idleKind = 'phone';
      slot.facing = null;
    } else {
      const spot = nearestBuilding(slot.x, slot.z, 10);
      if (spot) {
        slot.idleKind = 'shop';
        slot.facing = Math.atan2(spot.x - slot.x, spot.z - slot.z);
      } else {
        slot.idleKind = 'look';
        slot.facing = null;
      }
    }
  }

  function idleFrame(slot, dt, time) {
    const actor = slot.actor;
    const head = actor.parts.head;
    animateActor(actor, 0, time + slot.seed, dt);

    let yaw = 0;
    let nod = 0;
    if (slot.idleKind === 'look') {
      yaw = Math.sin((time + slot.seed) * 1.4) * 0.75;
    } else if (slot.idleKind === 'chat') {
      yaw = Math.sin((time + slot.seed) * 2.2) * 0.08;
      nod = Math.sin((time + slot.seed) * 2.6) * 0.08;
    } else if (slot.idleKind === 'phone') {
      nod = 0.28;
      const arm = actor.parts.rightArm;
      arm.rotation.x = -1.25;
      arm.rotation.z += (-0.16 - arm.rotation.z) * Math.min(1, dt * 8);
    } else {
      actor.parts.rightArm.rotation.z += (0 - actor.parts.rightArm.rotation.z) * Math.min(1, dt * 8);
    }
    head.rotation.y += (yaw - head.rotation.y) * Math.min(1, dt * 6);
    head.rotation.x += (nod - head.rotation.x) * Math.min(1, dt * 6);

    if (slot.idleKind === 'chat' && slot.chatPartner) {
      turnToward(slot, Math.atan2(
        slot.chatPartner.x - slot.x,
        slot.chatPartner.z - slot.z,
      ), dt);
    } else if (slot.idleKind === 'shop' && slot.facing != null) {
      turnToward(slot, slot.facing, dt);
    }

    actor.x = slot.x;
    actor.z = slot.z;
    actor.heading = slot.heading;
    actor.group.position.set(slot.x, WALK_TOP + world.ground(slot.x, slot.z), slot.z);
    actor.group.rotation.y = slot.heading;
  }

  function findChatPartner(slot) {
    if (slot.speed > 2.2) return null;
    for (const other of active) {
      if (other === slot) continue;
      if (other.speed > 2.2) continue;
      if (other.idle > 0 || other.panic > 0 || other.chatPartner) continue;
      if (other.dead || other.down > 0) continue;
      if (other.crossing || slot.crossing) continue;
      const dx = other.x - slot.x;
      const dz = other.z - slot.z;
      if (dx * dx + dz * dz < 2.2 * 2.2) return other;
    }
    return null;
  }

  function startChat(a, b) {
    const seconds = rnd(2.2, 3.6);
    for (const [slot, partner] of [[a, b], [b, a]]) {
      slot.chatPartner = partner;
      slot.idle = seconds;
      slot.idleKind = 'chat';
      slot.mayWait = false;
      slot.crossWait = 0;
      slot.chatCooldown = rnd(20, 40);
    }
  }

  function clearChat(slot) {
    const partner = slot.chatPartner;
    slot.chatPartner = null;
    if (!partner || partner.chatPartner !== slot) return;
    partner.chatPartner = null;
    if (partner.idleKind === 'chat') partner.idle = 0;
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

  const solidBuf = [];

  // The driven car is taken out of world.colliders so it does not hit itself.
  // Pedestrians still have to walk around it.
  function stampPerson(person) {
    let hit = person.hit;
    if (!hit) {
      hit = { circle: true, x: 0, z: 0, radius: NPC_RADIUS };
      person.hit = hit;
    }
    hit.x = person.x;
    hit.z = person.z;
    hit.radius = person.radius || NPC_RADIUS;
    return hit;
  }

  function solidColliders(self) {
    solidBuf.length = 0;
    for (let i = 0; i < world.colliders.length; i++) solidBuf.push(world.colliders[i]);
    const extra = getExtraColliders ? getExtraColliders() : null;
    if (extra) {
      for (let i = 0; i < extra.length; i++) {
        if (!solidBuf.includes(extra[i])) solidBuf.push(extra[i]);
      }
    }
    for (let i = 0; i < active.length; i++) {
      const other = active[i];
      if (other !== self) solidBuf.push(stampPerson(other));
    }
    const neighbors = getNeighbors ? getNeighbors() : null;
    if (neighbors) {
      for (let i = 0; i < neighbors.length; i++) solidBuf.push(stampPerson(neighbors[i]));
    }
    return solidBuf;
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
      if (blocked(x, z, NPC_RADIUS + 0.12, solidColliders())) continue;
      if (tooClose(x, z)) continue;
      if (visibleAt(x, z)) continue;
      return { x, z, seg, t };
    }
    return null;
  }

  function chooseNext(nodeIndex, previous) {
    const node = nodes[nodeIndex];
    if (!node || node.edges.length === 0) return { node: nodeIndex, crossing: false };

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
      options.push({ node: other, weight, crossing: edge.crossing });
    }

    let roll = Math.random() * total;
    for (const option of options) {
      roll -= option.weight;
      if (roll <= 0) return option;
    }
    return options[options.length - 1];
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

    clearChat(slot);
    slot.x = spot.x;
    slot.z = spot.z;
    slot.speed = slot.opts.speed;
    slot.target = target;
    slot.from = from;
    slot.crossing = !!spot.seg.crossing;
    slot.mayWait = false;
    slot.crossWait = 0;
    slot.panic = 0;
    slot.down = 0;
    slot.dead = false;
    slot.bleed = 0;
    slot.hitVX = 0;
    slot.hitVZ = 0;
    slot.hitCool = 0;
    slot.idle = 0;
    slot.idleKind = 'look';
    slot.facing = null;
    slot.stuck = 0;
    slot.heading = Math.atan2(nodes[target].x - spot.x, nodes[target].z - spot.z);
    slot.active = true;

    actor.x = slot.x;
    actor.z = slot.z;
    actor.heading = slot.heading;
    actor.group.visible = true;
    actor.group.position.set(slot.x, WALK_TOP + world.ground(slot.x, slot.z), slot.z);
    actor.group.rotation.y = slot.heading;
    if (actor.pose === 'down' || actor.pose === 'getup') setPose(actor, 'stand');
    active.push(slot);
    return true;
  }

  function despawn(slot) {
    clearChat(slot);
    slot.active = false;
    slot.idle = 0;
    slot.panic = 0;
    slot.mayWait = false;
    slot.crossWait = 0;
    if (slot.actor) slot.actor.group.visible = false;
    const index = active.indexOf(slot);
    if (index >= 0) active.splice(index, 1);
  }

  function placeActor(slot, actor, speed, dt, time) {
    const head = actor.parts.head;
    head.rotation.y += (0 - head.rotation.y) * Math.min(1, dt * 6);
    head.rotation.x += (0 - head.rotation.x) * Math.min(1, dt * 6);
    const arm = actor.parts.rightArm;
    arm.rotation.z += (0 - arm.rotation.z) * Math.min(1, dt * 8);

    actor.x = slot.x;
    actor.z = slot.z;
    actor.heading = slot.heading;
    actor.group.position.set(slot.x, WALK_TOP + world.ground(slot.x, slot.z), slot.z);
    actor.group.rotation.y = slot.heading;
    animateActor(actor, speed, time + slot.seed, dt);
  }

  function step(slot, dt, time) {
    const actor = slot.actor;
    if (slot.dead || slot.down > 0 || actor.pose === 'getup') {
      placeActor(slot, actor, 0, dt, time);
      return;
    }

    // A car coming straight at someone on the pavement: run clear.
    if (!slot.crossing) {
      const danger = trafficNear(slot.x, slot.z, PANIC_RANGE, 2.5);
      if (danger) {
        slot.idle = 0;
        clearChat(slot);
        slot.panic = Math.max(slot.panic, 0.65);
        const dx = slot.x - danger.x;
        const dz = slot.z - danger.z;
        const len = Math.hypot(dx, dz) || 1;
        slot.dodgeX = dx / len;
        slot.dodgeZ = dz / len;
      }
    }

    if (slot.panic > 0) {
      slot.panic -= dt;
      const next = moveCircle(
        slot.x,
        slot.z,
        slot.dodgeX * PANIC_SPEED * dt,
        slot.dodgeZ * PANIC_SPEED * dt,
        NPC_RADIUS,
        solidColliders(slot),
      );
      const moved = Math.hypot(next.x - slot.x, next.z - slot.z);
      slot.x = next.x;
      slot.z = next.z;
      turnToward(slot, Math.atan2(slot.dodgeX, slot.dodgeZ), dt);
      placeActor(slot, actor, moved > 0.002 ? PANIC_SPEED : 0.6, dt, time);
      return;
    }

    if (slot.idle > 0) {
      slot.idle -= dt;
      if (slot.idle <= 0) {
        clearChat(slot);
        slot.idle = 0;
      } else {
        idleFrame(slot, dt, time);
        return;
      }
    }

    // Wait at the kerb while a car is coming through the crossing.
    if (slot.mayWait && slot.crossing) {
      const target = nodes[slot.target];
      const midX = (slot.x + target.x) / 2;
      const midZ = (slot.z + target.z) / 2;
      if (trafficNear(midX, midZ, CROSS_LOOK, 2)) {
        slot.crossWait += dt;
        if (slot.crossWait < CROSS_PATIENCE) {
          slot.idleKind = 'look';
          idleFrame(slot, dt, time);
          return;
        }
      }
      slot.mayWait = false;
      slot.crossWait = 0;
    }

    // Two people walking past each other sometimes stop to talk.
    if (slot.chatCooldown > 0) {
      slot.chatCooldown -= dt;
    } else {
      const partner = findChatPartner(slot);
      if (partner && Math.random() < 0.5) {
        startChat(slot, partner);
        idleFrame(slot, dt, time);
        return;
      }
      slot.chatCooldown = rnd(1.5, 3.5);
    }

    const target = nodes[slot.target];
    const dx = target.x - slot.x;
    const dz = target.z - slot.z;
    const dist = Math.hypot(dx, dz);

    // Everyone hurries to clear the road when a car is close.
    let speed = slot.speed;
    if (slot.crossing && trafficNear(slot.x, slot.z, 12, 2)) {
      speed = Math.max(speed, 3.3);
    }
    const move = speed * dt;

    if (dist <= Math.max(move, 0.06)) {
      slot.x = target.x;
      slot.z = target.z;
      const arrived = slot.target;
      const choice = chooseNext(arrived, slot.from);
      slot.target = choice.node;
      slot.crossing = choice.crossing;
      slot.from = arrived;
      slot.mayWait = choice.crossing;
      slot.crossWait = 0;
      if (chance(0.04)) {
        beginIdle(slot, rnd(0.7, 2.2));
        idleFrame(slot, dt, time);
        return;
      }
    } else {
      const stepX = (dx / dist) * move;
      const stepZ = (dz / dist) * move;
      const next = moveCircle(slot.x, slot.z, stepX, stepZ, NPC_RADIUS, solidColliders(slot));
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
    turnToward(slot, want, dt);
    placeActor(slot, actor, speed, dt, time);
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
      clearChat(slot);
      slot.active = false;
      slot.idle = 0;
      slot.panic = 0;
      slot.down = 0;
      slot.dead = false;
      slot.bleed = 0;
      slot.hitVX = 0;
      slot.hitVZ = 0;
      slot.hitCool = 0;
      slot.mayWait = false;
      slot.crossWait = 0;
      if (slot.actor) {
        if (slot.actor.pose === 'down' || slot.actor.pose === 'getup') setPose(slot.actor, 'stand');
        slot.actor.group.visible = false;
      }
    }
    active.length = 0;
  }

  // A punch sends nearby people in front into the existing panic run.
  function hit(x, z, heading, range = 1.8) {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    let hits = 0;
    for (const slot of active) {
      const dx = slot.x - x;
      const dz = slot.z - z;
      const dist = Math.hypot(dx, dz);
      if (slot.dead || slot.down > 0) continue;
      if (dist > range) continue;
      if (dist > 0.01 && (dx * fx + dz * fz) / dist < 0.2) continue;
      slot.idle = 0;
      clearChat(slot);
      slot.panic = Math.max(slot.panic, 1.1);
      const len = dist || 1;
      slot.dodgeX = dx / len;
      slot.dodgeZ = dz / len;
      hits += 1;
    }
    return hits;
  }

  return {
    update,
    reset,
    hit,
    positions() {
      return active;
    },
  };
}
