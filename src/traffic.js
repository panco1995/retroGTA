import * as THREE from 'three';
import { colorOf } from './config.js';
import { createVehicle } from './vehicle.js';
import { blocked, obbHitsObb } from './collision.js';

// Ambient cars circle the city blocks on the same lane network the city
// builds. Like the pedestrian crowd, they only spawn and despawn off camera.
const MAX_ACTIVE = 10;
const SPAWN_MIN = 45;
const SPAWN_MAX = 120;
const DESPAWN_RANGE = 140;
const SPAWNS_PER_FRAME = 1;
const SPAWN_TRIES = 24;
const MAX_PER_LOOP = 4;
const CLEAR_RANGE = 6;
const FOLLOW_RANGE = 9;
const FOLLOW_SIDE = 2.4;
const CLOSE_RANGE = 3.2;

const TRAFFIC_TYPES = [
  'sedan', 'sedan', 'sedan', 'taxi', 'hatchback',
  'suv', 'pickup', 'sports', 'van',
];
const TRAFFIC_COLORS = [
  '#8a8f92', '#3f4a52', '#c8c2b4', '#23342c', '#8a4a2c',
  '#a32121', '#2c3136', '#d6ae2b', '#6a6a72', '#4a5a6a',
  '#7a6a5a', '#2f4f3a', '#9a9a8e', '#5a3a3a',
];

