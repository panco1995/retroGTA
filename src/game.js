import * as THREE from 'three';
import { WALK_TOP } from './config.js';
import { brickTexture } from './materials.js';
import { createInput } from './input.js';
import { blocked, circleExitsFromObb, moveCircle, obbHitsCircle, vehicleBlocked } from './collision.js';
import { ATTACK_TIME, animateActor, createActor, setPose } from './actor.js';
import { buildCity } from './city.js';
import { createMinimap } from './minimap.js';
import { createPedestrianCrowd } from './npc.js';
import { createTraffic } from './traffic.js';
import { onLangChange, t } from './i18n.js';
import { keyVars, onBindingsChange } from './bindings.js';
import { backPage, currentPage, onPageChange, openMainMenu, showPage, showPauseHome } from './menu.js';
import { VEHICLE_TYPES, vehicleFootprint } from './vehicle.js';
import { createBlood } from './blood.js';

const VIEW_ORDER = ['follow', 'first', 'top', 'iso'];
const VIEW_LABELS = {
  follow: 'viewFollow',
  first: 'viewFirst',
  top: 'viewTop',
  iso: 'viewIso',
};
// Views that use the mouse and pointer lock.
const LOOK_VIEWS = new Set(['follow', 'first']);

const ENTER_RANGE = 20;
// The prompt only appears when the player is close, even though pressing the
// interact key can still walk to a car from further away.
const PROMPT_RANGE = 5.5;
const JUMP_SPEED = 7.4;
// A moving car is much heavier than a person. Creeping still shoves them
// over; road speed runs them over. A stopped car stays solid.
const KNOCK_SPEED = 1.8;
const KILL_SPEED = 6;
const GRAVITY = 24;
const ATTACK_RANGE = 1.9;

const CHEAT_COLORS = {
  sedan: '#3f4a52',
  taxi: '#d6ae2b',
  hatchback: '#c8c2b4',
  suv: '#23342c',
  pickup: '#8a4a2c',
  sports: '#a32121',
  van: '#2c3136',
  bus: '#2f6b4f',
  truck: '#c9c4b8',
  excavator: '#d9a520',
  tractor: '#2f6b3a',
  ambulance: '#f2f0e8',
  firetruck: '#c02626',
  police: '#f2f0e8',
  mixer: '#d9a520',
};

