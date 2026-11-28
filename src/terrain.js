// The ground, as something everything else can ask a question of.
//
// Until now the height of the world was a chain of ifs in city.js, and
// everything that needed to know how high the ground was called it directly.
// That worked while the only hill was one ramp and the rest of the island was
// flat, but it leaves no room for the ground to have a *character*: sand is
// not a different height from asphalt, it is a different surface, and a car
// should feel it.
//
// So the ground is one object with three questions:
//
//   heightAt(x, z)   how high the ground is
//   normalAt(x, z)   which way it leans
//   surfaceAt(x, z)  all of the above, plus what it is made of
//
// The height comes from the map. The lean is worked out from the height by
// sampling a little either side, whichever way the map is built, so a height
// that is a height field, a hand written hill or a mesh all answer the same.
// The surface comes from the map's polygons, and carries the grip and the
// drag that a vehicle feels on it.
//
// Everything is sampled at a fixed step rather than differentiated by hand:
// the step is the width of a wheel's worth of ground, which is the scale a
// vehicle actually leans over, and it smooths the seams where one piece of
// the map meets the next.

import { insidePolygon } from './collision.js';
import { GRAVITY } from './physics.js';

// How sharply the grade has to change before the car leaves the ground, in
// metres per second of ground rise. A slope is a steady grade and the car
// follows it; a crest is the grade falling away from under the wheels all at
// once. Driving at 12 m/s, going from a 40% climb to a 40% drop changes the
// ground's own speed by about 10 m/s, and no slope changes that fast.
const CREST_SHARPNESS = 3.5;
// How far the body dips for each metre per second it arrives at the ground
// with, and the most it can dip. A landing is felt in the springs, not in a
// bounce that lifts the car back into the air.
const LANDING_GIVE = 0.012;
const MAX_LANDING_DIP = 0.16;
// How far below the ground a car may fall before it is put back on it. This is
// a net, not a rule: the ground is read from the map and the map has an edge,
// so a car should never get here. A car falling for ever is worse than one
// landing somewhere unexpected.
const FALL_ESCAPE = 30;


// How far either side of a point the height is sampled to work out the lean,
// in metres. Roughly the half of a wheelbase, so the lean is the slope over
// the part of the ground the vehicle actually rests on, and small creases in
// the height do not show up as the car twitching.
const TAN_STEP = 1;
// Past this the ground is steeper than a road, and the wide step is reading
// across the edge of something rather than measuring the ground it stands on.
// The sample is taken again closer in, so a car on the flat beside a kerb
// stays flat instead of leaning over the edge it is next to. It is a gradient:
// 0.35 is about nineteen degrees, which is already steeper than any road here.
const STEEP = 0.35;
// The narrowest step that is still worth trusting, in metres. Below this the
// sample is measuring the height function's own noise.
const TAN_MIN = 0.15;

// What each kind of ground is like to drive on.
//
// `grip` scales how hard the car can steer and how much of a shove it takes
// before it slides; `drag` is how much of the engine's push the surface eats,
// with 1 being a dry road and 2 being sand that the wheels sink into. The
// numbers are not physics, they are the feel of the surface, and they are
// here so that adding a surface to a map is only a polygon and a name.
export const SURFACE_KINDS = {
  asphalt: { grip: 1, drag: 1 },
  walk: { grip: 0.96, drag: 1.1 },
  grass: { grip: 0.8, drag: 1.7 },
  sand: { grip: 0.58, drag: 2.4 },
  rock: { grip: 0.9, drag: 1.2 },
  shallow: { grip: 0.45, drag: 3.2 },
};

const FALLBACK = SURFACE_KINDS.asphalt;

