import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WALK_TOP, shade } from './config.js';

// Every box is merged into the joint it belongs to and carries its colour in a
// vertex attribute, so the whole cast shares one material and a person costs
// about ten draw calls instead of one per box.
const BODY_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.8,
  metalness: 0,
});

const BUILDS = {
  slim: { width: 0.92, depth: 0.94, limb: 0.96 },
  normal: { width: 1, depth: 1, limb: 1 },
  heavy: { width: 1.16, depth: 1.12, limb: 1.08 },
};

const UNIT = new THREE.BoxGeometry(1, 1, 1);
const HEAD_Y = 0.56;
const THIGH_LEN = 0.44;
const SHIN_LEN = 0.38;
const UPPER_LEN = 0.26;
const FORE_LEN = 0.26;
const EYE_WHITE = 0xefebe4;
const EYE_DARK = 0x1a120e;

// A box whose top and bottom faces differ: shoulders, calves and jaws get a
// silhouette instead of a straight column.
function taper(topW, topD, botW, botD, h) {
  const g = UNIT.clone();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const top = pos.getY(i) > 0;
    const w = top ? topW : botW;
    const d = top ? topD : botD;
    pos.setXYZ(i, pos.getX(i) * w, pos.getY(i) * h, pos.getZ(i) * d);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function slab(w, h, d) {
  return taper(w, d, w, d, h);
}

function paint(geo, color) {
  const c = new THREE.Color(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Collects the boxes of one joint and bakes them into a single mesh.
class Joint {
  constructor() {
    this.geos = [];
  }

  box(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const g = geo.clone();
    if (rx || ry || rz) {
      g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    }
    g.translate(x, y, z);
    paint(g, color);
    this.geos.push(g);
    return this;
  }

  cyl(topR, botR, h, sides, color, x = 0, y = 0, z = 0) {
    const g = new THREE.CylinderGeometry(topR, botR, h, sides);
    g.translate(x, y, z);
    paint(g, color);
    this.geos.push(g);
    return this;
  }

  node(cast = true) {
    const group = new THREE.Group();
    const merged = this.geos.length === 1 ? this.geos[0] : mergeGeometries(this.geos, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, BODY_MAT);
      mesh.castShadow = cast;
      group.add(mesh);
    } else {
      // mergeGeometries only gives up on mismatched attributes, which cannot
      // happen here; keep the body visible if it ever does.
      for (const g of this.geos) {
        const mesh = new THREE.Mesh(g, BODY_MAT);
        mesh.castShadow = cast;
        group.add(mesh);
      }
    }
    return group;
  }
}

function addHat(head, hat) {
  const color = hat.color ?? 0x2b2b2e;
  switch (hat.type) {
    case 'beanie':
      head.box(slab(0.28, 0.12, 0.29), color, 0, 0.305, 0);
      head.box(slab(0.3, 0.05, 0.31), color, 0, 0.26, 0);
      break;
    case 'hardhat':
      head.cyl(0.16, 0.19, 0.11, 8, color, 0, 0.345, 0);
      head.cyl(0.235, 0.235, 0.025, 10, color, 0, 0.295, 0);
      break;
    case 'sunhat':
      head.cyl(0.33, 0.33, 0.025, 12, color, 0, 0.3, 0);
      head.cyl(0.145, 0.165, 0.13, 10, color, 0, 0.375, 0);
      break;
    case 'policecap':
      head.box(slab(0.28, 0.09, 0.28), color, 0, 0.325, 0);
      head.box(slab(0.2, 0.025, 0.13), color, 0, 0.29, 0.16);
      break;
    default:
      head.box(slab(0.27, 0.08, 0.27), color, 0, 0.325, 0);
      head.box(slab(0.17, 0.025, 0.12), color, 0, 0.29, 0.145);
  }
}

function addGlasses(head, color) {
  const mat = color ?? 0x14161a;
  head.box(slab(0.075, 0.05, 0.02), mat, -0.062, 0.145, 0.12);
  head.box(slab(0.075, 0.05, 0.02), mat, 0.062, 0.145, 0.12);
  head.box(slab(0.05, 0.015, 0.02), mat, 0, 0.145, 0.12);
}

function addHeadphones(head, color) {
  const mat = color ?? 0x1c1e24;
  head.box(slab(0.3, 0.035, 0.06), mat, 0, 0.36, 0);
  head.box(slab(0.05, 0.11, 0.11), mat, -0.145, 0.16, 0);
  head.box(slab(0.05, 0.11, 0.11), mat, 0.145, 0.16, 0);
}

export function createActor(opts = {}) {
  const build = BUILDS[opts.build] ?? BUILDS.normal;
  const wf = build.width;
  const df = build.depth;
  const lm = build.limb;

  const shirtColor = opts.shirt ?? 0x1a1c22;
  const pantsColor = opts.pants ?? 0x2a3648;
  const skinColor = opts.skin ?? 0xc89674;
  const hairColor = opts.hair ?? 0x1b140f;
  const shoeColor = opts.shoes == null ? null : opts.shoes;
  const armColor = opts.sleeveless ? skinColor : shirtColor;
  const shorts = !!opts.shorts;
  const legColor = opts.legs ?? (shorts ? skinColor : pantsColor);

  const visual = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  visual.add(hips);

  // ---- legs -------------------------------------------------------------
  const legW = 0.175 * lm;
  const legD = 0.195 * lm;

  function buildLeg(side) {
    const thigh = new THREE.Group();
    thigh.position.set(side * 0.1 * wf, 0, 0);
    const tj = new Joint();
    const hem = shorts ? 0.25 : THIGH_LEN;
    tj.box(taper(legW * 1.08, legD * 1.06, legW * 0.93, legD * 0.96, hem), pantsColor, 0, -hem / 2, 0);
    if (shorts) {
      // Bare skin between the shorts hem and the knee.
      const bare = THIGH_LEN - hem;
      tj.box(taper(legW * 0.97, legD, legW * 0.93, legD * 0.96, bare), skinColor, 0, -hem - bare / 2, 0);
    }
    thigh.add(tj.node());

    const shin = new THREE.Group();
    shin.position.y = -THIGH_LEN;
    thigh.add(shin);
    const sj = new Joint();
    // The shin starts wider than the thigh it hangs from, so the knee seam
    // stays hidden when the leg bends.
    sj.box(taper(legW * 0.96, legD * 0.99, legW * 0.8, legD * 0.85, SHIN_LEN), legColor, 0, -SHIN_LEN / 2, 0);
    if (shoeColor != null) {
      const sole = shade(shoeColor, 0.55);
      sj.box(slab(0.2 * lm, 0.075, 0.3 * lm), shoeColor, 0, -SHIN_LEN, 0.045);
      sj.box(slab(0.185 * lm, 0.025, 0.285 * lm), sole, 0, -SHIN_LEN - 0.0375, 0.045);
      sj.box(slab(0.14 * lm, 0.05, 0.075 * lm), sole, 0, -SHIN_LEN - 0.015, -0.055);
    }
    shin.add(sj.node());
    return { thigh, shin };
  }

  const { thigh: leftLeg, shin: leftShin } = buildLeg(-1);
  const { thigh: rightLeg, shin: rightShin } = buildLeg(1);
  hips.add(leftLeg, rightLeg);

  // ---- torso ------------------------------------------------------------
  const torso = new THREE.Group();
  const chest = new Joint();
  chest.box(taper(0.47 * wf, 0.27 * df, 0.4 * wf, 0.23 * df, 0.52), shirtColor, 0, 0.26, 0);
  chest.box(slab(0.135 * wf, 0.16, 0.14 * df), skinColor, 0, 0.52, 0);

  if (opts.belt != null) {
    chest.box(slab(0.42 * wf, 0.07, 0.245 * df), opts.belt, 0, 0.06, 0);
    chest.box(slab(0.06, 0.05, 0.02), 0xb8b2a4, 0, 0.06, 0.128 * df);
  }

  if (opts.tie != null) {
    chest.box(slab(0.06, 0.3, 0.02), opts.tie, 0, 0.3, 0.126);
    chest.box(slab(0.06, 0.06, 0.025), opts.tie, 0, 0.46, 0.13);
  }

  if (opts.vest != null) {
    const stripe = 0xe4e2d4;
    for (const side of [-1, 1]) {
      chest.box(taper(0.17, 0.25 * df, 0.16, 0.235 * df, 0.42), opts.vest, side * 0.12, 0.28, 0);
      chest.box(slab(0.175, 0.045, 0.256 * df), stripe, side * 0.12, 0.2, 0);
      chest.box(slab(0.175, 0.045, 0.256 * df), stripe, side * 0.12, 0.37, 0);
    }
  }

  if (opts.backpack != null) {
    chest.box(taper(0.34 * wf, 0.17, 0.31 * wf, 0.15, 0.42), opts.backpack, 0, 0.3, -0.16);
    chest.box(slab(0.2, 0.12, 0.05), opts.backpack, 0, 0.16, -0.245);
  }

  torso.add(chest.node());

  // ---- arms -------------------------------------------------------------
  function buildArm(side) {
    const upper = new THREE.Group();
    upper.position.set(side * 0.29 * wf, 0.46, 0);
    const uj = new Joint();
    uj.box(taper(0.135, 0.15, 0.11, 0.125, UPPER_LEN), armColor, 0, -UPPER_LEN / 2, 0);
    upper.add(uj.node());

    const fore = new THREE.Group();
    fore.position.y = -UPPER_LEN;
    upper.add(fore);
    const fj = new Joint();
    // The forearm starts wider than the arm it hangs from, so the joint seam
    // stays hidden when the elbow bends.
    fj.box(taper(0.118, 0.128, 0.095, 0.11, FORE_LEN), armColor, 0, -FORE_LEN / 2, 0);
    fj.box(slab(0.095, 0.115, 0.1), skinColor, 0, -FORE_LEN - 0.045, 0.01);
    fore.add(fj.node(false));
    return { upper, fore };
  }

  const { upper: leftArm, fore: leftFore } = buildArm(-1);
  const { upper: rightArm, fore: rightFore } = buildArm(1);
  // Arms hang from the chest so a hunch carries them along.
  torso.add(leftArm, rightArm);

  if (opts.briefcase != null) {
    const mat = opts.briefcase;
    rightFore.add(new Joint()
      .box(slab(0.3, 0.24, 0.1), mat, 0, -FORE_LEN - 0.12, 0.02)
      .box(slab(0.1, 0.04, 0.04), mat, 0, -FORE_LEN + 0.015, 0.02)
      .node());
  }
  if (opts.handbag != null) {
    const mat = opts.handbag;
    rightFore.add(new Joint()
      .box(slab(0.24, 0.2, 0.12), mat, 0, -FORE_LEN - 0.11, 0.02)
      .box(slab(0.12, 0.03, 0.03), mat, 0, -FORE_LEN + 0.005, 0.02)
      .node());
  }
  if (opts.tote != null) {
    const mat = opts.tote;
    leftFore.add(new Joint()
      .box(slab(0.27, 0.3, 0.13), mat, 0, -FORE_LEN - 0.16, 0.02)
      .box(slab(0.13, 0.03, 0.03), mat, 0, -FORE_LEN - 0.005, 0.02)
      .node());
  }

  // ---- head -------------------------------------------------------------
  const headPivot = new THREE.Group();
  headPivot.position.y = HEAD_Y;
  torso.add(headPivot);
  const head = new THREE.Group();
  head.scale.setScalar(opts.headScale ?? 1);
  headPivot.add(head);

  const hj = new Joint();
  hj.box(taper(0.235, 0.245, 0.195, 0.205, 0.26), skinColor, 0, 0.13, 0);
  // Hair: a cap plus fringe, sides and back instead of one slab.
  hj.box(taper(0.245, 0.255, 0.242, 0.252, 0.09), hairColor, 0, 0.275, 0);
  hj.box(slab(0.2, 0.07, 0.05), hairColor, 0, 0.245, 0.115);
  hj.box(slab(0.045, 0.15, 0.19), hairColor, -0.115, 0.185, -0.005);
  hj.box(slab(0.045, 0.15, 0.19), hairColor, 0.115, 0.185, -0.005);
  hj.box(slab(0.215, 0.17, 0.05), hairColor, 0, 0.175, -0.115);
  if (opts.hairLong) {
    hj.box(slab(0.23, 0.3, 0.07), hairColor, 0, 0.06, -0.135);
    hj.box(slab(0.06, 0.26, 0.18), hairColor, -0.13, 0.05, 0);
    hj.box(slab(0.06, 0.26, 0.18), hairColor, 0.13, 0.05, 0);
  }
  // Face: eyes with pupils, brows, nose, mouth and ears.
  for (const side of [-1, 1]) {
    hj.box(slab(0.055, 0.042, 0.02), EYE_WHITE, side * 0.062, 0.145, 0.108);
    hj.box(slab(0.022, 0.024, 0.012), EYE_DARK, side * 0.062, 0.145, 0.118);
    hj.box(slab(0.065, 0.014, 0.02), shade(hairColor, 0.8), side * 0.062, 0.185, 0.112);
    hj.box(slab(0.022, 0.06, 0.045), skinColor, side * 0.113, 0.13, -0.005);
  }
  hj.box(slab(0.042, 0.055, 0.05), skinColor, 0, 0.105, 0.115);
  hj.box(slab(0.07, 0.016, 0.02), shade(skinColor, 0.5), 0, 0.055, 0.105);

  if (opts.hat) addHat(hj, opts.hat);
  else if (opts.cap) {
    hj.box(slab(0.27, 0.08, 0.27), opts.cap, 0, 0.325, 0);
    hj.box(slab(0.17, 0.025, 0.12), opts.cap, 0, 0.29, 0.145);
  }
  if (opts.glasses) addGlasses(hj, opts.glasses === true ? undefined : opts.glasses);
  if (opts.headphones) addHeadphones(hj, opts.headphones === true ? undefined : opts.headphones);
  head.add(hj.node());

  // ---- waist props ------------------------------------------------------
  const hipJoint = new Joint();
  if (opts.skirt) {
    hipJoint.box(taper(0.46 * wf, 0.26 * df, 0.58 * wf, 0.32 * df, 0.44), opts.skirtColor ?? pantsColor, 0, -0.2, 0);
  }
  if (opts.cane != null) {
    hipJoint.box(slab(0.035, 0.92, 0.035), opts.cane, 0.33 * wf, -0.43, 0.07);
    hipJoint.box(slab(0.11, 0.04, 0.04), opts.cane, 0.29 * wf, 0.02, 0.07);
  }
  if (hipJoint.geos.length) hips.add(hipJoint.node(false));

  hips.add(torso);

  const hunch = opts.hunch ?? 0;
  if (hunch) torso.rotation.x = hunch;

  visual.scale.y = opts.height ?? 1;

  const group = new THREE.Group();
  group.position.y = WALK_TOP;
  group.add(visual);

  return {
    group,
    visual,
    hips,
    parts: {
      leftLeg,
      rightLeg,
      leftShin,
      rightShin,
      leftArm,
      rightArm,
      leftFore,
      rightFore,
      torso,
      head: headPivot,
    },
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
  if (pose === 'getup') {
    // Keep the lying angles; animateActor blends them up to standing.
    actor.getup = 0;
    return;
  }
  actor.visual.rotation.x = 0;
  actor.visual.position.y = 0;
  if (pose === 'sit') {
    actor.hips.position.y = 0.56;
    p.leftLeg.rotation.set(-1.35, 0, 0.06);
    p.rightLeg.rotation.set(-1.35, 0, -0.06);
    p.leftShin.rotation.set(1.38, 0, 0);
    p.rightShin.rotation.set(1.38, 0, 0);
    p.leftArm.rotation.set(-0.5, 0, 0.18);
    p.rightArm.rotation.set(-0.25, 0, -0.18);
    p.leftFore.rotation.set(-0.55, 0, 0);
    p.rightFore.rotation.set(-0.4, 0, 0);
    p.torso.rotation.set(0.08, 0, 0);
  } else if (pose === 'down') {
    actor.visual.rotation.x = -Math.PI / 2;
    actor.visual.position.y = 0.34;
    actor.hips.position.y = 0.9;
    p.leftLeg.rotation.set(0.25, 0.08, 0.4);
    p.rightLeg.rotation.set(-0.4, -0.06, -0.28);
    p.leftShin.rotation.set(0.2, 0, 0);
    p.rightShin.rotation.set(0.35, 0, 0);
    p.leftArm.rotation.set(0.7, 0, 1.2);
    p.rightArm.rotation.set(-0.9, 0, -1.35);
    p.leftFore.rotation.set(-0.4, 0, 0);
    p.rightFore.rotation.set(-0.3, 0, 0);
    p.torso.rotation.set(0, 0.25, 0.18);
  } else {
    actor.hips.position.y = 0.9;
    p.leftLeg.rotation.set(0, 0, 0);
    p.rightLeg.rotation.set(0, 0, 0);
    p.leftShin.rotation.set(0, 0, 0);
    p.rightShin.rotation.set(0, 0, 0);
    p.leftArm.rotation.set(0, 0, 0);
    p.rightArm.rotation.set(0, 0, 0);
    p.leftFore.rotation.set(0, 0, 0);
    p.rightFore.rotation.set(0, 0, 0);
    p.torso.rotation.set(actor.hunch ?? 0, 0, 0);
  }
}

export const ATTACK_TIME = 0.34;

// Key poses for standing up: lying, then a crouch on the knees, then upright.
const GETUP_TIME = 0.55;
const GETUP_DOWN = {
  visual: [-Math.PI / 2, 0.34],
  hipsY: 0.9,
  leftLeg: [0.25, 0.08, 0.4],
  rightLeg: [-0.4, -0.06, -0.28],
  leftShin: [0.2, 0, 0],
  rightShin: [0.35, 0, 0],
  leftArm: [0.7, 0, 1.2],
  rightArm: [-0.9, 0, -1.35],
  leftFore: [-0.4, 0, 0],
  rightFore: [-0.3, 0, 0],
  torso: [0, 0.25, 0.18],
};
const GETUP_CROUCH = {
  visual: [-0.55, 0.12],
  hipsY: 0.6,
  leftLeg: [-1.2, 0, 0.08],
  rightLeg: [-1.2, 0, -0.08],
  leftShin: [2, 0, 0],
  rightShin: [2, 0, 0],
  leftArm: [0.55, 0, 0.4],
  rightArm: [0.35, 0, -0.4],
  leftFore: [0.8, 0, 0],
  rightFore: [0.7, 0, 0],
  torso: [0.55, 0, 0],
};
const GETUP_STAND = {
  visual: [0, 0],
  hipsY: 0.9,
  leftLeg: [0, 0, 0],
  rightLeg: [0, 0, 0],
  leftShin: [0, 0, 0],
  rightShin: [0, 0, 0],
  leftArm: [0, 0, 0],
  rightArm: [0, 0, 0],
  leftFore: [0, 0, 0],
  rightFore: [0, 0, 0],
  torso: [0, 0, 0],
};

function mix3(target, a, b, t) {
  target.set(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  );
}

function animateGetup(actor, dt) {
  actor.getup = Math.min(1, (actor.getup || 0) + dt / GETUP_TIME);
  const p = actor.parts;
  const t = actor.getup;
  const split = 0.55;
  let from = GETUP_DOWN;
  let to = GETUP_CROUCH;
  let k = t / split;
  if (t >= split) {
    to = GETUP_STAND;
    k = (t - split) / (1 - split);
  }
  const e = k * k * (3 - 2 * k);
  actor.visual.rotation.x = from.visual[0] + (to.visual[0] - from.visual[0]) * e;
  actor.visual.position.y = from.visual[1] + (to.visual[1] - from.visual[1]) * e;
  actor.hips.position.y = from.hipsY + (to.hipsY - from.hipsY) * e;
  mix3(p.leftLeg.rotation, from.leftLeg, to.leftLeg, e);
  mix3(p.rightLeg.rotation, from.rightLeg, to.rightLeg, e);
  mix3(p.leftShin.rotation, from.leftShin, to.leftShin, e);
  mix3(p.rightShin.rotation, from.rightShin, to.rightShin, e);
  mix3(p.leftArm.rotation, from.leftArm, to.leftArm, e);
  mix3(p.rightArm.rotation, from.rightArm, to.rightArm, e);
  mix3(p.leftFore.rotation, from.leftFore, to.leftFore, e);
  mix3(p.rightFore.rotation, from.rightFore, to.rightFore, e);
  const torso = to === GETUP_STAND ? [actor.hunch ?? 0, 0, 0] : to.torso;
  mix3(p.torso.rotation, from.torso, torso, e);
  if (t >= 1) setPose(actor, 'stand');
}

function damp(current, target, dt) {
  const k = 1 - Math.pow(0.0015, dt);
  return current + (target - current) * k;
}

export function animateActor(actor, speed, time, dt) {
  if (actor.pose === 'getup') {
    animateGetup(actor, dt);
    return;
  }
  if (actor.pose === 'sit' || actor.pose === 'down') return;
  const p = actor.parts;

  if (actor.airborne) {
    p.leftLeg.rotation.x = damp(p.leftLeg.rotation.x, -0.65, dt);
    p.rightLeg.rotation.x = damp(p.rightLeg.rotation.x, 0.35, dt);
    p.leftShin.rotation.x = damp(p.leftShin.rotation.x, 0.55, dt);
    p.rightShin.rotation.x = damp(p.rightShin.rotation.x, 0.3, dt);
    p.leftArm.rotation.x = damp(p.leftArm.rotation.x, -0.95, dt);
    p.rightArm.rotation.x = damp(p.rightArm.rotation.x, -0.95, dt);
    p.leftArm.rotation.z = damp(p.leftArm.rotation.z, 0.14, dt);
    p.rightArm.rotation.z = damp(p.rightArm.rotation.z, -0.14, dt);
    p.leftFore.rotation.x = damp(p.leftFore.rotation.x, -0.45, dt);
    p.rightFore.rotation.x = damp(p.rightFore.rotation.x, -0.45, dt);
    p.torso.rotation.x = damp(p.torso.rotation.x, (actor.hunch ?? 0) + 0.08, dt);
    p.torso.rotation.y = damp(p.torso.rotation.y, 0, dt);
    actor.visual.position.y = 0;
    return;
  }

  const amp = THREE.MathUtils.clamp(speed / 3.2, 0, 1);
  const phase = time * (speed > 4.5 ? 11 : 8);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const swing = s * amp * 0.85;

  p.leftLeg.rotation.x = damp(p.leftLeg.rotation.x, swing, dt);
  p.rightLeg.rotation.x = damp(p.rightLeg.rotation.x, -swing, dt);

  // Knees fold through the swing and straighten for the next footfall.
  const kneeL = 0.06 + amp * (0.2 * Math.max(0, s) + 0.55 * Math.max(0, -c));
  const kneeR = 0.06 + amp * (0.2 * Math.max(0, -s) + 0.55 * Math.max(0, c));
  p.leftShin.rotation.x = damp(p.leftShin.rotation.x, kneeL, dt);
  p.rightShin.rotation.x = damp(p.rightShin.rotation.x, kneeR, dt);

  p.leftArm.rotation.x = damp(p.leftArm.rotation.x, -swing * 0.7, dt);
  p.rightArm.rotation.x = damp(p.rightArm.rotation.x, swing * 0.7, dt);
  // Elbows stay bent and close up as the arm swings forward.
  const elbowL = 0.14 + amp * (0.12 + 0.4 * Math.max(0, s));
  const elbowR = 0.14 + amp * (0.12 + 0.4 * Math.max(0, -s));
  p.leftFore.rotation.x = damp(p.leftFore.rotation.x, -elbowL, dt);
  p.rightFore.rotation.x = damp(p.rightFore.rotation.x, -elbowR, dt);

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
    // The punching arm straightens as it goes out.
    p.rightFore.rotation.x = damp(p.rightFore.rotation.x, -0.14 * (1 - punch), dt);
  } else {
    p.rightArm.rotation.z = damp(p.rightArm.rotation.z, 0, dt);
    p.leftArm.rotation.z = damp(p.leftArm.rotation.z, 0, dt);
    p.torso.rotation.y = damp(p.torso.rotation.y, 0, dt);
  }
}
