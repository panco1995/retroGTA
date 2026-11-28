// Drops a person and checks that the engine keeps the body together, puts
// it on the ground and lets it come to rest.
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
const { animateActor, createActor, setPose } = await import('../src/actor.js');
const { ragdollOf, startRagdoll, stepPhysics, stepRagdolls } = await import('../src/ragdoll.js');

// The world is shared with the street furniture now, so a frame is one step of
// the world and then one read of the result. The game does this once a frame;
// the check does it here.
function tick(frames) {
  for (let i = 0; i < frames; i += 1) {
    stepPhysics(1 / 60);
    stepRagdolls(1 / 60);
  }
}

function makeActor(height = 1) {
  const actor = createActor({ height });
  actor.group.position.set(0, 0, 0);
  actor.group.rotation.y = 0;
  actor.group.updateMatrixWorld(true);
  return actor;
}

function world(node) {
  return node.getWorldPosition(new THREE.Vector3());
}

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` ${detail}` : ''}`);
}

// A standing person is knocked over.
const actor = makeActor();
const before = world(actor.hips);
const handle = startRagdoll(actor, {
  x: 0, z: 0, groundY: 0, vx: 4, vy: 2, vz: 0, colliders: [],
});
check('a ragdoll starts', !!handle && ragdollOf(actor) === handle);

tick(600);
const after = world(actor.hips);
check('the body falls', after.y < before.y - 0.2, `hips ${before.y.toFixed(2)} -> ${after.y.toFixed(2)}`);
check('the body lands on the ground', after.y > -0.1 && after.y < 0.6, `hips y ${after.y.toFixed(2)}`);

// The seams must not come apart.
const p = actor.parts;
check('the torso stays on the hips', world(actor.hips).distanceTo(world(p.torso)) < 0.45);
check('the head stays on the shoulders', world(p.torso).distanceTo(world(p.head)) < 0.6);
check('the shin stays on the thigh', world(p.leftLeg).distanceTo(world(p.leftShin)) < 0.6);

let maxSpeed = 0;
for (const body of handle.bodies) maxSpeed = Math.max(maxSpeed, body.velocity.length());
check('the body comes to rest', maxSpeed < 0.6, `fastest ${maxSpeed.toFixed(2)} m/s`);
check('the ragdoll ends', !ragdollOf(actor));
check('the landing pose is kept for the get up', !!actor.getupFrom);

// A shorter person.
const small = makeActor(0.75);
startRagdoll(small, { x: 0, z: 0, groundY: 0, colliders: [] });
tick(300);
check('a short person lands too', world(small.hips).y > -0.1 && world(small.hips).y < 0.6);
check('a short person stays whole', world(small.hips).distanceTo(world(small.parts.torso)) < 0.45);

// A wall stops the body.
const wall = { minX: 1.5, maxX: 3.5, minZ: -5, maxZ: 5 };
const walled = makeActor();
startRagdoll(walled, { x: 0, z: 0, groundY: 0, vx: 6, vy: 0, vz: 0, colliders: [wall] });
tick(600);
check('the wall stops the body', world(walled.hips).x < 1.5, `hips x ${world(walled.hips).x.toFixed(2)}`);

// The character gets up from where it landed.
const getting = makeActor();
startRagdoll(getting, { x: 0, z: 0, groundY: 0, vx: 5, vy: 1, vz: 0, colliders: [] });
tick(600);
const landed = getting.hips.position.y;
setPose(getting, 'getup');
for (let i = 0; i < 120; i += 1) animateActor(getting, 0, i / 60, 1 / 60);
check('the character gets up', getting.pose === 'stand', `pose ${getting.pose}`);
check('the character stands up straight', Math.abs(getting.hips.position.y - 0.9) < 0.02,
  `hips y ${getting.hips.position.y.toFixed(2)}, landed at ${landed.toFixed(2)}`);
// The hips carry the landing orientation, so they have to be righted too.
const hipsUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
  getting.hips.getWorldQuaternion(new THREE.Quaternion()),
);
check('the hips are upright again', hipsUp.y > 0.95, `up ${hipsUp.y.toFixed(2)}`);
const headUp = world(getting.parts.head).y - world(getting.hips).y;
check('the head is above the hips again', headUp > 0.4, `head ${headUp.toFixed(2)} above`);

console.log(failures === 0 ? 'OK' : `${failures} failures`);
if (failures > 0) process.exit(1);
