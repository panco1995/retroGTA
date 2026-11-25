import * as THREE from 'three';
import { solid } from './materials.js';
import { WALK_TOP } from './config.js';

function hang(w, h, d, mat) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.y = -h / 2;
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}

function rise(w, h, d, mat) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}

export function createActor(opts = {}) {
  const shirt = solid(opts.shirt ?? 0x1a1c22, 0.84);
  const pants = solid(opts.pants ?? 0x2a3648, 0.9);
  const skin = solid(opts.skin ?? 0xc89674, 0.72);
  const hairMat = solid(opts.hair ?? 0x1b140f, 0.8);

  const visual = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  visual.add(hips);

  const leftLeg = hang(0.18, 0.9, 0.2, pants);
  leftLeg.position.set(-0.1, 0, 0);
  const rightLeg = hang(0.18, 0.9, 0.2, pants);
  rightLeg.position.set(0.1, 0, 0);
  hips.add(leftLeg, rightLeg);

  const torso = rise(0.44, 0.52, 0.24, shirt);
  hips.add(torso);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.56;
  hips.add(headPivot);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), skin);
  head.position.y = 0.13;
  head.castShadow = true;
  headPivot.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.26), hairMat);
  hair.position.set(0, 0.26, -0.01);
  hair.castShadow = true;
  headPivot.add(hair);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.02), solid(0x1a120e));
  const eyeL = eye.clone();
  const eyeR = eye.clone();
  eyeL.position.set(-0.06, 0.14, 0.12);
  eyeR.position.set(0.06, 0.14, 0.12);
  headPivot.add(eyeL, eyeR);

  const armLen = 0.52;
  const leftArm = hang(0.12, armLen, 0.14, shirt);
  leftArm.position.set(-0.29, 0.46, 0);
  const rightArm = hang(0.12, armLen, 0.14, shirt);
  rightArm.position.set(0.29, 0.46, 0);
  const handGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const leftHand = new THREE.Mesh(handGeo, skin);
  leftHand.position.y = -armLen - 0.02;
  const rightHand = new THREE.Mesh(handGeo, skin);
  rightHand.position.y = -armLen - 0.02;
  leftArm.add(leftHand);
  rightArm.add(rightHand);
  hips.add(leftArm, rightArm);

  if (opts.cap) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.28), solid(opts.cap));
    cap.position.y = 0.32;
    headPivot.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.12), solid(opts.cap));
    brim.position.set(0, 0.28, 0.16);
    headPivot.add(brim);
  }

  const group = new THREE.Group();
  group.position.y = WALK_TOP;
  group.add(visual);

  return {
    group,
    visual,
    hips,
    parts: { leftLeg, rightLeg, leftArm, rightArm, torso },
    pose: 'stand',
    heading: opts.heading ?? Math.PI,
    x: opts.x ?? 0,
    z: opts.z ?? 0,
    radius: 0.38,
  };
}

export function setPose(actor, pose) {
  actor.pose = pose;
  const p = actor.parts;
  if (pose === 'sit') {
    actor.hips.position.y = 0.56;
    p.leftLeg.rotation.set(-1.35, 0, 0.06);
    p.rightLeg.rotation.set(-1.35, 0, -0.06);
    p.leftArm.rotation.set(-0.5, 0, 0.18);
    p.rightArm.rotation.set(-0.25, 0, -0.18);
    p.torso.rotation.set(0.08, 0, 0);
    actor.visual.position.y = 0;
  } else {
    actor.hips.position.y = 0.9;
    p.leftLeg.rotation.set(0, 0, 0);
    p.rightLeg.rotation.set(0, 0, 0);
    p.leftArm.rotation.set(0, 0, 0);
    p.rightArm.rotation.set(0, 0, 0);
    p.torso.rotation.set(0, 0, 0);
  }
}

function damp(current, target, dt) {
  const k = 1 - Math.pow(0.0015, dt);
  return current + (target - current) * k;
}

export function animateActor(actor, speed, time, dt) {
  if (actor.pose === 'sit') return;
  const p = actor.parts;
  const amp = THREE.MathUtils.clamp(speed / 3.2, 0, 1);
  const phase = time * (speed > 4.5 ? 11 : 8);
  const swing = Math.sin(phase) * amp * 0.85;
  p.leftLeg.rotation.x = damp(p.leftLeg.rotation.x, swing, dt);
  p.rightLeg.rotation.x = damp(p.rightLeg.rotation.x, -swing, dt);
  p.leftArm.rotation.x = damp(p.leftArm.rotation.x, -swing * 0.7, dt);
  p.rightArm.rotation.x = damp(p.rightArm.rotation.x, swing * 0.7, dt);
  p.torso.rotation.x = damp(p.torso.rotation.x, Math.sin(time * 2.2) * 0.02 + amp * 0.06, dt);
  actor.visual.position.y = Math.abs(Math.sin(phase)) * 0.045 * amp;
}
