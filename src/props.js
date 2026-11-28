// Street furniture. One builder per prop, shared by the city and by the
// collection gallery, so the gallery always shows what the city actually has.
//
// Every builder hands back the mesh and the collider it needs. A prop that
// stands in the world cannot forget to say what it blocks: the collider is
// written next to the geometry, in the same function.
//
// The mesh is built around its own base, so the caller decides how high off
// the ground it stands. The collider is in world coordinates.

import * as THREE from 'three';
import { glow, solid } from './materials.js';

// A lamp post with the arm leaning over the road. `rot` turns the arm.
export function buildLamp({ x = 0, z = 0, rot = 0 } = {}) {
  const group = new THREE.Group();
  const metal = solid(0x2c2e32, 0.48, 0.45);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.5, 8), metal);
  pole.position.y = 2.25;
  pole.castShadow = true;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.08), metal);
  arm.position.set(0.38, 4.45, 0);
  arm.castShadow = true;
  group.add(arm);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.22), glow(0xffe6b0, 0.45));
  head.position.set(0.72, 4.32, 0);
  // The head hangs across the arm, not along it.
  head.rotation.y = Math.PI / 2;
  head.castShadow = true;
  group.add(head);
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  // Only the pole is at body height. The arm hangs over the road well above
  // a car, so it does not stop anything.
  return { group, collider: { circle: true, x, z, radius: 0.14 } };
}

// A fire hydrant, with the two side nozzles.
export function buildHydrant({ x = 0, z = 0 } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.48, 10), solid(0x8d2a24, 0.55));
  body.position.y = 0.24;
  body.castShadow = true;
  group.add(body);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), solid(0xb7b2a8, 0.4, 0.4));
  cap.position.y = 0.52;
  cap.castShadow = true;
  group.add(cap);
  for (const side of [-1, 1]) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 8), solid(0x6f211c, 0.6));
    nozzle.rotation.z = Math.PI / 2;
    nozzle.position.set(side * 0.17, 0.3, 0);
    nozzle.castShadow = true;
    group.add(nozzle);
  }
  group.position.set(x, 0, z);
  return { group, collider: { circle: true, x, z, radius: 0.2 } };
}

// Three rubbish bags, heaped on the pavement.
export function buildTrash({ x = 0, z = 0 } = {}) {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const bag = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 + (i % 2) * 0.05, 8, 6),
      solid(0x2a2c28, 0.85),
    );
    bag.position.set((i - 1) * 0.28, 0.16, (i - 1) * 0.12);
    bag.scale.y = 0.8;
    bag.castShadow = true;
    group.add(bag);
  }
  group.position.set(x, 0, z);
  return { group, collider: { circle: true, x, z, radius: 0.4 } };
}

// A street tree: a trunk under a canopy.
export function buildTree({ x = 0, z = 0, scale = 1 } = {}) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * scale, 0.16 * scale, 1.3 * scale, 8),
    solid(0x5a4030, 0.9),
  );
  trunk.position.y = 0.65 * scale;
  trunk.castShadow = true;
  group.add(trunk);
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(1.05 * scale, 10, 8),
    solid(0x2e4632, 0.95),
  );
  crown.position.y = 1.9 * scale;
  crown.castShadow = true;
  group.add(crown);
  group.position.set(x, 0, z);
  // The trunk stops people. The crown is a canopy that hangs over the
  // pavement, and blocking its whole footprint would wall the sidewalk off.
  return { group, collider: { circle: true, x, z, radius: 0.16 * scale + 0.06 } };
}

// A skip. `rot` turns it, and the collider follows.
export function buildDumpster({ x = 0, z = 0, rot = 0 } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 1.05), solid(0x24362c, 0.7));
  body.position.y = 0.7;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.08, 1.12), solid(0x1c2c24, 0.55));
  lid.position.y = 1.3;
  lid.rotation.x = -0.15;
  lid.castShadow = true;
  group.add(lid);
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  // The body is 1.7 across and 1.05 deep, and the collider has to follow the
  // rotation instead of pretending the box is axis aligned.
  return { group, collider: { obb: true, x, z, heading: rot, halfL: 0.53, halfW: 0.85 } };
}
