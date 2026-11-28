// Throws a pile of rubbish out of the way and checks that it lands, that it
// keeps its shape, and that its collider follows it instead of standing
// where it used to be. A car that catches up with a prop on the move has to
// push it rather than drive through it.
//
// Run with: npm run check

// The brick texture is drawn on a canvas as soon as the materials module
// loads, so the check needs a stand in for the browser.
globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return new Proxy({}, {
          get: () => () => {},
          set: () => true,
        });
      },
    };
  },
};

const THREE = await import('three');
const { WALK_TOP } = await import('../src/config.js');
const { buildDumpster, buildHydrant, buildLamp, buildTrash, buildTree } = await import('../src/props.js');
const { createPropPhysics } = await import('../src/prop-physics.js');
const { vehicleBlocked, vehicleBlockedBy } = await import('../src/collision.js');
const { ColliderList } = await import('../src/spatial.js');

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` ${detail}` : ''}`);
}

// A heap of rubbish on the pavement, with the physics engine around it.
function place(build, x = 0, z = 0, extra = {}) {
  const colliders = new ColliderList();
  const props = createPropPhysics({ colliders, ground: () => 0 });
  const { group, collider, body } = build({ x, z, ...extra });
  group.position.set(x, WALK_TOP, z);
  if (extra.rot) group.rotation.y = extra.rot;
  group.updateMatrixWorld(true);
  colliders.push(collider);
  const entry = { group, collider, spec: body };
  props.register(entry);
  return { colliders, props, group, collider, entry };
}

function settle(props, frames = 300) {
  for (let i = 0; i < frames; i += 1) props.step(1 / 60);
}

// The lowest point of the prop as it can be seen. The group stands at the
// foot of the prop, so a prop that has tipped over has its foot in the air:
// what has to stay on the ground is the prop itself.
function lowest(group) {
  return new THREE.Box3().setFromObject(group).min.y;
}

// How upright the prop is: 1 is standing, 0 lying on its side.
function upOf(group) {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(group.quaternion).y;
}

// How far the car and the prop overlap on the shallower axis. The car is
// driven straight down +Z, so both boxes are axis aligned.
function overlap(car, box) {
  const ox = Math.min(car.width / 2, box.max.x) - Math.max(-car.width / 2, box.min.x);
  const oz = Math.min(car.z + car.length / 2, box.max.z)
    - Math.max(car.z - car.length / 2, box.min.z);
  return Math.min(ox, oz);
}

// A car drives at the prop, using the same call the game makes: it looks for
// a blocker where it is about to be, throws what it finds, and steps on. The
// frame's own dt is handed over, so a slow frame cannot drive the car through
// anything. Returns the worst overlap between the car and the prop.
function driveInto(entry, props, colliders, group, speed, dt = 1 / 60, frames = 240) {
  const car = { x: 0, z: -8, heading: 0, length: 4.45, width: 1.85, speed };
  const mover = { x: 0, z: 0, heading: 0, length: car.length, width: car.width };
  let worst = 0;
  for (let f = 0; f < frames; f += 1) {
    const vz = car.speed;
    const nz = car.z + vz * dt;
    const blocker = vehicleBlockedBy(car.x, nz, car.heading, car.length, car.width, colliders, null);
    if (!blocker) {
      car.z = nz;
    } else if (blocker.prop) {
      mover.x = car.x;
      mover.z = nz;
      const keep = props.knock(blocker.prop, 0, vz, mover, dt);
      if (keep === null) car.speed *= -0.22;
      else {
        car.z = nz;
        car.speed *= keep;
      }
    } else {
      car.speed *= -0.22;
    }
    props.step(dt);
    const box = new THREE.Box3().setFromObject(group);
    const pen = overlap(car, box);
    if (pen > worst) worst = pen;
  }
  return { worst, car };
}

// The rubbish bags.
{
  const { colliders, props, group, collider, entry } = place(buildTrash, 0, 0);
  check('the heap starts in the index', colliders.near(0, 0, 1).includes(collider));
  check('the heap has a body', !!entry.spec && entry.spec.shapes.length === 3);

  // A car runs into it at speed.
  const keep = props.knock(entry, 14, 0);
  check('the heap is thrown', keep !== null && keep < 1, `car keeps ${keep?.toFixed(2)}`);
  // It travels with the heap: a prop that was taken out of the index would
  // leave a car with nothing to hit and the prop would be driven through.
  check('the heap stays in the index while it is in the air',
    colliders.near(0, 0, 1).includes(collider));
  check('the heap is a moving collider while it flies', collider.moving === true);

  settle(props);
  const moved = Math.hypot(group.position.x, group.position.z);
  check('the heap is thrown clear', moved > 1, `moved ${moved.toFixed(2)} m`);
  // It has to come to rest on its own, not wait for the time limit.
  check('the heap comes to rest', !entry.flying);
  check('the heap rests on the ground', Math.abs(lowest(group) - WALK_TOP) < 0.25,
    `lowest ${lowest(group).toFixed(2)}`);
  check('the heap is back on a static cell when it rests', collider.moving === false);

  // The collider has to be where the heap is, not where it stood. A heap that
  // landed on its side is blocked by the box around it, whose middle is where
  // the heap really is rather than where the foot of the group ended up.
  const box = new THREE.Box3().setFromObject(group);
  const midX = (box.min.x + box.max.x) / 2;
  const midZ = (box.min.z + box.max.z) / 2;
  check('the collider follows the heap',
    Math.abs(collider.x - midX) < 0.01 && Math.abs(collider.z - midZ) < 0.01,
    `collider ${collider.x.toFixed(2)},${collider.z.toFixed(2)} heap ${midX.toFixed(2)},${midZ.toFixed(2)}`);
  // The coarse mesh of a bag is a polygon, so its true box is a little
  // smaller than the sphere the body is; the two agree to a few centimetres.
  check('the collider is the heap\'s own box',
    Math.abs(collider.minX - box.min.x) < 0.06 && Math.abs(collider.maxZ - box.max.z) < 0.06,
    `collider ${collider.minX.toFixed(2)}..${collider.maxZ.toFixed(2)} heap ${box.min.x.toFixed(2)}..${box.max.z.toFixed(2)}`);
  check('the collider is found at the heap',
    colliders.near(group.position.x, group.position.z, 1).includes(collider));
  check('the old spot is clear for a car',
    !vehicleBlocked(0, 0, 0, 4.2, 1.8, colliders, null));
  check('the new spot is in the way of a car',
    vehicleBlocked(group.position.x, group.position.z, 0, 4.2, 1.8, colliders, null));
}

// The hydrant.
{
  const { props, group, collider, entry } = place(buildHydrant, 0, 0);
  const keep = props.knock(entry, 10, 0);
  check('the hydrant is thrown', keep !== null);
  settle(props);
  check('the hydrant moves', group.position.x > 0.5, `x ${group.position.x.toFixed(2)}`);
  check('the hydrant rests on the ground', Math.abs(lowest(group) - WALK_TOP) < 0.25,
    `lowest ${lowest(group).toFixed(2)}`);
  check('the hydrant collider follows it',
    Math.abs(collider.x - group.position.x) < 0.01 && Math.abs(collider.z - group.position.z) < 0.01);
  check('the hydrant comes to rest', !entry.flying);
}

// The dumpster, which is heavy enough that the car feels it.
{
  const { props, group, collider, entry } = place(buildDumpster, 0, 0);
  const keep = props.knock(entry, 12, 0);
  check('the dumpster is shoved', keep !== null && keep < 0.8, `car keeps ${keep?.toFixed(2)}`);
  settle(props);
  check('the dumpster moves', group.position.x > 0.2, `x ${group.position.x.toFixed(2)}`);
  check('the dumpster rests on the ground', Math.abs(lowest(group) - WALK_TOP) < 0.25,
    `lowest ${lowest(group).toFixed(2)}`);
  check('the dumpster collider follows it',
    Math.abs(collider.x - group.position.x) < 0.01
    && Math.abs(collider.z - group.position.z) < 0.01);
  check('the dumpster keeps its heading', Number.isFinite(collider.heading));
  check('the dumpster comes to rest', !entry.flying);
}

// A slow car leaves the furniture alone.
{
  const { props, group, entry } = place(buildTrash, 0, 0);
  const keep = props.knock(entry, 0.2, 0);
  check('a slow car throws nothing', keep === null);
  check('the heap did not move', Math.abs(group.position.x) < 0.01);
  check('the heap is still in the index', !entry.flying);
}

// Every kind of furniture has to go faster than the car that hit it, or the
// car drives straight through it.
for (const [name, build] of [
  ['the bags', buildTrash],
  ['the hydrant', buildHydrant],
  ['the dumpster', buildDumpster],
]) {
  const { props, entry } = place(build, 0, 0);
  const carSpeed = 10;
  const keep = props.knock(entry, carSpeed, 0);
  const thrown = carSpeed * entry.spec.launch;
  check(`${name} goes faster than the car`, thrown > carSpeed * keep,
    `prop ${thrown.toFixed(1)} m/s, car ${(carSpeed * keep).toFixed(1)} m/s`);
}

// A car that catches up with a prop on the move has to push it. The bag is
// thrown, drops to the road, and then the car comes through behind it: the
// car must not end up inside the prop on any frame.
for (const [name, build] of [
  ['the bags', buildTrash],
  ['the hydrant', buildHydrant],
  ['the dumpster', buildDumpster],
]) {
  const { colliders, props, group, entry } = place(build, 0, 0);
  const { worst, car } = driveInto(entry, props, colliders, group, 12);
  check(`${name} are not driven through`, worst < 0.12,
    `worst overlap ${worst.toFixed(3)} m, car at ${car.z.toFixed(1)}`);
}

// A slow frame is the case that used to let the car sink in: the car moves
// almost half a metre between two collision tests.
{
  const { colliders, props, group, entry } = place(buildDumpster, 0, 0);
  const { worst } = driveInto(entry, props, colliders, group, 12, 1 / 30);
  check('a slow frame does not drive through a skip', worst < 0.12,
    `worst overlap ${worst.toFixed(3)} m`);
}

// A skip the car cannot throw is shouldered down the road. That must not keep
// the prop in the air for ever: once the car stops, the skip has to come to
// rest and go back into the index like any other.
{
  const { colliders, props, group, entry } = place(buildDumpster, 0, 0);
  // The car keeps up with the skip but never faster than it can be pushed.
  const car = { x: 0, z: -8, heading: 0, length: 4.45, width: 1.85, speed: 9 };
  const mover = { x: 0, z: 0, y: 0, heading: 0, length: car.length, width: car.width };
  const dt = 1 / 60;
  let pushed = 0;
  for (let f = 0; f < 420; f += 1) {
    const nz = car.z + car.speed * dt;
    const blocker = vehicleBlockedBy(car.x, nz, car.heading, car.length, car.width, colliders, null);
    if (blocker && blocker.prop) {
      mover.z = nz;
      const keep = props.knock(blocker.prop, 0, car.speed, mover, dt);
      if (keep !== null) {
        car.z = nz;
        car.speed *= keep;
        pushed += 1;
      }
    } else if (!blocker) {
      car.z = nz;
    }
    props.step(dt);
  }
  check('the skip is shouldered along', pushed > 5, `${pushed} contacts`);
  // Seven seconds of shouldering is past the time limit, so the skip has to be
  // on the ground and back in the index by now.
  check('a shouldered skip is let go', !entry.flying);
  check('a shouldered skip goes back into the index',
    colliders.near(group.position.x, group.position.z, 1.5).includes(entry.collider));
}

// A prop that has been thrown and landed on its side keeps that pose when it
// is hit again. Rebuilding the body from the angle it was built at would snap
// a skip back upright the moment a second car touched it.
{
  const rot = Math.PI / 2;
  const { props, group, entry } = place(buildDumpster, 0, 0, { rot });
  // A hard hit off centre, so it goes over rather than sliding away.
  const mover = { x: 0, z: -1.2, y: 0, heading: 0, length: 4.45, width: 1.85 };
  props.knock(entry, 14, 0.2, mover, 1 / 60);
  settle(props, 400);
  const before = upOf(group);
  check('the skip has tipped over', before < 0.9, `up ${before.toFixed(2)}`);
  check('the skip came to rest', !entry.flying);

  // A second car runs into it where it lies.
  const mover2 = {
    x: group.position.x,
    z: group.position.z - 1.2,
    y: 0,
    heading: 0,
    length: 4.45,
    width: 1.85,
  };
  props.knock(entry, 0, 12, mover2, 1 / 60);
  props.step(1 / 60);
  const after = upOf(group);
  check('a skip hit again keeps the pose it landed in',
    Math.abs(after - before) < 0.15, `up ${before.toFixed(2)} -> ${after.toFixed(2)}`);
}

// A prop that is never let go of is still handed back eventually, so nothing
// is left in the engine for ever.
{
  const { props, group, entry } = place(buildTrash, 0, 0);
  props.knock(entry, 12, 0);
  let frames = 0;
  for (let i = 0; i < 12 * 60; i += 1) {
    if (entry.body) {
      // Pinned in the air: nothing the engine does can bring it down.
      entry.body.position.y = WALK_TOP + 5;
      entry.body.velocity.set(0, 0, 0);
      entry.body.angularVelocity.set(0, 0, 0);
    }
    props.step(1 / 60);
    frames += 1;
    if (!entry.flying) break;
  }
  check('a prop that never lands is let go in the end', !entry.flying,
    `after ${(frames / 60).toFixed(1)} s`);
}

// Everything goes back where it was.
{
  const { colliders, props, group, collider, entry } = place(buildTrash, 0, 0);
  props.knock(entry, 12, 0);
  settle(props);
  props.reset();
  check('the heap goes back', Math.abs(group.position.x) < 0.01 && Math.abs(group.position.z) < 0.01,
    `x ${group.position.x.toFixed(2)}`);
  check('the collider goes back with it',
    Math.abs(collider.x) < 0.01 && Math.abs(collider.z) < 0.01);
  check('the heap is in the index again', colliders.near(0, 0, 1).includes(collider));
  check('the heap is a circle again after a reset', collider.circle === true);
}

// A lamp post is bolted to the ground. It does not fly: it goes over about its
// foot, it stays down, and the road it lands on is blocked afterwards.
{
  const landings = [];
  const colliders = new ColliderList();
  const props = createPropPhysics({
    colliders,
    ground: () => 0,
    onLand: (entry) => landings.push(entry),
  });
  const built = buildLamp({ x: 0, z: 0 });
  built.group.position.set(0, WALK_TOP, 0);
  built.group.updateMatrixWorld(true);
  colliders.push(built.collider);
  const entry = {
    group: built.group,
    collider: built.collider,
    spec: built.body,
    light: built.light,
    mesh: built.mesh,
  };
  props.register(entry);

  // Its foot stays put while it goes over.
  props.knock(entry, 0, 10);
  const footX = built.group.position.x;
  const footZ = built.group.position.z;
  let halfway = 0;
  for (let i = 0; i < 120; i += 1) {
    props.step(1 / 60);
    const up = upOf(built.group);
    if (!halfway && up < 0.8 && up > 0.2) halfway = up;
  }
  check('the post goes over', Math.abs(upOf(built.group)) < 0.1,
    `up ${upOf(built.group).toFixed(2)}`);
  check('the post turns over rather than snapping flat',
    halfway > 0.2 && halfway < 0.8, `was ${halfway.toFixed(2)} upright halfway`);
  check('the post stays on its foot',
    Math.abs(built.group.position.x - footX) < 0.01
    && Math.abs(built.group.position.z - footZ) < 0.01,
    `foot ${built.group.position.x.toFixed(2)},${built.group.position.z.toFixed(2)}`);
  check('a fallen post is still a lamp', !!built.light && !!built.mesh);
  check('landing is announced so the lamp can start sparking', landings.length === 1);
  check('the post stays down', entry.down === true);

  // It lies across four and a half metres of the road, and that is blocked.
  const c = built.collider;
  const reach = Math.max(c.maxX - c.minX, c.maxZ - c.minZ);
  check('the fallen post blocks the length of itself', reach > 4,
    `${reach.toFixed(2)} m`);
  check('the fallen post is in the index',
    colliders.near(c.x, c.z, 3).includes(c));

  // It does not get up and go over again.
  check('a post that is already down is not knocked again',
    props.knock(entry, 0, 10) === null);
  check('it is still down', Math.abs(upOf(built.group)) < 0.1);

  // Everything goes back, and the post stands up again.
  props.reset();
  check('the post stands up again', upOf(built.group) > 0.99);
  check('the post blocks a car at its foot again',
    built.collider.circle === true && built.collider.radius < 0.2);
}

// A tree is taller than a car and cannot be knocked over: a car is stopped by
// it, and the tree does not move.
{
  const built = buildTree({ x: 0, z: 0 });
  built.group.position.set(0, WALK_TOP, 0);
  built.group.updateMatrixWorld(true);
  const height = new THREE.Box3().setFromObject(built.group).getSize(new THREE.Vector3()).y;
  check('the tree stands well over a car', height > 4.5, `${height.toFixed(2)} m`);
  check('the tree has nothing to throw', !built.body);

  const colliders = new ColliderList();
  colliders.push(built.collider);
  check('the tree stops a car',
    vehicleBlocked(0, 0, 0, 4.45, 1.85, colliders, null));
  const props = createPropPhysics({ colliders, ground: () => 0 });
  const treeEntry = { group: built.group, collider: built.collider, spec: built.body };
  props.register(treeEntry);
  check('nothing can throw a tree', props.knock(treeEntry, 0, 10) === null);}

console.log(failures === 0 ? 'OK' : `${failures} failures`);
if (failures > 0) process.exit(1);
