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

// Puts a vehicle on the ground under it and leans it to match. This is the one
// place a car is stood on the world, so the height and the lean can never
// disagree: both are read from the same sample.
const _lean = { pitch: 0, roll: 0 };
const _normal = { x: 0, y: 1, z: 0 };
export function settleOnGround(terrain, vehicle) {
  vehicle.y = terrain.heightAt(vehicle.x, vehicle.z);
  terrain.normalAt(vehicle.x, vehicle.z, _normal);
  leanOn(_normal, vehicle.heading, _lean);
  vehicle.pitch = _lean.pitch;
  vehicle.groundRoll = _lean.roll;
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
