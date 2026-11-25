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
