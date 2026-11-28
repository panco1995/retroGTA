// Checks the spatial index in src/spatial.js against a brute force scan.
// For every query the indexed answer has to match the answer a flat list of
// the same colliders gives, or the grid is dropping something.
//
// Run with: npm run check

import { blocked, vehicleBlocked } from '../src/collision.js';
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
if (mismatches > 0) process.exit(1);