export function createTerrain({ height, kinds = [], fallback = 'asphalt' }) {
  const base = fallback in SURFACE_KINDS ? fallback : 'asphalt';

  // The kind of ground at a point. The areas are searched in the order the
  // map lists them, so a small patch laid over a bigger one wins by being
  // written after it. Roads and pavements are rectangles and are tested as
  // rectangles, which is a handful of comparisons; anything else is a polygon.
  function kindAt(x, z) {
    for (let i = 0; i < kinds.length; i += 1) {
      const area = kinds[i];
      const r = area.rect;
      if (r) {
        if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return area.kind;
      } else if (area.ring && insidePolygon(x, z, area.ring)) {
        return area.kind;
      }
    }
    return base;
  }

  function heightAt(x, z) {
    return height(x, z);
  }

  // Which way the ground leans, as a unit normal. A flat piece of ground is
  // straight up, which is the common case and the one worth being cheap.
  const normal = { x: 0, y: 1, z: 0 };
  function normalAt(x, z, out = normal) {
    // The wide step first: it is the ground a wheel spans, and it is what the
    // car should lean on.
    let e = TAN_STEP;
    let dx;
    let dz;
    let len;
    for (;;) {
      dx = heightAt(x + e, z) - heightAt(x - e, z);
      dz = heightAt(x, z + e) - heightAt(x, z - e);
      len = Math.hypot(dx, 2 * e, dz);
      // The gradient, which is the steepness as a fraction: 0 is flat and 1 is
      // a wall. Steeper than a road means the sample has caught the edge of
      // something, so it is taken again closer in.
      const rise = Math.hypot(dx, dz);
      if (rise / (2 * e) <= STEEP || e <= TAN_MIN) break;
      e *= 0.5;
    }
    if (dx === 0 && dz === 0) {
      out.x = 0;
      out.y = 1;
      out.z = 0;
      return out;
    }
    out.x = -dx / len;
    out.y = (2 * e) / len;
    out.z = -dz / len;
    return out;
  }

  // Height, lean and material, at once, so that a caller that needs all three
  // only samples the map once each way.
  function surfaceAt(x, z, out = {}) {
    out.height = heightAt(x, z);
    normalAt(x, z, normal);
    out.nx = normal.x;
    out.ny = normal.y;
    out.nz = normal.z;
    out.kind = kindAt(x, z);
    const feel = SURFACE_KINDS[out.kind] ?? FALLBACK;
    out.grip = feel.grip;
    out.drag = feel.drag;
    return out;
  }

  // How steep the ground is at a point, as the sine of the angle from the
  // vertical: 0 is flat and 1 is a cliff.
  function slopeAt(x, z) {
    normalAt(x, z, normal);
    return Math.sqrt(1 - normal.y * normal.y);
  }

  return { heightAt, normalAt, surfaceAt, kindAt, slopeAt, kinds, base };
}

// The lean of a vehicle standing on the ground, as the two angles the mesh
// wants: `pitch` about its own side axis, and `roll` about its own forward
// axis. Both come from the ground normal, turned into the vehicle's frame, so
// the answer is right whichever way the vehicle is facing and whatever it is
// long.
//
// Doing it this way rather than by sampling one point ahead of the nose is
// what makes a slope work: a bus and a hatchback get the same lean over the
// same ground, a car on a slope across its path leans the way it should, and a
// slope that is barely a slope does not twitch, because the lean is read off
// the ground rather than differenced over a fixed distance.
export function leanOn(normal, heading, out = { pitch: 0, roll: 0 }) {
  // The ground normal in the vehicle's own frame. The vehicle faces down
  // (sin h, cos h) and its right is (cos h, -sin h).
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = Math.cos(heading);
  const rz = -Math.sin(heading);
  const along = normal.x * fx + normal.z * fz;
  const across = normal.x * rx + normal.z * rz;
  // The normal tips away from the rising ground, so a slope that climbs ahead
  // gives a negative `along`: the nose goes up, which is a negative pitch, and
  // that is the sign the car mesh was already built around.
  out.pitch = Math.atan2(along, normal.y);
  out.roll = Math.atan2(across, normal.y);
  return out;
}

// How a car sits on the ground, worked out from its four wheels rather than
// from one sample in the middle.
//
// One sample in the middle and a normal is what a plank of wood on a slope
// does: it lies flat against the slope. A car does not, because it has four
// wheels that each touch the ground where they are, and a spring at each
// corner: going over a crest it rests on the middle of the ground and its
// wheels reach for the ends, and a wheel that runs up a kerb lifts that corner
// of the body alone.
//
// The wheels' heights fit a plane, and the plane gives the pitch and the roll.
// The springs give the body a little travel on top of that, so a wheel that is
// pressed further than the others pushes its corner up.
//
// Everything here is done in the car's own frame: the wheels are laid out along
// its nose and its side, so the fit does not care which way it is pointing.

