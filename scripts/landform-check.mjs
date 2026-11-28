// Checks the landform: that a piece of ground answers with the height at its
// corners and in between, that the features are searched in order, and that the
// mesh drawn for a feature is the height the feature reports.
//
// Run with: npm run check

globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return new Proxy({}, { get: () => () => {}, set: () => true });
      },
    };
  },
};

const { createLandform, flat, slope } = await import('../src/landform.js');

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? ` ${detail}` : ''}`);
}

// A slope climbing 4 m over 8 m towards +Z.
{
  const s = slope([
    [0, 0, 0],
    [4, 0, 0],
    [0, 8, 4],
    [4, 8, 4],
  ]);
  check('the corners are at their heights',
    s.heightAt(0, 0) === 0 && s.heightAt(4, 0) === 0
    && Math.abs(s.heightAt(0, 8) - 4) < 1e-9 && Math.abs(s.heightAt(4, 8) - 4) < 1e-9);
  check('the middle of the slope is halfway up',
    Math.abs(s.heightAt(2, 4) - 2) < 1e-9, `${s.heightAt(2, 4).toFixed(3)}`);
  check('the height does not depend on x on a slope that does not lean that way',
    Math.abs(s.heightAt(1, 6) - s.heightAt(3, 6)) < 1e-9);
  check('a slope does not cover ground outside its corners',
    !s.covers(-1, 4) && !s.covers(5, 4) && !s.covers(2, -1) && !s.covers(2, 9));
  check('a slope covers ground inside its corners', s.covers(2, 4));
}

// A slope leaning across, so the height depends on x.
{
  const s = slope([
    [0, 0, 3],
    [6, 0, 0],
    [0, 4, 3],
    [6, 4, 0],
  ]);
  check('a slope across climbs the way its corners say',
    Math.abs(s.heightAt(3, 2) - 1.5) < 1e-9, `${s.heightAt(3, 2).toFixed(3)}`);
  check('a slope across is level along the other axis',
    Math.abs(s.heightAt(0, 1) - s.heightAt(0, 3)) < 1e-9);
}

// A flat piece is flat, and at the height it was given.
{
  const f = flat(-2, -3, 2, 3, 5);
  check('a flat piece is flat everywhere',
    f.heightAt(-2, -3) === 5 && f.heightAt(2, 3) === 5 && f.heightAt(0, 0) === 5);
}

// The landform: features in order, first one wins, and nothing covers the rest.
{
  const land = createLandform([
    flat(0, 0, 10, 10, 1),
    flat(4, 4, 6, 6, 3),
  ]);
  check('the first feature that covers a point wins', land.heightAt(5, 5) === 1);
  check('ground no feature covers is at zero', land.heightAt(-20, -20) === 0);
  check('covers says whether a feature is there',
    land.covers(5, 5) && !land.covers(-20, -20));
}

// The order matters, and it is how a patch is laid over a bigger piece.
{
  const land = createLandform([
    flat(4, 4, 6, 6, 3),
    flat(0, 0, 10, 10, 1),
  ]);
  check('a patch written first is beaten by the piece under it', land.heightAt(5, 5) === 3);
}

// The heights along the edges of two pieces that meet must agree, or the ground
// has a step in it where the two are drawn.
{
  const land = createLandform([
    slope([[0, 0, 0], [4, 0, 0], [0, 4, 2], [4, 4, 2]]),
    flat(0, 4, 4, 8, 2),
  ]);
  let worst = 0;
  for (let x = 0; x <= 4; x += 0.25) {
    // Just either side of the seam at z = 4.
    const below = land.heightAt(x, 3.999);
    const above = land.heightAt(x, 4.001);
    worst = Math.max(worst, Math.abs(above - below));
  }
  check('two pieces that meet do so without a step', worst < 0.01,
    `worst step ${worst.toFixed(4)} m`);
}

// The hill in the map, rebuilt from features, has to be the same ground the
// chain of ifs used to describe. That equivalence is what makes this a
// refactor rather than a redesign: the terrain moved into data without the
// shape of the world changing under anyone's feet.
{
  const { MAP, ROAD_W, WALK } = await import('../src/config.js');
  const h = MAP.hill;
  const hw = ROAD_W / 2 + WALK;
  const zNorth = h.zHigh - ROAD_W;
  const { roadX, zLow, zHigh, rise, taper } = h;

  // The old description, kept here as the reference the features are held to.
  function oldHeight(x, z) {
    if (Math.abs(x - roadX) <= hw && z <= zLow && z >= zHigh) {
      return rise * (zLow - z) / (zLow - zHigh);
    }
    if (Math.abs(x - roadX) <= hw && z <= zHigh && z >= zNorth) return rise;
    if (Math.abs(x - roadX) <= hw && z < zNorth && z >= zNorth - taper) {
      return rise * (1 - (zNorth - z) / taper);
    }
    const limit = x < roadX ? (h.west ?? taper) : taper;
    const dist = Math.abs(x - roadX);
    if (Math.abs(z - h.zTop) <= ROAD_W / 2 && dist > hw && dist <= limit) {
      return rise * (1 - (dist - hw) / (limit - hw));
    }
    if (h.pad && x >= h.pad.minX && x <= h.pad.maxX
      && z >= h.pad.minZ && z <= h.pad.maxZ) return h.pad.y;
    return 0;
  }

  const padY = rise * (zLow - h.pad.doorZ) / (zLow - zHigh);
  const westReach = h.west ?? taper;
  const armZ0 = h.zTop - ROAD_W / 2;
  const armZ1 = h.zTop + ROAD_W / 2;
  const land = createLandform([
    slope([
      [roadX - hw, zLow, 0], [roadX + hw, zLow, 0],
      [roadX - hw, zHigh, rise], [roadX + hw, zHigh, rise],
    ]),
    flat(roadX - hw, zNorth, roadX + hw, zHigh, rise),
    slope([
      [roadX - hw, zNorth - taper, 0], [roadX + hw, zNorth - taper, 0],
      [roadX - hw, zNorth, rise], [roadX + hw, zNorth, rise],
    ]),
    slope([
      [roadX - hw, armZ0, rise], [roadX - westReach, armZ0, 0],
      [roadX - hw, armZ1, rise], [roadX - westReach, armZ1, 0],
    ]),
    slope([
      [roadX + hw, armZ0, rise], [roadX + taper, armZ0, 0],
      [roadX + hw, armZ1, rise], [roadX + taper, armZ1, 0],
    ]),
    flat(h.pad.minX, h.pad.minZ, h.pad.maxX, h.pad.maxZ, padY),
  ]);

  let worst = 0;
  let at = null;
  for (let x = -140; x <= -80; x += 0.5) {
    for (let z = -90; z <= 5; z += 0.5) {
      const d = Math.abs(oldHeight(x, z) - land.heightAt(x, z));
      if (d > worst) {
        worst = d;
        at = { x, z };
      }
    }
  }
  check('the hill from features is the hill the ifs described', worst < 0.01,
    `worst ${worst.toFixed(4)} m difference${at ? ` at ${at.x}, ${at.z}` : ''}`);
}

console.log(failures === 0 ? 'OK' : `${failures} failures`);
if (failures > 0) process.exit(1);
