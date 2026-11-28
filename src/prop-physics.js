// Street furniture that a car runs into does not stay where it was.
//
// The rubbish bags, the hydrant and the dumpster are handed to a physics
// engine and get thrown out of the way. A bag flies, a dumpster only shifts,
// and the car loses a little speed for the trouble.
//
// The collider has to travel with the prop. The spatial index remembers
// where a collider was put, not where it is now, so a collider that stayed
// behind would leave a fence standing in the street: the next car would hit
// nothing, and people would walk into thin air. So a prop that is in the air
// is out of the index entirely, and it goes back into the index when it comes
// to rest, at the place it came to rest at.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { WALK_TOP } from './config.js';
import { buildWalls, createWorld } from './physics.js';

// How long a prop may be in the air before it is stopped where it lies.
const MAX_TIME = 6;
// How slow it has to be to count as still.
const REST_SPEED = 0.45;
// How slow it has to be turning to count as still.
const REST_SPIN = 1.2;
// How long it has to stay still before it is stopped.
const REST_TIME = 0.4;
// How far around the prop the walls are built. A prop travels further than a
// body that only falls over, so it needs walls further out.
const WALL_REACH = 8;

export function createPropPhysics({ colliders, ground }) {
  const world = createWorld();
  // Every prop that can be knocked out of the way.
  const all = new Set();
  // The ones that are in the air right now.
  const flying = new Set();

  // A prop on the pavement that a car can throw out of the way.
  function register(entry) {
    const group = entry.group;
    entry.start = {
      x: group.position.x,
      y: group.position.y,
      z: group.position.z,
      heading: group.rotation.y,
    };
    // The collider carries the prop with it, so that whoever runs into the
    // prop can tell which prop it was.
    entry.collider.prop = entry;
    entry.flying = false;
    entry.body = null;
    entry.walls = null;
    all.add(entry);
  }

  // The ground under a prop. The city has a hill, so the floor follows the
  // ground instead of being one flat plane.
  function floorAt(x, z) {
    return WALK_TOP + ground(x, z);
  }

  // A car has run into the prop: it takes off with the car's speed, less the
  // weight of the prop. Returns the share of the car's speed that is left, or
  // null when the prop was not thrown after all.
  function knock(entry, vx, vz) {
    if (!entry || entry.flying) return null;
    const spec = entry.spec;
    const speed = Math.hypot(vx, vz);
    if (speed < 0.5) return null;
    const dirX = vx / speed;
    const dirZ = vz / speed;

    const body = new CANNON.Body({ mass: spec.mass });
    for (const shape of spec.shapes) {
      body.addShape(
        makeShape(shape),
        new CANNON.Vec3(shape.at[0], shape.at[1], shape.at[2]),
        shapeTurn(shape.rot),
      );
    }
    body.angularDamping = 0.12;
    body.linearDamping = 0.02;
    // The engine must not put the prop to sleep: it has no ground under it to
    // sleep on, and a prop that falls asleep in mid air would hang there.
    body.allowSleep = false;

    // The prop keeps the way it was standing: the body starts turned the way
    // the prop was turned.
    const turn = new CANNON.Quaternion();
    turn.setFromEuler(0, entry.start.heading, 0);
    const at = new CANNON.Vec3(spec.at[0], spec.at[1], spec.at[2]);
    const centre = turn.vmult(at);
    const group = entry.group;
    body.position.set(
      group.position.x + centre.x,
      group.position.y + centre.y,
      group.position.z + centre.z,
    );
    body.quaternion.copy(turn);
    world.addBody(body);

    // The prop leaves the index while it is in the air. It cannot be found by
    // anything that is looking for something to hit, which is right: a bag of
    // rubbish in the air is not in the way of a car.
    colliders.hide(entry.collider);

    // It takes off with the car, less the weight of the prop.
    const launch = speed * spec.launch;
    body.velocity.set(dirX * launch, speed * spec.lift, dirZ * launch);
    // The prop tumbles about the axis across the direction it is travelling,
    // so it rolls the way it was hit instead of flailing.
    const spin = Math.min(9, speed * 0.7);
    body.angularVelocity.set(-dirZ * spin, (Math.random() - 0.5) * 0.8, dirX * spin);
    body.wakeUp();

    entry.body = body;
    entry.walls = buildWalls(
      world,
      colliders,
      body.position.x,
      body.position.z,
      floorAt(body.position.x, body.position.z),
      WALL_REACH,
      // Street furniture is not in the way of other street furniture, so one
      // heap of rubbish cannot stop another one from being thrown.
      (c) => !!c.prop,
    );
    entry.flying = true;
    entry.time = 0;
    entry.calm = 0;
    flying.add(entry);
    return 1 - spec.drag;
  }

  // The engine writes the body back onto the mesh: the group turns and moves
  // with it, and the collider follows the group, so it ends up where the prop
  // actually is.
  function writeBack(entry) {
    const body = entry.body;
    const group = entry.group;
    const quat = _quat.set(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w,
    );
    // The body sits in the middle of the prop, the group stands at its foot.
    _offset.set(entry.spec.at[0], entry.spec.at[1], entry.spec.at[2]).applyQuaternion(quat);
    group.position.set(
      body.position.x - _offset.x,
      body.position.y - _offset.y,
      body.position.z - _offset.z,
    );
    group.quaternion.copy(quat);
    const collider = entry.collider;
    collider.x = group.position.x;
    collider.z = group.position.z;
    if (collider.obb) {
      // The box turns with the prop, so its heading follows.
      _euler.setFromQuaternion(quat, 'YXZ');
      collider.heading = _euler.y;
    }
  }

  // The prop has reached the ground. It is pushed up out of it and the fall is
  // taken off it, so it slides and rolls along instead of sinking into the
  // street. Returns whether it is on the ground.
  function land(entry) {
    const body = entry.body;
    const floor = floorAt(body.position.x, body.position.z);
    body.updateAABB();
    // The lowest point of the shape is the bottom of its box, so a prop that
    // has tipped over rests on the edge it tipped onto.
    const lowest = body.aabb.lowerBound.y;
    if (lowest < floor) {
      body.position.y += floor - lowest;
      if (body.velocity.y < 0) body.velocity.y = 0;
      // The ground takes the speed off.
      body.velocity.x *= 0.82;
      body.velocity.z *= 0.82;
      body.angularVelocity.scale(0.78, body.angularVelocity);
    }
    // A prop that lies still just above the ground is on it as well. It has to
    // count, otherwise a prop that has come to rest is never stopped, and its
    // collider never goes back into the index.
    return lowest <= floor + 0.05;
  }

  function step(dt) {
    if (flying.size === 0) return;
    world.step(1 / 60, dt, 4);
    for (const entry of [...flying]) {
      entry.time += dt;
      const touching = land(entry);
      writeBack(entry);
      if (entry.time > MAX_TIME) {
        rest(entry);
        continue;
      }
      const body = entry.body;
      const still = body.velocity.lengthSquared() < REST_SPEED * REST_SPEED
        && body.angularVelocity.lengthSquared() < REST_SPIN * REST_SPIN;
      if (still && touching) {
        entry.calm += dt;
        if (entry.calm > REST_TIME) rest(entry);
      } else {
        entry.calm = 0;
      }
    }
  }

  // The prop has come to rest. It is taken out of the engine, it keeps the
  // pose it landed in, and its collider goes back into the index at the place
  // it came to rest at.
  function rest(entry) {
    world.removeBody(entry.body);
    for (const wall of entry.walls) world.removeBody(wall);
    flying.delete(entry);
    entry.flying = false;
    entry.body = null;
    entry.walls = null;
    colliders.restore(entry.collider);
  }

  // Everything goes back where it was.
  function reset() {
    for (const entry of [...flying]) {
      world.removeBody(entry.body);
      for (const wall of entry.walls) world.removeBody(wall);
      flying.delete(entry);
      entry.flying = false;
      entry.body = null;
      entry.walls = null;
    }
    for (const entry of all) {
      const group = entry.group;
      group.position.set(entry.start.x, entry.start.y, entry.start.z);
      group.rotation.set(0, entry.start.heading, 0);
      group.updateMatrixWorld(true);
      const collider = entry.collider;
      collider.x = entry.start.x;
      collider.z = entry.start.z;
      if (collider.obb) collider.heading = entry.start.heading;
      colliders.restore(collider);
    }
  }

  return { register, knock, step, reset };
}

// The shape a piece of furniture is made of.
function makeShape(shape) {
  if (shape.type === 'sphere') return new CANNON.Sphere(shape.radius);
  if (shape.type === 'cylinder') {
    return new CANNON.Cylinder(shape.radius, shape.radius, shape.height, 10);
  }
  return new CANNON.Box(new CANNON.Vec3(
    shape.half[0],
    shape.half[1],
    shape.half[2],
  ));
}

// The turn a shape sits at inside the prop.
function shapeTurn(rot) {
  const turn = new CANNON.Quaternion();
  if (rot) turn.setFromEuler(rot[0], rot[1], rot[2]);
  return turn;
}

const _quat = new THREE.Quaternion();
const _offset = new THREE.Vector3();
const _euler = new THREE.Euler();
