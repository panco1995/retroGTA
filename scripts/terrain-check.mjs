// Checks the ground: that it answers with a height, a lean and a material,
// that the lean is the same whichever way a vehicle faces, and that the edge
// of a slope does not leak into the flat ground beside it.
//
// Run with: npm run check

// Some of the modules touched here expect a browser to draw textures with.
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

const { createTerrain, leanOn, settleOnGround, surfaceAreas, SURFACE_KINDS } = await import('../src/terrain.js');

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` ${detail}` : ''}`);
}

// Ground that climbs at a steady rate towards +Z.
const RISE = 0.2;
const ramp = createTerrain({ height: (x, z) => z * RISE });

// A height, and a lean that matches it.
{
  check('height comes from the map', Math.abs(ramp.heightAt(0, 5) - 5 * RISE) < 1e-9);
  const n = ramp.normalAt(0, 5);
  // A slope of t has a normal of (0, 1, -t) once normalised.
  const want = -RISE / Math.hypot(1, RISE);
  check('the lean points away from the climb',
    Math.abs(n.z - want) < 1e-6 && Math.abs(n.x) < 1e-9,
    `n=(${n.x.toFixed(2)}, ${n.y.toFixed(3)}, ${n.z.toFixed(3)})`);
  check('the lean is a unit vector',
    Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-9);
  check('a slope is as steep as it looks',
    Math.abs(ramp.slopeAt(0, 5) - Math.hypot(RISE, 0) / Math.hypot(1, RISE)) < 1e-6);
}

// Flat ground is exactly flat, with no lean to it at all.
{
  const flat = createTerrain({ height: () => 3.5 });
  const n = flat.normalAt(40, -70);
  check('flat ground is straight up',
    n.x === 0 && n.y === 1 && n.z === 0, `n=(${n.x}, ${n.y}, ${n.z})`);
  check('flat ground has no lean', flat.slopeAt(40, -70) === 0);
  check('flat ground still has a height', Math.abs(flat.heightAt(40, -70) - 3.5) < 1e-9);
}

// The lean of a vehicle, from the ground it stands on. Uphill and downhill are
// opposite angles; a slope across the path is a roll, not a pitch.
{
  const uphill = leanOn(ramp.normalAt(0, 0), 0);
  const downhill = leanOn(ramp.normalAt(0, 0), Math.PI);
  check('a nose pointing up a slope is tilted up',
    uphill.pitch < 0 && Math.abs(uphill.pitch + Math.atan(RISE)) < 1e-6,
    `${(uphill.pitch * 180 / Math.PI).toFixed(1)} deg`);
  check('turning the car round flips the pitch',
    Math.abs(downhill.pitch + uphill.pitch) < 1e-6,
    `${(downhill.pitch * 180 / Math.PI).toFixed(1)} deg`);
  check('a slope along the path is no roll',
    Math.abs(uphill.roll) < 1e-6);

  // The same ground, but climbing towards +X, seen by a car facing +Z.
  const across = createTerrain({ height: (x) => x * RISE });
  const side = leanOn(across.normalAt(0, 0), 0);
  check('a slope across the path is a roll',
    Math.abs(side.pitch) < 1e-6 && Math.abs(Math.abs(side.roll) - Math.atan(RISE)) < 1e-6,
    `pitch ${(side.pitch * 180 / Math.PI).toFixed(1)} deg, roll ${(side.roll * 180 / Math.PI).toFixed(1)} deg`);
}

// A car standing on the ground gets its height and its lean from the same
// place, so the two can never disagree.
{
  const car = { x: 0, z: 12, heading: 0, y: 0, pitch: 0, groundRoll: 0 };
  settleOnGround(ramp, car);
  check('a car is stood on the ground under it',
    Math.abs(car.y - 12 * RISE) < 1e-9, `y ${car.y.toFixed(3)}`);
  check('a car is leaned to the ground it stands on',
    car.pitch < 0 && Math.abs(car.roll ? car.groundRoll : car.groundRoll) < 1e-6,
    `pitch ${(car.pitch * 180 / Math.PI).toFixed(1)} deg`);
}

// The edge of a slope must not tilt the ground beside it. A kerb is a cliff a
// few centimetres high; the ground on either side is flat, and a car parked
// next to it must not be leaned over it.
//
// The sample is taken a step inside the edge, which is exactly where a wide
// difference quotient reaches across the kerb and reads its height as a
// slope. That is the case that has to be caught here.
{
  const kerb = createTerrain({ height: (x) => (x < 0 ? 0 : 1.5) });
  const nearTop = kerb.normalAt(0.6, 0);
  const nearBelow = kerb.normalAt(-0.6, 0);
  check('the flat just beside a kerb is flat', Math.abs(nearTop.y - 1) < 0.02,
    `ny ${nearTop.y.toFixed(3)}`);
  check('the flat just below a kerb is flat', Math.abs(nearBelow.y - 1) < 0.02,
    `ny ${nearBelow.y.toFixed(3)}`);
  // And further out, where nothing is in doubt.
  check('the flat well beside a kerb is flat', Math.abs(kerb.normalAt(3, 0).y - 1) < 1e-9);
  // Right on the edge it is allowed to be steep, but the normal still has to
  // point up rather than lying down or flipping over.
  const atEdge = kerb.normalAt(0, 0);
  check('the edge itself is still a sane normal', atEdge.y > 0.1, `ny ${atEdge.y.toFixed(3)}`);
}

// What the ground is made of, and what that means for a car on it.
{
  const areas = surfaceAreas([
    { kind: 'sand', ring: [[0, 0], [20, 0], [20, 20], [0, 20]] },
    { kind: 'asphalt', rect: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } },
  ]);
  const ground = createTerrain({ height: () => 0, kinds: areas, fallback: 'grass' });
  check('a named patch answers with its material', ground.kindAt(5, 5) === 'sand');
  check('the ground outside every patch is the default', ground.kindAt(50, 50) === 'grass');
  check('a patch listed first wins', ground.kindAt(1, 1) === 'sand');

  const sand = ground.surfaceAt(10, 10);
  check('one sample gives height, lean and material at once',
    sand.height === 0 && sand.ny === 1 && sand.kind === 'sand' && sand.grip > 0 && sand.drag > 1);
  check('sand grips less than a road', SURFACE_KINDS.sand.grip < SURFACE_KINDS.asphalt.grip);
  check('sand drags more than a road', SURFACE_KINDS.sand.drag > SURFACE_KINDS.asphalt.drag);
  check('an unknown material falls back rather than crashing',
    createTerrain({ height: () => 0, kinds: [{ kind: 'lava', rect: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 } }] })
      .surfaceAt(0, 0).grip === SURFACE_KINDS.asphalt.grip);
}

console.log(failures === 0 ? 'OK' : `${failures} failures`);
if (failures > 0) process.exit(1);
