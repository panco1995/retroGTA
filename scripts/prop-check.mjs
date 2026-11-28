// Throws a pile of rubbish out of the way and checks that it lands, that it
// keeps its shape, and that its collider follows it instead of standing
// where it used to be.
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
const { buildDumpster, buildHydrant, buildTrash } = await import('../src/props.js');
const { createPropPhysics } = await import('../src/prop-physics.js');
const { vehicleBlocked } = await import('../src/collision.js');
const { ColliderList } = await import('../src/spatial.js');

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` ${detail}` : ''}`);
}

// A heap of rubbish on the pavement, with the physics engine around it.
function place(build, x = 0, z = 0) {
  const colliders = new ColliderList();
  const props = createPropPhysics({ colliders, ground: () => 0 });
  const { group, collider, body } = build({ x, z });
  group.position.set(x, WALK_TOP, z);
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

// The rubbish bags.
{
  const { colliders, props, group, collider, entry } = place(buildTrash, 0, 0);
  check('the heap starts in the index', colliders.near(0, 0, 1).includes(collider));
  check('the heap has a body', !!entry.spec && entry.spec.shapes.length === 3);

  // A car runs into it at speed.
  const keep = props.knock(entry, 14, 0);
  check('the heap is thrown', keep !== null && keep < 1, `car keeps ${keep?.toFixed(2)}`);
  check('the heap leaves the index while it is in the air',
    !colliders.near(0, 0, 1).includes(collider));

  settle(props);
  const moved = Math.hypot(group.position.x, group.position.z);
  check('the heap is thrown clear', moved > 1, `moved ${moved.toFixed(2)} m`);
  // It has to come to rest on its own, not wait for the time limit.
  check('the heap comes to rest', !entry.flying);
  check('the heap rests on the ground', Math.abs(lowest(group) - WALK_TOP) < 0.25,
    `lowest ${lowest(group).toFixed(2)}`);

  // The collider has to be where the heap is, not where it stood.
  check('the collider follows the heap',
    Math.abs(collider.x - group.position.x) < 0.01
    && Math.abs(collider.z - group.position.z) < 0.01,
    `collider ${collider.x.toFixed(2)},${collider.z.toFixed(2)} heap ${group.position.x.toFixed(2)},${group.position.z.toFixed(2)}`);
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
}

console.log(failures === 0 ? 'OK' : `${failures} failures`);
if (failures > 0) process.exit(1);
