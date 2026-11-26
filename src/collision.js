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

export function vehicleBlocked(x, z, heading, length, width, colliders, circles) {
  const halfL = length / 2;
  const halfW = width / 2;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  if (outOfRegion(x, z, colliders)
    || outOfRegion(x + fx * halfL, z + fz * halfL, colliders)
    || outOfRegion(x - fx * halfL, z - fz * halfL, colliders)) return true;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.keepInside) continue;
    if (c.obb) {
      if (obbHitsObb(x, z, heading, halfL, halfW, c.x, c.z, c.heading, c.halfL, c.halfW)) return true;
    } else if (obbHitsAabb(x, z, heading, halfL, halfW, c)) return true;
  }
  if (circles) {
    for (let i = 0; i < circles.length; i++) {
      const body = circles[i];
      if (obbHitsCircle(x, z, heading, halfL, halfW, body.x, body.z, body.radius || 0.36)) return true;
    }
  }
  return false;
}

export function blocked(x, z, radius, colliders) {
  const r2 = radius * radius;
  let hasRegion = false;
  let inRegion = false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
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

export function moveCircle(x, z, dx, dz, radius, colliders) {
  let nx = x + dx;
  if (blocked(nx, z, radius, colliders)) nx = x;
  let nz = z + dz;
  if (blocked(nx, nz, radius, colliders)) nz = z;
  return { x: nx, z: nz };
}
