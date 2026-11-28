// The physics engine the bodies are handed to.
//
// There is one world, shared by everything that gets thrown about: the people
// who are knocked down, and the street furniture a car hits. It used to be two,
// one each, which meant a piece of furniture and a body could not touch each
// other and every new thing that should fall had to be wired into one of them
// by hand. A thing that is given to this world now falls, lands, and hits what
// is near it without anything else being told about it.
//
// The cost of sharing is that the two kinds of body have to be kept apart where
// they must not touch. A body knocked down on the pavement should not be shoved
// by a wall that was put up for a flying skip, and the ground built under one
// is not the ground built under the other, so each gets its own collision
// group and sees only its own.

import * as CANNON from 'cannon-es';
import { nearby } from './collision.js';

// Downward pull, in metres per second squared.
//
// This is not the 9.82 of the real world: it is what a person's jump was tuned
// to, and it is what everything falls at now, so that a body knocked off a kerb
// and a bag of rubbish thrown by a car fall at the same rate. The two used to
// disagree, and a body fell faster while it was being hit than after.
export const GRAVITY = 24;

// The groups bodies sort themselves into. Each is a bit, so a body's mask can
// say which of the others it is allowed to touch.
export const GROUP = {
  // The person who is falling, and the ground and walls built for them.
  body: 1,
  bodyWorld: 2,
  // A piece of street furniture on the move, and its ground and walls.
  prop: 4,
  propWorld: 8,
  // Anything that should meet both, and be met by both. The car that throws a
  // prop goes here, so it shoves the prop without walking through a body.
  all: 16,
};

// How far around a body the walls are built.
const WALL_REACH = 4.5;
// How tall those walls are.
const WALL_HEIGHT = 6;

// A world with gravity in it, ready for bodies.
export function createWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 12;
  world.defaultContactMaterial.friction = 0.55;
  world.defaultContactMaterial.restitution = 0.04;
  return world;
}

// The one world everything shares. It is made on first use, so a module that
// only builds bodies for a check still gets a world of its own without the game
// having to make one first.
let shared = null;
export function physicsWorld() {
  if (!shared) shared = createWorld();
  return shared;
}

// Puts a body in a group, and says which groups it may touch.
export function inGroup(body, group, mask) {
  body.collisionFilterGroup = group;
  body.collisionFilterMask = mask;
  return body;
}

// The ground a body lands on.
//
// `group` and `mask` are what the ground can be touched by: a ground built for
// the people who are falling is only solid to them, and one built for the
// furniture only to that.
export function buildGround(world, groundY, group = GROUP.bodyWorld, mask = GROUP.body | GROUP.all) {
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  ground.position.set(0, groundY, 0);
  inGroup(ground, group, mask);
  world.addBody(ground);
  return ground;
}

// The walls around a body: everything near the spot it starts from, so it
// has something solid to land against.
//
// The boxes are turned to face the way the collider they stand for is turned,
// and the half extents follow the same convention: the length of a box runs
// along the direction it faces, the width across it.
//
// `skip` leaves out colliders that should not be in the way. Street
// furniture leaves it out, so that one heap of rubbish does not stop another
// one from being thrown out of the way.
export function buildWalls(
  world,
  colliders,
  x,
  z,
  groundY,
  reach = WALL_REACH,
  skip = null,
  group = GROUP.bodyWorld,
  mask = GROUP.body | GROUP.all,
) {
  const walls = [];
  for (const c of nearby(colliders, x, z, reach)) {
    if (c.keepInside) continue;
    if (skip && skip(c)) continue;
    let wall = null;
    if (c.obb) {
      wall = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(c.halfW, WALL_HEIGHT / 2, c.halfL)),
      });
      wall.quaternion.setFromEuler(0, c.heading, 0);
      wall.position.set(c.x, groundY + WALL_HEIGHT / 2, c.z);
    } else if (c.circle) {
      wall = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Cylinder(c.radius, c.radius, WALL_HEIGHT, 10),
      });
      wall.position.set(c.x, groundY + WALL_HEIGHT / 2, c.z);
    } else {
      wall = new CANNON.Body({
        mass: 0,
        shape: new CANNON.Box(new CANNON.Vec3(
          (c.maxX - c.minX) / 2,
          WALL_HEIGHT / 2,
          (c.maxZ - c.minZ) / 2,
        )),
      });
      wall.position.set(
        (c.minX + c.maxX) / 2,
        groundY + WALL_HEIGHT / 2,
        (c.minZ + c.maxZ) / 2,
      );
    }
    inGroup(wall, group, mask);
    world.addBody(wall);
    walls.push(wall);
  }
  return walls;
}
