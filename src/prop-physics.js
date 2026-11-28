// Street furniture that a car runs into does not stay where it was.
//
// The rubbish bags, the hydrant and the dumpster are handed to a physics
// engine and get thrown out of the way. A bag flies, a dumpster only shifts,
// and the car loses a little speed for the trouble.
//
// The collider has to travel with the prop, and it has to be the shape the
// prop actually has. The spatial index remembers where a collider was put,
// not where it is now, so a prop that is on the move sits on the index's list
// of moving colliders, which is tested wherever the prop happens to be. Its
// footprint is the box around the body: a skip that has landed on its side
// reaches a metre down the road, and an upright box turned by its yaw alone
// would let a car sink into it.
//
// A prop that is on the move is still in the way. A car that catches up with
// one does not drive through it: the car shoves it, and the prop is put back
// out of the bumper. Without that the throw would only carry while the prop
// is faster than the car, which a skip never is.

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
// How quickly the ground takes the slide off a prop, per second. The scrape
// has to be per second rather than per frame, or a prop stops dead on the
// frame it lands and the car that threw it drives through it.
const SCRAPE = 2.2;
// How far a prop may be moved in one frame to get it out of a car. A prop is
// only ever pulled out by the little its own tumbling added to its footprint,
// so this is a guard against a jump, not part of the maths.
const MAX_SHIFT = 0.9;
// How much faster than the car a shoved prop is sent, so the gap the shove
// opened survives into the next frame.
const SHOVE_LEAD = 1.06;
// How upright a prop has to be for its own footprint to be the right one.
// Past this it has tipped, and only a box around it tells the truth.
const UPRIGHT = 0.92;
// How tall the car that threw a prop is, for the body it leaves in the
// engine. The prop has to land on the bonnet, not sink through it.
const CAR_HEIGHT = 1.5;

