import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { glow, solid } from './materials.js';
import { ROAD_TOP } from './config.js';

// One material for every wheel in the game: the tyre and the hub bake into a
// single mesh with their colours in vertex attributes.
const WHEEL_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.58,
  metalness: 0.18,
});

// Trim (bumpers, panel gaps, handles, mirrors) and glass each share a single
// vertex coloured material, so a car keeps one mesh per material even though
// the trim comes in several colours.
const TRIM_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.5,
  metalness: 0.12,
});
TRIM_MAT.userData.defaultColor = 0x141618;

const GLASS_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.1,
  metalness: 0.25,
  side: THREE.DoubleSide,
});
GLASS_MAT.userData.defaultColor = 0x3a4a55;

// The panes of a passenger car's greenhouse are see-through, so the seats and
// the driver show from outside. Box bodied vehicles keep GLASS_MAT: their body
// is a solid shell, so there is no cabin behind those panes to show.
const CABIN_GLASS_MAT = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.08,
  metalness: 0.2,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const TYRE_COLOR = 0x1a1a1a;
const HUB_COLOR = 0x8d9094;
const SLOT_COLOR = 0x24262a;
// Side glass sits a shade darker than the screens, which catch more sky.
const SIDE_GLASS = 0x3a4a55;
const SCREEN_GLASS = 0x465964;
// Shut lines and window rubber are near black on every car, so gaps read as
// depth rather than as one more painted stripe.
const GROOVE_COLOR = 0x0f1114;

function paintGeo(geo, color) {
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

function part(parent, w, h, d, mat, x, y, z, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (mat.vertexColors) paintGeo(geo, color ?? mat.userData.defaultColor ?? mat.color.getHex());
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Panel gaps, handles and window frames have to stay readable on any body
// colour, so the trim picks a light or dark accent to match the paint.
function bodyLuma(color) {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function mixHex(color, target, t) {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const tr = (target >> 16) & 255;
  const tg = (target >> 8) & 255;
  const tb = target & 255;
  const rr = Math.round(r + (tr - r) * t);
  const gg = Math.round(g + (tg - g) * t);
  const bb = Math.round(b + (tb - b) * t);
  return (rr << 16) | (gg << 8) | bb;
}

// A dark body needs light seams and bright chrome to read, a light body needs
// the opposite. Everything else about the car stays the paint colour.
function trimPalette(color) {
  if (bodyLuma(color) < 0.34) {
    return { seam: mixHex(color, 0xffffff, 0.42), accent: 0xc3cad0 };
  }
  return { seam: mixHex(color, 0x000000, 0.52), accent: 0x2a2f34 };
}

function addWheel(parent, x, y, z, front, scale = 1) {
  const steer = new THREE.Group();
  steer.position.set(x, y, z);
  steer.scale.setScalar(scale);
  const roller = new THREE.Group();
  const geos = [];
  const tyre = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
  tyre.rotateZ(Math.PI / 2);
  geos.push(paintGeo(tyre, TYRE_COLOR));
  const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.27, 8);
  hub.rotateZ(Math.PI / 2);
  geos.push(paintGeo(hub, HUB_COLOR));
  // Spoke slots on the outboard face of the rim.
  const face = Math.sign(x) || 1;
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const slot = new THREE.BoxGeometry(0.03, 0.055, 0.16);
    slot.rotateX(-a);
    slot.translate(face * 0.138, Math.sin(a) * 0.085, Math.cos(a) * 0.085);
    geos.push(paintGeo(slot, SLOT_COLOR));
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), WHEEL_MAT);
  mesh.castShadow = true;
  roller.add(mesh);
  steer.add(roller);
  parent.add(steer);
  // Where the wheel hangs off the body, in the body's own frame. The suspension
  // needs it: every wheel looks at the ground under itself, so the car has to
  // know where its wheels are.
  return {
    steer,
    roller,
    front,
    radius: 0.34 * scale,
    at: { x, y, z },
    // How far the wheel is pushed up from its rest position by the ground under
    // it, in metres. Zero is sitting on its stop, at rest.
    travel: 0,
    // Whether the ground is under it at all.
    grounded: true,
  };
}

function wheelY(scale = 1) {
  return ROAD_TOP + 0.34 * scale;
}

