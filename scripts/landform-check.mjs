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

const { createLandform, flat, ramp, slope } = await import('../src/landform.js');

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

// A climb has to be smooth where it meets the flat. A straight slope meets
// the level at a crease: the height is continuous, but the gradient jumps from
// nothing to the whole grade in one step, which reads as a hard fold in the
// road and pitches a car all at once. A ramp eases the grade in and out of
// each end instead, so this checks that the gradient a car feels does not jump,
// and that the climb still covers the height it did.
{
  const { MAP, ROAD_W, WALK } = await import('../src/config.js');
  const h = MAP.hill;
  const hw = ROAD_W / 2 + WALK;
  const { roadX, zLow, zHigh, rise } = h;
  const hill = createLandform([
    ramp({
      axis: 'z', from: zLow, to: zHigh,
      cross0: roadX - hw, cross1: roadX + hw,
      y0: 0, y1: rise, ease: 8,
    }),
    flat(roadX - hw, zHigh - ROAD_W, roadX + hw, zHigh, rise),
  ]);

  const grade = (z, e = 0.05) => (hill.heightAt(roadX, z + e) - hill.heightAt(roadX, z - e)) / (2 * e);

  check('the climb still starts at the level of the street',
    Math.abs(hill.heightAt(roadX, zLow)) < 1e-9,
    `${hill.heightAt(roadX, zLow).toFixed(4)}`);
  check('the climb still reaches the top',
    Math.abs(hill.heightAt(roadX, zHigh) - rise) < 1e-9,
    `${hill.heightAt(roadX, zHigh).toFixed(4)}`);

  // Just inside the climb at each end, where a straight slope would already be
  // at full grade and a ramp has barely started to climb.
  check('the grade is flat just inside the bottom of the climb',
    Math.abs(grade(zLow - 0.3)) < 0.03, `${(grade(zLow - 0.3) * 100).toFixed(2)}%`);
  check('the grade is flat just inside the top of the climb',
    Math.abs(grade(zHigh + 0.3)) < 0.03, `${(grade(zHigh + 0.3) * 100).toFixed(2)}%`);

  let worstJump = 0;
  let at = 0;
  for (let z = zHigh; z <= zLow - 0.25; z += 0.25) {
    const jump = Math.abs(grade(z + 0.25) - grade(z));
    if (jump > worstJump) {
      worstJump = jump;
      at = z;
    }
  }
  check('the grade does not jump anywhere on the climb', worstJump < 0.03,
    `worst jump ${(worstJump * 100).toFixed(2)}% at z ${at.toFixed(1)}`);

  // What the crease used to be: a straight slope jumps its whole grade at once.
  const straight = rise / Math.abs(zHigh - zLow);
  check('a straight slope would jump the whole grade in one step, so the ramp is smoother',
    straight > worstJump * 2,
    `straight ${(straight * 100).toFixed(1)}% against a worst jump of ${(worstJump * 100).toFixed(2)}%`);

  // The arms of the cross road come off the level top and fall away sideways.
  // They are shorter and much steeper than the climb, and they were the fold a
  // car ended up parked across, so they get the same treatment.
  const arm = createLandform([
    ramp({
      axis: 'x',
      from: roadX + hw, to: roadX + h.taper,
      cross0: h.zTop - ROAD_W / 2, cross1: h.zTop + ROAD_W / 2,
      y0: rise, y1: 0, ease: 3,
    }),
    flat(roadX - hw, h.zTop - ROAD_W / 2, roadX + hw, h.zTop + ROAD_W / 2, rise),
  ]);
  const armGrade = (x, e = 0.05) => (arm.heightAt(x + e, h.zTop) - arm.heightAt(x - e, h.zTop)) / (2 * e);
  check('an arm still starts at the height of the top',
    Math.abs(arm.heightAt(roadX + hw, h.zTop) - rise) < 1e-9);
  check('an arm still comes down to the level of the street',
    Math.abs(arm.heightAt(roadX + h.taper, h.zTop)) < 1e-9);

  let armJump = 0;
  for (let x = roadX + hw; x <= roadX + h.taper - 0.1; x += 0.1) {
    armJump = Math.max(armJump, Math.abs(armGrade(x + 0.1) - armGrade(x)));
  }
  const armStraight = rise / (h.taper - hw);
  check('an arm does not fold where it leaves the top', armJump < 0.03,
    `worst jump ${(armJump * 100).toFixed(2)}%, against ${(armStraight * 100).toFixed(1)}% for a straight one`);
}

// Two pieces that meet do so without a step, and a raised piece of ground is
// closed at the sides.
//
// A ramp is drawn as a strip of quads over its own curve, which is a surface
// with no thickness: from the side you could see under it, and the ground it
// stands on showed through. The sides are drawn from the surface edge down to
// the level the piece stands on, so a climb reads as earth rather than a
// painted stripe. This checks that they are there, and that they run the
// height of the climb rather than stopping partway.
{
  const { buildFeatureMeshes } = await import('../src/landform.js');
  const THREE = await import('three');
  const f = ramp({
    axis: 'z', from: -7, to: -41,
    cross0: -120.2, cross1: -99.8,
    y0: 0, y1: 5.2, ease: 8,
    opts: { material: 'hill', skirt: -0.1 },
  });
  const built = buildFeatureMeshes([f], {});
  const meshes = [];
  built.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  check('a ramp is drawn with its sides, not as a bare sheet', meshes.length === 2,
    `${meshes.length} meshes`);

  const sides = meshes[1];
  if (!sides) {
    check('the sides reach the bottom of the climb', false, 'no side mesh to check');
    check('the sides reach the top of the climb', false, 'no side mesh to check');
    check('the sides are on the two edges of the climb, not across it', false, 'no side mesh to check');
  } else {
    const pos = sides.geometry.getAttribute('position');
    let low = Infinity;
    let high = -Infinity;
    const edges = new Set();
    for (let i = 0; i < pos.count; i += 1) {
      low = Math.min(low, pos.getY(i));
      high = Math.max(high, pos.getY(i));
      edges.add(pos.getX(i).toFixed(1));
    }
    check('the sides reach the bottom of the climb', low <= 0, `lowest ${low.toFixed(2)}`);
    check('the sides reach the top of the climb', high >= 5.2, `highest ${high.toFixed(2)}`);
    check('the sides are on the two edges of the climb, not across it',
      edges.size === 2, `${edges.size} distinct edges: ${[...edges].join(', ')}`);
  }
  void THREE;
}

console.log(failures === 0 ? 'OK' : `${failures} failures`);
if (failures > 0) process.exit(1);
