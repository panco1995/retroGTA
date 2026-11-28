// A lamp post that has been knocked over is still live. The cable it was
// wired with is torn and the head lies on the pavement, so it sparks: a burst
// when it lands, and a fitful flicker from then on until the scene is reset.
//
// The sparks are points on a short lived buffer, drawn with one material, so
// a street full of downed posts costs one draw call each and nothing is
// allocated while they are burning out.

import * as THREE from 'three';

// How many sparks a single fitted-out post can have in the air at once.
const SPARK_MAX = 90;
// How long a spark lives, in seconds.
const SPARK_LIFE = 0.55;
// Gravity on a spark, and how far it is thrown.
const GRAVITY = -14;
// How often the head spits again once it is down, and how far apart the
// bursts may be.
const BURST_EVERY = [0.35, 1.5];
// How bright the head glows when it is sparking, against its normal light.
const FLASH = 1.9;

export function createShocks(scene) {
  // One pool of sparks, grown as posts are knocked down.
  const live = [];

  const sparkGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(SPARK_MAX * 3);
  const colors = new Float32Array(SPARK_MAX * 3);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  sparkGeo.setDrawRange(0, 0);
  const sparkMat = new THREE.PointsMaterial({
    size: 0.075,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(sparkGeo, sparkMat);
  points.frustumCulled = false;
  scene.add(points);

  // The sparks in the air: a ring buffer, so a burst never allocates and an
  // old spark is simply written over.
  const sparks = new Float32Array(SPARK_MAX * 3);
  const sparkVel = new Float32Array(SPARK_MAX * 3);
  const sparkAge = new Float32Array(SPARK_MAX);
  for (let i = 0; i < SPARK_MAX; i += 1) sparkAge[i] = SPARK_LIFE;
  let cursor = 0;

  // The head of a fallen post: a point in the world sparks come out of, the
  // material to flicker, and the clock to the next burst.
  function sparkFrom(x, y, z, count) {
    for (let n = 0; n < count; n += 1) {
      const i = cursor;
      cursor = (cursor + 1) % SPARK_MAX;
      const o = i * 3;
      sparks[o] = x;
      sparks[o + 1] = y;
      sparks[o + 2] = z;
      // A short hop in a random direction, mostly upwards, as a spark off a
      // live cable does.
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 3.4;
      const up = 1.6 + Math.random() * 3.4;
      sparkVel[o] = Math.cos(angle) * speed;
      sparkVel[o + 1] = up;
      sparkVel[o + 2] = Math.sin(angle) * speed;
      sparkAge[i] = 0;
    }
  }

  // A post that has been knocked down. The head is kept where it lies and the
  // sparks keep coming out of it.
  function add(post) {
    if (!post.light || !post.mesh) return null;
    const light = post.light;
    // The material the post was built with is shared with every other lamp,
    // so the flicker is given its own copy to work on.
    const mat = light.clone();
    post.mesh.material = mat;
    const handle = {
      mat,
      base: light.emissiveIntensity ?? 0.45,
      post,
      next: 0.15,
      flash: 0,
      burstAt: new THREE.Vector3(),
    };
    live.push(handle);
    // It lands with a bang rather than a whimper.
    sparkAt(handle, 26);
    handle.flash = FLASH;
    handle.next = BURST_EVERY[0];
    return handle;
  }

  // Where the head of the post is now, in the world.
  const _at = new THREE.Vector3();
  function headOf(handle) {
    const local = handle.post.spec?.headAt;
    if (!local) return handle.burstAt.set(0, 0, 0);
    _at.set(local[0], local[1], local[2]);
    handle.post.group.updateWorldMatrix(true, false);
    return handle.burstAt.copy(_at).applyMatrix4(handle.post.group.matrixWorld);
  }

  function sparkAt(handle, count) {
    const at = headOf(handle);
    sparkFrom(at.x, at.y, at.z, count);
  }

  function update(dt) {
    // The sparks fall and burn out.
    let n = 0;
    for (let i = 0; i < SPARK_MAX; i += 1) {
      if (sparkAge[i] >= SPARK_LIFE) continue;
      sparkAge[i] += dt;
      const o = i * 3;
      sparkVel[o + 1] += GRAVITY * dt;
      sparks[o] += sparkVel[o] * dt;
      sparks[o + 1] += sparkVel[o + 1] * dt;
      sparks[o + 2] += sparkVel[o + 2] * dt;
      // A spark that reaches the pavement fizzles out there.
      if (sparks[o + 1] < 0.06) {
        sparkAge[i] = SPARK_LIFE;
        continue;
      }
      const fade = 1 - sparkAge[i] / SPARK_LIFE;
      positions[n * 3] = sparks[o];
      positions[n * 3 + 1] = sparks[o + 1];
      positions[n * 3 + 2] = sparks[o + 2];
      // White hot at first, then orange, then out.
      colors[n * 3] = 1;
      colors[n * 3 + 1] = 0.55 + fade * 0.45;
      colors[n * 3 + 2] = fade * fade * 0.7;
      n += 1;
    }
    sparkGeo.setDrawRange(0, n);
    if (n > 0) {
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;
    }

    // The heads that are still live spit again now and then, and the light in
    // them flickers.
    for (const handle of live) {
      handle.next -= dt;
      if (handle.next <= 0) {
        sparkAt(handle, 6 + Math.floor(Math.random() * 12));
        handle.flash = FLASH;
        handle.next = BURST_EVERY[0] + Math.random() * (BURST_EVERY[1] - BURST_EVERY[0]);
      }
      handle.flash = Math.max(0.45, handle.flash - dt * 3.6);
      // A cable does not fail cleanly: the glow jumps around.
      const jitter = 0.55 + Math.random() * 0.65;
      handle.mat.emissiveIntensity = handle.base * jitter * handle.flash;
    }
  }

  // A post that has been put back up goes back to a steady lamp.
  function reset(posts) {
    for (const handle of live) {
      handle.mat.emissiveIntensity = handle.base;
    }
    live.length = 0;
    for (let i = 0; i < SPARK_MAX; i += 1) sparkAge[i] = SPARK_LIFE;
    sparkGeo.setDrawRange(0, 0);
    void posts;
  }

  return { add, update, reset };
}
