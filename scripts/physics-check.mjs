// Checks that there is one physics world, that everything that can fall is in
// it, and that two kinds of body in it at once behave.
//
// Run with: npm run check

globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return new Proxy({}, { get: () => () => {}, set: () => true });
      },
    };
  },
};

const THREE = await import('three');
const { GRAVITY, GROUP, physicsWorld } = await import('../src/physics.js');
const { WALK_TOP } = await import('../src/config.js');
const { createActor, setPose } = await import('../src/actor.js');
const { startRagdoll, stepPhysics, stepRagdolls } = await import('../src/ragdoll.js');
const { buildTrash } = await import('../src/props.js');
const { createPropPhysics } = await import('../src/prop-physics.js');
const { ColliderList } = await import('../src/spatial.js');

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` ${detail}` : ''}`);
}

// One world, made once and handed to everybody.
{
  const a = physicsWorld();
  const b = physicsWorld();
  check('there is one world, not one per caller', a === b);

  // The prop physics and the ragdolls both put their bodies into it.
  const before = a.bodies.length;
  const colliders = new ColliderList();
  const props = createPropPhysics({ colliders, ground: () => 0 });
  const bag = buildTrash({ x: 0, z: 0 });
  bag.group.position.set(0, WALK_TOP, 0);
  bag.group.updateMatrixWorld(true);
  colliders.push(bag.collider);
  const entry = { group: bag.group, collider: bag.collider, spec: bag.body };
  props.register(entry);
  props.knock(entry, 12, 0);
  check('a thrown prop goes into the shared world', a.bodies.length > before,
    `${a.bodies.length - before} bodies added`);
}

// One gravity for everything. A body in the air falls at the same rate whether
// the engine is moving it or the game is working out a jump by hand.
{
  check('the gravity is one number', GRAVITY > 0 && Number.isFinite(GRAVITY), `${GRAVITY} m/s2`);

  // A body dropped from a known height takes the time that gravity says.
  const world = physicsWorld();
  const actor = createActor({ height: 1 });
  const drop = 20;
  actor.group.position.set(400, drop, 400);
  actor.group.updateMatrixWorld(true);
  setPose(actor, 'stand');
  actor.group.updateMatrixWorld(true);
  startRagdoll(actor, {
    x: 400, z: 400, groundY: 0,
    vx: 0, vy: 0, vz: 0, colliders: [],
  });
  const fall = actor.ragdoll.bodies[0].position.y;
  let frames = 0;
  while (frames < 600) {
    stepPhysics(1 / 60);
    stepRagdolls(1 / 60);
    frames += 1;
    if (actor.ragdoll?.bodies[0]?.position.y < 1.2) break;
  }
  // Free fall over `fall` metres at g: t = sqrt(2 h / g). At the old 9.82 the
  // same fall took about 1.6 times as long.
  const wantFrames = Math.sqrt(2 * (fall - 1.2) / GRAVITY) * 60;
  check('a body falls at the rate the game says it does',
    Math.abs(frames - wantFrames) < wantFrames * 0.2,
    `${frames} frames over ${fall.toFixed(1)} m, gravity says ${wantFrames.toFixed(0)}`);
  void world;
}

// Two kinds of body in the one world at the same time: a person going down and
// a heap of rubbish being thrown past them. Each has its own ground and walls,
// so neither is shoved by what was built for the other.
{
  const actor = createActor({ height: 1 });
  actor.group.position.set(-300, 1.5, -300);
  actor.group.updateMatrixWorld(true);
  setPose(actor, 'stand');
  actor.group.updateMatrixWorld(true);
  startRagdoll(actor, {
    x: -300, z: -300, groundY: 0,
    vx: 0, vy: 0, vz: 0, colliders: [],
  });

  const colliders = new ColliderList();
  const props = createPropPhysics({ colliders, ground: () => 0 });
  const bag = buildTrash({ x: -301.5, z: -300 });
  bag.group.position.set(-301.5, WALK_TOP, -300);
  bag.group.updateMatrixWorld(true);
  colliders.push(bag.collider);
  const entry = { group: bag.group, collider: bag.collider, spec: bag.body };
  props.register(entry);
  props.knock(entry, 14, 0);

  for (let i = 0; i < 240; i += 1) {
    stepPhysics(1 / 60);
    stepRagdolls(1 / 60);
    props.step(1 / 60);
  }

  const p = new THREE.Vector3();
  actor.hips.getWorldPosition(p);
  check('a body still lands with a prop in the world', p.y < 0.6 && p.y > -1,
    `hips y ${p.y.toFixed(2)}`);
  check('the prop still flies with a body in the world',
    Math.hypot(bag.group.position.x + 301.5, bag.group.position.z + 300) > 2,
    `moved ${Math.hypot(bag.group.position.x + 301.5, bag.group.position.z + 300).toFixed(1)} m`);
  check('the two are in groups of their own',
    GROUP.body !== GROUP.prop && GROUP.bodyWorld !== GROUP.propWorld);
}

// A car carries its own vertical speed, so driving over a crest throws it into
// the air and it comes down again, where before it was glued to the ground and
// stepped down the far side in one frame.
{
  const { createTerrain, settleOnGround } = await import('../src/terrain.js');
  const dt = 1 / 60;

  // A hill that climbs at 40%, falls at 40% down the far side, and then levels
  // out again, so a car that goes over it has somewhere to land.
  const hill = (x, z) => {
    if (z >= 0) return 0;
    if (z > -10) return -z * 0.4;
    if (z > -20) return 4 + (z + 10) * 0.4;
    return 0;
  };
  const terrain = createTerrain({ height: hill });

  function drive(speed) {
    const car = {
      x: 0, z: 6, heading: Math.PI, y: 0, vy: 0, airborne: false,
      pitch: 0, groundRoll: 0,
    };
    settleOnGround(terrain, car, 0);
    let air = 0;
    let peak = 0;
    let takeoffVy = 0;
    let climbedOnGround = true;
    for (let f = 0; f < 240; f += 1) {
      car.z -= speed * dt;
      const before = car.airborne;
      settleOnGround(terrain, car, dt);
      if (!before && car.airborne) takeoffVy = car.vy;
      if (car.airborne) {
        air += 1;
        peak = Math.max(peak, car.y - hill(0, car.z));
      } else if (car.z > -10 && Math.abs(car.y - hill(0, car.z)) > 0.01) {
        // While climbing, the car is on the ground, not floating or sunk.
        climbedOnGround = false;
      }
    }
    return { air, peak, takeoffVy, climbedOnGround };
  }

  const slow = drive(6);
  const fast = drive(20);

  check('a car climbing a slope stays on it', slow.climbedOnGround && fast.climbedOnGround);
  check('a car over a crest leaves the ground', fast.air > 30, `${(fast.air / 60).toFixed(2)} s in the air`);
  check('a faster car is thrown further', fast.air > slow.air * 2,
    `${(fast.air / 60).toFixed(2)} s against ${(slow.air / 60).toFixed(2)} s`);
  check('a faster car goes higher', fast.peak > slow.peak * 2,
    `${fast.peak.toFixed(2)} m against ${slow.peak.toFixed(2)} m`);
  check('the car leaves with the climb it had in it', fast.takeoffVy > 2,
    `${fast.takeoffVy.toFixed(1)} m/s upward at take off`);

  // It comes down again, and is on the ground at the end of the run.
  {
    const car = {
      x: 0, z: 6, heading: Math.PI, y: 0, vy: 0, airborne: false,
      pitch: 0, groundRoll: 0,
    };
    settleOnGround(terrain, car, 0);
    for (let f = 0; f < 400; f += 1) {
      car.z -= 12 * dt;
      settleOnGround(terrain, car, dt);
    }
    check('a car that went over a crest comes back down', !car.airborne,
      `z ${car.z.toFixed(1)}, y ${car.y.toFixed(2)}`);
  }
}

console.log(failures === 0 ? 'OK' : `${failures} failures`);
if (failures > 0) process.exit(1);
