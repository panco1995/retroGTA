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
import { GROUP, buildWalls, inGroup, physicsWorld } from './physics.js';

// How long a prop may be in the air before it is stopped where it lies. It is
// only stopped once it is back on the ground: a prop frozen in mid air would
// hang there, and a car would then hit a wall that was not there a frame ago.
const MAX_TIME = 6;
// The length of rope after that. A prop that never comes down - wedged, or on
// the end of a bumper that does not let it go - is still stopped eventually,
// so that nothing is left in the engine for ever.
const MAX_HANG = 3;
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
// opened survives into the next frame. It has to be enough for the prop to
// stay clear through the whole time the car is behind it, and the car closes
// that gap faster now that everything falls at one gravity: a prop thrown at
// speed comes down sooner than it used to, so the car catches it again with
// less of a gap to spare.
const SHOVE_LEAD = 1.16;
// How upright a prop has to be for its own footprint to be the right one.
// Past this it has tipped, and only a box around it tells the truth.
const UPRIGHT = 0.92;
// How tall the car that threw a prop is, for the body it leaves in the
// engine. The prop has to land on the bonnet, not sink through it.
const CAR_HEIGHT = 1.5;
// How fast a post goes over, in radians per second. A four and a half metre
// post takes about a second and a bit to come down, which is what a real one
// does, and it is slow enough to read as a fall rather than a flick.
const TO_TOPPLE_RATE = 1.55;