const pick = (list) => list[(Math.random() * list.length) | 0];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function angleDelta(a, b) {
  let delta = a - b;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function samplePoint(loop, distance) {
  const total = loop.total;
  let s = distance % total;
  if (s < 0) s += total;
  let lo = 0;
  let hi = loop.cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (loop.cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const span = loop.cum[lo + 1] - loop.cum[lo];
  const t = span > 0 ? (s - loop.cum[lo]) / span : 0;
  const a = loop.points[lo];
  const b = loop.points[lo + 1];
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

function headingAt(loop, distance, ahead = 2.2) {
  const a = samplePoint(loop, distance);
  const b = samplePoint(loop, distance + ahead);
  return Math.atan2(b.x - a.x, b.z - a.z);
}

export function createTraffic({
  scene, world, camera, getFocus, getTarget,
}) {
  const loops = world.trafficLoops ?? [];
  const slots = [];
  const active = [];

  for (let i = 0; i < MAX_ACTIVE; i += 1) {
    slots.push({
      index: i,
      type: pick(TRAFFIC_TYPES),
      color: colorOf(pick(TRAFFIC_COLORS)),
      cruise: rnd(7, 11),
      vehicle: null,
      active: false,
      loop: null,
      s: 0,
    });
  }

  const viewPoint = new THREE.Vector3();
  const cameraPoint = new THREE.Vector3();

  function visibleAt(x, z) {
    viewPoint.set(x, world.ground(x, z) + 0.9, z);
    cameraPoint.copy(viewPoint).applyMatrix4(camera.matrixWorldInverse);
    if (cameraPoint.z > -0.2) return false;
    viewPoint.project(camera);
    return Math.abs(viewPoint.x) < 1.05
      && Math.abs(viewPoint.y) < 1.05
      && viewPoint.z < 1;
  }

  function carVisible(x, z, heading) {
    const fx = Math.sin(heading) * 2.2;
    const fz = Math.cos(heading) * 2.2;
    return visibleAt(x, z)
      || visibleAt(x + fx, z + fz)
      || visibleAt(x - fx, z - fz);
  }

  function ensureVehicle(slot) {
    if (slot.vehicle) return slot.vehicle;
    const vehicle = createVehicle({
      x: 0,
      z: 0,
      heading: 0,
      type: slot.type,
      color: slot.color,
    });
    vehicle.traffic = true;
    vehicle.trafficIndex = slot.index;
    vehicle.group.visible = false;
    scene.add(vehicle.group);
    slot.vehicle = vehicle;
    return vehicle;
  }

  function nearVehicle(x, z, range) {
    for (const vehicle of world.vehicles) {
      if (Math.hypot(vehicle.x - x, vehicle.z - z) < range) return true;
    }
    return false;
  }

  function findSpot(focus) {
    if (loops.length === 0) return null;
    for (let attempt = 0; attempt < SPAWN_TRIES; attempt += 1) {
      const loop = loops[(Math.random() * loops.length) | 0];
      if ((loop.cars ?? 0) >= MAX_PER_LOOP) continue;
      const s = Math.random() * loop.total;
      const point = samplePoint(loop, s);
      const dist = Math.hypot(point.x - focus.x, point.z - focus.z);
      if (dist < SPAWN_MIN || dist > SPAWN_MAX) continue;
      const heading = headingAt(loop, s);
      if (carVisible(point.x, point.z, heading)) continue;
      if (blocked(point.x, point.z, 1.4, world.colliders)) continue;
      if (nearVehicle(point.x, point.z, CLEAR_RANGE)) continue;
      return { loop, s, x: point.x, z: point.z, heading };
    }
    return null;
  }

  function activate(slot, spot) {
    const vehicle = ensureVehicle(slot);
    vehicle.x = spot.x;
    vehicle.z = spot.z;
    vehicle.heading = spot.heading;
    vehicle.y = world.ground(spot.x, spot.z);
    vehicle.pitch = 0;
    vehicle.speed = slot.cruise * 0.5;
    vehicle.steer = 0;
    vehicle.braking = false;
    vehicle.inUse = false;
    vehicle.sync();
    vehicle.group.visible = true;
    vehicle.collider();

    slot.loop = spot.loop;
    slot.s = spot.s;
    slot.active = true;
    spot.loop.cars = (spot.loop.cars ?? 0) + 1;
    active.push(slot);

    world.vehicles.push(vehicle);
    if (!world.colliders.includes(vehicle._aabb)) world.colliders.push(vehicle._aabb);
  }

  function deactivate(slot) {
    const vehicle = slot.vehicle;
    if (vehicle) {
      const vi = world.vehicles.indexOf(vehicle);
      if (vi >= 0) world.vehicles.splice(vi, 1);
      const ci = world.colliders.indexOf(vehicle._aabb);
      if (ci >= 0) world.colliders.splice(ci, 1);
      vehicle.speed = 0;
      vehicle.braking = false;
      vehicle.group.visible = false;
    }
    if (slot.loop) {
      slot.loop.cars = Math.max(0, (slot.loop.cars ?? 1) - 1);
    }
    slot.loop = null;
    slot.active = false;
    const index = active.indexOf(slot);
    if (index >= 0) active.splice(index, 1);
  }

  // The player took this car. It becomes a normal vehicle and the traffic slot
  // is freed; the car stays in world.vehicles as the player's new hero.
  function release(slot) {
    const vehicle = slot.vehicle;
    if (vehicle) {
      vehicle.traffic = false;
      vehicle.trafficIndex = undefined;
    }
    if (slot.loop) slot.loop.cars = Math.max(0, (slot.loop.cars ?? 1) - 1);
    slot.loop = null;
    slot.vehicle = null;
    slot.active = false;
    const index = active.indexOf(slot);
    if (index >= 0) active.splice(index, 1);
  }

  function obstacleAhead(vehicle) {
    const fx = Math.sin(vehicle.heading);
    const fz = Math.cos(vehicle.heading);

    for (const other of world.vehicles) {
      if (other === vehicle) continue;
      if (!other.inUse && !other.traffic) continue;
      const dx = other.x - vehicle.x;
      const dz = other.z - vehicle.z;
      const dist = Math.hypot(dx, dz);
      if (dist < CLOSE_RANGE) {
        if (other.traffic && !other.inUse
          && vehicle.speed < 0.5 && other.speed < 0.5
          && vehicle.trafficIndex < other.trafficIndex) {
          continue;
        }
        return true;
      }
      const along = dx * fx + dz * fz;
      if (along <= 1 || along > FOLLOW_RANGE) continue;
      if (Math.abs(dx * fz - dz * fx) > FOLLOW_SIDE) continue;
      return true;
    }
    return false;
  }

  function hitsVehicle(vehicle, x, z, heading) {
    const halfL = vehicle.length / 2;
    const halfW = vehicle.width / 2;
    for (let i = 0; i < world.vehicles.length; i++) {
      const other = world.vehicles[i];
      if (other === vehicle || (!other.inUse && !other.traffic)) continue;
      const box = other.collider();
      if (obbHitsObb(
        x, z, heading, halfL, halfW,
        box.x, box.z, box.heading, box.halfL, box.halfW,
      )) return true;
    }
    return false;
  }

  function drive(slot, dt, carjackTarget) {
    const vehicle = slot.vehicle;
    const loop = slot.loop;
    if (!vehicle || !loop) return;

    const turn = angleDelta(headingAt(loop, slot.s + 7), headingAt(loop, slot.s));
    let target = slot.cruise;
    if (Math.abs(turn) > 0.35) target = Math.min(target, 4.2);
    if (vehicle === carjackTarget) target = 0;
    if (obstacleAhead(vehicle)) target = 0;

    const diff = target - vehicle.speed;
    const rate = diff > 0 ? 5.5 : 11;
    vehicle.speed = Math.max(0, vehicle.speed + clamp(diff, -rate * dt, rate * dt));
    vehicle.braking = target === 0 && vehicle.speed > 0.15;

    // Impacts push the car off its lane for a moment; the offset settles back.
    const shoveDecay = Math.exp(-2.6 * dt);
    vehicle.shoveX *= shoveDecay;
    vehicle.shoveZ *= shoveDecay;
    vehicle.shoveYaw *= shoveDecay;

    const nextS = (slot.s + vehicle.speed * dt) % loop.total;
    const point = samplePoint(loop, nextS);
    const heading = headingAt(loop, nextS);
    // The path is a rail, so stop before driving into another car.
    // People are not a wall: a moving car runs them over.
    const enteredCar = hitsVehicle(vehicle, point.x, point.z, heading)
      && !hitsVehicle(vehicle, vehicle.x, vehicle.z, vehicle.heading);
    if (enteredCar) {
      vehicle.speed = Math.max(0, vehicle.speed - 14 * dt);
      vehicle.braking = vehicle.speed > 0.15;
      vehicle.steer = clamp(turn * 2.2, -0.5, 0.5);
      const base = samplePoint(loop, slot.s);
      vehicle.x = base.x + vehicle.shoveX;
      vehicle.z = base.z + vehicle.shoveZ;
      vehicle.heading = headingAt(loop, slot.s) + vehicle.shoveYaw;
      vehicle.collider();
      return;
    }
    slot.s = nextS;
    vehicle.x = point.x + vehicle.shoveX;
    vehicle.z = point.z + vehicle.shoveZ;
    vehicle.heading = heading + vehicle.shoveYaw;
    vehicle.steer = clamp(turn * 2.2, -0.5, 0.5);
    vehicle.y = world.ground(vehicle.x, vehicle.z);
    const nose = world.ground(
      vehicle.x + Math.sin(vehicle.heading) * 3,
      vehicle.z + Math.cos(vehicle.heading) * 3,
    );
    vehicle.pitch = -Math.atan2(nose - vehicle.y, 3);
    vehicle.collider();
  }

  function update(dt) {
    if (loops.length === 0) return;
    const focus = getFocus();
    if (!focus) return;
    camera.updateMatrixWorld();

    for (let i = active.length - 1; i >= 0; i -= 1) {
      const slot = active[i];
      if (slot.vehicle.inUse) {
        release(slot);
        continue;
      }
      const vehicle = slot.vehicle;
      const dist = Math.hypot(vehicle.x - focus.x, vehicle.z - focus.z);
      if (dist > DESPAWN_RANGE && !carVisible(vehicle.x, vehicle.z, vehicle.heading)) {
        deactivate(slot);
      }
    }

    const carjackTarget = getTarget ? getTarget() : null;
    for (const slot of active) drive(slot, dt, carjackTarget);

    let budget = SPAWNS_PER_FRAME;
    while (active.length < MAX_ACTIVE && budget > 0) {
      const slot = slots.find((item) => !item.active);
      if (!slot) break;
      const spot = findSpot(focus);
      if (!spot) break;
      activate(slot, spot);
      budget -= 1;
    }
  }

  function reset() {
    for (let i = active.length - 1; i >= 0; i -= 1) deactivate(active[i]);
    for (const loop of loops) loop.cars = 0;
  }

  return { update, reset };
}
