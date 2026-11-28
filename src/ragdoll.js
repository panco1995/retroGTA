// A person who gets hit hard does not play back a canned fall any more: the
// body is handed to a physics engine and goes down for real.
//
// The actor is already built from separate joints, so every joint becomes a
// rigid body and the seams between them become constraints. The engine
// writes the result back onto the same objects, so the character keeps its
// own look, and the walking animation takes over again once the body has
// come to rest.

import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { buildGround, buildWalls, createWorld } from './physics.js';

const THIGH_LEN = 0.44;
const SHIN_LEN = 0.38;
const UPPER_LEN = 0.26;
const FORE_LEN = 0.26;

// How long a ragdoll may live before it is frozen where it lies.
const MAX_TIME = 9;
// How slow the body has to be to count as still.
const REST_SPEED = 0.4;
// How long it has to stay still before it is frozen.
const REST_TIME = 0.5;

let engine = null;
const live = new Set();

function physics() {
  if (!engine) engine = createWorld();
  return engine;
}

// The body plan for every joint: the shape it collides as, where that shape
// sits inside the joint, and how heavy it is. The order matters, a joint
// has to be written before the joints hanging off it.
function partPlan(actor) {
  const p = actor.parts;
  return [
    { name: 'hips', node: actor.hips, box: [0.2, 0.12, 0.13], at: [0, 0, 0], mass: 12 },
    { name: 'torso', node: p.torso, box: [0.21, 0.25, 0.12], at: [0, 0.26, 0], mass: 26 },
    { name: 'head', node: p.head, box: [0.11, 0.13, 0.11], at: [0, 0.16, 0], mass: 5 },
    { name: 'leftLeg', node: p.leftLeg, cyl: [0.085, THIGH_LEN], at: [0, -THIGH_LEN / 2, 0], mass: 7 },
    { name: 'leftShin', node: p.leftShin, cyl: [0.07, SHIN_LEN], at: [0, -SHIN_LEN / 2, 0], mass: 4 },
    { name: 'rightLeg', node: p.rightLeg, cyl: [0.085, THIGH_LEN], at: [0, -THIGH_LEN / 2, 0], mass: 7 },
    { name: 'rightShin', node: p.rightShin, cyl: [0.07, SHIN_LEN], at: [0, -SHIN_LEN / 2, 0], mass: 4 },
    { name: 'leftArm', node: p.leftArm, cyl: [0.055, UPPER_LEN], at: [0, -UPPER_LEN / 2, 0], mass: 3 },
    { name: 'leftFore', node: p.leftFore, cyl: [0.05, FORE_LEN], at: [0, -FORE_LEN / 2, 0], mass: 2 },
    { name: 'rightArm', node: p.rightArm, cyl: [0.055, UPPER_LEN], at: [0, -UPPER_LEN / 2, 0], mass: 3 },
    { name: 'rightFore', node: p.rightFore, cyl: [0.05, FORE_LEN], at: [0, -FORE_LEN / 2, 0], mass: 2 },
  ];
}

// The seams between the joints: which two joints meet, the axis the seam
// swings around, how far it may swing, and how far it may twist.
const SEAMS = [
  ['hips', 'torso', [0, 1, 0], 0.55, 0.5],
  ['torso', 'head', [1, 0, 0], 0.75, 0.6],
  ['hips', 'leftLeg', [1, 0, 0], 0.95, 0.3],
  ['hips', 'rightLeg', [1, 0, 0], 0.95, 0.3],
  ['leftLeg', 'leftShin', [1, 0, 0], 1.5, 0.2],
  ['rightLeg', 'rightShin', [1, 0, 0], 1.5, 0.2],
  ['torso', 'leftArm', [1, 0, 0], 1.4, 0.9],
  ['torso', 'rightArm', [1, 0, 0], 1.4, 0.9],
  ['leftArm', 'leftFore', [1, 0, 0], 1.7, 0.3],
  ['rightArm', 'rightFore', [1, 0, 0], 1.7, 0.3],
];

