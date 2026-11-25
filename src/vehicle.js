import * as THREE from 'three';
import { glow, solid } from './materials.js';
import { ROAD_TOP } from './config.js';

const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
const hubGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.26, 8);

function part(parent, w, h, d, mat, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addWheel(parent, x, y, z, front) {
  const steer = new THREE.Group();
  steer.position.set(x, y, z);
  const roller = new THREE.Group();
  const tire = new THREE.Mesh(wheelGeo, solid(0x1a1a1a, 0.7));
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const hub = new THREE.Mesh(hubGeo, solid(0x8d9094, 0.35, 0.6));
  hub.rotation.z = Math.PI / 2;
  roller.add(tire, hub);
  steer.add(roller);
  parent.add(steer);
  return { steer, roller, front };
}

function buildSedan(group, color, taxi) {
  const paint = solid(color, 0.55, 0.08);
  const dark = solid(0x141618, 0.6, 0.2);
  const glass = solid(0x141c22, 0.12, 0.25);
  part(group, 1.78, 0.5, 4.35, paint, 0, 0.72, 0);
  part(group, 1.6, 0.78, 2.05, paint, 0, 1.28, -0.22);
  part(group, 1.46, 0.55, 0.05, glass, 0, 1.32, 0.82);
  part(group, 1.46, 0.5, 0.05, glass, 0, 1.28, -1.26);
  part(group, 0.05, 0.48, 1.7, glass, -0.8, 1.28, -0.2);
  part(group, 0.05, 0.48, 1.7, glass, 0.8, 1.28, -0.2);
  part(group, 1.82, 0.16, 0.14, dark, 0, 0.42, 2.2);
  part(group, 1.82, 0.16, 0.14, dark, 0, 0.42, -2.2);
  part(group, 0.95, 0.22, 0.06, dark, 0, 0.58, 2.2);
  part(group, 0.22, 0.14, 0.06, glow(0xfff1cc, 0.7), -0.58, 0.62, 2.22);
  part(group, 0.22, 0.14, 0.06, glow(0xfff1cc, 0.7), 0.58, 0.62, 2.22);
  const tailL = part(group, 0.28, 0.12, 0.06, glow(0xff2a2a, 0.35).clone(), -0.62, 0.66, -2.22);
  const tailR = part(group, 0.28, 0.12, 0.06, glow(0xff2a2a, 0.35).clone(), 0.62, 0.66, -2.22);
  part(group, 0.42, 0.12, 0.04, solid(0xd9d3c4, 0.5), 0, 0.5, -2.24);
  if (taxi) {
    part(group, 0.46, 0.12, 0.28, glow(0xfff6d8, 0.5), 0, 1.78, -0.15);
  }
  const wheels = [
    addWheel(group, -0.82, ROAD_TOP + 0.34, 1.38, true),
    addWheel(group, 0.82, ROAD_TOP + 0.34, 1.38, true),
    addWheel(group, -0.82, ROAD_TOP + 0.34, -1.38, false),
    addWheel(group, 0.82, ROAD_TOP + 0.34, -1.38, false),
  ];
  return { wheels, tails: [tailL, tailR], length: 4.45, width: 1.85 };
}

function buildVan(group, color) {
  const paint = solid(color, 0.62, 0.05);
  const dark = solid(0x15171a, 0.65, 0.15);
  const glass = solid(0x141c22, 0.12, 0.25);
  part(group, 1.9, 1.45, 4.7, paint, 0, 1.12, 0);
  part(group, 1.55, 0.55, 0.06, glass, 0, 1.45, 2.38);
  part(group, 0.05, 0.5, 0.7, glass, -0.96, 1.5, 1.7);
  part(group, 0.05, 0.5, 0.7, glass, 0.96, 1.5, 1.7);
  part(group, 1.92, 0.18, 0.12, dark, 0, 0.48, 2.4);
  part(group, 1.92, 0.18, 0.12, dark, 0, 0.48, -2.4);
  part(group, 0.24, 0.16, 0.06, glow(0xfff1cc, 0.6), -0.62, 0.72, 2.4);
  part(group, 0.24, 0.16, 0.06, glow(0xfff1cc, 0.6), 0.62, 0.72, 2.4);
  const tailL = part(group, 0.26, 0.16, 0.06, glow(0xff2a2a, 0.35).clone(), -0.7, 0.78, -2.4);
  const tailR = part(group, 0.26, 0.16, 0.06, glow(0xff2a2a, 0.35).clone(), 0.7, 0.78, -2.4);
  const wheels = [
    addWheel(group, -0.9, ROAD_TOP + 0.34, 1.5, true),
    addWheel(group, 0.9, ROAD_TOP + 0.34, 1.5, true),
    addWheel(group, -0.9, ROAD_TOP + 0.34, -1.5, false),
    addWheel(group, 0.9, ROAD_TOP + 0.34, -1.5, false),
  ];
  return { wheels, tails: [tailL, tailR], length: 4.85, width: 1.95 };
}

export function createVehicle(cfg) {
  const group = new THREE.Group();
  const taxi = cfg.type === 'taxi';
  const built = cfg.type === 'van' ? buildVan(group, cfg.color) : buildSedan(group, cfg.color, taxi);
  const state = {
    group,
    type: cfg.type ?? 'sedan',
    driveable: !!cfg.driveable,
    x: cfg.x,
    z: cfg.z,
    heading: cfg.heading ?? 0,
    speed: 0,
    steer: 0,
    braking: false,
    length: built.length,
    width: built.width,
    radius: cfg.type === 'van' ? 1.85 : 1.7,
    wheels: built.wheels,
    tails: built.tails,
    _spin: 0,
    _aabb: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    sync() {
      group.rotation.order = 'YXZ';
      group.position.set(this.x, this.y || 0, this.z);
      group.rotation.y = this.heading;
      group.rotation.x = this.pitch || 0;
    },
    collider() {
      const c = Math.abs(Math.cos(this.heading));
      const s = Math.abs(Math.sin(this.heading));
      const hx = (this.length * s + this.width * c) / 2;
      const hz = (this.length * c + this.width * s) / 2;
      this._aabb.minX = this.x - hx;
      this._aabb.maxX = this.x + hx;
      this._aabb.minZ = this.z - hz;
      this._aabb.maxZ = this.z + hz;
      return this._aabb;
    },
    updateVisual(dt) {
      this.sync();
      this._spin += (this.speed / 0.34) * dt;
      for (const wheel of this.wheels) {
        wheel.roller.rotation.x = this._spin;
        if (wheel.front) wheel.steer.rotation.y = this.steer;
      }
      const glowAmount = this.braking ? 1.6 : 0.28;
      for (const tail of this.tails) tail.material.emissiveIntensity = glowAmount;
    },
  };
  state.sync();
  return state;
}