function beam(parent, a, b, thickness, mat, color) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(to, from);
  const geo = new THREE.BoxGeometry(thickness, thickness, dir.length());
  if (mat.vertexColors) paintGeo(geo, color ?? mat.userData.defaultColor ?? mat.color.getHex());
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Bakes the static body of a vehicle down to one mesh per material. Wheels
// stay separate because they steer and roll, and the windshield stays
// separate because the first person camera hides it.
function mergeVehicleBody(group, keep) {
  const buckets = new Map();
  for (const child of [...group.children]) {
    if (!child.isMesh || keep.has(child)) continue;
    child.updateMatrix();
    const geo = child.geometry.clone();
    geo.applyMatrix4(child.matrix);
    let bucket = buckets.get(child.material);
    if (!bucket) {
      bucket = { material: child.material, geos: [] };
      buckets.set(child.material, bucket);
    }
    bucket.geos.push(geo);
    group.remove(child);
  }
  const byMaterial = new Map();
  for (const bucket of buckets.values()) {
    const merged = bucket.geos.length === 1 ? bucket.geos[0] : mergeGeometries(bucket.geos, false);
    if (!merged) {
      // mergeGeometries only gives up on mismatched attributes, which cannot
      // happen here; keep the body visible if it ever does.
      for (const geo of bucket.geos) {
        const mesh = new THREE.Mesh(geo, bucket.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      continue;
    }
    const mesh = new THREE.Mesh(merged, bucket.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    byMaterial.set(bucket.material, mesh);
  }
  return byMaterial;
}

function cylinderPart(parent, r, h, mat, x, y, z, rx = 0, color) {
  const geo = new THREE.CylinderGeometry(r, r, h, 8);
  if (mat.vertexColors) paintGeo(geo, color ?? mat.userData.defaultColor ?? mat.color.getHex());
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Trim every car shares: door skins and shut lines, handles, mirrors, a grille
// and exhaust tips. Each door skin stands a couple of centimetres proud of the
// body and the hood and boot are raised panels, so the shut lines read as real
// gaps that cast shadows instead of looking painted on. It reuses the shared
// trim material, so once the body is merged the whole car still costs one mesh
// per material.
function addCarTrim(group, spec) {
  const {
    paint, bodyColor, halfW, frontZ, rearZ, beltY, sillY, bodyTopY,
    cabinFrontZ, cabinRearZ,
    doors = 2,
    mirror = true,
    exhaust = true,
    grille = true,
    deckRearZ = null,
    trimW = null,
    hood = false,
  } = spec;
  const { seam, accent } = trimPalette(bodyColor);
  group.userData.trimMat = TRIM_MAT;
  group.userData.paintMat = paint;
  // Some vehicles have a narrower cab on a wider body, so the flank trim can
  // sit on the cab instead of the widest part.
  const sw = trimW ?? halfW;

  if (doors > 0) {
    // Door panel edges. Two doors per side get a pillar between them.
    const edges = doors === 1
      ? [cabinFrontZ, cabinRearZ]
      : [cabinFrontZ, (cabinFrontZ + cabinRearZ) * 0.5, cabinRearZ];
    const top = Math.min(beltY, bodyTopY) - 0.02;
    const gap = 0.035;
    for (const side of [-1, 1]) {
      for (let i = 0; i < edges.length - 1; i += 1) {
        const z0 = edges[i];
        const z1 = edges[i + 1];
        const span = Math.abs(z1 - z0);
        if (span < gap * 2 + 0.12) continue;
        const zMid = (z0 + z1) * 0.5;
        // The door skin stands proud of the body, so its edges cast a shadow
        // and the door reads as a separate panel from the chase camera.
        part(group, 0.03, top - sillY - 0.06, span - gap * 2, paint, side * (sw + 0.009), (sillY + top) * 0.5, zMid);
        // A crease along the middle of the doors catches the light.
        part(group, 0.022, 0.03, span - gap * 2 - 0.06, TRIM_MAT, side * (sw + 0.032), top - 0.34, zMid, accent);
        // Rocker strip running along the bottom of the doors.
        part(group, 0.05, 0.08, span - 0.06, TRIM_MAT, side * (sw + 0.02), sillY + 0.07, zMid, accent);
        // Door handle, just behind the leading edge of the door.
        part(group, 0.07, 0.08, 0.32, TRIM_MAT, side * (sw + 0.045), top - 0.17, z0 - 0.32, accent);
      }
      // Shut lines sit at the bottom of the gaps between the skins.
      for (const z of edges) {
        part(group, 0.02, top - sillY - 0.04, gap * 2 + 0.012, TRIM_MAT, side * (sw + 0.002), (sillY + top) * 0.5, z, GROOVE_COLOR);
      }
    }
  }

  // A raised panel with a dark shut line around it. Used for the hood and the
  // boot lid, whose tops are most of what the chase camera sees.
  const topPanel = (zA, zB, inset) => {
    const len = Math.abs(zA - zB);
    if (len < 0.2) return;
    const width = (sw - inset) * 2;
    const zMid = (zA + zB) * 0.5;
    part(group, width, 0.028, len, paint, 0, bodyTopY + 0.006, zMid);
    for (const side of [-1, 1]) {
      part(group, 0.035, 0.014, len, TRIM_MAT, side * (width / 2 + 0.03), bodyTopY + 0.002, zMid, GROOVE_COLOR);
    }
    const dir = Math.sign(zA - zB) || 1;
    part(group, width + 0.09, 0.014, 0.045, TRIM_MAT, 0, bodyTopY + 0.002, zA + dir * 0.025, GROOVE_COLOR);
    part(group, width + 0.09, 0.014, 0.045, TRIM_MAT, 0, bodyTopY + 0.002, zB - dir * 0.025, GROOVE_COLOR);
  };

  if (hood) topPanel(frontZ - 0.16, cabinFrontZ - 0.02, 0.1);
  // Boot lid seam on the deck behind the cabin.
  if (deckRearZ !== null) topPanel(deckRearZ - 0.03, rearZ + 0.14, 0.12);

  if (mirror) {
    for (const side of [-1, 1]) {
      part(group, 0.05, 0.05, 0.05, TRIM_MAT, side * (halfW + 0.04), beltY + 0.12, cabinFrontZ - 0.16, seam);
      part(group, 0.16, 0.13, 0.22, TRIM_MAT, side * (halfW + 0.11), beltY + 0.16, cabinFrontZ - 0.25, accent);
    }
  }

  if (grille) {
    part(group, halfW * 1.15, 0.17, 0.06, TRIM_MAT, 0, beltY - 0.3, frontZ - 0.02, seam);
    part(group, halfW * 0.8, 0.05, 0.05, TRIM_MAT, 0, beltY - 0.24, frontZ - 0.04, accent);
    part(group, halfW * 0.8, 0.05, 0.05, TRIM_MAT, 0, beltY - 0.36, frontZ - 0.04, accent);
  }

  if (exhaust) {
    for (const side of [-1, 1]) {
      cylinderPart(group, 0.05, 0.16, TRIM_MAT, side * 0.34, 0.3, rearZ - 0.06, Math.PI / 2, accent);
    }
  }
}

// A flat quad pane built from four corners. PlaneGeometry has the same
// position/normal/uv/index layout as a box, so the glass still merges with the
// rest of the car into one mesh per material.
function quadPane(group, corners, mat, color) {
  const geo = new THREE.PlaneGeometry(1, 1);
  const pos = geo.attributes.position;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const [x, y, z] of corners) {
    cx += x;
    cy += y;
    cz += z;
  }
  cx /= corners.length;
  cy /= corners.length;
  cz /= corners.length;
  for (let i = 0; i < corners.length; i += 1) {
    const [x, y, z] = corners[i];
    pos.setXYZ(i, x - cx, y - cy, z - cz);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  if (mat.vertexColors) paintGeo(geo, color ?? mat.userData.defaultColor ?? mat.color.getHex());
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(cx, cy, cz);
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// A car greenhouse made of a painted roof, painted pillars and separate dark
// panes instead of one solid cabin block. The side glass is split by the B
// pillar, so doors and windows stay readable from the third person camera
// instead of dissolving into a single tinted slab.
// The lower body of a passenger car. The top is capped over the hood, the boot
// and the door ledges, but left open over the cabin, so the interior floor can
// sit below the belt line. The greenhouse roof and glass close the opening
// from above, so the car still looks solid from outside.
function addCarBody(group, paint, {
  w, bottom, top, zFront, zBack, cabinFrontZ, cabinRearZ, cabinHalfW, wall = 0.06,
}) {
  const inner = w - wall * 2;
  const depth = Math.abs(zFront - zBack);
  const zMid = (zFront + zBack) / 2;
  const wallH = top - bottom - 0.08;

  // Floor pan, then the four walls. The front and rear walls sit between the
  // side walls so no two outer faces land on the same plane.
  part(group, w, 0.08, depth, paint, 0, bottom + 0.04, zMid);
  for (const side of [-1, 1]) {
    part(group, wall, wallH, depth, paint, side * (w / 2 - wall / 2), bottom + 0.08 + wallH / 2, zMid);
  }
  part(group, inner, wallH, wall, paint, 0, bottom + 0.08 + wallH / 2, zFront - wall / 2);
  part(group, inner, wallH, wall, paint, 0, bottom + 0.08 + wallH / 2, zBack + wall / 2);

  // Top caps over the hood and the boot, plus the ledges under the side glass.
  const capT = 0.08;
  const capY = top - capT / 2;
  const hoodLen = zFront - wall - cabinFrontZ;
  if (hoodLen > 0) {
    part(group, inner, capT, hoodLen, paint, 0, capY, cabinFrontZ + hoodLen / 2);
  }
  const deckLen = cabinRearZ - (zBack + wall);
  if (deckLen > 0) {
    part(group, inner, capT, deckLen, paint, 0, capY, zBack + wall + deckLen / 2);
  }
  const ledgeW = w / 2 - wall - cabinHalfW;
  if (ledgeW > 0) {
    const cabinLen = cabinFrontZ - cabinRearZ;
    for (const side of [-1, 1]) {
      part(
        group,
        ledgeW,
        capT,
        cabinLen,
        paint,
        side * (cabinHalfW + ledgeW / 2),
        capY,
        (cabinFrontZ + cabinRearZ) / 2,
      );
    }
  }
}

function addGreenhouse(group, {
  paint,
  bodyColor,
  beltY,
  roofY,
  frontZ,
  rearZ,
  roofFrontZ = frontZ - 0.14,
  roofRearZ = rearZ + 0.12,
  beltHalfW,
  roofHalfW = beltHalfW - 0.06,
  bPillarZ = null,
  cPillarZ = null,
  pillar = 0.085,
  roofT = 0.1,
  floorY = null,
}) {
  const { seam, accent } = trimPalette(bodyColor);
  const zMid = (roofFrontZ + roofRearZ) / 2;
  const glassBottomY = beltY + 0.03;
  const glassTopY = roofY - 0.03;

  // Roof, a touch wider than the pillars so it overhangs the glass.
  part(group, roofHalfW * 2 + 0.08, roofT, Math.abs(roofFrontZ - roofRearZ), paint, 0, roofY + roofT / 2, zMid);

  // Side glass, split by the B pillar on four door cars and by the C pillar
  // on estates and SUVs that carry a quarter light. The panes taper in with
  // the pillars instead of staying a flat slab.
  const splits = [frontZ];
  const topSplits = [roofFrontZ];
  if (bPillarZ !== null) {
    splits.push(bPillarZ);
    topSplits.push(bPillarZ);
  }
  if (cPillarZ !== null) {
    splits.push(cPillarZ);
    topSplits.push(cPillarZ);
  }
  splits.push(rearZ);
  topSplits.push(roofRearZ);
  for (const side of [-1, 1]) {
    for (let i = 0; i < splits.length - 1; i += 1) {
      const z0 = splits[i];
      const z1 = splits[i + 1];
      if (Math.abs(z1 - z0) <= pillar + 0.06) continue;
      quadPane(group, [
        [side * roofHalfW, glassTopY, topSplits[i]],
        [side * roofHalfW, glassTopY, topSplits[i + 1]],
        [side * beltHalfW, glassBottomY, z0],
        [side * beltHalfW, glassBottomY, z1],
      ], CABIN_GLASS_MAT, SIDE_GLASS);
      // Waistline strip under each pane and a rail along its top, so the glass
      // sits in a frame of bright trim instead of bleeding into the paint.
      part(group, 0.035, 0.05, Math.abs(z1 - z0) - 0.02, TRIM_MAT, side * (beltHalfW + 0.012), beltY + 0.01, (z0 + z1) / 2, accent);
      part(group, 0.045, 0.035, Math.abs(topSplits[i + 1] - topSplits[i]) - 0.02, TRIM_MAT, side * (roofHalfW + 0.012), glassTopY, (topSplits[i] + topSplits[i + 1]) / 2, accent);
      // Drip rail along the roof edge.
      part(group, 0.04, 0.04, Math.abs(topSplits[i + 1] - topSplits[i]), TRIM_MAT, side * (roofHalfW + 0.02), roofY - 0.005, (topSplits[i] + topSplits[i + 1]) / 2, seam);
    }
  }

  // A, B, C and D pillars, painted so they frame the doors as well as the
  // glass. The B pillar takes the trim colour, because a body coloured pillar
  // merges with the dark panes on exactly the cars whose paint is darkest.
  const pillarCap = bodyLuma(bodyColor) < 0.34 ? 0xd0d7dc : 0x2a2f34;
  for (const side of [-1, 1]) {
    beam(group, [side * beltHalfW, beltY, frontZ], [side * roofHalfW, roofY, roofFrontZ], pillar, paint);
    beam(group, [side * beltHalfW, beltY, rearZ], [side * roofHalfW, roofY, roofRearZ], pillar, paint);
    if (bPillarZ !== null) {
      beam(group, [side * beltHalfW, beltY, bPillarZ], [side * roofHalfW, roofY, bPillarZ], pillar, TRIM_MAT, pillarCap);
    }
    if (cPillarZ !== null) {
      beam(group, [side * beltHalfW, beltY, cPillarZ], [side * roofHalfW, roofY, cPillarZ], pillar, paint);
    }
  }

  // Windshield and backlight lean in from the belt line to the roof.
  const windshield = quadPane(group, [
    [-roofHalfW + 0.04, roofY, roofFrontZ],
    [roofHalfW - 0.04, roofY, roofFrontZ],
    [-beltHalfW + 0.04, beltY, frontZ + 0.03],
    [beltHalfW - 0.04, beltY, frontZ + 0.03],
  ], CABIN_GLASS_MAT, SCREEN_GLASS);
  quadPane(group, [
    [-roofHalfW + 0.04, roofY, roofRearZ],
    [roofHalfW - 0.04, roofY, roofRearZ],
    [-beltHalfW + 0.04, beltY, rearZ - 0.03],
    [beltHalfW - 0.04, beltY, rearZ - 0.03],
  ], CABIN_GLASS_MAT, SCREEN_GLASS);

  // Trim down the A and C pillars along the edge of each screen. It is the
  // frame that makes the rear glass read as a window from the chase camera.
  for (const side of [-1, 1]) {
    beam(group, [side * (beltHalfW - 0.055), beltY, frontZ + 0.03], [side * (roofHalfW - 0.055), roofY, roofFrontZ], 0.05, TRIM_MAT, accent);
    beam(group, [side * (beltHalfW - 0.055), beltY, rearZ - 0.03], [side * (roofHalfW - 0.055), roofY, roofRearZ], 0.05, TRIM_MAT, accent);
  }

  // Rubber seals along the top and bottom of the screens, so the glass sits
  // inside a frame instead of butting straight into the paint.
  const screenW = (beltHalfW - 0.05) * 2;
  const roofW = (roofHalfW - 0.03) * 2;
  part(group, screenW, 0.06, 0.07, TRIM_MAT, 0, beltY + 0.02, frontZ + 0.02, accent);
  part(group, screenW, 0.06, 0.07, TRIM_MAT, 0, beltY + 0.02, rearZ - 0.02, accent);
  part(group, roofW, 0.05, 0.07, TRIM_MAT, 0, roofY - 0.015, roofFrontZ, accent);
  part(group, roofW, 0.05, 0.07, TRIM_MAT, 0, roofY - 0.015, roofRearZ, accent);

  // The cabin lining: a low floor, door cards up past the belt, front and rear
  // bulkheads and a headliner. The lower body is open over the cabin, so this
  // is what the interior camera actually sits inside.
  if (floorY !== null) {
    // Grey rather than near-black: the roof cuts the sun off the cabin, so
    // these surfaces are lit by the hemisphere and the cabin lamp alone.
    const lining = 0x2c3136;
    const panel = 0x373d42;
    const headliner = 0x3e444a;
    const cabW = (beltHalfW - 0.04) * 2;
    const cabinLen = Math.abs(frontZ - rearZ);
    const cabinMid = (frontZ + rearZ) / 2;
    const sideTop = beltY + 0.08;
    part(group, cabW, 0.06, cabinLen, TRIM_MAT, 0, floorY, cabinMid, lining);
    for (const side of [-1, 1]) {
      part(
        group,
        0.04,
        sideTop - floorY,
        cabinLen,
        TRIM_MAT,
        side * (beltHalfW - 0.03),
        (floorY + sideTop) / 2,
        cabinMid,
        panel,
      );
    }
    part(group, cabW, beltY - floorY, 0.05, TRIM_MAT, 0, (floorY + beltY) / 2, frontZ - 0.03, panel);
    part(group, cabW, beltY - floorY, 0.05, TRIM_MAT, 0, (floorY + beltY) / 2, rearZ + 0.03, panel);
    part(
      group,
      (roofHalfW - 0.04) * 2,
      0.04,
      Math.abs(roofFrontZ - roofRearZ) - 0.04,
      TRIM_MAT,
      0,
      roofY - 0.02,
      (roofFrontZ + roofRearZ) / 2,
      headliner,
    );
    group.userData.cabinFloorY = floorY;
  }
  group.userData.cabinFrontZ = frontZ;
  // The panes are clear, so this car can carry a visible driver.
  group.userData.seeThrough = true;
  return windshield;
}

// A dark fender lip around each wheel. It breaks up the flat slab side and
// frames the tyre, which is most of what makes a low poly car read as a car
// from the chase camera.
function addWheelArches(group, wheels, halfW, bodyColor) {
  const { accent } = trimPalette(bodyColor);
  for (const wheel of wheels) {
    const radius = wheel.radius + 0.055;
    const geo = new THREE.TorusGeometry(radius, 0.035, 4, 12, Math.PI);
    geo.rotateY(Math.PI / 2);
    paintGeo(geo, accent);
    const pos = wheel.steer.position;
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(geo.clone(), TRIM_MAT);
      mesh.position.set(side * (halfW + 0.03), pos.y, pos.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // Inner fender. The body is hollow over the cabin now, so without this the
    // top of a tyre pokes through the door card into the cabin.
    const scale = wheel.radius / 0.34;
    const innerX = Math.abs(pos.x) - 0.12 * scale - 0.02;
    for (const side of [-1, 1]) {
      part(
        group,
        0.04,
        wheel.radius * 2 + 0.15,
        wheel.radius * 2 + 0.16,
        TRIM_MAT,
        side * innerX,
        pos.y,
        pos.z,
        0x16191c,
      );
    }
  }
}

// A thin trim frame around a box shaped side window. The vans, buses and
// trucks keep their glass as boxes, so without this the panes read as flat
// decals on the body.
function frameSideWindow(group, side, x, y, z, h, d, color) {
  const fx = side * (x + 0.015);
  part(group, 0.035, 0.05, d + 0.1, TRIM_MAT, fx, y + h / 2, z, color);
  part(group, 0.035, 0.05, d + 0.1, TRIM_MAT, fx, y - h / 2, z, color);
  part(group, 0.035, h, 0.05, TRIM_MAT, fx, y, z + d / 2, color);
  part(group, 0.035, h, 0.05, TRIM_MAT, fx, y, z - d / 2, color);
}

// A dashboard and a steering wheel, so the first person camera has something
// to sit behind. The body shell is invisible from the inside, so without these
// the driver view is nothing but the road. Distances are measured from the
// seat: a wheel at arm's length instead of against the lens, with a shallow
// dash and a column behind it.
function addCabinInterior(group, mat, built, seat) {
  const eyeY = seat.y;
  // Run the dash from just behind the wheel to the firewall, so it reads as a
  // full-width dashboard rather than a slab floating mid-cabin.
  const dashFront = (group.userData.cabinFrontZ ?? seat.z + 0.8) - 0.08;
  const dashBack = seat.z + 0.55;
  const dashDepth = Math.max(0.12, dashFront - dashBack);
  part(group, built.width * 0.8, 0.16, dashDepth, mat, 0, eyeY - 0.31, (dashFront + dashBack) / 2, 0x2f353a);

  const hub = new THREE.Group();
  hub.position.set(seat.x, eyeY - 0.3, seat.z + 0.48);
  hub.rotation.x = 0.35;
  const spin = new THREE.Group();
  const rim = new THREE.TorusGeometry(0.16, 0.026, 6, 14);
  const boss = new THREE.BoxGeometry(0.07, 0.065, 0.065);
  const spoke = new THREE.BoxGeometry(0.055, 0.15, 0.045);
  spoke.translate(0, -0.095, 0);
  const wheel = paintGeo(mergeGeometries([rim, boss, spoke], false), 0x24292e);
  const mesh = new THREE.Mesh(wheel, mat);
  mesh.castShadow = true;
  spin.add(mesh);
  hub.add(spin);
  group.add(hub);

  // Column from the wheel back to the dash.
  part(group, 0.07, 0.07, 0.16, mat, seat.x, eyeY - 0.33, seat.z + 0.53, 0x24292e);

  // Driver and passenger seats, with a pedestal down to the cabin floor, plus
  // a low console between them. The floor comes from the cabin lining built by
  // the greenhouse (cars) or the cab shell (vans, buses, trucks).
  const floorY = group.userData.cabinFloorY ?? eyeY - 0.72;
  const cushionTop = eyeY - 0.4;
  const cushionH = 0.15;
  const cushionBottom = cushionTop - cushionH;
  const passengerX = seat.x === 0 ? 0.36 : -seat.x;
  for (const x of [seat.x, passengerX]) {
    part(group, 0.52, cushionH, 0.52, mat, x, cushionTop - cushionH / 2, seat.z + 0.05, 0x3d4349);
    const pedestalH = Math.max(0.06, cushionBottom - floorY);
    part(group, 0.4, pedestalH, 0.4, mat, x, floorY + pedestalH / 2, seat.z + 0.05, 0x272c30);
    const back = part(group, 0.52, 0.58, 0.13, mat, x, cushionTop + 0.26, seat.z - 0.27, 0x3d4349);
    back.rotation.x = -0.12;
  }
  part(group, 0.18, 0.34, 0.85, mat, 0, floorY + 0.17, seat.z - 0.08, 0x272c30);
  return spin;
}

// A driver sitting behind the wheel, so a car with somebody in it reads from
// outside. He is merged into one vertex coloured mesh with the shared trim
// material, and kept out of the body merge so the player can hide him when
// they take the seat in the game or in the collection.
const DRIVER_SHIRTS = [0x2b3440, 0x3a3f47, 0x6b2f2f, 0x2f4f3a, 0x4a4d52, 0x7a5a3a, 0x3c3f6b, 0x8a4a2c, 0xc8c2b4];
const DRIVER_SKINS = [0xf1c9a5, 0xe4b58f, 0xd39c74, 0xbe8359, 0xa06b46, 0x825536, 0x633f27];
const DRIVER_HAIR = [0x14100d, 0x231812, 0x33231a, 0x4a3120, 0x6a4a2c, 0x8c8c8a, 0xd8d4cb];

function addSeatedDriver(group, seat) {
  const pick = (list) => list[(Math.random() * list.length) | 0];
  const skin = pick(DRIVER_SKINS);
  const hair = pick(DRIVER_HAIR);
  const shirt = pick(DRIVER_SHIRTS);
  const x = seat.x;
  const eye = seat.y;
  const z = seat.z;
  const geos = [];
  const box = (w, h, d, ox, oy, oz, color) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    paintGeo(geo, color);
    geo.translate(ox, oy, oz);
    geos.push(geo);
  };
  // The seat height is the camera eye, so the head starts at eye level and
  // stays under the roof even in the low sports car. Torso, shoulders, neck.
  box(0.42, 0.46, 0.26, x, eye - 0.42, z - 0.16, shirt);
  box(0.46, 0.12, 0.28, x, eye - 0.19, z - 0.18, shirt);
  box(0.1, 0.08, 0.1, x, eye - 0.09, z - 0.16, skin);
  // Head and hair, with a cap on some of them for variety.
  box(0.21, 0.22, 0.21, x, eye + 0.02, z - 0.16, skin);
  box(0.22, 0.075, 0.22, x, eye + 0.14, z - 0.17, hair);
  box(0.22, 0.14, 0.05, x, eye + 0.06, z - 0.27, hair);
  if (Math.random() < 0.3) {
    const cap = pick([0x2b2b2e, 0x8c2f2f, 0x2f4a6b, 0x33363b]);
    box(0.23, 0.06, 0.23, x, eye + 0.175, z - 0.16, cap);
    box(0.17, 0.03, 0.12, x, eye + 0.16, z - 0.01, cap);
  }
  // Arms reaching for the wheel, with hands resting on the rim.
  for (const side of [-1, 1]) {
    const arm = new THREE.BoxGeometry(0.12, 0.58, 0.13);
    paintGeo(arm, shirt);
    arm.rotateX(-1.38);
    arm.translate(x + side * 0.155, eye - 0.305, z + 0.155);
    geos.push(arm);
    box(0.1, 0.09, 0.1, x + side * 0.11, eye - 0.37, z + 0.45, skin);
  }
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), TRIM_MAT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// The box-bodied vehicles are one painted shell, and a box is invisible from
// the inside. This lining gives the cab a floor, headliner and door cards,
// closes the back, and frames the windshield opening, so the interior view
// looks out through the windshield instead of straight through the body.
function addCabShell(group, spec) {
  const {
    cx = 0, halfW, floorY, roofY, frontZ, backZ,
    windowBottomY, windowTopY, glassHalfW, glassBottomY, glassTopY,
  } = spec;
  const depth = frontZ - backZ;
  const zMid = (frontZ + backZ) / 2;
  const lining = 0x272c31;
  const headliner = 0x383e44;

  part(group, halfW * 2, 0.05, depth, TRIM_MAT, cx, floorY + 0.025, zMid, lining);
  part(group, halfW * 2, 0.05, depth, TRIM_MAT, cx, roofY - 0.025, zMid, headliner);

  for (const side of [-1, 1]) {
    const x = cx + side * (halfW - 0.02);
    part(group, 0.04, windowBottomY - floorY, depth, TRIM_MAT, x, (floorY + windowBottomY) / 2, zMid, lining);
    part(group, 0.04, roofY - windowTopY, depth, TRIM_MAT, x, (windowTopY + roofY) / 2, zMid, headliner);
  }

  // Rear bulkhead behind the seats.
  part(group, halfW * 2, roofY - floorY, 0.06, TRIM_MAT, cx, (floorY + roofY) / 2, backZ + 0.03, lining);

  // Firewall under the windshield, header above it, and a pillar either side.
  const zFront = frontZ - 0.03;
  part(group, halfW * 2, glassBottomY - floorY, 0.06, TRIM_MAT, cx, (floorY + glassBottomY) / 2, zFront, lining);
  part(group, halfW * 2, roofY - glassTopY, 0.06, TRIM_MAT, cx, (glassTopY + roofY) / 2, zFront, headliner);
  for (const side of [-1, 1]) {
    part(
      group,
      halfW - glassHalfW,
      roofY - floorY,
      0.06,
      TRIM_MAT,
      cx + (side * (glassHalfW + halfW)) / 2,
      (floorY + roofY) / 2,
      zFront,
      lining,
    );
  }
  group.userData.cabinFloorY = floorY;
  group.userData.cabinFrontZ = frontZ;
}

function buildSedan(group, color, taxi) {
  const paint = solid(color, 0.55, 0.08);
  const dark = TRIM_MAT;
  addCarBody(group, paint, {
    w: 1.78, bottom: 0.47, top: 0.97,
    zFront: 2.175, zBack: -2.175,
    cabinFrontZ: 0.8, cabinRearZ: -1.25,
    cabinHalfW: 0.8,
  });
  addGreenhouse(group, {
    paint, bodyColor: color,
    beltY: 0.97, roofY: 1.64,
    frontZ: 0.8, rearZ: -1.25,
    roofFrontZ: 0.48, roofRearZ: -1.05,
    beltHalfW: 0.8, roofHalfW: 0.72,
    bPillarZ: -0.225,
    floorY: 0.57,
  });
  part(group, 1.82, 0.16, 0.14, dark, 0, 0.42, 2.2);
  part(group, 1.82, 0.16, 0.14, dark, 0, 0.42, -2.2);
  part(group, 0.95, 0.22, 0.06, dark, 0, 0.58, 2.2);
  part(group, 0.22, 0.14, 0.06, glow(0xfff1cc, 0.7), -0.58, 0.62, 2.22);
  part(group, 0.22, 0.14, 0.06, glow(0xfff1cc, 0.7), 0.58, 0.62, 2.22);
  const tailL = part(group, 0.28, 0.12, 0.06, glow(0xff2a2a, 0.35).clone(), -0.62, 0.66, -2.22);
  const tailR = part(group, 0.28, 0.12, 0.06, glow(0xff2a2a, 0.35).clone(), 0.62, 0.66, -2.22);
  part(group, 0.42, 0.12, 0.04, solid(0xd9d3c4, 0.5), 0, 0.5, -2.24);
  addCarTrim(group, {
    paint, dark, bodyColor: color,
    halfW: 0.89, frontZ: 2.2, rearZ: -2.2, beltY: 1.04,
    sillY: 0.47, bodyTopY: 0.97,
    cabinFrontZ: 0.8, cabinRearZ: -1.25,
    doors: 2,
    deckRearZ: -1.45,
    hood: true,
  });
  if (taxi) {
    part(group, 0.46, 0.12, 0.28, glow(0xfff6d8, 0.5), 0, 1.78, -0.15);
  }
  const wheels = [
    addWheel(group, -0.82, wheelY(), 1.38, true),
    addWheel(group, 0.82, wheelY(), 1.38, true),
    addWheel(group, -0.82, wheelY(), -1.38, false),
    addWheel(group, 0.82, wheelY(), -1.38, false),
  ];
  addWheelArches(group, wheels, 0.89, color);
  return { wheels, tails: [tailL, tailR], length: 4.45, width: 1.85, radius: 1.7 };
}

function buildHatchback(group, color) {
  const paint = solid(color, 0.55, 0.08);
  const dark = TRIM_MAT;
  addCarBody(group, paint, {
    w: 1.7, bottom: 0.45, top: 0.95,
    zFront: 1.875, zBack: -1.875,
    cabinFrontZ: 0.82, cabinRearZ: -1.55,
    cabinHalfW: 0.76,
  });
  addGreenhouse(group, {
    paint, bodyColor: color,
    beltY: 0.95, roofY: 1.58,
    frontZ: 0.82, rearZ: -1.55,
    roofFrontZ: 0.55, roofRearZ: -1.42,
    beltHalfW: 0.76, roofHalfW: 0.69,
    bPillarZ: -0.1, cPillarZ: -1.2,
    floorY: 0.55,
  });
  part(group, 1.74, 0.14, 0.14, dark, 0, 0.42, 1.9);
  part(group, 1.74, 0.14, 0.14, dark, 0, 0.42, -1.9);
  part(group, 0.9, 0.2, 0.06, dark, 0, 0.56, 1.9);
  part(group, 0.2, 0.13, 0.06, glow(0xfff1cc, 0.7), -0.56, 0.6, 1.92);
  part(group, 0.2, 0.13, 0.06, glow(0xfff1cc, 0.7), 0.56, 0.6, 1.92);
  const tailL = part(group, 0.24, 0.16, 0.06, glow(0xff2a2a, 0.35).clone(), -0.62, 0.68, -1.9);
  const tailR = part(group, 0.24, 0.16, 0.06, glow(0xff2a2a, 0.35).clone(), 0.62, 0.68, -1.9);
  addCarTrim(group, {
    paint, dark, bodyColor: color,
    halfW: 0.85, frontZ: 1.9, rearZ: -1.9, beltY: 1.02,
    sillY: 0.45, bodyTopY: 0.95,
    cabinFrontZ: 0.82, cabinRearZ: -1.2,
    doors: 2,
    deckRearZ: null,
    hood: true,
  });
  const wheels = [
    addWheel(group, -0.78, wheelY(), 1.2, true),
    addWheel(group, 0.78, wheelY(), 1.2, true),
    addWheel(group, -0.78, wheelY(), -1.2, false),
    addWheel(group, 0.78, wheelY(), -1.2, false),
  ];
  addWheelArches(group, wheels, 0.85, color);
  return { wheels, tails: [tailL, tailR], length: 3.9, width: 1.78, radius: 1.55 };
}

function buildSuv(group, color) {
  const paint = solid(color, 0.6, 0.06);
  const dark = TRIM_MAT;
  addCarBody(group, paint, {
    w: 1.92, bottom: 0.53, top: 1.31,
    zFront: 2.275, zBack: -2.275,
    cabinFrontZ: 1.0, cabinRearZ: -2.05,
    cabinHalfW: 0.9,
  });
  addGreenhouse(group, {
    paint, bodyColor: color,
    beltY: 1.31, roofY: 2.06,
    frontZ: 1.0, rearZ: -2.05,
    roofFrontZ: 0.72, roofRearZ: -1.98,
    beltHalfW: 0.9, roofHalfW: 0.83,
    bPillarZ: -0.175, cPillarZ: -1.35,
    floorY: 0.63,
  });
  part(group, 0.08, 0.08, 2.55, dark, -0.66, 2.16, -0.63);
  part(group, 0.08, 0.08, 2.55, dark, 0.66, 2.16, -0.63);
  part(group, 1.96, 0.2, 0.16, dark, 0, 0.46, 2.3);
  part(group, 1.96, 0.2, 0.16, dark, 0, 0.46, -2.3);
  part(group, 0.3, 0.18, 0.06, glow(0xfff1cc, 0.7), -0.64, 0.78, 2.32);
  part(group, 0.3, 0.18, 0.06, glow(0xfff1cc, 0.7), 0.64, 0.78, 2.32);
  const tailL = part(group, 0.28, 0.18, 0.06, glow(0xff2a2a, 0.35).clone(), -0.68, 0.82, -2.32);
  const tailR = part(group, 0.28, 0.18, 0.06, glow(0xff2a2a, 0.35).clone(), 0.68, 0.82, -2.32);
  addCarTrim(group, {
    paint, dark, bodyColor: color,
    halfW: 0.96, frontZ: 2.3, rearZ: -2.3, beltY: 1.3,
    sillY: 0.53, bodyTopY: 1.31,
    cabinFrontZ: 1.0, cabinRearZ: -1.35,
    doors: 2,
    deckRearZ: null,
    hood: true,
  });
  const wheels = [
    addWheel(group, -0.86, wheelY(1.08), 1.45, true, 1.08),
    addWheel(group, 0.86, wheelY(1.08), 1.45, true, 1.08),
    addWheel(group, -0.86, wheelY(1.08), -1.45, false, 1.08),
    addWheel(group, 0.86, wheelY(1.08), -1.45, false, 1.08),
  ];
  addWheelArches(group, wheels, 0.96, color);
  return { wheels, tails: [tailL, tailR], length: 4.7, width: 1.98, radius: 1.85 };
}

function buildPickup(group, color) {
  const paint = solid(color, 0.58, 0.07);
  const dark = TRIM_MAT;
  part(group, 1.88, 0.3, 5.15, paint, 0, 0.62, 0);
  part(group, 1.86, 0.42, 1.35, paint, 0, 0.92, 1.85);
  addCarBody(group, paint, {
    w: 1.84, bottom: 0.8, top: 1.5,
    zFront: 1.425, zBack: -0.325,
    cabinFrontZ: 1.05, cabinRearZ: -0.05,
    cabinHalfW: 0.8,
  });
  addGreenhouse(group, {
    paint, bodyColor: color,
    beltY: 1.5, roofY: 2.02,
    frontZ: 1.05, rearZ: -0.05,
    roofFrontZ: 0.9, roofRearZ: -0.02,
    beltHalfW: 0.8, roofHalfW: 0.74,
    floorY: 0.9,
  });
  part(group, 1.8, 0.16, 2.3, paint, 0, 0.92, -1.45);
  part(group, 0.08, 0.45, 2.3, paint, -0.9, 1.15, -1.45);
  part(group, 0.08, 0.45, 2.3, paint, 0.9, 1.15, -1.45);
  part(group, 1.8, 0.45, 0.08, paint, 0, 1.15, -2.6);
  part(group, 1.94, 0.18, 0.16, dark, 0, 0.42, 2.56);
  part(group, 1.94, 0.18, 0.16, dark, 0, 0.42, -2.64);
  part(group, 0.32, 0.18, 0.06, glow(0xfff1cc, 0.7), -0.62, 0.8, 2.58);
  part(group, 0.32, 0.18, 0.06, glow(0xfff1cc, 0.7), 0.62, 0.8, 2.58);
  const tailL = part(group, 0.28, 0.18, 0.06, glow(0xff2a2a, 0.35).clone(), -0.68, 0.78, -2.65);
  const tailR = part(group, 0.28, 0.18, 0.06, glow(0xff2a2a, 0.35).clone(), 0.68, 0.78, -2.65);
  addCarTrim(group, {
    paint, dark, bodyColor: color,
    halfW: 0.94, frontZ: 2.56, rearZ: -2.64, beltY: 1.5,
    sillY: 0.8, bodyTopY: 1.5,
    cabinFrontZ: 1.05, cabinRearZ: -0.05,
    doors: 1,
    deckRearZ: null,
    trimW: 0.92,
  });
  const wheels = [
    addWheel(group, -0.88, wheelY(1.12), 1.65, true, 1.12),
    addWheel(group, 0.88, wheelY(1.12), 1.65, true, 1.12),
    addWheel(group, -0.88, wheelY(1.12), -1.65, false, 1.12),
    addWheel(group, 0.88, wheelY(1.12), -1.65, false, 1.12),
  ];
  addWheelArches(group, wheels, 0.94, color);
  return { wheels, tails: [tailL, tailR], length: 5.3, width: 1.96, radius: 2.05 };
}

function buildSports(group, color) {
  const paint = solid(color, 0.5, 0.15);
  const dark = TRIM_MAT;
  addCarBody(group, paint, {
    w: 1.9, bottom: 0.39, top: 0.81,
    zFront: 2.175, zBack: -2.175,
    cabinFrontZ: 0.72, cabinRearZ: -1.35,
    cabinHalfW: 0.78,
  });
  part(group, 1.78, 0.24, 1.1, paint, 0, 0.78, 1.75);
  addGreenhouse(group, {
    paint, bodyColor: color,
    beltY: 0.81, roofY: 1.24,
    frontZ: 0.72, rearZ: -1.35,
    roofFrontZ: 0.42, roofRearZ: -1.15,
    beltHalfW: 0.78, roofHalfW: 0.7,
    pillar: 0.075,
    floorY: 0.47,
  });
  part(group, 0.08, 0.28, 0.1, dark, -0.55, 1.14, -2.0);
  part(group, 0.08, 0.28, 0.1, dark, 0.55, 1.14, -2.0);
  part(group, 1.7, 0.07, 0.34, paint, 0, 1.28, -2.0);
  part(group, 1.94, 0.14, 0.14, dark, 0, 0.38, 2.2);
  part(group, 1.94, 0.14, 0.14, dark, 0, 0.38, -2.2);
  part(group, 0.26, 0.12, 0.06, glow(0xfff1cc, 0.8), -0.62, 0.52, 2.22);
  part(group, 0.26, 0.12, 0.06, glow(0xfff1cc, 0.8), 0.62, 0.52, 2.22);
  const tailL = part(group, 0.3, 0.1, 0.06, glow(0xff2a2a, 0.35).clone(), -0.64, 0.55, -2.22);
  const tailR = part(group, 0.3, 0.1, 0.06, glow(0xff2a2a, 0.35).clone(), 0.64, 0.55, -2.22);
  addCarTrim(group, {
    paint, dark, bodyColor: color,
    halfW: 0.95, frontZ: 2.2, rearZ: -2.2, beltY: 0.84,
    sillY: 0.39, bodyTopY: 0.81,
    cabinFrontZ: 0.65, cabinRearZ: -0.6,
    doors: 1,
    deckRearZ: -1.55,
  });
  const wheels = [
    addWheel(group, -0.86, wheelY(), 1.45, true),
    addWheel(group, 0.86, wheelY(), 1.45, true),
    addWheel(group, -0.86, wheelY(), -1.45, false),
    addWheel(group, 0.86, wheelY(), -1.45, false),
  ];
  addWheelArches(group, wheels, 0.95, color);
  return { wheels, tails: [tailL, tailR], length: 4.45, width: 1.98, radius: 1.7 };
}

function buildVan(group, color) {
  const paint = solid(color, 0.62, 0.05);
  const dark = TRIM_MAT;
  const glass = GLASS_MAT;
  part(group, 1.9, 1.45, 4.7, paint, 0, 1.12, 0);
  part(group, 1.55, 0.55, 0.06, glass, 0, 1.45, 2.38);
  part(group, 0.05, 0.5, 0.7, glass, -0.96, 1.5, 1.7);
  part(group, 0.05, 0.5, 0.7, glass, 0.96, 1.5, 1.7);
  const vanTrim = trimPalette(color).accent;
  for (const side of [-1, 1]) frameSideWindow(group, side, 0.96, 1.5, 1.7, 0.5, 0.7, vanTrim);
  part(group, 1.58, 0.62, 0.04, dark, 0, 1.5, -2.355, vanTrim);
  part(group, 1.46, 0.5, 0.06, glass, 0, 1.5, -2.375);
  part(group, 1.92, 0.18, 0.12, dark, 0, 0.48, 2.4);
  part(group, 1.92, 0.18, 0.12, dark, 0, 0.48, -2.4);
  part(group, 0.24, 0.16, 0.06, glow(0xfff1cc, 0.6), -0.62, 0.72, 2.4);
  part(group, 0.24, 0.16, 0.06, glow(0xfff1cc, 0.6), 0.62, 0.72, 2.4);
  const tailL = part(group, 0.26, 0.16, 0.06, glow(0xff2a2a, 0.35).clone(), -0.7, 0.78, -2.4);
  const tailR = part(group, 0.26, 0.16, 0.06, glow(0xff2a2a, 0.35).clone(), 0.7, 0.78, -2.4);
  addCarTrim(group, {
    paint, dark, bodyColor: color,
    halfW: 0.95, frontZ: 2.4, rearZ: -2.4, beltY: 1.25,
    sillY: 0.4, bodyTopY: 1.845,
    cabinFrontZ: 2.0, cabinRearZ: 1.35,
    doors: 1,
    exhaust: false,
    deckRearZ: null,
  });
  addCabShell(group, {
    halfW: 0.9, floorY: 0.48, roofY: 1.8,
    frontZ: 2.32, backZ: 0.6,
    windowBottomY: 1.25, windowTopY: 1.75,
    glassHalfW: 0.78, glassBottomY: 1.18, glassTopY: 1.73,
  });
  // Rear cargo doors: the centre split and the two handles are what tell you
  // the back of the van opens.
  part(group, 0.04, 0.76, 0.03, dark, 0, 0.81, -2.36, GROOVE_COLOR);
  part(group, 0.3, 0.08, 0.05, dark, -0.42, 0.98, -2.375, vanTrim);
  part(group, 0.3, 0.08, 0.05, dark, 0.42, 0.98, -2.375, vanTrim);
  const wheels = [
    addWheel(group, -0.9, wheelY(), 1.5, true),
    addWheel(group, 0.9, wheelY(), 1.5, true),
    addWheel(group, -0.9, wheelY(), -1.5, false),
    addWheel(group, 0.9, wheelY(), -1.5, false),
  ];
  addWheelArches(group, wheels, 0.95, color);
  return { wheels, tails: [tailL, tailR], length: 4.85, width: 1.95, radius: 1.85 };
}

function buildBus(group, color) {
  const paint = solid(color, 0.6, 0.05);
  const dark = TRIM_MAT;
  const glass = GLASS_MAT;
  part(group, 2.45, 2.5, 10.4, paint, 0, 1.7, 0);
  part(group, 2.4, 0.12, 10.4, paint, 0, 3.0, 0);
  part(group, 0.06, 0.85, 8.6, glass, -1.24, 2.35, -0.3);
  part(group, 0.06, 0.85, 8.6, glass, 1.24, 2.35, -0.3);
  const busTrim = trimPalette(color).accent;
  for (const side of [-1, 1]) {
    part(group, 0.04, 0.05, 8.7, dark, side * 1.25, 1.93, -0.3, busTrim);
    part(group, 0.04, 0.05, 8.7, dark, side * 1.25, 2.77, -0.3, busTrim);
    for (let z = -4.4; z <= 4.4; z += 1.1) {
      part(group, 0.04, 0.9, 0.06, dark, side * 1.25, 2.35, z, busTrim);
    }
  }
  part(group, 2.1, 0.9, 0.06, glass, 0, 2.3, 5.22);
  part(group, 1.9, 0.7, 0.06, glass, 0, 2.3, -5.22);
  const busSeam = trimPalette(color).seam;
  part(group, 0.07, 1.9, 0.9, dark, 1.24, 1.55, 3.5, busSeam);
  part(group, 0.07, 1.9, 0.9, dark, 1.24, 1.55, 1.5, busSeam);
  part(group, 0.03, 0.08, 0.3, dark, 1.285, 1.55, 3.32, busTrim);
  part(group, 0.03, 0.08, 0.3, dark, 1.285, 1.55, 1.32, busTrim);
  part(group, 2.5, 0.22, 0.16, dark, 0, 0.52, 5.28);
  part(group, 2.5, 0.22, 0.16, dark, 0, 0.52, -5.28);
  part(group, 0.32, 0.2, 0.06, glow(0xfff1cc, 0.7), -0.85, 0.82, 5.3);
  part(group, 0.32, 0.2, 0.06, glow(0xfff1cc, 0.7), 0.85, 0.82, 5.3);
  const tailL = part(group, 0.3, 0.22, 0.06, glow(0xff2a2a, 0.35).clone(), -0.85, 0.88, -5.3);
  const tailR = part(group, 0.3, 0.22, 0.06, glow(0xff2a2a, 0.35).clone(), 0.85, 0.88, -5.3);
  addCarTrim(group, {
    paint, dark, bodyColor: color,
    halfW: 1.225, frontZ: 5.28, rearZ: -5.28, beltY: 1.93,
    sillY: 0.45, bodyTopY: 2.95,
    cabinFrontZ: 4.9, cabinRearZ: -4.6,
    doors: 0,
    exhaust: false,
    deckRearZ: null,
  });
  addCabShell(group, {
    halfW: 1.19, floorY: 0.55, roofY: 2.9,
    frontZ: 5.16, backZ: 3.4,
    windowBottomY: 1.93, windowTopY: 2.77,
    glassHalfW: 1.05, glassBottomY: 1.85, glassTopY: 2.75,
  });
  const wheels = [
    addWheel(group, -1.06, wheelY(1.25), 3.55, true, 1.25),
    addWheel(group, 1.06, wheelY(1.25), 3.55, true, 1.25),
    addWheel(group, -1.06, wheelY(1.25), -3.3, false, 1.25),
    addWheel(group, 1.06, wheelY(1.25), -3.3, false, 1.25),
  ];
  addWheelArches(group, wheels, 1.225, color);
  return { wheels, tails: [tailL, tailR], length: 10.6, width: 2.5, radius: 5.3 };
}

function buildTruck(group, color) {
  const paint = solid(color, 0.62, 0.05);
  const dark = TRIM_MAT;
  const glass = GLASS_MAT;
  part(group, 2.3, 0.32, 6.3, dark, 0, 0.62, -0.1);
  part(group, 2.35, 2.35, 4.6, paint, 0, 1.75, -1.0);
  part(group, 2.1, 2.0, 0.06, solid(0x2a2d30, 0.55, 0.1), 0, 1.7, -3.32);
  part(group, 2.2, 1.7, 2.0, paint, 0, 1.35, 2.2);
  part(group, 2.0, 0.75, 0.06, glass, 0, 1.75, 3.22);
  part(group, 0.06, 0.6, 1.2, glass, -1.11, 1.72, 2.2);
  part(group, 0.06, 0.6, 1.2, glass, 1.11, 1.72, 2.2);
  const truckTrim = trimPalette(color).accent;
  for (const side of [-1, 1]) frameSideWindow(group, side, 1.11, 1.72, 2.2, 0.6, 1.2, truckTrim);
  // Split line and handles on the cargo box doors.
  part(group, 0.035, 1.9, 0.03, dark, 0, 1.7, -3.36, GROOVE_COLOR);
  part(group, 0.3, 0.09, 0.05, dark, -0.45, 1.25, -3.375, truckTrim);
  part(group, 0.3, 0.09, 0.05, dark, 0.45, 1.25, -3.375, truckTrim);
  part(group, 2.4, 0.24, 0.16, dark, 0, 0.5, 3.26);
  part(group, 2.4, 0.24, 0.16, dark, 0, 0.5, -3.36);
  part(group, 0.3, 0.2, 0.06, glow(0xfff1cc, 0.7), -0.8, 0.78, 3.28);
  part(group, 0.3, 0.2, 0.06, glow(0xfff1cc, 0.7), 0.8, 0.78, 3.28);
  const tailL = part(group, 0.28, 0.24, 0.06, glow(0xff2a2a, 0.35).clone(), -0.9, 0.8, -3.38);
  const tailR = part(group, 0.28, 0.24, 0.06, glow(0xff2a2a, 0.35).clone(), 0.9, 0.8, -3.38);
  addCarTrim(group, {
    paint, dark, bodyColor: color,
    halfW: 1.15, frontZ: 3.26, rearZ: -3.36, beltY: 1.42,
    sillY: 0.78, bodyTopY: 2.2,
    cabinFrontZ: 3.2, cabinRearZ: 1.3,
    doors: 1,
    exhaust: false,
    deckRearZ: null,
    trimW: 1.1,
  });
  addCabShell(group, {
    halfW: 1.06, floorY: 0.62, roofY: 2.15,
    frontZ: 3.15, backZ: 1.3,
    windowBottomY: 1.42, windowTopY: 2.02,
    glassHalfW: 1.0, glassBottomY: 1.38, glassTopY: 2.12,
  });
  const wheels = [
    addWheel(group, -0.95, wheelY(1.28), 2.6, true, 1.28),
    addWheel(group, 0.95, wheelY(1.28), 2.6, true, 1.28),
    addWheel(group, -0.95, wheelY(1.28), -1.7, false, 1.28),
    addWheel(group, 0.95, wheelY(1.28), -2.7, false, 1.28),
  ];
  addWheelArches(group, wheels, 1.15, color);
  return { wheels, tails: [tailL, tailR], length: 6.6, width: 2.42, radius: 3.3 };
}
function buildAmbulance(group, color) {
  const paint = solid(color, 0.5, 0.1);
  const red = solid(0xc22a2a, 0.45, 0.1);
  const dark = TRIM_MAT;
  const glass = GLASS_MAT;
  part(group, 2.0, 1.95, 4.8, paint, 0, 1.35, -0.25);
  part(group, 1.9, 0.75, 1.0, paint, 0, 0.9, 2.45);
  const windshield = part(group, 1.7, 0.75, 0.06, glass, 0, 1.65, 2.38);
  windshield.rotation.x = 0.18;
  part(group, 0.05, 0.55, 0.95, glass, -1.0, 1.65, 1.85);
  part(group, 0.05, 0.55, 0.95, glass, 1.0, 1.65, 1.85);
  part(group, 0.04, 0.28, 4.6, red, -1.01, 1.1, -0.3);
  part(group, 0.04, 0.28, 4.6, red, 1.01, 1.1, -0.3);
  for (const side of [-1, 1]) {
    part(group, 0.03, 0.6, 0.2, red, side * 1.02, 1.65, -0.9);
    part(group, 0.03, 0.2, 0.6, red, side * 1.02, 1.65, -0.9);
  }
  part(group, 0.6, 0.2, 0.03, red, 0, 1.55, -2.66);
  part(group, 0.2, 0.6, 0.03, red, 0, 1.55, -2.66);
  part(group, 1.1, 0.14, 0.32, dark, 0, 2.4, 1.9);
  part(group, 0.4, 0.16, 0.28, glow(0xff3030, 0.6), -0.28, 2.42, 1.9);
  part(group, 0.4, 0.16, 0.28, glow(0x2a6cff, 0.6), 0.28, 2.42, 1.9);
  part(group, 2.04, 0.2, 0.16, dark, 0, 0.48, 2.96);
  part(group, 2.04, 0.2, 0.16, dark, 0, 0.48, -2.68);
  part(group, 0.28, 0.18, 0.06, glow(0xfff1cc, 0.7), -0.64, 0.85, 2.98);
  part(group, 0.28, 0.18, 0.06, glow(0xfff1cc, 0.7), 0.64, 0.85, 2.98);
  const tailL = part(group, 0.26, 0.2, 0.06, glow(0xff2a2a, 0.35).clone(), -0.7, 0.85, -2.7);
  const tailR = part(group, 0.26, 0.2, 0.06, glow(0xff2a2a, 0.35).clone(), 0.7, 0.85, -2.7);
  addCarTrim(group, {
    paint, dark, bodyColor: color,
    halfW: 1.0, frontZ: 2.96, rearZ: -2.68, beltY: 1.38,
    sillY: 0.42, bodyTopY: 2.325,
    cabinFrontZ: 2.1, cabinRearZ: 1.3,
    doors: 1,
    deckRearZ: null,
  });
  addCabShell(group, {
    halfW: 0.96, floorY: 0.5, roofY: 2.28,
    frontZ: 2.1, backZ: 0.9,
    windowBottomY: 1.38, windowTopY: 1.92,
    glassHalfW: 0.86, glassBottomY: 1.32, glassTopY: 1.98,
  });
  const wheels = [
    addWheel(group, -0.9, wheelY(), 1.75, true),
    addWheel(group, 0.9, wheelY(), 1.75, true),
    addWheel(group, -0.9, wheelY(), -1.55, false),
    addWheel(group, 0.9, wheelY(), -1.55, false),
  ];
  addWheelArches(group, wheels, 1.0, color);
  return { wheels, tails: [tailL, tailR], length: 5.6, width: 2.04, radius: 2.1 };
}

function buildFireTruck(group, color) {
  const paint = solid(color, 0.55, 0.1);
  const dark = TRIM_MAT;
  const glass = GLASS_MAT;
  const steel = solid(0x9aa0a4, 0.35, 0.45);
  part(group, 2.25, 0.3, 8.2, dark, 0, 0.62, 0);
  part(group, 2.3, 1.85, 2.2, paint, 0, 1.45, 3.0);
  part(group, 2.0, 0.75, 0.06, glass, 0, 1.75, 4.12);
  part(group, 0.06, 0.6, 1.3, glass, -1.16, 1.75, 3.0);
  part(group, 0.06, 0.6, 1.3, glass, 1.16, 1.75, 3.0);
  part(group, 2.4, 2.05, 4.9, paint, 0, 1.75, -1.0);
  for (const z of [0.6, -0.6, -1.8]) {
    part(group, 0.03, 1.2, 1.0, steel, -1.21, 1.55, z);
    part(group, 0.03, 1.2, 1.0, steel, 1.21, 1.55, z);
  }
  part(group, 2.1, 1.7, 0.05, steel, 0, 1.6, -3.47);
  for (const x of [-0.5, 0.5]) {
    part(group, 0.08, 0.08, 4.8, steel, x, 2.95, -1.0);
  }
  for (let i = 0; i < 7; i += 1) {
    part(group, 1.1, 0.06, 0.06, steel, 0, 2.95, -3.0 + i * 0.7);
  }
  part(group, 1.3, 0.14, 0.32, dark, 0, 2.5, 3.0);
  part(group, 0.46, 0.16, 0.28, glow(0xff3030, 0.6), -0.32, 2.52, 3.0);
  part(group, 0.46, 0.16, 0.28, glow(0x2a6cff, 0.6), 0.32, 2.52, 3.0);
  part(group, 2.48, 0.22, 0.16, dark, 0, 0.48, 4.16);
  part(group, 2.48, 0.22, 0.16, dark, 0, 0.48, -3.5);
  part(group, 0.3, 0.2, 0.06, glow(0xfff1cc, 0.7), -0.82, 0.82, 4.18);
  part(group, 0.3, 0.2, 0.06, glow(0xfff1cc, 0.7), 0.82, 0.82, 4.18);
  const tailL = part(group, 0.28, 0.22, 0.06, glow(0xff2a2a, 0.35).clone(), -0.85, 0.85, -3.52);
  const tailR = part(group, 0.28, 0.22, 0.06, glow(0xff2a2a, 0.35).clone(), 0.85, 0.85, -3.52);
  addCarTrim(group, {
    paint, dark, bodyColor: color,
    halfW: 1.15, frontZ: 4.16, rearZ: -3.5, beltY: 1.45,
    sillY: 0.55, bodyTopY: 2.375,
    cabinFrontZ: 4.0, cabinRearZ: 2.2,
    doors: 1,
    exhaust: false,
    deckRearZ: null,
  });
  addCabShell(group, {
    halfW: 1.11, floorY: 0.66, roofY: 2.32,
    frontZ: 4.06, backZ: 2.0,
    windowBottomY: 1.45, windowTopY: 2.05,
    glassHalfW: 1.0, glassBottomY: 1.38, glassTopY: 2.12,
  });
  const wheels = [
    addWheel(group, -1.0, wheelY(1.28), 3.1, true, 1.28),
    addWheel(group, 1.0, wheelY(1.28), 3.1, true, 1.28),
    addWheel(group, -1.0, wheelY(1.28), -1.9, false, 1.28),
    addWheel(group, 1.0, wheelY(1.28), -1.9, false, 1.28),
    addWheel(group, -1.0, wheelY(1.28), -2.9, false, 1.28),
    addWheel(group, 1.0, wheelY(1.28), -2.9, false, 1.28),
  ];
  addWheelArches(group, wheels, 1.15, color);
  return { wheels, tails: [tailL, tailR], length: 7.8, width: 2.48, radius: 4.0 };
}

function buildPolice(group, color) {
  const built = buildSedan(group, color, false);
  const blue = solid(0x1d4f9c, 0.45, 0.1);
  const dark = TRIM_MAT;
  part(group, 0.035, 0.2, 4.2, blue, -0.925, 0.82, 0);
  part(group, 0.035, 0.2, 4.2, blue, 0.925, 0.82, 0);
  part(group, 1.0, 0.12, 0.3, dark, 0, 1.74, -0.15);
  part(group, 0.38, 0.14, 0.26, glow(0xff3030, 0.7), -0.25, 1.76, -0.15);
  part(group, 0.38, 0.14, 0.26, glow(0x2a6cff, 0.7), 0.25, 1.76, -0.15);
  return built;
}
const BUILDERS = {
  sedan: buildSedan,
  taxi: buildSedan,
  hatchback: buildHatchback,
  suv: buildSuv,
  pickup: buildPickup,
  sports: buildSports,
  van: buildVan,
  bus: buildBus,
  truck: buildTruck,
  ambulance: buildAmbulance,
  firetruck: buildFireTruck,
  police: buildPolice,
};

export const VEHICLE_TYPES = Object.keys(BUILDERS);

// Suggested paint for each type. The cheat menu and the collection gallery
// share it, so a car looks the same wherever it is shown.
export const VEHICLE_COLORS = {
  sedan: 0x3f4a52,
  taxi: 0xd6ae2b,
  hatchback: 0xc8c2b4,
  suv: 0x23342c,
  pickup: 0x8a4a2c,
  sports: 0xa32121,
  van: 0x2c3136,
  bus: 0x2f6b4f,
  truck: 0xc9c4b8,
  ambulance: 0xf2f0e8,
  firetruck: 0xc02626,
  police: 0xf2f0e8,
};

const footprints = new Map();

export function vehicleFootprint(type) {
  const key = type in BUILDERS ? type : 'sedan';
  const cached = footprints.get(key);
  if (cached) return cached;
  const group = new THREE.Group();
  const built = BUILDERS[key](group, 0x888888, key === 'taxi');
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
  });
  const size = { length: built.length, width: built.width };
  footprints.set(key, size);
  return size;
}

export function createVehicle(cfg) {
  const group = new THREE.Group();
  const type = cfg.type in BUILDERS ? cfg.type : 'sedan';
  const built = BUILDERS[type](group, cfg.color, type === 'taxi');
  // The front-most glass pane is the windshield. From a camera inside the
  // cabin it would block the view, so it can be hidden for first person.
  const glassParts = [];
  group.traverse((obj) => {
    if (obj.isMesh && (obj.material === GLASS_MAT || obj.material === CABIN_GLASS_MAT)) {
      glassParts.push(obj);
    }
  });
  glassParts.sort((a, b) => b.position.z - a.position.z);
  const windshield = glassParts[0] ?? null;

  let seat;
  if (windshield) {
    seat = {
      x: windshield.position.x === 0 ? -0.36 : windshield.position.x,
      y: windshield.position.y,
      z: windshield.position.z - 0.8,
    };
  } else {
    const box = new THREE.Box3().setFromObject(group);
    seat = { x: -0.36, y: Math.min(2.6, box.max.y - 0.4), z: Math.min(0.1, built.length / 2 - 1.2) };
  }

  // A cabin for the first person camera to sit behind.
  let steering = null;
  const trimMat = group.userData.trimMat;
  if (trimMat && windshield) {
    steering = addCabinInterior(group, trimMat, built, seat);
  }

  // Both brake lights share one material so a single glow drives them.
  if (built.tails.length > 1) {
    const mat = built.tails[0].material;
    for (const tail of built.tails) tail.material = mat;
  }

  // Bake the body down to one mesh per material.
  const keep = new Set();
  if (windshield) keep.add(windshield);
  const byMaterial = mergeVehicleBody(group, keep);
  if (built.tails.length) {
    const mergedTail = byMaterial.get(built.tails[0].material);
    built.tails = mergedTail ? [mergedTail] : [];
  }

  // Only cars with clear glass get a visible driver; a van or a bus hides
  // everything behind its tinted panes, so the mesh would never be seen.
  // Built after the body merge so the driver stays its own mesh and can be
  // hidden when the player takes the seat.
  const driver = cfg.driver && steering && group.userData.seeThrough
    ? addSeatedDriver(group, seat)
    : null;

  const state = {
    group,
    type,
    driveable: !!cfg.driveable,
    x: cfg.x,
    z: cfg.z,
    heading: cfg.heading ?? 0,
    speed: 0,
    steer: 0,
    braking: false,
    length: built.length,
    width: built.width,
    radius: built.radius,
    // Rough momentum proxy: bigger bodies push smaller ones around.
    mass: Math.max(3, built.length * built.width * 0.75),
    knockVX: 0,
    knockVZ: 0,
    knockSpin: 0,
    shoveX: 0,
    shoveZ: 0,
    shoveYaw: 0,
    bounce: 0,
    // How far the body rocks on its springs, which settles back to level, and
    // how far it leans on the ground, which does not. They are kept apart so
    // that the settle does not flatten out a car parked across a slope.
    roll: 0,
    groundRoll: 0,
    // Vertical speed, and whether the wheels are off the ground. A car that has
    // just come over the crest of the hill is in the air, still going the way
    // it was going, and comes down with a shove into the springs.
    vy: 0,
    airborne: false,
    wheels: built.wheels,
    tails: built.tails,
    windshield,
    steering,
    driver,
    seat,
    inUse: false,
    // A car can be driven, pushed or spun at any moment, and the collider is
    // rewritten in place when it moves. So it is never worth indexing: the
    // spatial grid keeps moving colliders on a short list it always checks.
    _aabb: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, moving: true },
    sync() {
      group.rotation.order = 'YXZ';
      group.position.set(this.x, (this.y || 0) + (this.bounce || 0), this.z);
      group.rotation.y = this.heading;
      // `pitch` is the lean of the ground under the car; `roll` is the rock of
      // the springs, and `groundRoll` the lean of the ground across the car.
      group.rotation.x = this.pitch || 0;
      group.rotation.z = (this.roll || 0) + (this.groundRoll || 0);
    },
    aabb() {
      const c = Math.abs(Math.cos(this.heading));
      const s = Math.abs(Math.sin(this.heading));
      return {
        hx: (this.length * s + this.width * c) / 2,
        hz: (this.length * c + this.width * s) / 2,
      };
    },
    collider() {
      const { hx, hz } = this.aabb();
      const box = this._aabb;
      box.minX = this.x - hx;
      box.maxX = this.x + hx;
      box.minZ = this.z - hz;
      box.maxZ = this.z + hz;
      box.obb = true;
      box.x = this.x;
      box.z = this.z;
      box.heading = this.heading;
      box.halfL = this.length / 2;
      box.halfW = this.width / 2;
      return box;
    },
    // Half extent of the body along its own side axis, so a spot beside the
    // car can be placed outside the collider even for a rotated vehicle.
    sideExtent() {
      const c = Math.abs(Math.cos(this.heading));
      const s = Math.abs(Math.sin(this.heading));
      const { hx, hz } = this.aabb();
      return hx * c + hz * s;
    },
    updateVisual(dt) {
      const settle = Math.exp(-7 * dt);
      this.bounce *= settle;
      this.roll *= settle;
      if (Math.abs(this.bounce) < 0.001) this.bounce = 0;
      if (Math.abs(this.roll) < 0.001) this.roll = 0;
      this.sync();
      for (const wheel of this.wheels) {
        wheel.roller.rotation.x += (this.speed / wheel.radius) * dt;
        if (wheel.front) wheel.steer.rotation.y = this.steer;
        // The spring: a wheel pressed up by the ground under it sits higher in
        // its arch. The body has been tipped to match, so this is the last of
        // the travel rather than the whole of it - what is left over is the
        // small difference between one wheel and another.
        if (wheel.at && wheel.travel !== undefined) {
          wheel.steer.position.y = wheel.at.y + wheel.travel;
        }
      }
      if (this.steering) this.steering.rotation.z = -this.steer * 1.7;
      const glowAmount = this.braking ? 1.6 : 0.28;
      for (const tail of this.tails) tail.material.emissiveIntensity = glowAmount;
    },
  };
  state.sync();
  return state;
}
