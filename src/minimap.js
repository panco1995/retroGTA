const BASE_SIZE = 2048;

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

// Paints the whole world once, at a resolution high enough to be sampled by
// both the round HUD radar and the large map in the pause menu.
function buildBase(world) {
  const bounds = boundsOf([
    world.shore,
    ...(world.deck ?? []),
    ...(world.landing ? [world.landing] : []),
  ]);
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const scale = BASE_SIZE / Math.max(spanX, spanZ);
  const width = Math.max(1, Math.round(spanX * scale));
  const height = Math.max(1, Math.round(spanZ * scale));

  const base = document.createElement('canvas');
  base.width = width;
  base.height = height;
  const g = base.getContext('2d');
  const px = (x) => (x - bounds.minX) * scale;
  const py = (z) => (z - bounds.minZ) * scale;

  const fillPoly = (poly, color) => {
    if (!poly?.length) return;
    g.fillStyle = color;
    g.beginPath();
    poly.forEach(([x, z], i) => {
      if (i === 0) g.moveTo(px(x), py(z));
      else g.lineTo(px(x), py(z));
    });
    g.closePath();
    g.fill();
  };

  const tracePoly = (poly) => {
    if (!poly?.length) return false;
    g.beginPath();
    poly.forEach(([x, z], i) => {
      if (i === 0) g.moveTo(px(x), py(z));
      else g.lineTo(px(x), py(z));
    });
    g.closePath();
    return true;
  };

  g.fillStyle = '#16343a';
  g.fillRect(0, 0, width, height);
  fillPoly(world.shore, '#3e3a34');
  if (tracePoly(world.shore)) {
    g.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    g.lineWidth = 3;
    g.stroke();
  }
  fillPoly(world.beach, '#c6b48a');
  fillPoly(world.landing, '#4a463c');
  for (const quad of world.deck ?? []) fillPoly(quad, '#4e4a42');

  g.fillStyle = '#5a5f53';
  for (const road of world.roads) {
    g.save();
    g.translate(px(road.x), py(road.z));
    // Three.js yaw turns local +X toward -Z, which is a mirrored rotation in
    // map space where +Z points down.
    g.rotate(-(road.rot ?? 0));
    g.fillRect(-(road.w * scale) / 2, -(road.d * scale) / 2, road.w * scale, road.d * scale);
    g.restore();
  }

  for (const b of world.buildings) {
    g.fillStyle = b.safehouse ? '#d2c2a4' : b.kind === 'industrial' ? '#6d7270' : '#7a463c';
    const x = px(b.x - b.w / 2);
    const y = py(b.z - b.d / 2);
    g.fillRect(x, y, Math.max(1, b.w * scale), Math.max(1, b.d * scale));
  }

  if (world.el) {
    g.strokeStyle = '#b7b2a6';
    g.lineWidth = Math.max(2, scale * 1.1);
    g.beginPath();
    g.moveTo(px(world.el.x), py(world.el.z0));
    g.lineTo(px(world.el.x), py(world.el.z1));
    g.stroke();
  }

  if (world.safehouse) {
    const sx = px(world.safehouse.doorX);
    const sy = py(world.safehouse.doorZ);
    g.fillStyle = '#7fe7ff';
    g.beginPath();
    g.arc(sx, sy, Math.max(5, scale * 1.6), 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(6, 16, 20, 0.85)';
    g.lineWidth = 2;
    g.stroke();
  }

  return { base, bounds, scale };
}

function blipColor(vehicle) {
  return vehicle.inUse ? '#f0d48a' : '#d7d3c8';
}

export function createMinimap(canvas, world) {
  const { base, bounds, scale } = buildBase(world);

  const cssW = canvas.width;
  const cssH = canvas.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cx = cssW / 2;
  const cy = cssH / 2;
  const radius = Math.min(cssW, cssH) / 2 - 2;

  // GTA-style radar: a local window around the player, rotated so the player
  // always faces up. range is the world-space radius the radar covers.
  function draw(player, vehicles = [], opts = {}) {
    const range = opts.range ?? 60;
    const pxPerUnit = radius / range;
    const a = player.heading - Math.PI;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const toScreen = (x, z) => {
      const dx = (x - player.x) * pxPerUnit;
      const dz = (z - player.z) * pxPerUnit;
      return [cx + dx * cos - dz * sin, cy + dx * sin + dz * cos];
    };

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = '#16343a';
    ctx.fillRect(0, 0, cssW, cssH);

    const k = pxPerUnit / scale;
    const bx = (player.x - bounds.minX) * scale;
    const bz = (player.z - bounds.minZ) * scale;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.scale(k, k);
    ctx.drawImage(base, -bx, -bz);
    ctx.restore();

    if (world.safehouse) {
      const [sx, sy] = toScreen(world.safehouse.doorX, world.safehouse.doorZ);
      if (Math.hypot(sx - cx, sy - cy) <= radius) {
        ctx.fillStyle = '#7fe7ff';
        ctx.beginPath();
        ctx.arc(sx, sy, 3.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(6, 16, 20, 0.85)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }

    for (const v of vehicles) {
      // Moving traffic stays off the map so the radar reads clearly.
      if (v.traffic) continue;
      const [sx, sy] = toScreen(v.x, v.z);
      if (Math.hypot(sx - cx, sy - cy) > radius + 4) continue;
      ctx.fillStyle = blipColor(v);
      ctx.beginPath();
      ctx.arc(sx, sy, v.inUse ? 3.2 : 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(6, 10, 10, 0.75)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();

    // Rim.
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(240, 212, 138, 0.55)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 2.4, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(6, 10, 10, 0.5)';
    ctx.stroke();

    // North marker: stays attached to the world, so it circles the rim as the
    // map turns with the player.
    const nx = cx - Math.sin(player.heading) * (radius - 10);
    const ny = cy + Math.cos(player.heading) * (radius - 10);
    ctx.font = '700 10px "Avenir Next Condensed", "Arial Narrow", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(6, 10, 10, 0.85)';
    ctx.strokeText('N', nx, ny);
    ctx.fillStyle = '#f0d48a';
    ctx.fillText('N', nx, ny);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';

    // Player arrow, always pointing up in the rotated radar.
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    ctx.moveTo(0, -7.5);
    ctx.lineTo(5.6, 6.2);
    ctx.lineTo(0, 3.4);
    ctx.lineTo(-5.6, 6.2);
    ctx.closePath();
    ctx.fillStyle = '#fff4c8';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(10, 14, 12, 0.85)';
    ctx.stroke();
    ctx.restore();
  }

  // Whole-island map for the pause menu. North is up, the arrow shows the
  // player's heading.
  function drawFull(target, player, vehicles = []) {
    if (target.width !== base.width) target.width = base.width;
    if (target.height !== base.height) target.height = base.height;
    const g = target.getContext('2d');
    g.drawImage(base, 0, 0);

    for (const v of vehicles) {
      if (v.traffic) continue;
      const x = (v.x - bounds.minX) * scale;
      const y = (v.z - bounds.minZ) * scale;
      g.fillStyle = blipColor(v);
      g.beginPath();
      g.arc(x, y, v.inUse ? 7 : 5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(6, 10, 10, 0.8)';
      g.lineWidth = 1.6;
      g.stroke();
    }

    if (player) {
      const x = (player.x - bounds.minX) * scale;
      const y = (player.z - bounds.minZ) * scale;
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI - player.heading);
      g.beginPath();
      g.moveTo(0, -14);
      g.lineTo(9.5, 11);
      g.lineTo(0, 6);
      g.lineTo(-9.5, 11);
      g.closePath();
      g.fillStyle = '#fff4c8';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(10, 14, 12, 0.9)';
      g.stroke();
      g.restore();
    }
  }

  return { draw, drawFull };
}