export function createGame(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  brickTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8b97a1);
  scene.fog = new THREE.Fog(0x8b97a1, 70, 520);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);

  const hemi = new THREE.HemisphereLight(0xd5e0e8, 0x4a4036, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(48, 72, 36);
  sun.target.position.set(10, 0, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 48;
  sun.shadow.camera.bottom = -48;
  sun.shadow.camera.near = 8;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xc5d4e0, 0.55);
  fill.position.set(-36, 28, -24);
  scene.add(fill);

  const world = buildCity();
  scene.add(world.group);

  const spawn = world.spawn;
  const player = createActor({
    x: spawn.x,
    z: spawn.z,
    heading: spawn.heading,
    shirt: 0x1a1c22,
    pants: 0x2a3648,
    hair: 0x16110e,
  });
  player.x = spawn.x;
  player.z = spawn.z;
  player.heading = spawn.heading;
  player.jumpY = 0;
  player.jumpV = 0;
  player.airborne = false;
  player.attack = 0;
  player.group.position.set(spawn.x, WALK_TOP + world.ground(spawn.x, spawn.z), spawn.z);
  player.group.rotation.y = spawn.heading;
  scene.add(player.group);

  // People pinned in the map file by hand: they always exist and walk their
  // own path, unlike the crowd that streams around the player.
  const peds = world.pedestrians.map((spec) => {
    const actor = createActor(spec);
    actor.x = spec.x;
    actor.z = spec.z;
    actor.heading = spec.heading;
    actor.speed = spec.speed;
    actor.path = spec.path;
    actor.index = 0;
    actor.dir = 1;
    actor.group.position.set(spec.x, WALK_TOP + world.ground(spec.x, spec.z), spec.z);
    actor.group.rotation.y = spec.heading;
    scene.add(actor.group);
    return actor;
  });

  let hero = world.vehicles.find((v) => v.driveable);
  const vehicleHome = world.vehicles.map((vehicle) => ({
    vehicle,
    x: vehicle.x,
    z: vehicle.z,
    heading: vehicle.heading,
    y: vehicle.y,
    pitch: vehicle.pitch,
    driveable: vehicle.driveable,
  }));
  const pedHome = peds.map((ped) => ({ x: ped.x, z: ped.z, heading: ped.heading }));
  const input = createInput(canvas);
  const minimap = createMinimap(document.getElementById('map'), world);

  let started = false;
  let paused = false;
  let suppressEsc = false;
  // Tracks whether the map was opened straight from gameplay with its hotkey,
  // so closing it resumes the game instead of landing on the pause menu.
  let mapFromGame = false;
  let mode = 'foot';
  let view = 'follow';
  let approach = null;
  let flash = null;
  let hintTime = 0;
  let yaw = Math.PI;
  let pitch = 0.32;
  const scratch = [];
  const staticCols = [];
  const blood = createBlood(scene);
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let camReady = false;
  const crowd = createPedestrianCrowd({
    scene,
    world,
    camera,
    getFocus: () => (mode === 'drive' ? hero : player),
    avoid: () => peds,
    getExtraColliders: () => (mode === 'drive' && hero ? [hero.collider()] : null),
    getNeighbors: () => neighborBodies(),
  });
  const traffic = createTraffic({
    scene,
    world,
    camera,
    getFocus: () => (mode === 'drive' ? hero : player),
    getTarget: () => approach?.vehicle ?? null,
  });

  const speedEl = document.getElementById('speed');
  const hintEl = document.getElementById('hint');
  const promptEl = document.getElementById('prompt');
  const promptKeyEl = document.getElementById('prompt-key');
  const promptLabelEl = document.getElementById('prompt-label');
  const toastEl = document.getElementById('toast');
  const menuEl = document.getElementById('menu');
  const hudEl = document.getElementById('hud');
  const pauseEl = document.getElementById('pause');
  const cheatSelect = document.getElementById('cheat-vehicle-type');
  const cheatStatus = document.getElementById('cheat-status');
  const mapPanel = document.getElementById('pause-map-panel');
  const mapCanvas = document.getElementById('pause-map-canvas');
  const viewOptionsEl = document.getElementById('view-options');

  function syncViewOptions() {
    viewOptionsEl.querySelectorAll('[data-view]').forEach((el) => {
      el.textContent = t(VIEW_LABELS[el.dataset.view]);
      el.setAttribute('aria-pressed', el.dataset.view === view ? 'true' : 'false');
    });
  }

  function setView(next) {
    view = next;
    if (next !== 'first') pitch = THREE.MathUtils.clamp(pitch, -0.15, 1.05);
    syncViewOptions();
  }

  function mountViewOptions() {
    viewOptionsEl.replaceChildren();
    for (const name of VIEW_ORDER) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.view = name;
      button.addEventListener('click', () => {
        setView(name);
        if (!LOOK_VIEWS.has(name)) document.exitPointerLock();
      });
      viewOptionsEl.append(button);
    }
    syncViewOptions();
  }

  function placeOnFoot(actor, x, z, heading) {
    actor.x = x;
    actor.z = z;
    actor.heading = heading;
    actor.group.position.set(x, WALK_TOP + world.ground(x, z), z);
    actor.group.rotation.set(0, heading, 0);
  }

  function vehicleLabel(type) {
    return t(`vehicle_${type}`);
  }

  // Distance from a point to the body of a vehicle (0 when inside it).
  function vehicleDistance(vehicle, x, z) {
    const box = vehicle.collider();
    const cx = x < box.minX ? box.minX : x > box.maxX ? box.maxX : x;
    const cz = z < box.minZ ? box.minZ : z > box.maxZ ? box.maxZ : z;
    return Math.hypot(x - cx, z - cz);
  }

  // Every vehicle can be driven, so the only filter is the pick up range.
  function findEnterableVehicle(x, z, range = ENTER_RANGE) {
    let best = null;
    let bestDist = range;
    for (const vehicle of world.vehicles) {
      if (vehicle.inUse) continue;
      const dist = vehicleDistance(vehicle, x, z);
      if (dist < bestDist) {
        bestDist = dist;
        best = vehicle;
      }
    }
    return best;
  }

  // A spot beside the vehicle, outside the body. side -1 and 1 are the two flanks.
  function sideSpot(vehicle, side) {
    const h = vehicle.heading;
    const lateral = vehicle.width / 2 + player.radius + 0.32;
    return {
      side,
      x: vehicle.x + side * Math.cos(h) * lateral,
      z: vehicle.z - side * Math.sin(h) * lateral,
    };
  }

  // The nearer flank that is not inside a wall. prefer keeps the walk from
  // flipping sides when both are almost the same distance.
  function approachSpot(vehicle, prefer) {
    const spots = [sideSpot(vehicle, -1), sideSpot(vehicle, 1)];
    const open = spots.filter((spot) => !blocked(spot.x, spot.z, player.radius, world.colliders));
    const pool = open.length > 0 ? open : spots;
    const dist = (spot) => Math.hypot(spot.x - player.x, spot.z - player.z);
    if (prefer === -1 || prefer === 1) {
      const kept = pool.find((spot) => spot.side === prefer);
      const other = pool.find((spot) => spot.side !== prefer);
      if (kept && (!other || dist(kept) <= dist(other) + 0.8)) return kept;
      if (other) return other;
    }
    pool.sort((a, b) => dist(a) - dist(b));
    return pool[0];
  }

  function addVehicleCollider(vehicle) {
    const box = vehicle.collider();
    if (!world.colliders.includes(box)) world.colliders.push(box);
  }

  function removeVehicleCollider(vehicle) {
    const box = vehicle.collider();
    const index = world.colliders.indexOf(box);
    if (index >= 0) world.colliders.splice(index, 1);
  }

  function activateHero(next) {
    if (!next) return;
    const previous = hero;
    if (previous && previous !== next) {
      previous.inUse = false;
      previous.speed = 0;
      previous.braking = false;
      addVehicleCollider(previous);
    }
    removeVehicleCollider(next);
    next.inUse = true;
    hero = next;
  }

  function findSpawnSpot(origin, facing, radius) {
    const cols = [...world.colliders, hero.collider()];
    const angles = [
      0, Math.PI / 2, -Math.PI / 2, Math.PI,
      Math.PI / 4, -Math.PI / 4, Math.PI * 0.75, -Math.PI * 0.75,
    ];
    const distances = [radius + 2.5, radius + 5, radius + 8, radius + 12];
    for (const distance of distances) {
      for (const angle of angles) {
        const heading = facing + angle;
        const x = origin.x + Math.sin(heading) * distance;
        const z = origin.z + Math.cos(heading) * distance;
        if (!blocked(x, z, radius, cols)) return { x, z };
      }
    }
    return null;
  }

  function removeCheatVehicles() {
    for (let i = world.vehicles.length - 1; i >= 0; i -= 1) {
      const vehicle = world.vehicles[i];
      if (!vehicle.cheat) continue;
      const index = world.colliders.indexOf(vehicle._aabb);
      if (index >= 0) world.colliders.splice(index, 1);
      vehicle.group.removeFromParent();
      vehicle.group.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
      });
      world.vehicles.splice(i, 1);
    }
    for (let i = vehicleHome.length - 1; i >= 0; i -= 1) {
      if (vehicleHome[i].vehicle.cheat) vehicleHome.splice(i, 1);
    }
  }

  function syncVehicleColliders() {
    for (const home of vehicleHome) removeVehicleCollider(home.vehicle);
    for (const home of vehicleHome) addVehicleCollider(home.vehicle);
  }

  function spawnCheatVehicle(type) {
    const origin = mode === 'drive' ? hero : player;
    const facing = mode === 'drive' ? hero.heading : player.heading;
    const size = vehicleFootprint(type);
    const radius = Math.max(size.length, size.width) / 2 + 0.4;
    const spot = findSpawnSpot(origin, facing, radius);
    if (!spot) {
      cheatStatus.textContent = t('cheatNoRoom');
      return;
    }
    const vehicle = world.spawnVehicle({
      x: spot.x,
      z: spot.z,
      heading: facing,
      type,
      color: CHEAT_COLORS[type] ?? '#8a8f92',
      driveable: true,
    });
    vehicle.cheat = true;
    addVehicleCollider(vehicle);
    vehicleHome.push({
      vehicle,
      x: vehicle.x,
      z: vehicle.z,
      heading: vehicle.heading,
      y: vehicle.y,
      pitch: vehicle.pitch,
      driveable: true,
    });
    cheatStatus.textContent = t('cheatSpawned', { vehicle: vehicleLabel(type) });
  }

  function fillCheatVehicles() {
    const selected = cheatSelect.value;
    cheatSelect.replaceChildren();
    for (const type of VEHICLE_TYPES) {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = vehicleLabel(type);
      cheatSelect.append(option);
    }
    if (selected) cheatSelect.value = selected;
    cheatStatus.textContent = '';
  }

  function resetSession() {
    if (mode === 'drive') {
      scene.attach(player.group);
      setPose(player, 'stand');
    }
    mode = 'foot';
    setView('follow');
    approach = null;
    player.jumpY = 0;
    player.jumpV = 0;
    player.airborne = false;
    player.attack = 0;
    player.down = 0;
    player.dead = false;
    player.bleed = 0;
    setPose(player, 'stand');
    blood.reset();
    removeCheatVehicles();
    // A car taken from traffic is not in vehicleHome; leave it parked where it
    // was instead of keeping it marked as driven with no collider.
    if (hero && !hero.cheat && !vehicleHome.some((home) => home.vehicle === hero)) {
      hero.traffic = false;
      hero.trafficIndex = undefined;
      hero.inUse = false;
      hero.speed = 0;
      hero.braking = false;
      addVehicleCollider(hero);
    }
    for (const home of vehicleHome) {
      home.vehicle.inUse = false;
    }
    hero = vehicleHome.find((home) => home.driveable)?.vehicle ?? hero;
    placeOnFoot(player, spawn.x, spawn.z, spawn.heading);
    yaw = spawn.heading;
    pitch = 0.3;
    camReady = false;
    for (const home of vehicleHome) {
      home.vehicle.x = home.x;
      home.vehicle.z = home.z;
      home.vehicle.heading = home.heading;
      home.vehicle.y = home.y;
      home.vehicle.pitch = home.pitch;
      home.vehicle.speed = 0;
      home.vehicle.steer = 0;
      home.vehicle.braking = false;
      home.vehicle.sync();
      home.vehicle.collider();
    }
    syncVehicleColliders();
    peds.forEach((ped, index) => {
      const home = pedHome[index];
      ped.index = 0;
      ped.dir = 1;
      ped.stun = 0;
      ped.down = 0;
      ped.dead = false;
      ped.bleed = 0;
      placeOnFoot(ped, home.x, home.z, home.heading);
      setPose(ped, 'stand');
    });
    crowd.reset();
    traffic.reset();
    world.reset();
    hintTime = 12;
    input.release();
  }

  function openPause() {
    if (!started || paused) return;
    showPauseHome();
    paused = true;
    suppressEsc = true;
    document.exitPointerLock();
    pauseEl.classList.remove('hidden');
    input.release();
    setTimeout(() => {
      suppressEsc = false;
    }, 250);
  }

  function closePause() {
    if (!paused) return;
    paused = false;
    mapFromGame = false;
    pauseEl.classList.add('hidden');
    input.release();
    if (LOOK_VIEWS.has(view)) input.lock();
  }

  function closeMap() {
    if (mapFromGame) closePause();
    else showPauseHome();
  }

  // The map hotkey works during play and while the map is up; elsewhere in the
  // pause menu it stays out of the way.
  function toggleMap() {
    if (!started || suppressEsc) return;
    if (!paused) {
      openPause();
      mapFromGame = true;
      showPage('pause', 'map');
      return;
    }
    if (currentPage().page === 'map') closeMap();
  }

  function carHits(vehicle, x, z) {
    return vehicleBlocked(
      x,
      z,
      vehicle.heading,
      vehicle.length,
      vehicle.width,
      world.colliders,
      null,
    );
  }

  // A car that has already overlapped someone keeps them inside, because
  // moveCircle refuses every step that is still blocked. Push them out to the
  // nearest edge, unless that edge is a wall.
  function separatePeople() {
    staticCols.length = 0;
    for (let i = 0; i < world.colliders.length; i++) {
      const box = world.colliders[i];
      if (!box.obb) staticCols.push(box);
    }
    const ignore = mode === 'foot' ? (approach?.vehicle ?? null) : null;
    if (mode === 'foot') separateBody(player, player.radius, ignore);
    for (let i = 0; i < peds.length; i++) separateBody(peds[i], peds[i].radius, null);
    const slots = crowd.positions();
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!separateBody(slot, slot.radius || 0.36, null) || !slot.actor) continue;
      slot.actor.x = slot.x;
      slot.actor.z = slot.z;
      slot.actor.group.position.set(slot.x, WALK_TOP + world.ground(slot.x, slot.z), slot.z);
    }
  }

  function separateBody(body, radius, ignore) {
    let x = body.x;
    let z = body.z;
    let changed = false;
    for (let pass = 0; pass < 3; pass += 1) {
      for (let i = 0; i < world.vehicles.length; i++) {
        const vehicle = world.vehicles[i];
        if (vehicle === ignore || vehicle.group.visible === false) continue;
        if (Math.abs(vehicle.speed || 0) >= KNOCK_SPEED) continue;
        const exits = circleExitsFromObb(
          x,
          z,
          radius,
          vehicle.x,
          vehicle.z,
          vehicle.heading,
          vehicle.length / 2,
          vehicle.width / 2,
        );
        if (!exits) continue;
        let freed = null;
        for (let edge = 0; edge < exits.length; edge += 1) {
          const candidate = exits[edge];
          if (!blocked(candidate.x, candidate.z, radius, staticCols)) {
            freed = candidate;
            break;
          }
        }
        if (!freed) continue;
        x = freed.x;
        z = freed.z;
        changed = true;
      }
    }
    if (!changed) return false;
    body.x = x;
    body.z = z;
    if (body.group) {
      body.group.position.set(
        x,
        WALK_TOP + world.ground(x, z) + (body.jumpY || 0),
        z,
      );
    }
    return true;
  }

  function eachPerson() {
    const list = [];
    if (mode === 'foot') list.push({ body: player, actor: player, radius: player.radius });
    for (let i = 0; i < peds.length; i++) {
      list.push({ body: peds[i], actor: peds[i], radius: peds[i].radius });
    }
    const slots = crowd.positions();
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot.actor) continue;
      list.push({ body: slot, actor: slot.actor, radius: slot.radius || 0.36 });
    }
    return list;
  }

  function syncPerson(body, actor) {
    actor.x = body.x;
    actor.z = body.z;
    actor.heading = body.heading;
    actor.group.position.set(
      body.x,
      WALK_TOP + world.ground(body.x, body.z) + (body.jumpY || 0),
      body.z,
    );
    actor.group.rotation.y = body.heading;
  }

  function respawnPlayer() {
    player.dead = false;
    player.down = 0;
    player.bleed = 0;
    player.airborne = false;
    player.jumpY = 0;
    player.jumpV = 0;
    approach = null;
    setPose(player, 'stand');
    placeOnFoot(player, spawn.x, spawn.z, spawn.heading);
    flash = { text: t('wasted'), timer: 2.4 };
  }

  // The car keeps going. A hard hit kills; a slow shove only knocks them flat.
  function crushPeople(dt) {
    staticCols.length = 0;
    for (let i = 0; i < world.colliders.length; i += 1) {
      if (!world.colliders[i].obb) staticCols.push(world.colliders[i]);
    }
    const people = eachPerson();
    for (let v = 0; v < world.vehicles.length; v += 1) {
      const vehicle = world.vehicles[v];
      if (vehicle.group.visible === false) continue;
      const speed = Math.abs(vehicle.speed || 0);
      if (speed < KNOCK_SPEED) continue;
      const dir = Math.sign(vehicle.speed) || 1;
      const fx = Math.sin(vehicle.heading) * dir;
      const fz = Math.cos(vehicle.heading) * dir;
      const halfL = vehicle.length / 2;
      const halfW = vehicle.width / 2;
      const fatal = speed >= KILL_SPEED;
      let slowed = false;
      for (let p = 0; p < people.length; p += 1) {
        const { body, actor, radius } = people[p];
        if (!obbHitsCircle(vehicle.x, vehicle.z, vehicle.heading, halfL, halfW, body.x, body.z, radius)) {
          continue;
        }
        if (body === player) {
          body.jumpY = 0;
          body.jumpV = 0;
          body.airborne = false;
        }
        const shove = Math.min(speed, 12) * dt * 0.95;
        const next = moveCircle(body.x, body.z, fx * shove, fz * shove, radius, staticCols);
        body.x = next.x;
        body.z = next.z;
        body.heading = Math.atan2(fx, fz);
        const y = world.ground(body.x, body.z);
        if (body.dead) {
          if ((body.bleed || 0) <= 0) {
            blood.spill(body.x, body.z, y, true);
            body.bleed = 0.45;
          }
        } else if (fatal || !(body.down > 0)) {
          if (fatal) {
            body.dead = true;
            body.down = body === player ? 3.6 : 1;
          } else {
            body.down = 6.5;
            body.dead = false;
          }
          if (actor.pose !== 'down') setPose(actor, 'down');
          if (body.chatPartner) {
            const partner = body.chatPartner;
            body.chatPartner = null;
            body.idle = 0;
            if (partner.chatPartner === body) partner.chatPartner = null;
          }
          blood.spill(body.x, body.z, y, fatal);
          body.bleed = fatal ? 0.3 : 0.65;
          if (!slowed) {
            vehicle.speed *= fatal ? 0.93 : 0.78;
            slowed = true;
          }
          if (body === player) approach = null;
        }
        syncPerson(body, actor);
      }
    }
  }

  function unclipPeople() {
    const people = eachPerson();
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < people.length; i += 1) {
        for (let j = i + 1; j < people.length; j += 1) {
          const a = people[i];
          const b = people[j];
          let dx = b.body.x - a.body.x;
          let dz = b.body.z - a.body.z;
          const min = a.radius + b.radius;
          let dist = Math.hypot(dx, dz);
          if (dist >= min) continue;
          if (dist < 0.0001) {
            dx = 1;
            dz = 0;
            dist = 1;
          }
          const push = (min - dist) / 2;
          const nx = dx / dist;
          const nz = dz / dist;
          const ax = a.body.x - nx * push;
          const az = a.body.z - nz * push;
          const bx = b.body.x + nx * push;
          const bz = b.body.z + nz * push;
          if (!blocked(ax, az, a.radius, staticCols)) {
            a.body.x = ax;
            a.body.z = az;
          }
          if (!blocked(bx, bz, b.radius, staticCols)) {
            b.body.x = bx;
            b.body.z = bz;
          }
        }
      }
    }
    for (let i = 0; i < people.length; i += 1) syncPerson(people[i].body, people[i].actor);
  }

  function tickBodies(dt) {
    const people = eachPerson();
    for (let i = 0; i < people.length; i += 1) {
      const { body, actor } = people[i];
      if (!body.dead && !(body.down > 0)) continue;
      if (body.bleed > 0) body.bleed -= dt;
      else {
        blood.drip(body.x, body.z, world.ground(body.x, body.z));
        body.bleed = body.dead ? 0.42 : 0.85;
      }
      if (body.dead) {
        if (body === player) {
          body.down -= dt;
          if (body.down <= 0) respawnPlayer();
        }
        continue;
      }
      body.down -= dt;
      if (body.down <= 0) {
        body.down = 0;
        body.bleed = 0;
        setPose(actor, 'stand');
      }
    }
  }

  function personHit(person) {
    let hit = person.hit;
    if (!hit) {
      hit = { circle: true, x: 0, z: 0, radius: 0.36 };
      person.hit = hit;
    }
    hit.x = person.x;
    hit.z = person.z;
    hit.radius = person.radius || 0.36;
    return hit;
  }

  function neighborBodies() {
    scratch.length = 0;
    if (mode === 'foot') scratch.push(player);
    for (let i = 0; i < peds.length; i++) scratch.push(peds[i]);
    return scratch;
  }

  function collidersFor(includeHero, ignore, ignorePerson) {
    scratch.length = 0;
    for (const c of world.colliders) {
      if (ignore && c === ignore._aabb) continue;
      scratch.push(c);
    }
    if (includeHero && hero && hero !== ignore && !scratch.includes(hero.collider())) {
      scratch.push(hero.collider());
    }
    if (mode === 'foot' && player !== ignorePerson) scratch.push(personHit(player));
    for (let i = 0; i < peds.length; i++) {
      if (peds[i] !== ignorePerson) scratch.push(personHit(peds[i]));
    }
    const slots = crowd.positions();
    for (let i = 0; i < slots.length; i++) {
      if (slots[i] !== ignorePerson) scratch.push(personHit(slots[i]));
    }
    return scratch;
  }

  function enterCar() {
    mode = 'drive';
    player.jumpY = 0;
    player.jumpV = 0;
    player.airborne = false;
    player.attack = 0;
    hero.group.attach(player.group);
    player.group.position.set(-0.36, 0.22, -0.15);
    player.group.rotation.set(0, 0, 0);
    setPose(player, 'sit');
    hero.speed = 0;
    input.release();
  }

  function beginEnter(vehicle) {
    approach = null;
    activateHero(vehicle);
    enterCar();
  }

  function exitCar() {
    const vehicle = hero;
    const spots = [
      sideSpot(vehicle, -1),
      sideSpot(vehicle, 1),
      {
        x: vehicle.x - Math.sin(vehicle.heading) * (vehicle.sideExtent() + player.radius + 0.35),
        z: vehicle.z - Math.cos(vehicle.heading) * (vehicle.sideExtent() + player.radius + 0.35),
      },
    ];
    const cols = world.colliders;
    let spot = spots[0];
    for (const candidate of spots) {
      if (!blocked(candidate.x, candidate.z, player.radius, cols)) {
        spot = candidate;
        break;
      }
    }
    scene.attach(player.group);
    mode = 'foot';
    player.jumpY = 0;
    player.jumpV = 0;
    player.airborne = false;
    player.attack = 0;
    player.x = spot.x;
    player.z = spot.z;
    player.heading = Math.atan2(vehicle.x - spot.x, vehicle.z - spot.z);
    player.group.position.set(spot.x, WALK_TOP + world.ground(spot.x, spot.z), spot.z);
    player.group.rotation.set(0, player.heading, 0);
    setPose(player, 'stand');
    vehicle.speed = 0;
    vehicle.braking = false;
    // The parked car becomes solid again once the character is out.
    addVehicleCollider(vehicle);
    vehicle.inUse = false;
    input.release();
  }

  function moveYaw() {
    if (view === 'top') return Math.PI;
    if (view === 'iso') return Math.PI * 0.75;
    return yaw;
  }

  function updateJump(dt) {
    if (input.consume('brake') && !player.airborne) {
      player.airborne = true;
      player.jumpV = JUMP_SPEED;
    }
    if (!player.airborne) return;
    player.jumpV -= GRAVITY * dt;
    player.jumpY += player.jumpV * dt;
    if (player.jumpY <= 0) {
      player.jumpY = 0;
      player.jumpV = 0;
      player.airborne = false;
    }
  }

  function strike() {
    crowd.hit(player.x, player.z, player.heading, ATTACK_RANGE);
    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    for (const ped of peds) {
      const dx = ped.x - player.x;
      const dz = ped.z - player.z;
      const dist = Math.hypot(dx, dz);
      if (dist > ATTACK_RANGE) continue;
      if (dist > 0.01 && (dx * fx + dz * fz) / dist < 0.2) continue;
      ped.stun = 1.1;
      const len = dist || 1;
      ped.stunX = dx / len;
      ped.stunZ = dz / len;
    }
  }

  function updateWalk(dt, time) {
    let ix = 0;
    let iz = 0;
    const face = moveYaw();
    const fx = Math.sin(face);
    const fz = Math.cos(face);
    const rx = -Math.cos(face);
    const rz = Math.sin(face);
    if (input.w) { ix += fx; iz += fz; }
    if (input.s) { ix -= fx; iz -= fz; }
    if (input.d) { ix += rx; iz += rz; }
    if (input.a) { ix -= rx; iz -= rz; }
    const len = Math.hypot(ix, iz);
    let speed = 0;
    if (len > 0.001) {
      ix /= len;
      iz /= len;
      speed = input.run ? 6.8 : 3.35;
      const target = Math.atan2(ix, iz);
      let delta = target - player.heading;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      player.heading += delta * (1 - Math.pow(0.0008, dt));
      player.group.rotation.y = player.heading;
    }
    const step = moveCircle(player.x, player.z, ix * speed * dt, iz * speed * dt, player.radius, collidersFor(true, null, player));
    player.x = step.x;
    player.z = step.z;
    player.group.position.set(
      player.x,
      WALK_TOP + world.ground(player.x, player.z) + player.jumpY,
      player.z,
    );
    animateActor(player, speed, time, dt);
  }

  // Walks to the nearer side of the vehicle. The body stays solid, so the
  // character goes around it instead of through it.
  function updateApproach(dt, time) {
    const target = approach;
    const spot = approachSpot(target.vehicle, target.side);
    target.side = spot.side;
    target.x = spot.x;
    target.z = spot.z;
    const dx = target.x - player.x;
    const dz = target.z - player.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.55) {
      beginEnter(target.vehicle);
      return;
    }
    const speed = 4.4;
    const step = moveCircle(
      player.x,
      player.z,
      (dx / dist) * speed * dt,
      (dz / dist) * speed * dt,
      player.radius,
      collidersFor(true, null, player),
    );
    player.x = step.x;
    player.z = step.z;
    player.group.position.set(player.x, WALK_TOP + world.ground(player.x, player.z), player.z);
    player.heading = Math.atan2(dx, dz);
    player.group.rotation.y = player.heading;
    animateActor(player, speed, time, dt);
    target.timer += dt;
    if (target.timer > 8) {
      approach = null;
      flash = { text: t('approachFail'), timer: 1.6 };
    }
  }

  function updateFoot(dt, time) {
    if (player.dead || player.down > 0) {
      input.consume('attack');
      input.consume('interact');
      approach = null;
      return;
    }
    updateJump(dt);
    if (player.attack > 0) player.attack = Math.max(0, player.attack - dt);
    if (input.consume('attack') && player.attack <= 0 && !player.airborne) {
      player.heading = moveYaw();
      player.group.rotation.y = player.heading;
      player.attack = ATTACK_TIME;
      strike();
    }

    if (approach && (input.w || input.a || input.s || input.d || player.airborne)) approach = null;
    if (approach) {
      updateApproach(dt, time);
    } else {
      updateWalk(dt, time);
    }

    if (input.consume('interact') && !player.airborne) {
      if (approach) {
        approach = null;
      } else {
        const target = findEnterableVehicle(player.x, player.z);
        if (target) {
          const spot = approachSpot(target);
          if (Math.hypot(spot.x - player.x, spot.z - player.z) < 0.7) {
            beginEnter(target);
          } else {
            approach = { vehicle: target, x: spot.x, z: spot.z, side: spot.side, timer: 0 };
          }
          input.release();
        } else {
          flash = { text: t('noVehicle'), timer: 1.6 };
        }
      }
    }
  }

  function updateDrive(dt) {
    const throttle = (input.w ? 1 : 0) - (input.s ? 1 : 0);
    // heading 0 points the nose toward +Z, so a right turn must decrease heading.
    const steerInput = (input.a ? 1 : 0) - (input.d ? 1 : 0);
    hero.braking = input.brake && Math.abs(hero.speed) > 0.2;
    const accel = throttle > 0 ? 9.5 : 7.5;
    hero.speed += throttle * accel * dt;
    if (hero.braking) hero.speed -= Math.sign(hero.speed) * 22 * dt;
    const drag = throttle === 0 ? 2.1 : 0.35;
    hero.speed -= Math.sign(hero.speed) * drag * dt;
    if (throttle === 0 && !hero.braking && Math.abs(hero.speed) < 0.18) hero.speed = 0;
    hero.speed = THREE.MathUtils.clamp(hero.speed, -5.5, 16);

    const rolling = Math.abs(hero.speed) > 0.25;
    const speedFactor = THREE.MathUtils.clamp(Math.abs(hero.speed) / 2.4, 0, 1);
    const high = 1 / (1 + Math.abs(hero.speed) * 0.045);
    if (rolling) {
      hero.heading += steerInput * 1.45 * speedFactor * high * (hero.speed >= 0 ? 1 : -1) * dt;
    }
    hero.steer = steerInput * 0.38;

    const vx = Math.sin(hero.heading) * hero.speed;
    const vz = Math.cos(hero.heading) * hero.speed;
    const nx = hero.x + vx * dt;
    if (!carHits(hero, nx, hero.z)) hero.x = nx;
    else hero.speed *= -0.22;
    const nz = hero.z + vz * dt;
    if (!carHits(hero, hero.x, nz)) hero.z = nz;
    else hero.speed *= -0.22;
    hero.collider();

    const ahead = 3;
    hero.y = world.ground(hero.x, hero.z);
    const nose = world.ground(
      hero.x + Math.sin(hero.heading) * ahead,
      hero.z + Math.cos(hero.heading) * ahead,
    );
    hero.pitch = -Math.atan2(nose - hero.y, ahead);

    // Only leave the car once it is slow enough, but keep the key pending so
    // a press while moving fast still works once the car has slowed down.
    if (Math.abs(hero.speed) < 2.5 && input.consume('interact')) exitCar();
  }

  // A moving car heading straight at this point, if any.
  function threatAt(x, z) {
    for (const vehicle of world.vehicles) {
      const speed = Math.abs(vehicle.speed ?? 0);
      if (speed < 3) continue;
      const dx = x - vehicle.x;
      const dz = z - vehicle.z;
      if (Math.hypot(dx, dz) > 5.5) continue;
      const dir = Math.sign(vehicle.speed) || 1;
      const fx = Math.sin(vehicle.heading) * dir;
      const fz = Math.cos(vehicle.heading) * dir;
      if (dx * fx + dz * fz <= 0.1) continue;
      if (Math.abs(dx * fz - dz * fx) > 2.8) continue;
      return vehicle;
    }
    return null;
  }

  function updatePeds(dt, time) {
    for (const ped of peds) {
      if (ped.dead || ped.down > 0) {
        ped.group.position.set(ped.x, WALK_TOP + world.ground(ped.x, ped.z), ped.z);
        ped.group.rotation.y = ped.heading;
        continue;
      }
      if (ped.stun > 0) {
        ped.stun -= dt;
        const run = 4.2;
        const next = moveCircle(
          ped.x,
          ped.z,
          ped.stunX * run * dt,
          ped.stunZ * run * dt,
          ped.radius,
          collidersFor(true, null, ped),
        );
        ped.x = next.x;
        ped.z = next.z;
        ped.heading = Math.atan2(ped.stunX, ped.stunZ);
        ped.group.position.set(ped.x, WALK_TOP + world.ground(ped.x, ped.z), ped.z);
        ped.group.rotation.y = ped.heading;
        animateActor(ped, run, time + ped.x, dt);
        continue;
      }

      const danger = threatAt(ped.x, ped.z);
      if (danger) {
        const ax = ped.x - danger.x;
        const az = ped.z - danger.z;
        const len = Math.hypot(ax, az) || 1;
        const run = 4.2;
        const next = moveCircle(
          ped.x,
          ped.z,
          (ax / len) * run * dt,
          (az / len) * run * dt,
          ped.radius,
          collidersFor(true, null, ped),
        );
        ped.x = next.x;
        ped.z = next.z;
        ped.heading = Math.atan2(ax / len, az / len);
        ped.group.position.set(ped.x, WALK_TOP + world.ground(ped.x, ped.z), ped.z);
        ped.group.rotation.y = ped.heading;
        animateActor(ped, run, time + ped.x, dt);
        continue;
      }

      const target = ped.path[ped.index];
      let dx = target.x - ped.x;
      let dz = target.z - ped.z;
      let dist = Math.hypot(dx, dz);
      if (dist < 0.4) {
        ped.index += ped.dir;
        if (ped.index >= ped.path.length) {
          ped.dir = -1;
          ped.index = ped.path.length - 2;
        } else if (ped.index < 0) {
          ped.dir = 1;
          ped.index = 1;
        }
        dx = ped.path[ped.index].x - ped.x;
        dz = ped.path[ped.index].z - ped.z;
        dist = Math.hypot(dx, dz) || 1;
      }
      const step = ped.speed * dt;
      const mx = (dx / dist) * step;
      const mz = (dz / dist) * step;
      const next = moveCircle(ped.x, ped.z, mx, mz, ped.radius, collidersFor(true, null, ped));
      if (Math.hypot(next.x - ped.x, next.z - ped.z) < step * 0.25) ped.dir *= -1;
      ped.x = next.x;
      ped.z = next.z;
      ped.heading = Math.atan2(dx, dz);
      ped.group.position.set(ped.x, WALK_TOP + world.ground(ped.x, ped.z), ped.z);
      ped.group.rotation.y = ped.heading;
      animateActor(ped, ped.speed, time + ped.x, dt);
    }
  }

  function viewLabel() {
    if (view === 'first' && mode === 'foot') return t('viewFirst');
    if (view === 'top') return t('viewTop');
    if (view === 'iso') return t('viewIso');
    return t('viewFollow');
  }

  function updateCamera(dt, snap) {
    const driving = started && mode === 'drive';
    const targetX = driving ? hero.x : player.x;
    const targetZ = driving ? hero.z : player.z;
    const gy = world.ground(targetX, targetZ);
    let camYaw = yaw;
    let camPitch = pitch;
    let dist = driving ? 10.5 : started ? 6.4 : 12.5;
    let lookY = (driving ? 1.15 : started ? 1.35 : 4.2) + gy;
    // The character would fill the first-person view.
    player.group.visible = !(started && mode === 'foot' && view === 'first');
    if (!started) {
      camera.up.set(0, 1, 0);
    } else if (view === 'first' && mode === 'foot') {
      // Eyes in the character's head: the camera looks where the mouse points.
      camera.up.set(0, 1, 0);
      const eyeY = WALK_TOP + gy + player.jumpY + 1.62;
      camera.position.set(player.x, eyeY, player.z);
      camReady = true;
      const cp = Math.cos(pitch);
      look.set(
        player.x + Math.sin(yaw) * cp * 4,
        eyeY - Math.sin(pitch) * 4,
        player.z + Math.cos(yaw) * cp * 4,
      );
      camera.lookAt(look);
      sun.position.set(player.x + 36, 64, player.z + 22);
      sun.target.position.set(player.x, 0, player.z);
      sun.target.updateMatrixWorld();
      return;
    } else if (view === 'top') {
      camera.up.set(0, 0, -1);
      desired.set(targetX, gy + (driving ? 52 : 38), targetZ);
      look.set(targetX, gy, targetZ);
      if (snap || !camReady) {
        camera.position.copy(desired);
        camReady = true;
      } else {
        const k = 1 - Math.pow(0.0006, dt);
        camera.position.lerp(desired, k);
      }
      camera.lookAt(look);
      sun.position.set(targetX + 36, 64, targetZ + 22);
      sun.target.position.set(targetX, 0, targetZ);
      sun.target.updateMatrixWorld();
      return;
    } else if (view === 'iso') {
      camera.up.set(0, 1, 0);
      camYaw = Math.PI * 0.75;
      camPitch = 0.98;
      dist = driving ? 32 : 24;
      lookY = gy + 1.1;
    } else {
      camera.up.set(0, 1, 0);
    }
    const horiz = Math.cos(camPitch) * dist;
    desired.set(
      targetX - Math.sin(camYaw) * horiz,
      Math.max(gy + 0.45, lookY + Math.sin(camPitch) * dist),
      targetZ - Math.cos(camYaw) * horiz,
    );
    if (snap || !camReady) {
      camera.position.copy(desired);
      camReady = true;
    } else {
      const k = 1 - Math.pow(0.0006, dt);
      camera.position.lerp(desired, k);
    }
    look.set(targetX, lookY, targetZ);
    camera.lookAt(look);
    sun.position.set(targetX + 36, 64, targetZ + 22);
    sun.target.position.set(targetX, 0, targetZ);
    sun.target.updateMatrixWorld();
  }

  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  // A small keycap plus a verb: the way most modern games show a contextual
  // action. status hides the keycap for messages such as "heading to car".
  function setPrompt(show, key = '', label = '', status = false) {
    if (!show) {
      promptEl.classList.remove('show');
      return;
    }
    setText(promptKeyEl, key);
    setText(promptLabelEl, label);
    promptEl.classList.toggle('status', status);
    promptEl.classList.add('show');
  }

  function setToast(text) {
    if (text) {
      setText(toastEl, text);
      toastEl.classList.add('show');
    } else {
      toastEl.classList.remove('show');
    }
  }

  function updateHud() {
    if (!started) {
      setText(speedEl, '');
      setText(hintEl, '');
      setPrompt(false);
      setToast('');
      return;
    }

    const keys = keyVars();
    hintEl.classList.toggle('fade', hintTime <= 0);
    setToast(flash ? flash.text : '');

    if (mode === 'drive') {
      setText(speedEl, `${Math.round(hero.speed * 3.6)} km/h`);
      setText(hintEl, t('hintDrive', { ...keys, view: viewLabel() }));
      const canExit = Math.abs(hero.speed) < 2.5;
      setPrompt(canExit, keys.interact, t('exitCar'));
      return;
    }

    setText(speedEl, t('onFoot'));
    setText(
      hintEl,
      LOOK_VIEWS.has(view)
        ? t('hintFollow', keys)
        : t('hintFixed', { ...keys, view: viewLabel() }),
    );

    if (player.airborne) {
      setPrompt(false);
      return;
    }

    if (approach) {
      setPrompt(true, '', t('approachCar'), true);
      return;
    }

    const near = findEnterableVehicle(player.x, player.z, PROMPT_RANGE);
    if (near) {
      setPrompt(true, keys.interact, near.traffic ? t('stealCar') : t('enterCar'));
    } else {
      setPrompt(false);
    }
  }

  onLangChange(updateHud);
  onLangChange(fillCheatVehicles);
  onLangChange(syncViewOptions);
  onBindingsChange(updateHud);
  fillCheatVehicles();
  mountViewOptions();

  function drawPauseMap() {
    if (mapPanel.hidden) return;
    const focus = mode === 'drive' ? hero : player;
    minimap.drawFull(mapCanvas, { x: focus.x, z: focus.z, heading: focus.heading }, world.vehicles);
  }

  onPageChange(({ menu, page }) => {
    if (menu !== 'pause') return;
    if (page === 'map') drawPauseMap();
    else mapFromGame = false;
    if (page === 'cheats') cheatStatus.textContent = '';
  });

  document.getElementById('pause-map-back').addEventListener('click', () => closeMap());

  document.getElementById('cheat-spawn').addEventListener('click', () => {
    spawnCheatVehicle(cheatSelect.value);
  });

  document.addEventListener('mousemove', (e) => {
    if (!started || !LOOK_VIEWS.has(view) || document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.003;
    pitch += e.movementY * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch, view === 'first' ? -1.2 : -0.15, 1.05);
  });

  canvas.addEventListener('click', () => {
    if (started && !paused && LOOK_VIEWS.has(view)) input.lock();
  });

  document.getElementById('menu-start').addEventListener('click', () => {
    if (started) return;
    started = true;
    hintTime = 12;
    menuEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    yaw = player.heading;
    pitch = 0.3;
    input.release();
    if (LOOK_VIEWS.has(view)) input.lock();
  });

  document.getElementById('pause-resume').addEventListener('click', () => closePause());
  document.getElementById('pause-restart').addEventListener('click', () => {
    resetSession();
    closePause();
  });
  document.getElementById('pause-exit').addEventListener('click', () => {
    resetSession();
    paused = false;
    started = false;
    pauseEl.classList.add('hidden');
    hudEl.classList.add('hidden');
    menuEl.classList.remove('hidden');
    openMainMenu();
    document.exitPointerLock();
    input.release();
  });

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape' || event.repeat) return;
    if (!started || suppressEsc) return;
    event.preventDefault();
    if (paused) {
      if (mapFromGame || !backPage()) closePause();
    } else {
      openPause();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) return;
    if (!started || paused || !LOOK_VIEWS.has(view)) return;
    openPause();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    drawPauseMap();
  });

  for (const vehicle of world.vehicles) vehicle.updateVisual(0);

  let last = performance.now();
  let elapsed = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;

    if (started && input.consume('map')) toggleMap();

    if (paused) {
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
      return;
    }

    if (hintTime > 0) hintTime = Math.max(0, hintTime - dt);

    if (started && input.consume('camera')) {
      const index = VIEW_ORDER.indexOf(view);
      setView(VIEW_ORDER[(index + 1) % VIEW_ORDER.length]);
      if (!LOOK_VIEWS.has(view)) document.exitPointerLock();
    }
    if (started) input.setAim(LOOK_VIEWS.has(view));

    if (flash) {
      flash.timer -= dt;
      if (flash.timer <= 0) flash = null;
    }

    if (!started) {
      yaw = Math.PI + Math.sin(elapsed * 0.28) * 0.42;
      pitch = 0.34;
      animateActor(player, 0, elapsed, dt);
    } else if (mode === 'foot') {
      updateFoot(dt, elapsed);
    } else {
      input.consume('attack');
      updateDrive(dt);
    }

    updatePeds(dt, elapsed);
    world.update(dt, elapsed);
    updateCamera(dt, false);
    traffic.update(dt);
    for (const vehicle of world.vehicles) vehicle.updateVisual(dt);
    crowd.update(dt, elapsed);
    crushPeople(dt);
    unclipPeople();
    tickBodies(dt);
    separatePeople();
    blood.update(dt);
    updateHud();
    const focus = mode === 'drive' ? hero : player;
    const range = mode === 'drive'
      ? THREE.MathUtils.clamp(64 + Math.abs(hero.speed) * 1.9, 64, 108)
      : 56;
    minimap.draw(focus, world.vehicles, { range });
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  updateCamera(0.016, true);
  requestAnimationFrame(frame);

  // Debug handle: returned in dev only. import.meta.env.DEV is false in builds,
  // so this whole branch is statically stripped from the bundle.
  return import.meta.env.DEV
    ? {
        player,
        world,
        crowd,
        traffic,
        get hero() { return hero; },
        get mode() { return mode; },
        get started() { return started; },
        get paused() { return paused; },
      }
    : null;
}
