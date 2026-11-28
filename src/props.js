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
//
// The post is tall and thin, so a car that hits it does not throw it: it
// snaps off at the foot and goes over. The geometry and the body it is given
// are written from the same numbers, so the shape the engine throws about is
// the shape on screen.
const LAMP_POLE_H = 4.5;
const LAMP_ARM_Y = 4.45;
const LAMP_HEAD = [0.72, 4.32, 0];

export function buildLamp({ x = 0, z = 0, rot = 0 } = {}) {
  const group = new THREE.Group();
  const metal = solid(0x2c2e32, 0.48, 0.45);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, LAMP_POLE_H, 8), metal);
  pole.position.y = LAMP_POLE_H / 2;
  pole.castShadow = true;
  group.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.06, 0.08), metal);
  arm.position.set(0.38, LAMP_ARM_Y, 0);
  arm.castShadow = true;
  group.add(arm);
  // The head has a lamp of its own rather than the shared glow material, so
  // that a post which has been knocked down can flicker without every other
  // light in the street doing the same.
  const lamp = glow(0xffe6b0, 0.45).clone();
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.22), lamp);
  head.position.set(LAMP_HEAD[0], LAMP_HEAD[1], LAMP_HEAD[2]);
  // The head hangs across the arm, not along it.
  head.rotation.y = Math.PI / 2;
  head.castShadow = true;
  group.add(head);
  group.position.set(x, 0, z);
  group.rotation.y = rot;
  // Only the pole is at body height. The arm hangs over the road well above
  // a car, so it does not stop anything.
  return {
    group,
    collider: { circle: true, x, z, radius: 0.14 },
    // The lamp's own light, for whoever wants to flicker it, and the head the
    // sparks come out of once the post is down.
    light: lamp,
    mesh: head,
    body: {
      mass: 70,
      // A post is bolted down. It does not fly: it leans over and falls, so it
      // leaves with only a little of the car's speed and turns over slowly.
      launch: 0.34,
      lift: 0.03,
      drag: 0.42,
      spin: 0.55,
      maxSpin: 2.2,
      side: 0.1,
      push: 2.4,
      // A post is bolted at the foot: it does not fly, it goes over about its
      // own base, which is the only way a four and a half metre pole can fall
      // without pole vaulting over the car that hit it.
      topple: true,
      // The middle of the post, above the foot of it.
      at: [0, LAMP_POLE_H / 2, 0],
      shapes: [
        { type: 'cylinder', radius: 0.08, height: LAMP_POLE_H, at: [0, 0, 0] },
        { type: 'box', half: [0.425, 0.03, 0.04], at: [0.38, LAMP_ARM_Y - LAMP_POLE_H / 2, 0] },
        {
          type: 'box',
          half: [0.11, 0.05, 0.21],
          at: [LAMP_HEAD[0], LAMP_HEAD[1] - LAMP_POLE_H / 2, LAMP_HEAD[2]],
        },
      ],
      // Where the sparks come from once it is down: the head of the lamp.
      headAt: LAMP_HEAD,
    },
  };
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
  // A hydrant is heavy, but a car still sends it flying.
  return {
    group,
    collider: { circle: true, x, z, radius: 0.2 },
    body: {
      mass: 32,
      launch: 0.85,
      lift: 0.16,
      drag: 0.22,
      // A hydrant is small enough to go almost anywhere: it is thrown well
      // off to the side, and a car that catches up with it only loses a
      // little speed for the trouble.
      side: 0.55,
      push: 0.4,
      // The middle of the barrel, above the foot of it.
      at: [0, 0.24, 0],
      shapes: [
        { type: 'cylinder', radius: 0.15, height: 0.48, at: [0, 0, 0] },
        { type: 'sphere', radius: 0.14, at: [0, 0.28, 0] },
      ],
    },
  };
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
  // The bags are light enough for a car to throw them out of the way.
  return {
    group,
    collider: { circle: true, x, z, radius: 0.4 },
    body: {
      mass: 12,
      // The share of the car's speed the heap takes off with, how high it
      // pops, and how much of the car's speed it takes away. The heap goes
      // faster than the car that hit it, so it clears out of the way.
      launch: 1.05,
      lift: 0.2,
      drag: 0.05,
      // A heap of bags skitters off to the side, and a car barely notices
      // pushing it.
      side: 0.7,
      push: 0.15,
      // The middle of the heap, above the foot of it.
      at: [0, 0.16, 0],
      shapes: [
        { type: 'sphere', radius: 0.18, at: [-0.28, 0, -0.12] },
        { type: 'sphere', radius: 0.23, at: [0, 0, 0] },
        { type: 'sphere', radius: 0.18, at: [0.28, 0, 0.12] },
      ],
    },
  };
}

// A street tree: a trunk under a canopy.
//
// A tree is older than the street and cannot be knocked over: a car that hits
// one stops against it. The trunk is tall enough to stand over a car, and the
// canopy sits high enough that a car drives under the leaves rather than into
// them.
const TRUNK_H = 3.4;
const TRUNK_R = 0.17;

export function buildTree({ x = 0, z = 0, scale = 1 } = {}) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(TRUNK_R * scale, (TRUNK_R + 0.05) * scale, TRUNK_H * scale, 8),
    solid(0x5a4030, 0.9),
  );
  trunk.position.y = (TRUNK_H / 2) * scale;
  trunk.castShadow = true;
  group.add(trunk);
  // A branch fork, so the trunk does not read as a bare pole under the leaves.
  const branch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06 * scale, 0.09 * scale, 0.9 * scale, 6),
    solid(0x5a4030, 0.9),
  );
  branch.position.set(0.16 * scale, (TRUNK_H - 0.2) * scale, 0);
  branch.rotation.z = -0.5;
  branch.castShadow = true;
  group.add(branch);
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(1.15 * scale, 10, 8),
    solid(0x2e4632, 0.95),
  );
  crown.position.y = (TRUNK_H + 0.85) * scale;
  crown.scale.set(1, 1.15, 1);
  crown.castShadow = true;
  group.add(crown);
  group.position.set(x, 0, z);
  // The trunk stops people and cars. The crown is a canopy that hangs over
  // the pavement, and blocking its whole footprint would wall the sidewalk
  // off; it is also high enough for a car to drive under.
  return { group, collider: { circle: true, x, z, radius: TRUNK_R * scale + 0.1 } };
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
  // A dumpster is too heavy to be thrown, but a car still shoves it along.
  return {
    group,
    collider: { obb: true, x, z, heading: rot, halfL: 0.53, halfW: 0.85 },
    body: {
      mass: 80,
      launch: 0.6,
      lift: 0.05,
      drag: 0.45,
      // A skip is heavy and wide. It barely leaves the lane it was standing
      // in, and shouldering it down the road costs the car real speed.
      side: 0.12,
      push: 1.6,
      // The middle of the box, above the foot of it.
      at: [0, 0.7, 0],
      shapes: [
        { type: 'box', half: [0.85, 0.575, 0.525], at: [0, 0, 0] },
        { type: 'box', half: [0.89, 0.04, 0.56], at: [0, 0.6, 0], rot: [-0.15, 0, 0] },
      ],
    },
  };
}
