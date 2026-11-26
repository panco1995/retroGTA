import * as THREE from 'three';
import { solid } from './materials.js';
import { WALK_TOP } from './config.js';

const BUILDS = {
  slim: { width: 0.92, depth: 0.94, limb: 0.96 },
  normal: { width: 1, depth: 1, limb: 1 },
  heavy: { width: 1.16, depth: 1.12, limb: 1.08 },
};

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

function part(w, h, d, mat, x, y, z, parent, cast = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  parent.add(mesh);
  return mesh;
}

function cylinder(top, bottom, h, sides, mat, x, y, z, parent) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, h, sides), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addHat(head, hat) {
  const mat = solid(hat.color, 0.72);
  switch (hat.type) {
    case 'beanie':
      part(0.28, 0.15, 0.29, mat, 0, 0.33, 0, head);
      part(0.29, 0.05, 0.3, mat, 0, 0.27, 0, head);
      break;
    case 'hardhat':
      cylinder(0.16, 0.19, 0.1, 8, mat, 0, 0.33, 0, head);
      cylinder(0.24, 0.24, 0.03, 10, mat, 0, 0.285, 0.01, head);
      break;
    case 'sunhat':
      cylinder(0.34, 0.34, 0.03, 12, mat, 0, 0.3, 0, head);
      cylinder(0.15, 0.17, 0.13, 10, mat, 0, 0.375, 0, head);
      break;
    case 'policecap':
      part(0.29, 0.09, 0.29, mat, 0, 0.32, 0, head);
      part(0.2, 0.025, 0.12, mat, 0, 0.275, 0.18, head);
      break;
    default:
      part(0.28, 0.08, 0.28, mat, 0, 0.32, 0, head);
      part(0.16, 0.03, 0.12, mat, 0, 0.28, 0.16, head);
  }
}

function addGlasses(head, color) {
  const mat = solid(color ?? 0x14161a, 0.35, 0.1);
  part(0.075, 0.05, 0.02, mat, -0.06, 0.16, 0.135, head);
  part(0.075, 0.05, 0.02, mat, 0.06, 0.16, 0.135, head);
  part(0.05, 0.015, 0.02, mat, 0, 0.16, 0.135, head);
}

function addHeadphones(head, color) {
  const mat = solid(color ?? 0x1c1e24, 0.5);
  part(0.3, 0.035, 0.06, mat, 0, 0.36, 0, head);
  part(0.05, 0.11, 0.11, mat, -0.145, 0.16, 0, head);
  part(0.05, 0.11, 0.11, mat, 0.145, 0.16, 0, head);
}