// The four corners of the car, in its own frame: [forward, side]. The order is
// front-left, front-right, back-left, back-right, which is the order the wheels
// are built in.
const WHEEL_CORNERS = [
  [1, -1],
  [1, 1],
  [-1, -1],
  [-1, 1],
];

// How much of a wheel's push the body takes, in metres of travel per metre the
// wheel is pressed, and the most it can move. A car with a quarter of a metre of
// travel is a soft one; a bus has less.
function springTravel(vehicle) {
  return Math.min(0.22, Math.max(0.1, (vehicle.width ?? 1.8) * 0.07));
}

export function sitOnWheels(terrain, vehicle, out) {
  const fx = Math.sin(vehicle.heading);
  const fz = Math.cos(vehicle.heading);
  const rx = Math.cos(vehicle.heading);
  const rz = -Math.sin(vehicle.heading);

  const wheels = vehicle.wheels && vehicle.wheels.length === 4 ? vehicle.wheels : null;
  const halfL = (vehicle.length ?? 4.2) / 2;
  const halfW = (vehicle.width ?? 1.8) / 2;

  // The ground under each wheel, and where each wheel is. The wheel's own mount
  // point is the authority on where it is, because a bus and a hatchback do not
  // put their wheels in the same place.
  const heights = [];
  let frontH = 0;
  let backH = 0;
  let leftH = 0;
  let rightH = 0;
  let trackSum = 0;
  let baseSum = 0;
  for (let i = 0; i < 4; i += 1) {
    const [along, across] = WHEEL_CORNERS[i];
    const at = wheels ? wheels[i].at : null;
    const localF = at ? at.z : along * halfL;
    const localR = at ? at.x : across * halfW;
    const wx = vehicle.x + fx * localF + rx * localR;
    const wz = vehicle.z + fz * localF + rz * localR;
    const h = terrain.heightAt(wx, wz);
    heights.push(h);
    if (along > 0) frontH += h;
    else backH += h;
    if (across < 0) leftH += h;
    else rightH += h;
    trackSum += Math.abs(localR);
    baseSum += Math.abs(localF);
  }
  frontH /= 2;
  backH /= 2;
  leftH /= 2;
  rightH /= 2;
  // The real wheelbase and track, from where the wheels actually are.
  const wheelBase = baseSum / 2;
  const track = trackSum / 2;

  // The body sits at the average of what is under its wheels. The pitch and the
  // roll then tip it so that each corner follows its own patch of ground; using
  // the highest wheel instead would lift the whole car by the drop across it,
  // which on a hill is more than a metre.
  //
  // The height is the ground's, not the ground plus a sag: the car's own model
  // already has the wheels under it, at `wheelY` above its origin, so the
  // origin belongs on the ground. The springs show as the wheels moving up
  // into their arches, not as the whole body sinking.
  const average = heights.reduce((a, b) => a + b, 0) / 4;
  const travel = springTravel(vehicle);
  out.y = average;

  const alongRise = frontH - backH;
  const acrossRise = rightH - leftH;
  // A rise at the front means the nose is up, which is a negative pitch in the
  // car's own frame, the same convention the rest of the game uses.
  out.pitch = -Math.atan2(alongRise, wheelBase);
  out.roll = Math.atan2(acrossRise, track);

  // Each wheel's spring: how far it is pressed up into the body, given where
  // the body ended up. A wheel over higher ground is pressed further.
  if (wheels) {
    for (let i = 0; i < 4; i += 1) {
      const at = wheels[i].at;
      const restBottom = out.y + at.y - wheels[i].radius;
      const press = heights[i] - restBottom;
      wheels[i].travel = Math.max(0, Math.min(travel, press));
      wheels[i].grounded = press > -travel * 1.5;
    }
  }
  return out;
}
//
// The height is no longer taken straight from the ground. A car carries its own
// vertical speed, so that driving off the top of the hill carries it into the
// air and it comes down again with a shove into the springs, instead of the
// body being placed on whatever the ground is doing that frame. The ground is
// what it lands on, not what it is glued to.
//
// The rules are the ones a car obeys:
//
//   - On the ground and the ground rising under it, the car is carried up with
//     the ground. Driving up a slope does not launch you.
//   - On the ground and the ground falling away faster than gravity would take
//     the car, it leaves the ground: the crest of a hill, the edge of a ramp.
//   - In the air, gravity pulls it down until the ground is under it again.
//   - Landing costs the springs: the body dips by the speed it arrived with.
//
// `dt` of zero means "put it on the ground and leave it", which is what laying
// out the map and resetting the game want.
const _sit = { pitch: 0, roll: 0, y: 0 };
export function settleOnGround(terrain, vehicle, dt = 0) {
  // Where the car sits, from its four wheels rather than from the ground under
  // its middle. `ground` is the height the body would be at if its wheels were
  // all on level ground; the pitch and the roll come from how far apart the
  // wheels' own patches of ground are.
  sitOnWheels(terrain, vehicle, _sit);
  const ground = _sit.y;
  vehicle.pitch = _sit.pitch;
  vehicle.groundRoll = _sit.roll;

  if (!dt) {
    vehicle.y = ground;
    vehicle.groundY = ground;
    vehicle.vy = 0;
    vehicle.airborne = false;
    return vehicle.y;
  }

  const previous = vehicle.y ?? ground;
  // Where the ground was under the car last frame, so the slope can be read as
  // the car's own speed along it.
  const climbed = ground - (vehicle.groundY ?? ground);
  vehicle.groundY = ground;

  if (!vehicle.airborne) {
    // On its wheels. The car is carried up and down whatever the ground does,
    // so long as the ground does not fall away faster than the car could fall:
    // a crest drops away almost at once, a slope does not.
    //
    // What counts as a crest rather than a slope is how sharply the grade
    // changes, not how big the drop is: a car going down a 50% hill is still
    // on the hill, and taking off every frame because the ground under it is
    // falling fast would have it hopping all the way down. The grade changing
    // from what it was to something far steeper is a crest.
    const wasGrade = vehicle.groundGrade ?? 0;
    const grade = dt > 0 ? climbed / dt : 0;
    vehicle.groundGrade = grade;
    const sharpness = Math.abs(grade - wasGrade);
    const leave = sharpness > CREST_SHARPNESS && grade < wasGrade;
    if (leave) {
      // Over the crest: it is in the air, carrying on at the speed it was
      // climbing at. That is what throws it up: coming up a slope at 12 m/s
      // with the ground rising a metre a second, the car leaves with a metre a
      // second of climb still in it, and gravity has to take that back before
      // it starts to come down.
      vehicle.airborne = true;
      vehicle.airTime = 0;
      vehicle.vy = Math.max(0, wasGrade);
      vehicle.y = previous;
    } else {
      vehicle.y = ground;
      vehicle.vy = 0;
      vehicle.airTime = (vehicle.airTime ?? 0) + 1;
      return vehicle.y;
    }
  }

  // In the air: gravity takes it down.
  vehicle.vy = (vehicle.vy ?? 0) - GRAVITY * dt;
  vehicle.y = previous + vehicle.vy * dt;

  // A car that has fallen far below the ground it should be on is put back on
  // it. Nothing should be able to do this - the ground is read from the map
  // and the map has an edge the car cannot cross - but a car falling for ever
  // is a worse failure than a car that lands somewhere it did not expect, and
  // it is the kind of thing a new piece of map can introduce.
  if (vehicle.y < ground - FALL_ESCAPE) {
    vehicle.y = ground;
    vehicle.vy = 0;
    vehicle.airborne = false;
    vehicle.airTime = 0;
    return vehicle.y;
  }

  if (vehicle.y <= ground) {
    // It has come down. The springs take the arrival, and the body dips.
    const landing = vehicle.vy ?? 0;
    vehicle.y = ground;
    vehicle.vy = 0;
    vehicle.airborne = false;
    vehicle.airTime = 0;
    const thump = Math.min(MAX_LANDING_DIP, Math.max(0, -landing) * LANDING_GIVE);
    if (thump > 0) {
      vehicle.bounce = Math.min((vehicle.bounce || 0) - thump, 0);
    }
  }
  return vehicle.y;
}

// The list of ground types a map declares, turned into what createTerrain
// wants. A map may name the polygons itself; anything it leaves unnamed is
// still ground, it is just the default surface.
export function surfaceAreas(spec = []) {
  const out = [];
  for (const area of spec) {
    if (!area) continue;
    if (area.rect && area.kind) {
      out.push({ rect: area.rect, kind: area.kind });
    } else if (area.ring && area.kind) {
      out.push({ ring: area.ring, kind: area.kind });
    }
  }
  return out;
}
