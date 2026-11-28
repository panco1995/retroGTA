// A collider source answers "what could touch this point": the world list
// uses its spatial index, a plain array is scanned as it is.
export function nearby(source, x, z, radius) {
  return source && typeof source.near === 'function' ? source.near(x, z, radius) : source;
}

export function insidePolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const zi = poly[i][1];
    const xj = poly[j][0];
    const zj = poly[j][1];
    const cross = ((zi > z) !== (zj > z))
      && (x < ((xj - xi) * (z - zi)) / (zj - zi) + xi);
    if (cross) inside = !inside;
  }
  return inside;
}

function outOfRegion(x, z, colliders) {
  let hasRegion = false;
  let inRegion = false;
  for (let i = 0; i < colliders.length; i++) {
    const ring = colliders[i].keepInside;
    if (!ring) continue;
    hasRegion = true;
    if (!inRegion && insidePolygon(x, z, ring)) inRegion = true;
  }
  return hasRegion && !inRegion;
}

// Vehicle boxes store a real oriented rectangle. The axis-aligned bounds are
// only a broad footprint, and a rotated car's corners are empty air.
export function obbHitsCircle(x, z, heading, halfL, halfW, cx, cz, radius) {
  const dx = cx - x;
  const dz = cz - z;
  const side = dx * Math.cos(heading) - dz * Math.sin(heading);
  const fwd = dx * Math.sin(heading) + dz * Math.cos(heading);
  const qx = Math.abs(side) - halfW;
  const qz = Math.abs(fwd) - halfL;
  if (qx <= 0 && qz <= 0) return true;
  const ox = qx > 0 ? qx : 0;
  const oz = qz > 0 ? qz : 0;
  return ox * ox + oz * oz < radius * radius;
}

function obbHitsAabb(x, z, heading, halfL, halfW, box) {
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  const bcx = (box.minX + box.maxX) / 2;
  const bcz = (box.minZ + box.maxZ) / 2;
  const bhx = (box.maxX - box.minX) / 2;
  const bhz = (box.maxZ - box.minZ) / 2;
  const axes = [[1, 0], [0, 1], [fx, fz], [rx, rz]];
  for (let i = 0; i < 4; i++) {
    const ax = axes[i][0];
    const az = axes[i][1];
    const dist = Math.abs((x - bcx) * ax + (z - bcz) * az);
    const reach = Math.abs(fx * ax + fz * az) * halfL
      + Math.abs(rx * ax + rz * az) * halfW
      + Math.abs(ax) * bhx
      + Math.abs(az) * bhz;
    if (dist >= reach) return false;
  }
  return true;
}

export function obbHitsObb(ax, az, aHeading, aHalfL, aHalfW, bx, bz, bHeading, bHalfL, bHalfW) {
  const afx = Math.sin(aHeading);
  const afz = Math.cos(aHeading);
  const arx = Math.cos(aHeading);
  const arz = -Math.sin(aHeading);
  const bfx = Math.sin(bHeading);
  const bfz = Math.cos(bHeading);
  const brx = Math.cos(bHeading);
  const brz = -Math.sin(bHeading);
  const axes = [[afx, afz], [arx, arz], [bfx, bfz], [brx, brz]];
  const dx = bx - ax;
  const dz = bz - az;
  for (let i = 0; i < 4; i++) {
    const axisX = axes[i][0];
    const axisZ = axes[i][1];
    const dist = Math.abs(dx * axisX + dz * axisZ);
    const reach = Math.abs(afx * axisX + afz * axisZ) * aHalfL
      + Math.abs(arx * axisX + arz * axisZ) * aHalfW
      + Math.abs(bfx * axisX + bfz * axisZ) * bHalfL
      + Math.abs(brx * axisX + brz * axisZ) * bHalfW;
    if (dist >= reach) return false;
  }
  return true;
}

// Ways out of a vehicle rectangle, nearest first. Null when the circle is already clear.
export function circleExitsFromObb(x, z, radius, ox, oz, heading, halfL, halfW) {
  const dx = x - ox;
  const dz = z - oz;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const side = dx * cos - dz * sin;
  const fwd = dx * sin + dz * cos;
  const limitS = halfW + radius;
  const limitF = halfL + radius;
  if (Math.abs(side) >= limitS || Math.abs(fwd) >= limitF) return null;
  const clampS = Math.max(-limitS, Math.min(limitS, side));
  const clampF = Math.max(-limitF, Math.min(limitF, fwd));
  const edges = [
    [-limitS, clampF],
    [limitS, clampF],
    [clampS, -limitF],
    [clampS, limitF],
  ];
  edges.sort((a, b) => ((a[0] - side) ** 2 + (a[1] - fwd) ** 2) - ((b[0] - side) ** 2 + (b[1] - fwd) ** 2));
  return edges.map(([s, f]) => ({
    x: ox + s * cos + f * sin,
    z: oz - s * sin + f * cos,
  }));
}

// The island edge is a rule, not an object, so there is no collider to hand
// back for it. It still stops the car.
const REGION = { region: true };

// The collider that stops a car, if one does.
function blockerFor(x, z, heading, length, width, colliders, circles) {
  const halfL = length / 2;
  const halfW = width / 2;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  // The car reaches halfL ahead of its centre, so that is how far the query
  // has to look to catch anything it would drive into.
  const list = nearby(colliders, x, z, halfL + halfW);
  if (outOfRegion(x, z, list)
    || outOfRegion(x + fx * halfL, z + fz * halfL, list)
    || outOfRegion(x - fx * halfL, z - fz * halfL, list)) return REGION;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.keepInside) continue;
    if (c.obb) {
      if (obbHitsObb(x, z, heading, halfL, halfW, c.x, c.z, c.heading, c.halfL, c.halfW)) return c;
    } else if (c.circle) {
      if (obbHitsCircle(x, z, heading, halfL, halfW, c.x, c.z, c.radius)) return c;
    } else if (obbHitsAabb(x, z, heading, halfL, halfW, c)) return c;
  }
  if (circles) {
    for (let i = 0; i < circles.length; i++) {
      const body = circles[i];
      if (obbHitsCircle(x, z, heading, halfL, halfW, body.x, body.z, body.radius || 0.36)) return body;
    }
  }
  return null;
}