export function createPropPhysics({ colliders, ground, onLand = null }) {
  const world = physicsWorld();
  // Every prop that can be knocked out of the way.
  const all = new Set();
  // The ones that are on the move right now.
  const flying = new Set();
  // The posts that are on their way over, which are turning about a foot and
  // are not in the engine at all.
  const toppling = new Set();

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
    entry.down = false;
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
    const spec = entry.spec;
    // A prop with no body is part of the scenery: a tree is older than the
    // street and does not come down.
    if (!spec) return null;
    if (entry.topplingAnim) return null;
    // A post can only go over once. A second car that runs into one that is
    // already down is stopped by it rather than standing it up and felling it
    // again, which would turn it through the pavement.
    if (entry.down) return null;
    if (entry.flying) return shove(entry, vx, vz, mover, dt);
    const speed = Math.hypot(vx, vz);
    if (speed < 0.5) return null;
    // A post bolted at the foot does not fly: it goes over about its base.
    if (spec.topple) return topple(entry, vx, vz);
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

    // The prop starts turned the way it is standing now, which is not the way
    // it was built once it has been thrown and landed on its side: a skip hit
    // a second time must not snap back upright before it flies.
    const group = entry.group;
    const turn = new CANNON.Quaternion(
      group.quaternion.x,
      group.quaternion.y,
      group.quaternion.z,
      group.quaternion.w,
    );
    const at = new CANNON.Vec3(spec.at[0], spec.at[1], spec.at[2]);
    const centre = turn.vmult(at);
    body.position.set(
      group.position.x + centre.x,
      group.position.y + centre.y,
      group.position.z + centre.z,
    );
    body.quaternion.copy(turn);
    // A prop only meets other props, and the ground and walls built for one.
    // It is not stopped by the walls put up around somebody falling over.
    inGroup(body, GROUP.prop, GROUP.prop | GROUP.propWorld | GROUP.all);
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
    // so it rolls the way it was hit instead of flailing. A post is bolted at
    // the foot: it turns over slowly rather than spinning away.
    //
    // The twist about the vertical is taken from the prop's own place on the
    // map rather than from `Math.random`, so a given hit comes out the same
    // way every time: a replay, a check, or the same crash happening twice
    // should not look different each time. It is still varied from prop to
    // prop, and from spot to spot, so a row of bins does not tumble in unison.
    const spin = Math.min(spec.maxSpin ?? 9, speed * (spec.spin ?? 0.7));
    const twist = twistAt(entry.group.position.x, entry.group.position.z);
    body.angularVelocity.set(
      -dirZ * spin,
      twist * (spec.twist ?? 0.8),
      dirX * spin,
    );
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
      GROUP.propWorld,
      GROUP.prop | GROUP.all,
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

  // A prop that is bolted down does not fly: it leans over and falls. The
  // fall is played out as a turn about the foot, because a four and a half
  // metre post handed to the engine as a free body pole vaults over the car
  // that hit it and comes down somewhere else entirely.
  //
  // The foot is left where it is, the post turns until it lies flat, and then
  // it is handed to the rest of the machinery as if it had landed: the
  // footprint is the box around the fallen post, so the road it now covers is
  // the road that is blocked.
  function topple(entry, vx, vz) {
    if (entry.topplingAnim) return null;
    const speed = Math.hypot(vx, vz);
    const spec = entry.spec;
    const dirX = vx / speed;
    const dirZ = vz / speed;
    const group = entry.group;
    // The post falls away from the car that hit it. A post that fell the other
    // way would come down across the bonnet of the car stopped against it,
    // which is a pole through the windscreen rather than a broken street lamp.
    entry.topplingAnim = {
      // The axis it turns about, lying on the ground across the push.
      axisX: dirZ,
      axisZ: -dirX,
      angle: 0,
      // How fast it goes over. A post is long and it takes its time.
      rate: TO_TOPPLE_RATE * (0.7 + Math.min(1, speed / 12) * 0.6),
      pivotX: group.position.x,
      pivotY: group.position.y,
      pivotZ: group.position.z,
      // The way the post was facing, so its arm keeps its bearing as it falls.
      heading: group.rotation.y,
    };
    // The post stays in the index while it goes over, still at its foot. The
    // car that hit it has to be stopped by it: the post is bolted down, and a
    // car that carried on would drive under the falling pole and be clipped by
    // it. Once the post is down, its footprint becomes the stretch of road it
    // covers.
    entry.flying = true;
    toppling.add(entry);
    return null;
  }

  // Turns the post a little further over. Returns true while it is still going.
  function stepTopple(entry, dt) {
    const t = entry.topplingAnim;
    t.angle = Math.min(Math.PI / 2, t.angle + t.rate * dt);
    const group = entry.group;
    // The post turns about its foot, and the group sits at the foot, so the
    // whole of it is a turn in world space. The post's own heading is kept, so
    // the arm over the road keeps the bearing it was built with and ends up
    // lying where the lamp was.
    _axis.set(t.axisX, 0, t.axisZ).normalize();
    _toppleQuat.setFromAxisAngle(_axis, t.angle);
    _yawQuat.setFromAxisAngle(_up, t.heading);
    group.quaternion.copy(_toppleQuat).multiply(_yawQuat);
    group.position.set(t.pivotX, t.pivotY, t.pivotZ);
    group.updateMatrixWorld(true);
    if (t.angle < Math.PI / 2) return true;
    // It is down. The collider becomes the box around it, at the stretch of
    // road it now covers, and goes back into the grid.
    syncFootprintAsBox(entry);
    colliders.restore(entry.collider);
    entry.topplingAnim = null;
    entry.flying = false;
    // It stays down: a post does not get up again.
    entry.down = true;
    if (onLand) onLand(entry);
    return false;
  }

  // A prop that has been thrown and is already on its way back out of the
  // engine: it is put back in front of the bumper and sent along, and it
  // stays on the moving list until it rests.
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

  // The footprint of a prop that is lying where it fell: the box around the
  // mesh on screen. A post on the ground covers four and a half metres of the
  // pavement, and a car has to be stopped by all of it.
  function syncFootprintAsBox(entry) {
    const meshBox = _box.setFromObject(entry.group);
    const c = entry.collider;
    delete c.circle;
    delete c.obb;
    c.minX = meshBox.min.x;
    c.maxX = meshBox.max.x;
    c.minZ = meshBox.min.z;
    c.maxZ = meshBox.max.z;
    c.x = (c.minX + c.maxX) / 2;
    c.z = (c.minZ + c.maxZ) / 2;
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
    const up = _worldUp.set(0, 1, 0).applyQuaternion(
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
    // A post that is going over is turned a little more each frame. It is not
    // in the engine at all: it is a turn about its own foot.
    for (const entry of toppling) {
      if (!stepTopple(entry, dt)) toppling.delete(entry);
    }
    if (flying.size === 0) return;
    // The cars in the engine are moved to wherever the game put them, so the
    // engine's answer is about the car as it is on screen now. The world itself
    // is stepped by the game, once a frame, because it is shared with the
    // bodies that have been knocked down.
    if (cars) {
      for (const entry of flying) {
        if (!entry.car) continue;
        const mover = cars(entry);
        if (mover) moveCar(entry, mover);
      }
    }
    for (const entry of [...flying]) {
      entry.time += dt;
      const touching = land(entry, dt);
      writeBack(entry);
      // The footprint follows the body, so a prop that has tipped over is
      // blocked out where it lies rather than where it stood upright.
      syncFootprint(entry);
      // A prop is stopped where it lies once it is on the ground again, so
      // that nothing is frozen in mid air. The hard limit is only there for a
      // prop that never comes down at all.
      if ((entry.time > MAX_TIME && touching) || entry.time > MAX_TIME + MAX_HANG) {
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
    // Whoever is listening gets the prop where it lies, so a fallen post can
    // start sparking and a knocked prop can make whatever noise it makes.
    if (onLand) onLand(entry);
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
    // A post that is halfway over is stood back up with the rest.
    for (const entry of [...toppling]) {
      entry.topplingAnim = null;
      entry.flying = false;
      toppling.delete(entry);
    }
    for (const entry of all) {
      entry.down = false;
      const group = entry.group;
      group.position.set(entry.start.x, entry.start.y, entry.start.z);
      group.rotation.set(0, entry.start.heading, 0);
      group.updateMatrixWorld(true);
      const c = entry.collider;
      delete c.minX;
      delete c.maxX;
      delete c.minZ;
      delete c.maxZ;
      delete c.circle;
      delete c.obb;
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

// A number between -0.5 and 0.5 that depends only on where the prop is. The
// same prop hit from the same place tumbles the same way every time, but two
// props side by side do not tumble alike.
function twistAt(x, z) {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return (n - Math.floor(n)) - 0.5;
}

const _quat = new THREE.Quaternion();
const _offset = new THREE.Vector3();
const _euler = new THREE.Euler();
// The world up, never written to: it is an axis to turn about, not a scratch
// vector.
const _up = new THREE.Vector3(0, 1, 0);
const _worldUp = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _toppleQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _box = new THREE.Box3();