export function createActor(opts = {}) {
  const build = BUILDS[opts.build] ?? BUILDS.normal;
  const wf = build.width;
  const df = build.depth;

  const shirtColor = opts.shirt ?? 0x1a1c22;
  const pantsColor = opts.pants ?? 0x2a3648;
  const skinColor = opts.skin ?? 0xc89674;
  const shirt = solid(shirtColor, 0.84);
  const pants = solid(pantsColor, 0.9);
  const legsMat = solid(opts.legs ?? pantsColor, 0.9);
  const skin = solid(skinColor, 0.72);
  const hairMat = solid(opts.hair ?? 0x1b140f, 0.8);
  const armMat = opts.sleeveless ? skin : shirt;
  const shoesMat = opts.shoes == null ? null : solid(opts.shoes, 0.62);

  const visual = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  visual.add(hips);

  const legW = 0.18 * build.limb;
  const legD = 0.2 * build.limb;

  const leftLeg = hang(legW, 0.9, legD, pants);
  leftLeg.position.set(-0.1 * wf, 0, 0);
  const rightLeg = hang(legW, 0.9, legD, pants);
  rightLeg.position.set(0.1 * wf, 0, 0);
  hips.add(leftLeg, rightLeg);

  if (opts.shorts) {
    for (const leg of [leftLeg, rightLeg]) {
      part(legW * 1.06, 0.45, legD * 1.06, legsMat, 0, -0.67, 0, leg);
    }
  }

  if (shoesMat) {
    for (const leg of [leftLeg, rightLeg]) {
      part(0.21 * build.limb, 0.1, 0.3, shoesMat, 0, -0.85, 0.05, leg);
    }
  }

  if (opts.skirt) {
    part(0.54 * wf, 0.44, 0.36 * df, solid(opts.skirtColor ?? pantsColor, 0.9), 0, -0.2, 0, hips);
  }

  const torso = rise(0.44 * wf, 0.52, 0.24 * df, shirt);
  hips.add(torso);

  if (opts.belt != null) {
    part(0.46 * wf, 0.07, 0.255 * df, solid(opts.belt, 0.6), 0, 0.05, 0, hips);
    part(0.06, 0.05, 0.02, solid(0xb8b2a4, 0.35, 0.3), 0, 0.05, 0.13 * df, hips);
  }

  if (opts.tie != null) {
    const z = 0.12 * df + 0.015;
    part(0.065, 0.3, 0.02, solid(opts.tie, 0.7), 0, 0.33, z, hips);
    part(0.06, 0.06, 0.025, solid(opts.tie, 0.7), 0, 0.49, z, hips);
  }

  if (opts.vest != null) {
    part(0.47 * wf, 0.44, 0.255 * df, solid(opts.vest, 0.68), 0, 0.3, 0, hips);
    const stripe = solid(0xe4e2d4, 0.42);
    part(0.48 * wf, 0.045, 0.262 * df, stripe, 0, 0.2, 0, hips);
    part(0.48 * wf, 0.045, 0.262 * df, stripe, 0, 0.38, 0, hips);
  }

  if (opts.backpack != null) {
    part(0.34 * wf, 0.42, 0.17, solid(opts.backpack, 0.82), 0, 0.3, -0.22 * df, hips);
    part(0.2, 0.12, 0.05, solid(opts.backpack, 0.82), 0, 0.16, -0.31 * df, hips);
  }

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.56;
  hips.add(headPivot);
  const head = new THREE.Group();
  head.scale.setScalar(opts.headScale ?? 1);
  headPivot.add(head);

  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), skin);
  skull.position.y = 0.13;
  skull.castShadow = true;
  head.add(skull);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.26), hairMat);
  hair.position.set(0, 0.26, -0.01);
  hair.castShadow = true;
  head.add(hair);
  if (opts.hairLong) {
    part(0.24, 0.3, 0.08, hairMat, 0, 0.1, -0.13, head);
    part(0.07, 0.28, 0.2, hairMat, -0.14, 0.1, 0, head);
    part(0.07, 0.28, 0.2, hairMat, 0.14, 0.1, 0, head);
  }
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.02), solid(0x1a120e));
  const eyeL = eye.clone();
  const eyeR = eye.clone();
  eyeL.position.set(-0.06, 0.14, 0.12);
  eyeR.position.set(0.06, 0.14, 0.12);
  head.add(eyeL, eyeR);

  if (opts.hat) addHat(head, opts.hat);
  else if (opts.cap) {
    const capMat = solid(opts.cap, 0.72);
    part(0.28, 0.08, 0.28, capMat, 0, 0.32, 0, head);
    part(0.16, 0.03, 0.12, capMat, 0, 0.28, 0.16, head);
  }
  if (opts.glasses) addGlasses(head, opts.glasses === true ? undefined : opts.glasses);
  if (opts.headphones) addHeadphones(head, opts.headphones === true ? undefined : opts.headphones);

  const armLen = 0.52;
  const leftArm = hang(0.12, armLen, 0.14, armMat);
  leftArm.position.set(-0.29 * wf, 0.46, 0);
  const rightArm = hang(0.12, armLen, 0.14, armMat);
  rightArm.position.set(0.29 * wf, 0.46, 0);
  const handGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
  const leftHand = new THREE.Mesh(handGeo, skin);
  leftHand.position.y = -armLen - 0.02;
  const rightHand = new THREE.Mesh(handGeo, skin);
  rightHand.position.y = -armLen - 0.02;
  leftArm.add(leftHand);
  rightArm.add(rightHand);
  hips.add(leftArm, rightArm);

  if (opts.briefcase != null) {
    const mat = solid(opts.briefcase, 0.66);
    part(0.3, 0.24, 0.1, mat, 0, -0.72, 0.02, rightArm);
    part(0.1, 0.04, 0.04, mat, 0, -0.585, 0.02, rightArm);
  }
  if (opts.handbag != null) {
    const mat = solid(opts.handbag, 0.72);
    part(0.24, 0.2, 0.12, mat, 0, -0.68, 0.02, rightArm);
    part(0.12, 0.03, 0.03, mat, 0, -0.57, 0.02, rightArm);
  }
  if (opts.tote != null) {
    const mat = solid(opts.tote, 0.86);
    part(0.27, 0.3, 0.13, mat, 0, -0.72, 0.02, leftArm);
    part(0.13, 0.03, 0.03, mat, 0, -0.555, 0.02, leftArm);
  }
  if (opts.cane != null) {
    const mat = solid(opts.cane, 0.6);
    part(0.035, 0.92, 0.035, mat, 0.33 * wf, -0.43, 0.07, hips);
    part(0.11, 0.04, 0.04, mat, 0.29 * wf, 0.02, 0.07, hips);
  }

  const hunch = opts.hunch ?? 0;
  if (hunch) {
    torso.rotation.x = hunch;
    headPivot.position.z = hunch * 0.32;
  }

  visual.scale.y = opts.height ?? 1;

  const group = new THREE.Group();
  group.position.y = WALK_TOP;
  group.add(visual);

  return {
    group,
    visual,
    hips,
    parts: { leftLeg, rightLeg, leftArm, rightArm, torso, head: headPivot },
    pose: 'stand',
    hunch,
    height: opts.height ?? 1,
    heading: opts.heading ?? Math.PI,
    x: opts.x ?? 0,
    z: opts.z ?? 0,
    radius: 0.38 * wf,
  };
}