export function vehicleBlocked(x, z, heading, length, width, colliders, circles) {
  return blockerFor(x, z, heading, length, width, colliders, circles) !== null;
}

// The collider that stops the car, so a caller can tell a wall from a piece
// of street furniture it could throw out of the way instead of bouncing off.
export function vehicleBlockedBy(x, z, heading, length, width, colliders, circles) {
  const blocker = blockerFor(x, z, heading, length, width, colliders, circles);
  return blocker === REGION ? null : blocker;
}

export function blocked(x, z, radius, colliders) {
  const r2 = radius * radius;
  const list = nearby(colliders, x, z, radius);
  let hasRegion = false;
  let inRegion = false;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.keepInside) {
      hasRegion = true;
      if (!inRegion && insidePolygon(x, z, c.keepInside)) inRegion = true;
      continue;
    }
    if (c.circle) {
      const px = x - c.x;
      const pz = z - c.z;
      const reach = radius + c.radius;
      if (px * px + pz * pz < reach * reach) return true;
      continue;
    }
    if (c.obb) {
      if (obbHitsCircle(c.x, c.z, c.heading, c.halfL, c.halfW, x, z, radius)) return true;
      continue;
    }
    const cx = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
    const cz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r2) return true;
  }
  return hasRegion && !inRegion;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// A circle against an axis aligned box, in the box's own frame. The centre
// can be inside the box, and then the way out is the nearest face.
function boxContact(x, z, radius, minX, maxX, minZ, maxZ) {
  const cx = clamp(x, minX, maxX);
  const cz = clamp(z, minZ, maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > radius * radius) return null;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    return { nx: dx / d, nz: dz / d, depth: radius - d };
  }
  const left = x - minX;
  const right = maxX - x;
  const near = z - minZ;
  const far = maxZ - z;
  const m = Math.min(left, right, near, far);
  if (m === left) return { nx: -1, nz: 0, depth: left + radius };
  if (m === right) return { nx: 1, nz: 0, depth: right + radius };
  if (m === near) return { nx: 0, nz: -1, depth: near + radius };
  return { nx: 0, nz: 1, depth: far + radius };
}

// How a circle touches a collider: the direction that pushes it clear and how
// far it has to move to get out. Null when the two do not touch.
export function circleContact(x, z, radius, c) {
  if (c.circle) {
    const dx = c.x - x;
    const dz = c.z - z;
    const d = Math.hypot(dx, dz);
    const reach = radius + c.radius;
    if (d >= reach) return null;
    if (d < 1e-6) return { nx: 1, nz: 0, depth: reach };
    return { nx: dx / d, nz: dz / d, depth: reach - d };
  }
  if (c.obb) {
    // Into the box's own frame: forward along the body, sideways across it.
    const fx = Math.sin(c.heading);
    const fz = Math.cos(c.heading);
    const rx = Math.cos(c.heading);
    const rz = -Math.sin(c.heading);
    const relX = x - c.x;
    const relZ = z - c.z;
    const hit = boxContact(
      relX * fx + relZ * fz,
      relX * rx + relZ * rz,
      radius,
      -c.halfL,
      c.halfL,
      -c.halfW,
      c.halfW,
    );
    if (!hit) return null;
    return {
      nx: hit.nx * fx + hit.nz * rx,
      nz: hit.nx * fz + hit.nz * rz,
      depth: hit.depth,
    };
  }
  return boxContact(x, z, radius, c.minX, c.maxX, c.minZ, c.maxZ);
}

// The deepest thing a circle is touching. That is the surface it has to
// slide along.
export function deepestContact(x, z, radius, colliders) {
  const list = nearby(colliders, x, z, radius);
  let best = null;
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    if (c.keepInside) continue;
    const hit = circleContact(x, z, radius, c);
    if (hit && (!best || hit.depth > best.depth)) best = hit;
  }
  return best;
}

export function moveCircle(x, z, dx, dz, radius, colliders) {
  const nx = x + dx;
  const nz = z + dz;
  if (!blocked(nx, nz, radius, colliders)) return { x: nx, z: nz };

  // The step went into something. Slide along the surface it hit instead of
  // stopping dead against it: step back out to the surface and keep the part
  // of the step that runs along it.
  const hit = deepestContact(nx, nz, radius, colliders);
  if (hit) {
    const sx = nx + hit.nx * hit.depth;
    const sz = nz + hit.nz * hit.depth;
    if (!blocked(sx, sz, radius, colliders)) return { x: sx, z: sz };
  }

  // A corner, or a surface the slide cannot reach: take whichever axis is
  // still free.
  if (!blocked(nx, z, radius, colliders)) return { x: nx, z: z };
  if (!blocked(x, nz, radius, colliders)) return { x, z: nz };

  // Wedged inside something: climb out of it.
  const stuck = deepestContact(x, z, radius, colliders);
  if (stuck && stuck.depth > 0) {
    const ex = x + stuck.nx * stuck.depth;
    const ez = z + stuck.nz * stuck.depth;
    if (!blocked(ex, ez, radius, colliders)) return { x: ex, z: ez };
  }
  return { x, z };
}
