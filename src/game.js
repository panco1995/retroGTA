import * as THREE from 'three';
import { WALK_TOP } from './config.js';
import { brickTexture } from './materials.js';
import { createInput } from './input.js';
import { blocked, moveCircle } from './collision.js';
import { animateActor, createActor, setPose } from './actor.js';
import { buildCity } from './city.js';
import { createMinimap } from './minimap.js';
import { onLangChange, t, toggleLang } from './i18n.js';
import { keyVars, onBindingsChange, resetPauseControls } from './bindings.js';
import { openMainMenu } from './menu.js';

const ENTER_DIST = 4.8;

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
  player.group.position.set(spawn.x, WALK_TOP + world.ground(spawn.x, spawn.z), spawn.z);
  player.group.rotation.y = spawn.heading;
  scene.add(player.group);

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

  const hero = world.vehicles.find((v) => v.driveable);
  const vehicleHome = world.vehicles.map((vehicle) => ({
    vehicle,
    x: vehicle.x,
    z: vehicle.z,
    heading: vehicle.heading,
    y: vehicle.y,
    pitch: vehicle.pitch,
  }));
  const pedHome = peds.map((ped) => ({ x: ped.x, z: ped.z, heading: ped.heading }));
  const input = createInput(canvas);
  const minimap = createMinimap(document.getElementById('map'), world);

  let started = false;
  let paused = false;
  let suppressEsc = false;
  let mode = 'foot';
  let view = 'follow';
  let yaw = Math.PI;
  let pitch = 0.32;
  const scratch = [];
  const look = new THREE.Vector3();
  const desired = new THREE.Vector3();
  let camReady = false;

  const speedEl = document.getElementById('speed');
  const hintEl = document.getElementById('hint');
  const promptEl = document.getElementById('prompt');
  const menuEl = document.getElementById('menu');
  const hudEl = document.getElementById('hud');
  const pauseEl = document.getElementById('pause');

  function placeOnFoot(actor, x, z, heading) {
    actor.x = x;
    actor.z = z;
    actor.heading = heading;
    actor.group.position.set(x, WALK_TOP + world.ground(x, z), z);
    actor.group.rotation.set(0, heading, 0);
  }

  function resetSession() {
    if (mode === 'drive') {
      scene.attach(player.group);
      setPose(player, 'stand');
    }
    mode = 'foot';
    view = 'follow';
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
    }
    peds.forEach((ped, index) => {
      const home = pedHome[index];
      ped.index = 0;
      ped.dir = 1;
      placeOnFoot(ped, home.x, home.z, home.heading);
      setPose(ped, 'stand');
    });
    world.reset();
    input.release();
  }

  function openPause() {
    if (!started || paused) return;
    resetPauseControls();
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
    pauseEl.classList.add('hidden');
    input.release();
    if (view === 'follow') input.lock();
  }

  function carHits(vehicle, x, z, cols) {
  const fx = Math.sin(vehicle.heading);
  const fz = Math.cos(vehicle.heading);
  const offset = Math.max(0.2, vehicle.length / 2 - vehicle.width / 2);
  const radius = vehicle.width / 2 + 0.22;
  return blocked(x + fx * offset, z + fz * offset, radius, cols)
    || blocked(x - fx * offset, z - fz * offset, radius, cols);
}