export function createPropPhysics({ colliders, ground }) {
  const world = createWorld();
  // Every prop that can be knocked out of the way.
  const all = new Set();
  // The ones that are on the move right now.
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
    // The footprint the prop was built with, so that a prop which comes to
    // rest on its feet gets it back and goes on blocking the pavement the way
    // it always did.
    const c = entry.collider;
    entry.authored = c.circle
      ? { circle: true, radius: c.radius }
      : { obb: true, halfL: c.halfL, halfW: c.halfW };
    // The collider carries the prop with it, so that whoever runs into the
    // prop can tell which prop it was.
    c.prop = entry;
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

  // A car has run into the prop. The first time it is thrown: it takes off
  // with the car's speed, less the weight of the prop, and off to one side so
  // that it leaves the lane the car is driving down. Every time after that the
  // car has caught up with a prop that is still on the move, and the prop is
  // shouldered along in front of the bumper instead of being driven through.
  //
  // `mover` is the car, as a rectangle on the ground, and `dt` is the frame
  // that is being stepped. Returns the share of the car's speed that is left,
  // or null when the car has to stop against the prop instead.
  function knock(entry, vx, vz, mover = null, dt = 0) {
    if (!entry) return null;
    if (entry.flying) return shove(entry, vx, vz, mover, dt);
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

    // The car is already into the prop: it hit between two frames, and at
    // speed that is most of a metre. The prop is put out of the bumper before
    // it flies, so that the throw does not start from inside the car.
    const out = mover ? clearOf(entry.collider, mover, speed * dt) : null;
    if (out) {
      const len = Math.hypot(out.dx, out.dz);
      const take = len > MAX_SHIFT ? MAX_SHIFT / len : 1;
      body.position.x += out.dx * take;
      body.position.z += out.dz * take;
    }

    // It takes off with the car, less the weight of the prop, and away from
    // the middle of the car, so that it does not stay in the lane to be
    // caught again by the car that threw it.
    const launch = speed * spec.launch;
    const aside = sideOf(entry.collider, mover) * speed * (spec.side ?? 0.3);
    // Right of the direction of travel is (dirZ, -dirX).
    body.velocity.set(
      dirX * launch + dirZ * aside,
      speed * spec.lift,
      dirZ * launch - dirX * aside,
    );
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
    // The car that threw it goes into the engine as well, so that a prop that
    // tumbles back towards the bonnet lands on it instead of turning through
    // it. It is only there while the prop is moving, and it is carried along
    // with the car by whoever steps the props.
    entry.mover = mover ? (mover.vehicle ?? mover) : null;
    entry.car = mover ? carBody(world, mover) : null;
    flying.add(entry);
    // The prop stays in the index while it flies, on the always-tested list,
    // with the box around its body as its footprint.
    syncFootprint(entry);
    colliders.restore(entry.collider, true);
    return 1 - spec.drag;
  }

  // A car has caught up with a prop that is already on the move. The prop is
  // put back out of the car and sent on at the car's speed, so the car never
  // ends up inside it.
  function shove(entry, vx, vz, mover, dt) {
    const speed = Math.hypot(vx, vz);
    if (!mover || speed < 0.35) return null;
    const out = clearOf(entry.collider, mover, speed * dt);
    // The car is past it: there is nothing left to shove.
    if (!out) return 1;
    const body = entry.body;
    const len = Math.hypot(out.dx, out.dz);
    if (len > 1e-4) {
      const take = len > MAX_SHIFT ? MAX_SHIFT / len : 1;
      body.position.x += out.dx * take;
      body.position.z += out.dz * take;
    }
    // It is carried along with the car, and thrown off to its own side of the
    // lane. A bag skitters out of the way in a fraction of a second; a skip
    // only creeps aside, so the car ends up shouldering it down the road.
    const aside = sideOf(entry.collider, mover) * speed * (entry.spec.side ?? 0.3);
    // Right of the direction of travel is (vz, -vx) over the speed.
    body.velocity.x = vx * SHOVE_LEAD + (vz / speed) * aside;
    body.velocity.z = vz * SHOVE_LEAD - (vx / speed) * aside;
    if (body.velocity.y < 0) body.velocity.y = 0;
    body.wakeUp();
    // The car in the engine is put where the car really is.
    moveCar(entry, mover);
    writeBack(entry);
    syncFootprint(entry);
    // A prop on the end of a bumper is being driven, not lying still, so the
    // clock that would stop it where it is has to start again.
    entry.calm = 0;
    // Shouldering something heavy is not free. The cost is per second, so the
    // car brakes by the same amount whatever the frame rate.
    return Math.exp(-(entry.spec.push ?? 1) * dt);
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

  // The footprint of a prop that is off its feet, or still in the air: the box
  // around the body it actually has. A skip lands on its side and reaches a
  // metre down the road, which its own upright box does not say.
  function syncFootprint(entry) {
    const body = entry.body;
    body.updateAABB();
    const aabb = body.aabb;
    const c = entry.collider;
    delete c.circle;
    delete c.obb;
    c.minX = aabb.lowerBound.x;
    c.maxX = aabb.upperBound.x;
    c.minZ = aabb.lowerBound.z;
    c.maxZ = aabb.upperBound.z;
    // The middle of that box is where the prop is, which is not the foot it
    // was built on once it has tipped over.
    c.x = (c.minX + c.maxX) / 2;
    c.z = (c.minZ + c.maxZ) / 2;
  }

  // The footprint a prop has come to rest with. One that is back on its feet
  // gets the footprint it was built with, which follows its yaw exactly; one
  // that landed on its side keeps the box around it.
  function settleFootprint(entry) {
    const body = entry.body;
    syncFootprint(entry);
    const up = _up.set(0, 1, 0).applyQuaternion(
      _quat.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w),
    );
    if (up.y < UPRIGHT) return;
    const c = entry.collider;
    const authored = entry.authored;
    const group = entry.group;
    delete c.minX;
    delete c.maxX;
    delete c.minZ;
    delete c.maxZ;
    c.x = group.position.x;
    c.z = group.position.z;
    if (authored.circle) {
      c.circle = true;
      c.radius = authored.radius;
      return;
    }
    _euler.setFromQuaternion(_quat, 'YXZ');
    c.obb = true;
    c.halfL = authored.halfL;
    c.halfW = authored.halfW;
    c.heading = _euler.y;
  }

  // The prop has reached the ground. It is pushed up out of it and the fall is
  // taken off it, so it slides and rolls along instead of sinking into the
  // street. Returns whether it is on the ground.
  function land(entry, dt) {
    const body = entry.body;
    const floor = floorAt(body.position.x, body.position.z);
    body.updateAABB();
    // The lowest point of the shape is the bottom of its box, so a prop that
    // has tipped over rests on the edge it tipped onto.
    const lowest = body.aabb.lowerBound.y;
    if (lowest < floor) {
      body.position.y += floor - lowest;
      if (body.velocity.y < 0) body.velocity.y = 0;
      // The ground takes the slide off over time. It has to be the same at
      // every frame rate, or a prop stops dead on the frame it lands.
      const scrape = Math.exp(-SCRAPE * dt);
      body.velocity.x *= scrape;
      body.velocity.z *= scrape;
      body.angularVelocity.scale(scrape, body.angularVelocity);
    }
    // A prop that lies still just above the ground is on it as well. It has to
    // count, otherwise a prop that has come to rest is never stopped, and its
    // collider never goes back into the grid.
    return lowest <= floor + 0.05;
  }

  function step(dt, cars = null) {
    if (flying.size === 0) return;
    // The cars in the engine are moved to wherever the game put them, so the
    // engine's answer is about the car as it is on screen now.
    if (cars) {
      for (const entry of flying) {
        if (!entry.car) continue;
        const mover = cars(entry);
        if (mover) moveCar(entry, mover);
      }
    }
    world.step(1 / 60, dt, 4);
    for (const entry of [...flying]) {
      entry.time += dt;
      const touching = land(entry, dt);
      writeBack(entry);
      // The footprint follows the body, so a prop that has tipped over is
      // blocked out where it lies rather than where it stood upright.
      syncFootprint(entry);
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
  // pose it landed in, and its collider goes back into the grid at the place
  // it came to rest at.
  function rest(entry) {
    settleFootprint(entry);
    world.removeBody(entry.body);
    if (entry.car) world.removeBody(entry.car);
    for (const wall of entry.walls) world.removeBody(wall);
    flying.delete(entry);
    entry.flying = false;
    entry.body = null;
    entry.car = null;
    entry.mover = null;
    entry.walls = null;
    colliders.restore(entry.collider);
  }

  // Everything goes back where it was.
  function reset() {
    for (const entry of [...flying]) {
      world.removeBody(entry.body);
      if (entry.car) world.removeBody(entry.car);
      for (const wall of entry.walls) world.removeBody(wall);
      flying.delete(entry);
      entry.flying = false;
      entry.body = null;
      entry.car = null;
      entry.mover = null;
      entry.walls = null;
    }
    for (const entry of all) {
      const group = entry.group;
      group.position.set(entry.start.x, entry.start.y, entry.start.z);
      group.rotation.set(0, entry.start.heading, 0);
      group.updateMatrixWorld(true);
      const c = entry.collider;
      delete c.minX;
      delete c.maxX;
      delete c.minZ;
      delete c.maxZ;
      const authored = entry.authored;
      if (authored.circle) {
        c.circle = true;
        c.radius = authored.radius;
      } else {
        c.obb = true;
        c.halfL = authored.halfL;
        c.halfW = authored.halfW;
        c.heading = entry.start.heading;
      }
      c.x = entry.start.x;
      c.z = entry.start.z;
      colliders.restore(c);
    }
  }

  return { register, knock, step, reset };
}

// Which side of the car the prop is on: -1 for its left, 1 for its right. A
// prop hit dead centre is thrown to the right, so that it still leaves the
// lane instead of being driven along in front of the car.
function sideOf(collider, mover) {
  if (!mover) return 1;
  const rx = Math.cos(mover.heading);
  const rz = -Math.sin(mover.heading);
  const side = (collider.x - mover.x) * rx + (collider.z - mover.z) * rz;
  return side < -0.05 ? -1 : 1;
}

// How far a prop has to move to be out of a car's rectangle, in the car's own
// frame: a prop in front of it is shouldered down the road, the way a car
// pushes a skip it cannot throw; one that ended up beside or behind the middle
// of the car is put out the nearer side. `lead` is how far the car will travel
// before it is asked again, so the prop is put that much further out. Null
// when the prop is not touching the car at all.
function clearOf(collider, mover, lead = 0) {
  const halfL = mover.length / 2 + Math.abs(lead);
  const halfW = mover.width / 2;
  const fx = Math.sin(mover.heading);
  const fz = Math.cos(mover.heading);
  const rx = Math.cos(mover.heading);
  const rz = -Math.sin(mover.heading);

  // The prop's own frame: circles are round, boxes are their corners, and the
  // plain boxes a falling prop carries are already axis aligned.
  let minF = Infinity;
  let maxF = -Infinity;
  let minS = Infinity;
  let maxS = -Infinity;
  const reach = (x, z) => {
    const relX = x - mover.x;
    const relZ = z - mover.z;
    const f = relX * fx + relZ * fz;
    const s = relX * rx + relZ * rz;
    if (f < minF) minF = f;
    if (f > maxF) maxF = f;
    if (s < minS) minS = s;
    if (s > maxS) maxS = s;
  };
  if (collider.circle) {
    const at = [-1, -1, 1, 1];
    for (let i = 0; i < 4; i += 1) {
      reach(collider.x + at[i] * collider.radius, collider.z + at[3 - i] * collider.radius);
    }
  } else if (collider.obb) {
    const pf = Math.sin(collider.heading);
    const pz = Math.cos(collider.heading);
    const pr = Math.cos(collider.heading);
    const ps = -Math.sin(collider.heading);
    for (const [lf, lw] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      reach(
        collider.x + pf * collider.halfL * lf + pr * collider.halfW * lw,
        collider.z + pz * collider.halfL * lf + ps * collider.halfW * lw,
      );
    }
  } else {
    reach(collider.minX, collider.minZ);
    reach(collider.maxX, collider.minZ);
    reach(collider.minX, collider.maxZ);
    reach(collider.maxX, collider.maxZ);
  }

  // Clear of the car on one of its own axes, so there is nothing to shove.
  if (maxF <= -halfL || minF >= halfL || maxS <= -halfW || minS >= halfW) return null;
  // The little push that separates the two along one axis is one number per
  // axis: how far the prop has to move forwards or backwards to be clear, and
  // the same sideways. The shortest is the way out through the nearest face.
  const exitF = minF < 0 ? -(halfL + maxF) : halfL - minF;
  const exitS = minS < 0 ? -(halfW + maxS) : halfW - minS;
  // Beside or behind the middle of the car, a prop is pushed out the nearer
  // side, the way a car nudges a skip it has bumped. In front of it, it is
  // shouldered down the road instead: that is the shove a car can keep up.
  if (minF < 0 && Math.abs(exitS) < Math.abs(exitF)) {
    return { dx: rx * exitS, dz: rz * exitS };
  }
  return { dx: fx * exitF, dz: fz * exitF };
}

// Where the car in the engine has to be to match the car on screen. The body
// is carried rather than driven: the game decides where the car is, and the
// engine only uses it to push the prop out of the way.
function moveCar(entry, mover) {
  const car = entry.car;
  if (!car) return;
  car.position.set(mover.x, (mover.y ?? 0) + CAR_HEIGHT / 2, mover.z);
  car.quaternion.setFromEuler(0, mover.heading, 0);
  car.aabbNeedsUpdate = true;
}

// The car that threw a prop, as a body the engine knows about. It is carried
// rather than driven: the game already decided where the car is, so the body
// is moved to match every frame and the engine pushes the prop out of it. The
// prop then lands on the bonnet or slides off its side instead of turning back
// through the car, which is what a prop that only knows about walls does.
function carBody(world, mover) {
  const shape = new CANNON.Box(new CANNON.Vec3(
    mover.width / 2,
    CAR_HEIGHT / 2,
    mover.length / 2,
  ));
  const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, shape });
  body.collisionResponse = true;
  body.allowSleep = false;
  body.position.set(mover.x, (mover.y ?? 0) + CAR_HEIGHT / 2, mover.z);
  body.quaternion.setFromEuler(0, mover.heading, 0);
  world.addBody(body);
  return body;
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
const _up = new THREE.Vector3();