export function setPose(actor, pose) {
  actor.pose = pose;
  const p = actor.parts;
  actor.visual.rotation.x = 0;
  actor.visual.position.y = 0;
  if (pose === 'sit') {
    actor.hips.position.y = 0.56;
    p.leftLeg.rotation.set(-1.35, 0, 0.06);
    p.rightLeg.rotation.set(-1.35, 0, -0.06);
    p.leftArm.rotation.set(-0.5, 0, 0.18);
    p.rightArm.rotation.set(-0.25, 0, -0.18);
    p.torso.rotation.set(0.08, 0, 0);
  } else if (pose === 'down') {
    actor.visual.rotation.x = -Math.PI / 2;
    actor.visual.position.y = 0.34;
    actor.hips.position.y = 0.9;
    p.leftLeg.rotation.set(0.25, 0.08, 0.4);
    p.rightLeg.rotation.set(-0.4, -0.06, -0.28);
    p.leftArm.rotation.set(0.7, 0, 1.2);
    p.rightArm.rotation.set(-0.9, 0, -1.35);
    p.torso.rotation.set(0, 0.25, 0.18);
  } else {
    actor.hips.position.y = 0.9;
    p.leftLeg.rotation.set(0, 0, 0);
    p.rightLeg.rotation.set(0, 0, 0);
    p.leftArm.rotation.set(0, 0, 0);
    p.rightArm.rotation.set(0, 0, 0);
    p.torso.rotation.set(actor.hunch ?? 0, 0, 0);
  }
}

export const ATTACK_TIME = 0.34;

function damp(current, target, dt) {
  const k = 1 - Math.pow(0.0015, dt);
  return current + (target - current) * k;
}

export function animateActor(actor, speed, time, dt) {
  if (actor.pose === 'sit' || actor.pose === 'down') return;
  const p = actor.parts;

  if (actor.airborne) {
    p.leftLeg.rotation.x = damp(p.leftLeg.rotation.x, -0.65, dt);
    p.rightLeg.rotation.x = damp(p.rightLeg.rotation.x, 0.35, dt);
    p.leftArm.rotation.x = damp(p.leftArm.rotation.x, -0.95, dt);
    p.rightArm.rotation.x = damp(p.rightArm.rotation.x, -0.95, dt);
    p.leftArm.rotation.z = damp(p.leftArm.rotation.z, 0.14, dt);
    p.rightArm.rotation.z = damp(p.rightArm.rotation.z, -0.14, dt);
    p.torso.rotation.x = damp(p.torso.rotation.x, (actor.hunch ?? 0) + 0.08, dt);
    p.torso.rotation.y = damp(p.torso.rotation.y, 0, dt);
    actor.visual.position.y = 0;
    return;
  }

  const amp = THREE.MathUtils.clamp(speed / 3.2, 0, 1);
  const phase = time * (speed > 4.5 ? 11 : 8);
  const swing = Math.sin(phase) * amp * 0.85;
  p.leftLeg.rotation.x = damp(p.leftLeg.rotation.x, swing, dt);
  p.rightLeg.rotation.x = damp(p.rightLeg.rotation.x, -swing, dt);
  p.leftArm.rotation.x = damp(p.leftArm.rotation.x, -swing * 0.7, dt);
  p.rightArm.rotation.x = damp(p.rightArm.rotation.x, swing * 0.7, dt);
  const lean = (actor.hunch ?? 0) + Math.sin(time * 2.2) * 0.02 + amp * 0.06;
  p.torso.rotation.x = damp(p.torso.rotation.x, lean, dt);
  actor.visual.position.y = Math.abs(Math.sin(phase)) * 0.045 * amp;

  if (actor.attack > 0) {
    const progress = 1 - actor.attack / ATTACK_TIME;
    const punch = Math.sin(THREE.MathUtils.clamp(progress, 0, 1) * Math.PI);
    p.rightArm.rotation.x = -0.12 - punch * 1.4;
    p.rightArm.rotation.z = damp(p.rightArm.rotation.z, -punch * 0.16, dt);
    p.leftArm.rotation.z = damp(p.leftArm.rotation.z, -punch * 0.05, dt);
    p.torso.rotation.y = damp(p.torso.rotation.y, -punch * 0.22, dt);
  } else {
    p.rightArm.rotation.z = damp(p.rightArm.rotation.z, 0, dt);
    p.leftArm.rotation.z = damp(p.leftArm.rotation.z, 0, dt);
    p.torso.rotation.y = damp(p.torso.rotation.y, 0, dt);
  }
}
