// The physics engine the bodies are handed to.
//
// It holds the setup that is the same everywhere: gravity, a broad phase
// that can sort the bodies along one axis, and the walls that are built
// around a body when it starts falling, so that it lands against something
// solid instead of sliding through the city.
//
// The walls are taken away again when the body comes to rest. They are only
// there to give the body something to hit while it is moving.

import * as CANNON from 'cannon-es';
import { nearby } from './collision.js';

// How far around a body the walls are built.
const WALL_REACH = 4.5;
// How tall those walls are.
const WALL_HEIGHT = 6;

// A world with gravity in it, ready for bodies.
export function createWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 12;
  world.defaultContactMaterial.friction = 0.55;
  world.defaultContactMaterial.restitution = 0.04;
  return world;
}

// The ground a body lands on.
export function buildGround(world, groundY) {
  const ground = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  ground.position.set(0, groundY, 0);
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
export function buildWalls(world, colliders, x, z, groundY, reach = WALL_REACH, skip = null) {
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
    world.addBody(wall);
    walls.push(wall);
  }
  return walls;
}