function collidersFor(includeHero) {
    scratch.length = 0;
    for (const c of world.colliders) scratch.push(c);
    if (includeHero) scratch.push(hero.collider());
    return scratch;
  }

  function enterCar() {
    mode = 'drive';
    hero.group.attach(player.group);
    player.group.position.set(-0.36, 0.22, -0.15);
    player.group.rotation.set(0, 0, 0);
    setPose(player, 'sit');
    hero.speed = 0;
  }

  function exitCar() {
    const h = hero.heading;
    const spots = [
      { x: hero.x - Math.cos(h) * 2.15, z: hero.z + Math.sin(h) * 2.15 },
      { x: hero.x + Math.cos(h) * 2.15, z: hero.z - Math.sin(h) * 2.15 },
      { x: hero.x - Math.sin(h) * 3.3, z: hero.z - Math.cos(h) * 3.3 },
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
    player.x = spot.x;
    player.z = spot.z;
    player.heading = h;
    player.group.position.set(spot.x, WALK_TOP + world.ground(spot.x, spot.z), spot.z);
    player.group.rotation.set(0, h, 0);
    setPose(player, 'stand');
    hero.speed = 0;
    hero.braking = false;
  }

  function moveYaw() {
    if (view === 'top') return Math.PI;
    if (view === 'iso') return Math.PI * 0.75;
    return yaw;
  }

  function updateFoot(dt, time) {
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
    const step = moveCircle(player.x, player.z, ix * speed * dt, iz * speed * dt, player.radius, collidersFor(true));
    player.x = step.x;
    player.z = step.z;
    player.group.position.set(player.x, WALK_TOP + world.ground(player.x, player.z), player.z);
    animateActor(player, speed, time, dt);

    if (input.consume('interact')) {
      const dx = player.x - hero.x;
      const dz = player.z - hero.z;
      if (dx * dx + dz * dz < ENTER_DIST * ENTER_DIST) enterCar();
    }
  }

  function updateDrive(dt) {
    const throttle = (input.w ? 1 : 0) - (input.s ? 1 : 0);
    const steerInput = (input.d ? 1 : 0) - (input.a ? 1 : 0);
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
    const cols = world.colliders;
    const nx = hero.x + vx * dt;
    if (!carHits(hero, nx, hero.z, cols)) hero.x = nx;
    else hero.speed *= -0.22;
    const nz = hero.z + vz * dt;
    if (!carHits(hero, hero.x, nz, cols)) hero.z = nz;
    else hero.speed *= -0.22;

    const ahead = 3;
    hero.y = world.ground(hero.x, hero.z);
    const nose = world.ground(
      hero.x + Math.sin(hero.heading) * ahead,
      hero.z + Math.cos(hero.heading) * ahead,
    );
    hero.pitch = -Math.atan2(nose - hero.y, ahead);

    if (input.consume('interact') && Math.abs(hero.speed) < 2.5) exitCar();
  }

  function updatePeds(dt, time) {
    for (const ped of peds) {
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
      const next = moveCircle(ped.x, ped.z, mx, mz, ped.radius, collidersFor(true));
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
    if (!started) {
      camera.up.set(0, 1, 0);
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

  function updateHud() {
    if (!started) {
      setText(speedEl, '');
      setText(hintEl, '');
      promptEl.style.opacity = '0';
      return;
    }
    const keys = keyVars();
    if (mode === 'drive') {
      setText(speedEl, `${Math.round(hero.speed * 3.6)} km/h`);
      setText(hintEl, t('hintDrive', { ...keys, view: viewLabel() }));
      promptEl.style.opacity = '0';
    } else {
      setText(speedEl, t('onFoot'));
      setText(hintEl, view === 'follow'
        ? t('hintFollow', keys)
        : t('hintFixed', { ...keys, view: viewLabel() }));
      const near = (player.x - hero.x) ** 2 + (player.z - hero.z) ** 2 < ENTER_DIST * ENTER_DIST;
      promptEl.textContent = near ? t('enterCar', keys) : '';
      promptEl.style.opacity = near ? '1' : '0';
    }
  }

  onLangChange(updateHud);
  onBindingsChange(updateHud);

  document.addEventListener('mousemove', (e) => {
    if (!started || view !== 'follow' || document.pointerLockElement !== canvas) return;
    yaw -= e.movementX * 0.003;
    pitch += e.movementY * 0.0022;
    pitch = THREE.MathUtils.clamp(pitch, -0.15, 1.05);
  });

  canvas.addEventListener('click', () => {
    if (started && !paused && view === 'follow') input.lock();
  });

  document.getElementById('menu-start').addEventListener('click', () => {
    if (started) return;
    started = true;
    menuEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    yaw = player.heading;
    pitch = 0.3;
    input.lock();
  });

  document.getElementById('pause-lang').addEventListener('click', () => toggleLang());
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
    resetPauseControls();
    openMainMenu();
    document.exitPointerLock();
    input.release();
  });

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape' || event.repeat) return;
    if (!started || suppressEsc) return;
    event.preventDefault();
    if (paused) closePause();
    else openPause();
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) return;
    if (!started || paused || view !== 'follow') return;
    openPause();
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  for (const vehicle of world.vehicles) vehicle.updateVisual(0);

  let last = performance.now();
  let elapsed = 0;

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;

    if (paused) {
      renderer.render(scene, camera);
      requestAnimationFrame(frame);
      return;
    }

    if (started && input.consume('camera')) {
      view = view === 'follow' ? 'top' : view === 'top' ? 'iso' : 'follow';
      if (view !== 'follow') document.exitPointerLock();
    }

    if (!started) {
      yaw = Math.PI + Math.sin(elapsed * 0.28) * 0.42;
      pitch = 0.34;
      animateActor(player, 0, elapsed, dt);
    } else if (mode === 'foot') {
      updateFoot(dt, elapsed);
    } else {
      updateDrive(dt);
    }

    updatePeds(dt, elapsed);
    world.update(dt, elapsed);
    for (const vehicle of world.vehicles) vehicle.updateVisual(dt);
    updateCamera(dt, false);
    updateHud();
    minimap.draw(mode === 'drive' ? { x: hero.x, z: hero.z, heading: hero.heading } : player, world.vehicles);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  updateCamera(0.016, true);
  requestAnimationFrame(frame);

  return { player, hero, world };
}
