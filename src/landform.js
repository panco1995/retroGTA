// The shape of the ground, as a list of pieces that each know two things: how
// high the ground is inside them, and what mesh to draw for them.
//
// The hill used to be two things that had to agree: a chain of ifs in
// city.js that said how high the ground was, and a set of hand-rotated boxes
// that drew it. They stopped agreeing - the east arm's deck was drawn as one
// straight slope while the height under it stayed level for its first three
// metres, so the road surface and the ground a car stood on were nearly a
// metre apart.
//
// A feature is the fix: one piece of ground, described once, which is asked
// both questions. A slope is a rectangle with the height at each of its four
// corners, and it answers with the height by interpolating between them, and
// draws itself as the quad through those corners. Ramp, plateau, arm, yard:
// they are all the same shape with different numbers.
//
// The pieces are searched in the order they are written and the first one that
// covers a point wins, so a later feature is laid on top of an earlier one and
// a patch of raised ground does not have to cut a hole in the flat around it.

import * as THREE from 'three';

// A quad of ground: four corners in the XZ plane, each with its own height.
//
// The corners are given as [x, z, y]. They must go round the quad in order.
// The height inside is the bilinear blend of the four, which on a quad whose
// corners are level along one axis is exactly the plane through it, and on a
// twisted quad is the flattest surface that meets all four corners.
export function slope(corners, opts = {}) {
  const [a, b, c, d] = corners;
  const minX = Math.min(a[0], b[0], c[0], d[0]);
  const maxX = Math.max(a[0], b[0], c[0], d[0]);
  const minZ = Math.min(a[1], b[1], c[1], d[1]);
  const maxZ = Math.max(a[1], b[1], c[1], d[1]);
  return {
    kind: 'slope',
    corners,
    minX,
    maxX,
    minZ,
    maxZ,
    opts,
    covers(x, z) {
      return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
    },
    // Height at a point. The quad is split along its own axes, so the blend is
    // done in the frame of the rectangle the corners make rather than in world
    // space: that keeps it exact for an axis aligned quad, which is every piece
    // of ground here.
    heightAt(x, z) {
      const u = maxX > minX ? (x - minX) / (maxX - minX) : 0;
      const v = maxZ > minZ ? (z - minZ) / (maxZ - minZ) : 0;
      // Which corner is at which of the four (u, v) combinations.
      const byUV = cornerTable(corners, minX, maxX, minZ, maxZ);
      const h0 = byUV[0] + (byUV[1] - byUV[0]) * u;
      const h1 = byUV[2] + (byUV[3] - byUV[2]) * u;
      return h0 + (h1 - h0) * v;
    },
  };
}

// Puts each corner in its slot: 0 at (0,0), 1 at (1,0), 2 at (0,1), 3 at (1,1).
function cornerTable(corners, minX, maxX, minZ, maxZ) {
  const halfX = (minX + maxX) / 2;
  const halfZ = (minZ + maxZ) / 2;
  const out = [0, 0, 0, 0];
  for (const [x, z, y] of corners) {
    const u = x > halfX ? 1 : 0;
    const v = z > halfZ ? 1 : 0;
    out[u + v * 2] = y;
  }
  return out;
}

// A flat piece of ground at one height, given as a rectangle.
export function flat(x0, z0, x1, z1, y, opts = {}) {
  return slope(
    [[x0, z0, y], [x1, z0, y], [x0, z1, y], [x1, z1, y]],
    opts,
  );
}

// The ground, from its features.
//
// `kindAt` is asked for the surface at a point - rock, asphalt, whatever the
// caller's material list says - and is separate from the height on purpose: a
// feature may be drawn in any material, and a material may be painted on the
// flat ground without moving it.
export function createLandform(features) {
  function featureAt(x, z) {
    for (let i = 0; i < features.length; i += 1) {
      if (features[i].covers(x, z)) return features[i];
    }
    return null;
  }

  function heightAt(x, z) {
    const f = featureAt(x, z);
    return f ? f.heightAt(x, z) : 0;
  }

  // Whether a point is on ground that was placed as a feature, as opposed to
  // the flat of the island. Used where a road or a walk must not be laid on
  // top of a hill.
  function covers(x, z) {
    return featureAt(x, z) !== null;
  }

  return { heightAt, covers, featureAt, features };
}

// The meshes for the features, so the ground that is drawn is the ground that
// is stood on. Each feature is one quad, with its corners where the height says
// they are.
//
// The top is lifted by a hair so that it does not fight the flat ground drawn
// under it for the same pixels.
export function buildFeatureMeshes(features, materials = {}) {
  const group = new THREE.Group();
  const LIFT = 0.03;
  for (const f of features) {
    const [a, b, c, d] = f.corners;
    // Two triangles through the four corners, in the order that winds the face
    // upward whichever way the corners were listed.
    const positions = new Float32Array([
      a[0], a[2] + LIFT, a[1],
      b[0], b[2] + LIFT, b[1],
      d[0], d[2] + LIFT, d[1],
      b[0], b[2] + LIFT, b[1],
      c[0], c[2] + LIFT, c[1],
      d[0], d[2] + LIFT, d[1],
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    // The side of the quad down from its edge to the ground, so a raised piece
    // is not a sheet of paper lying in the air.
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, materials[f.opts.material] ?? materials.ground ?? fallback());
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    if (f.opts.skirt) {
      const skirt = skirtMesh(f, f.opts.skirt, LIFT);
      if (skirt) group.add(skirt);
    }
    group.add(mesh);
  }
  return group;
}

let fallbackMat = null;
function fallback() {
  if (!fallbackMat) fallbackMat = new THREE.MeshStandardMaterial({ color: 0x3e3a34, roughness: 1 });
  return fallbackMat;
}

// The walls of a raised piece of ground, from each edge down to a level, so
// that a plateau reads as a block of earth rather than a floating sheet.
function skirtMesh(f, bottomY, lift) {
  const [a, b, c, d] = f.corners;
  const ring = [a, b, c, d];
  const positions = [];
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    const top1 = p[2] + lift;
    const top2 = q[2] + lift;
    if (top1 <= bottomY && top2 <= bottomY) continue;
    positions.push(
      p[0], top1, p[1],
      q[0], top2, q[1],
      q[0], bottomY, q[1],
      p[0], top1, p[1],
      q[0], bottomY, q[1],
      p[0], bottomY, p[1],
    );
  }
  if (positions.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 1, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}
