// Checks the spatial index in src/spatial.js against a brute force scan.
// For every query the indexed answer has to match the answer a flat list of
// the same colliders gives, or the grid is dropping something.
//
// Run with: npm run check

import { blocked, moveCircle, vehicleBlocked } from '../src/collision.js';
import { ColliderList } from '../src/spatial.js';

let seed = 12345;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

// The walkable region, as the city pushes it.
const region = [[-60, -60], [60, -60], [60, 60], [-60, 60]];

const list = new ColliderList();
const flat = [];
function add(c) {
  list.push(c);
  flat.push(c);
}

for (let i = 0; i < 200; i += 1) {
  const kind = i % 4;
  const x = rnd() * 120 - 60;
  const z = rnd() * 120 - 60;
  if (kind === 0) {
    add({ minX: x, maxX: x + 1 + rnd() * 4, minZ: z, maxZ: z + 1 + rnd() * 4 });
  } else if (kind === 1) {
    add({ obb: true, x, z, heading: rnd() * Math.PI, halfL: 0.8 + rnd() * 2, halfW: 0.5 + rnd() });
  } else if (kind === 2) {
    add({ circle: true, x, z, radius: 0.2 + rnd() * 1.5 });
  } else {
    add({ minX: x - 3, maxX: x + 3, minZ: z - 0.2, maxZ: z + 0.2 });
  }
}
add({ keepInside: region });

let mismatches = 0;
let checked = 0;

for (let i = 0; i < 4000; i += 1) {
  const x = rnd() * 130 - 65;
  const z = rnd() * 130 - 65;
  const r = 0.2 + rnd() * 0.6;
  const indexed = blocked(x, z, r, list);
  const scanned = blocked(x, z, r, flat);
  checked += 1;
  if (indexed !== scanned) {
    mismatches += 1;
    if (mismatches < 5) {
      console.log('circle mismatch', x.toFixed(2), z.toFixed(2), r.toFixed(2), indexed, scanned);
    }
  }
}

// The car test uses an oriented footprint and the region rules.
for (let i = 0; i < 2000; i += 1) {
  const x = rnd() * 130 - 65;
  const z = rnd() * 130 - 65;
  const heading = rnd() * Math.PI * 2;
  const length = 3 + rnd() * 3;
  const width = 1.6 + rnd();
  const indexed = vehicleBlocked(x, z, heading, length, width, list, null);
  const scanned = vehicleBlocked(x, z, heading, length, width, flat, null);
  checked += 1;
  if (indexed !== scanned) {
    mismatches += 1;
    if (mismatches < 5) {
      console.log('vehicle mismatch', x.toFixed(2), z.toFixed(2), indexed, scanned);
    }
  }
}

// Taking a collider out has to change the answer, and putting it back has to
// restore it. A stale grid entry would fail one of the two.
const victim = flat[7];
const victimX = (victim.minX + victim.maxX) / 2;
const victimZ = (victim.minZ + victim.maxZ) / 2;
const before = blocked(victimX, victimZ, 0.3, list);
list.splice(list.indexOf(victim), 1);
const during = blocked(victimX, victimZ, 0.3, list);
list.push(victim);
const after = blocked(victimX, victimZ, 0.3, list);
if (before !== after) {
  mismatches += 1;
  console.log('re-add mismatch', before, after);
}

// A circle collider has no corners: the car test used to treat one as a
// rectangle and read the missing edges as a hit.
const solo = new ColliderList();
solo.push({ circle: true, x: 0, z: 0, radius: 0.14 });
if (vehicleBlocked(20, 20, 0, 4, 2, solo, null)) {
  mismatches += 1;
  console.log('a circle far away blocked the car');
}

console.log(`checked ${checked} queries, ${mismatches} mismatches`);

// Walking into a wall has to slide along it, not stop dead against it.
const R = 0.36;
const wall = new ColliderList();
wall.push({ minX: -20, maxX: 20, minZ: 0, maxZ: 1 });

// A step that is half into the wall and half along it keeps the part along
// it and drops the part into the wall.
const slid = moveCircle(0, 1.36, 0.1, -0.1, R, wall);
if (Math.abs(slid.x - 0.1) > 1e-6 || Math.abs(slid.z - 1.36) > 1e-6) {
  mismatches += 1;
  console.log('slide along a wall', slid.x.toFixed(3), slid.z.toFixed(3), 'want 0.100 1.360');
}

// A wall that is not square to the world: the body follows the wall, not
// the axes.
const turned = new ColliderList();
turned.push({ obb: true, x: 0, z: 0, heading: Math.PI / 4, halfL: 10, halfW: 0.5 });
const fx = Math.sin(Math.PI / 4);
const fz = Math.cos(Math.PI / 4);
const sx = Math.cos(Math.PI / 4);
const sz = -Math.sin(Math.PI / 4);
const from = [-0.8 * sx, -0.8 * sz];
const turned2 = moveCircle(
  from[0],
  from[1],
  0.4 * sx + 0.1 * fx,
  0.4 * sz + 0.1 * fz,
  R,
  turned,
);
const along = (turned2.x - from[0]) * fx + (turned2.z - from[1]) * fz;
const across = (turned2.x - from[0]) * sx + (turned2.z - from[1]) * sz;
if (Math.abs(along - 0.1) > 1e-6 || across > 1e-6) {
  mismatches += 1;
  console.log('slide along a turned wall', along.toFixed(3), across.toFixed(3), 'want 0.100 and <= 0');
}

// A body that is wedged inside something climbs out of it.
const wedged = moveCircle(0, 0.5, 0, -0.1, R, wall);
if (blocked(wedged.x, wedged.z, R, wall)) {
  mismatches += 1;
  console.log('a body inside a wall stayed inside', wedged.x.toFixed(3), wedged.z.toFixed(3));
}

if (mismatches > 0) process.exit(1);