// Puts the body on the ground and hands it to the engine.
export function startRagdoll(actor, opts = {}) {
  releaseRagdoll(actor);
  const world = physics();
  // The actor is scaled by its height, so the bodies are too.
  const scaleY = actor.visual.scale.y || 1;
  const parts = partPlan(actor);
  const byName = new Map();
  const bodies = [];
  const statics = [];
  const constraints = [];

  for (const part of parts) {
    part.node.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    part.node.matrixWorld.decompose(pos, quat, scale);

    // The shape sits inside the joint, so the body is not at the seam.
    const at = new THREE.Vector3(part.at[0], part.at[1] * scaleY, part.at[2]);
    const shape = part.box
      ? new CANNON.Box(new CANNON.Vec3(part.box[0], part.box[1] * scaleY, part.box[2]))
      : new CANNON.Cylinder(part.cyl[0], part.cyl[0], part.cyl[1] * scaleY, 10);
    const body = new CANNON.Body({
      mass: part.mass,
      shape,
      position: new CANNON.Vec3(),
      quaternion: new CANNON.Quaternion(),
    });
    const centre = at.clone().applyQuaternion(quat);
    body.position.set(pos.x + centre.x, pos.y + centre.y, pos.z + centre.z);
    body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
    world.addBody(body);

    part.body = body;
    part.centre = at;
    byName.set(part.name, part);
    bodies.push(body);
  }

  for (const [parentName, childName, axis, cone, twist] of SEAMS) {
    const parent = byName.get(parentName);
    const child = byName.get(childName);
    // The seam is where the child hangs off the parent.
    const seam = child.node.position.clone();
    seam.y *= scaleY;
    const pivotA = seam.sub(parent.centre);
    const pivotB = child.centre.clone().negate();
    const constraint = new CANNON.ConeTwistConstraint(parent.body, child.body, {
      pivotA: new CANNON.Vec3(pivotA.x, pivotA.y, pivotA.z),
      pivotB: new CANNON.Vec3(pivotB.x, pivotB.y, pivotB.z),
      axisA: new CANNON.Vec3(axis[0], axis[1], axis[2]),
      axisB: new CANNON.Vec3(axis[0], axis[1], axis[2]),
      angle: cone,
      twistAngle: twist,
      maxForce: 1e5,
    });
    world.addConstraint(constraint);
    constraints.push(constraint);
  }

  // The ground it lands on, and the walls it lands against.
  const groundY = opts.groundY ?? 0;
  statics.push(buildGround(world, groundY));
  statics.push(...buildWalls(world, opts.colliders, opts.x ?? 0, opts.z ?? 0, groundY));

  // The hit throws the body along the ground and into the air.
  const vx = opts.vx ?? 0;
  const vy = opts.vy ?? 0;
  const vz = opts.vz ?? 0;
  // The body spins about the axis across the direction it is travelling, so
  // it tumbles the way it was hit instead of flailing.
  const speed = Math.hypot(vx, vz);
  const spin = Math.min(6, speed * 0.8);
  const spinX = speed > 0.01 ? (-vz / speed) * spin : 0;
  const spinZ = speed > 0.01 ? (vx / speed) * spin : 0;
  for (const body of bodies) {
    body.velocity.set(vx, vy, vz);
    body.angularVelocity.set(spinX, (Math.random() - 0.5) * 0.8, spinZ);
    body.wakeUp();
  }

  const handle = {
    actor,
    parts,
    bodies,
    statics,
    constraints,
    time: 0,
    calm: 0,
    x: opts.x ?? 0,
    z: opts.z ?? 0,
  };
  // The animation must leave the body alone while the engine has it.
  actor.pose = 'down';
  actor.ragdoll = handle;
  live.add(handle);
  return handle;
}

// The physics moves every ragdoll at once, then writes the result back onto
// the actors.
export function stepRagdolls(dt) {
  if (live.size === 0) return;
  physics().step(1 / 60, dt, 4);
  for (const handle of [...live]) {
    handle.time += dt;
    writeBack(handle);
    if (handle.time > MAX_TIME) {
      freeze(handle);
      continue;
    }
    if (atRest(handle)) {
      handle.calm += dt;
      if (handle.calm > REST_TIME) freeze(handle);
    } else {
      handle.calm = 0;
    }
  }
}

// The engine's positions are turned back into the local transforms the
// actor's joints use.
function writeBack(handle) {
  const hips = handle.parts[0];
  for (const part of handle.parts) {
    const body = part.body;
    const quat = _quat.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
    // The body sits at the middle of the shape, the joint is at its edge.
    _offset.copy(part.centre).applyQuaternion(quat);
    _world.set(
      body.position.x - _offset.x,
      body.position.y - _offset.y,
      body.position.z - _offset.z,
    );
    const node = part.node;
    const parent = node.parent;
    parent.updateWorldMatrix(true, false);
    _matrix.copy(parent.matrixWorld).invert();
    node.position.copy(_world).applyMatrix4(_matrix);
    parent.getWorldQuaternion(_parentQuat).invert();
    node.quaternion.copy(_parentQuat).multiply(quat);
    node.updateWorldMatrix(false, true);
    if (part === hips) {
      handle.x = _world.x;
      handle.z = _world.z;
    }
  }
}

function atRest(handle) {
  for (const body of handle.bodies) {
    if (body.sleepState === CANNON.Body.SLEEPING) continue;
    if (body.velocity.lengthSquared() > REST_SPEED * REST_SPEED) return false;
    if (body.angularVelocity.lengthSquared() > 2) return false;
  }
  return true;
}

// The body has come to rest. Take it out of the engine and keep the pose it
// landed in, so the character can get up from there.
function freeze(handle) {
  const world = physics();
  for (const body of handle.bodies) world.removeBody(body);
  for (const wall of handle.statics) world.removeBody(wall);
  for (const constraint of handle.constraints) world.removeConstraint(constraint);
  live.delete(handle);
  const actor = handle.actor;
  if (actor.ragdoll === handle) actor.ragdoll = null;
  actor.getupFrom = capturePose(actor);
}

// Stops a ragdoll early, for an actor that is about to be reused.
export function releaseRagdoll(actor) {
  const handle = actor?.ragdoll;
  if (!handle) return;
  freeze(handle);
}

export function ragdollOf(actor) {
  return actor?.ragdoll ?? null;
}

// The pose the body landed in, so the character can get up from it.
function capturePose(actor) {
  const p = actor.parts;
  const rot = (node) => [node.rotation.x, node.rotation.y, node.rotation.z];
  return {
    visual: [actor.visual.rotation.x, actor.visual.position.y],
    hipsY: actor.hips.position.y,
    hips: rot(actor.hips),
    leftLeg: rot(p.leftLeg),
    rightLeg: rot(p.rightLeg),
    leftShin: rot(p.leftShin),
    rightShin: rot(p.rightShin),
    leftArm: rot(p.leftArm),
    rightArm: rot(p.rightArm),
    leftFore: rot(p.leftFore),
    rightFore: rot(p.rightFore),
    torso: rot(p.torso),
  };
}

const _quat = new THREE.Quaternion();
const _parentQuat = new THREE.Quaternion();
const _offset = new THREE.Vector3();
const _world = new THREE.Vector3();
const _matrix = new THREE.Matrix4();
