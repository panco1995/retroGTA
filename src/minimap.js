function boundsOf(polys) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const poly of polys) {
    for (const [x, z] of poly) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
  }
  const padX = (maxX - minX) * 0.06;
  const padZ = (maxZ - minZ) * 0.06;
  return { minX: minX - padX, maxX: maxX + padX, minZ: minZ - padZ, maxZ: maxZ + padZ };
}

export function createMinimap(canvas, world) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const bounds = boundsOf([
    world.shore,
    ...(world.deck ?? []),
    ...(world.landing ? [world.landing] : []),
  ]);
  const project = (x, z) => {
    const u = (x - bounds.minX) / (bounds.maxX - bounds.minX);
    const v = (z - bounds.minZ) / (bounds.maxZ - bounds.minZ);
    return [u * w, v * h];
  };

  const base = document.createElement('canvas');
  base.width = w;
  base.height = h;
  const g = base.getContext('2d');

  const fillPoly = (poly, color) => {
    if (!poly?.length) return;
    g.fillStyle = color;
    g.beginPath();
    poly.forEach(([x, z], i) => {
      const [sx, sy] = project(x, z);
      if (i === 0) g.moveTo(sx, sy);
      else g.lineTo(sx, sy);
    });
    g.closePath();
    g.fill();
  };

  g.fillStyle = '#16343a';
  g.fillRect(0, 0, w, h);
  fillPoly(world.shore, '#3e3a34');
  fillPoly(world.beach, '#c6b48a');
  fillPoly(world.landing, '#4a463c');
  for (const quad of world.deck ?? []) fillPoly(quad, '#4e4a42');

  g.fillStyle = '#3c4036';
  for (const road of world.roads) {
    const [x, y] = project(road.x, road.z);
    const scaleX = w / (bounds.maxX - bounds.minX);
    const scaleZ = h / (bounds.maxZ - bounds.minZ);
    g.save();
    g.translate(x, y);
    g.rotate(road.rot ?? 0);
    g.fillRect(-(road.w * scaleX) / 2, -(road.d * scaleZ) / 2, road.w * scaleX, road.d * scaleZ);
    g.restore();
  }

  for (const b of world.buildings) {
    g.fillStyle = b.safehouse ? '#d2c2a4' : b.kind === 'industrial' ? '#6d7270' : '#7a463c';
    const [x, y] = project(b.x - b.w / 2, b.z - b.d / 2);
    const [x2, y2] = project(b.x + b.w / 2, b.z + b.d / 2);
    g.fillRect(x, y, Math.max(1, x2 - x), Math.max(1, y2 - y));
  }

  if (world.el) {
    g.strokeStyle = '#b7b2a6';
    g.lineWidth = 2;
    const [x, y1] = project(world.el.x, world.el.z0);
    const [, y2] = project(world.el.x, world.el.z1);
    g.beginPath();
    g.moveTo(x, y1);
    g.lineTo(x, y2);
    g.stroke();
  }

  return {
    draw(player, vehicles) {
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(base, 0, 0);
      for (const v of vehicles) {
        const [x, y] = project(v.x, v.z);
        ctx.fillStyle = v.inUse ? '#f0d48a' : '#d7d3c8';
        ctx.fillRect(x - 2, y - 2, 4, 4);
      }
      const [px, py] = project(player.x, player.z);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.PI - player.heading);
      ctx.fillStyle = '#fff4c8';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}
