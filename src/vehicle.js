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

function addWheel(parent, x, y, z, front, scale = 1) {
  const steer = new THREE.Group();
  steer.position.set(x, y, z);
  steer.scale.setScalar(scale);
  const roller = new THREE.Group();
  const tire = new THREE.Mesh(wheelGeo, solid(0x1a1a1a, 0.7));
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const hub = new THREE.Mesh(hubGeo, solid(0x8d9094, 0.35, 0.6));
  hub.rotation.z = Math.PI / 2;
  roller.add(tire, hub);
  steer.add(roller);
  parent.add(steer);
  return { steer, roller, front, radius: 0.34 * scale };
}

function wheelY(scale = 1) {
  return ROAD_TOP + 0.34 * scale;
}

function beam(parent, a, b, thickness, mat) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(to, from);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thickness, thickness, dir.length()), mat);
  mesh.position.copy(from).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
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
    addWheel(group, -0.82, wheelY(), 1.38, true),
    addWheel(group, 0.82, wheelY(), 1.38, true),
    addWheel(group, -0.82, wheelY(), -1.38, false),
    addWheel(group, 0.82, wheelY(), -1.38, false),
  ];
  return { wheels, tails: [tailL, tailR], length: 4.45, width: 1.85, radius: 1.7 };
}

function buildHatchback(group, color) {
  const paint = solid(color, 0.55, 0.08);
  const dark = solid(0x141618, 0.6, 0.2);
  const glass = solid(0x141c22, 0.12, 0.25);
  part(group, 1.7, 0.5, 3.75, paint, 0, 0.7, 0);
  part(group, 1.56, 0.72, 1.9, paint, 0, 1.24, -0.05);
  part(group, 1.42, 0.5, 0.05, glass, 0, 1.28, 0.92);
  const hatch = part(group, 1.4, 0.5, 0.05, glass, 0, 1.24, -1.02);
  hatch.rotation.x = -0.28;
  part(group, 0.05, 0.46, 1.55, glass, -0.79, 1.25, -0.05);
  part(group, 0.05, 0.46, 1.55, glass, 0.79, 1.25, -0.05);
  part(group, 1.74, 0.14, 0.14, dark, 0, 0.42, 1.9);
  part(group, 1.74, 0.14, 0.14, dark, 0, 0.42, -1.9);
  part(group, 0.9, 0.2, 0.06, dark, 0, 0.56, 1.9);
  part(group, 0.2, 0.13, 0.06, glow(0xfff1cc, 0.7), -0.56, 0.6, 1.92);
  part(group, 0.2, 0.13, 0.06, glow(0xfff1cc, 0.7), 0.56, 0.6, 1.92);
  const tailL = part(group, 0.24, 0.16, 0.06, glow(0xff2a2a, 0.35).clone(), -0.62, 0.68, -1.9);
  const tailR = part(group, 0.24, 0.16, 0.06, glow(0xff2a2a, 0.35).clone(), 0.62, 0.68, -1.9);
  const wheels = [
    addWheel(group, -0.78, wheelY(), 1.2, true),
    addWheel(group, 0.78, wheelY(), 1.2, true),
    addWheel(group, -0.78, wheelY(), -1.2, false),
    addWheel(group, 0.78, wheelY(), -1.2, false),
  ];
  return { wheels, tails: [tailL, tailR], length: 3.9, width: 1.78, radius: 1.55 };
}

function buildSuv(group, color) {
  const paint = solid(color, 0.6, 0.06);
  const dark = solid(0x141618, 0.6, 0.2);
  const glass = solid(0x141c22, 0.12, 0.25);
  part(group, 1.92, 0.78, 4.55, paint, 0, 0.92, 0);
  part(group, 1.8, 0.82, 2.55, paint, 0, 1.58, -0.2);
  part(group, 1.6, 0.6, 0.05, glass, 0, 1.6, 1.1);
  part(group, 1.58, 0.56, 0.05, glass, 0, 1.58, -1.5);
  part(group, 0.05, 0.56, 2.2, glass, -0.91, 1.58, -0.2);
  part(group, 0.05, 0.56, 2.2, glass, 0.91, 1.58, -0.2);
  part(group, 0.08, 0.08, 2.0, dark, -0.66, 2.02, -0.2);
  part(group, 0.08, 0.08, 2.0, dark, 0.66, 2.02, -0.2);
  part(group, 1.96, 0.2, 0.16, dark, 0, 0.46, 2.3);
  part(group, 1.96, 0.2, 0.16, dark, 0, 0.46, -2.3);
  part(group, 0.3, 0.18, 0.06, glow(0xfff1cc, 0.7), -0.64, 0.78, 2.32);
  part(group, 0.3, 0.18, 0.06, glow(0xfff1cc, 0.7), 0.64, 0.78, 2.32);
  const tailL = part(group, 0.28, 0.18, 0.06, glow(0xff2a2a, 0.35).clone(), -0.68, 0.82, -2.32);
  const tailR = part(group, 0.28, 0.18, 0.06, glow(0xff2a2a, 0.35).clone(), 0.68, 0.82, -2.32);
  const wheels = [
    addWheel(group, -0.86, wheelY(1.08), 1.45, true, 1.08),
    addWheel(group, 0.86, wheelY(1.08), 1.45, true, 1.08),
    addWheel(group, -0.86, wheelY(1.08), -1.45, false, 1.08),
    addWheel(group, 0.86, wheelY(1.08), -1.45, false, 1.08),
  ];
  return { wheels, tails: [tailL, tailR], length: 4.7, width: 1.98, radius: 1.85 };
}

function buildPickup(group, color) {
  const paint = solid(color, 0.58, 0.07);
  const dark = solid(0x141618, 0.6, 0.2);
  const glass = solid(0x141c22, 0.12, 0.25);
  part(group, 1.88, 0.3, 5.15, paint, 0, 0.62, 0);
  part(group, 1.86, 0.42, 1.35, paint, 0, 0.92, 1.85);
  part(group, 1.84, 0.7, 1.75, paint, 0, 1.15, 0.55);
  part(group, 1.68, 0.55, 1.25, paint, 0, 1.72, 0.5);
  part(group, 1.5, 0.45, 0.05, glass, 0, 1.74, 1.1);
  part(group, 1.48, 0.4, 0.05, glass, 0, 1.72, -0.1);
  part(group, 0.05, 0.4, 1.1, glass, -0.85, 1.72, 0.5);
  part(group, 0.05, 0.4, 1.1, glass, 0.85, 1.72, 0.5);
  part(group, 1.8, 0.16, 2.3, paint, 0, 0.92, -1.45);
  part(group, 0.08, 0.45, 2.3, paint, -0.9, 1.15, -1.45);
  part(group, 0.08, 0.45, 2.3, paint, 0.9, 1.15, -1.45);
  part(group, 1.8, 0.45, 0.08, paint, 0, 1.15, -2.6);
  part(group, 1.94, 0.18, 0.16, dark, 0, 0.42, 2.56);
  part(group, 1.94, 0.18, 0.16, dark, 0, 0.42, -2.64);
  part(group, 0.32, 0.18, 0.06, glow(0xfff1cc, 0.7), -0.62, 0.8, 2.58);
  part(group, 0.32, 0.18, 0.06, glow(0xfff1cc, 0.7), 0.62, 0.8, 2.58);
  const tailL = part(group, 0.28, 0.18, 0.06, glow(0xff2a2a, 0.35).clone(), -0.68, 0.78, -2.65);
  const tailR = part(group, 0.28, 0.18, 0.06, glow(0xff2a2a, 0.35).clone(), 0.68, 0.78, -2.65);
  const wheels = [
    addWheel(group, -0.88, wheelY(1.12), 1.65, true, 1.12),
    addWheel(group, 0.88, wheelY(1.12), 1.65, true, 1.12),
    addWheel(group, -0.88, wheelY(1.12), -1.65, false, 1.12),
    addWheel(group, 0.88, wheelY(1.12), -1.65, false, 1.12),
  ];
  return { wheels, tails: [tailL, tailR], length: 5.3, width: 1.96, radius: 2.05 };
}

function buildSports(group, color) {
  const paint = solid(color, 0.5, 0.15);
  const dark = solid(0x141618, 0.6, 0.2);
  const glass = solid(0x141c22, 0.1, 0.3);
  part(group, 1.9, 0.42, 4.35, paint, 0, 0.6, 0);
  part(group, 1.78, 0.24, 1.1, paint, 0, 0.78, 1.75);
  part(group, 1.5, 0.45, 1.7, paint, 0, 0.98, -0.15);
  const windshield = part(group, 1.38, 0.5, 0.05, glass, 0, 1.04, 0.7);
  windshield.rotation.x = 0.5;
  const rearGlass = part(group, 1.36, 0.44, 0.05, glass, 0, 1.02, -1.0);
  rearGlass.rotation.x = -0.42;
  part(group, 0.05, 0.36, 1.25, glass, -0.76, 1.02, -0.15);
  part(group, 0.05, 0.36, 1.25, glass, 0.76, 1.02, -0.15);
  part(group, 0.08, 0.28, 0.1, dark, -0.55, 1.14, -2.0);
  part(group, 0.08, 0.28, 0.1, dark, 0.55, 1.14, -2.0);
  part(group, 1.7, 0.07, 0.34, paint, 0, 1.28, -2.0);
  part(group, 1.94, 0.14, 0.14, dark, 0, 0.38, 2.2);
  part(group, 1.94, 0.14, 0.14, dark, 0, 0.38, -2.2);
  part(group, 0.26, 0.12, 0.06, glow(0xfff1cc, 0.8), -0.62, 0.52, 2.22);
  part(group, 0.26, 0.12, 0.06, glow(0xfff1cc, 0.8), 0.62, 0.52, 2.22);
  const tailL = part(group, 0.3, 0.1, 0.06, glow(0xff2a2a, 0.35).clone(), -0.64, 0.55, -2.22);
  const tailR = part(group, 0.3, 0.1, 0.06, glow(0xff2a2a, 0.35).clone(), 0.64, 0.55, -2.22);
  const wheels = [
    addWheel(group, -0.86, wheelY(), 1.45, true),
    addWheel(group, 0.86, wheelY(), 1.45, true),
    addWheel(group, -0.86, wheelY(), -1.45, false),
    addWheel(group, 0.86, wheelY(), -1.45, false),
  ];
  return { wheels, tails: [tailL, tailR], length: 4.45, width: 1.98, radius: 1.7 };
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
    addWheel(group, -0.9, wheelY(), 1.5, true),
    addWheel(group, 0.9, wheelY(), 1.5, true),
    addWheel(group, -0.9, wheelY(), -1.5, false),
    addWheel(group, 0.9, wheelY(), -1.5, false),
  ];
  return { wheels, tails: [tailL, tailR], length: 4.85, width: 1.95, radius: 1.85 };
}

function buildBus(group, color) {
  const paint = solid(color, 0.6, 0.05);
  const dark = solid(0x141618, 0.65, 0.15);
  const glass = solid(0x141c22, 0.1, 0.3);
  part(group, 2.45, 2.5, 10.4, paint, 0, 1.7, 0);
  part(group, 2.4, 0.12, 10.4, paint, 0, 3.0, 0);
  part(group, 0.06, 0.85, 8.6, glass, -1.24, 2.35, -0.3);
  part(group, 0.06, 0.85, 8.6, glass, 1.24, 2.35, -0.3);
  part(group, 2.1, 0.9, 0.06, glass, 0, 2.3, 5.22);
  part(group, 1.9, 0.7, 0.06, glass, 0, 2.3, -5.22);
  part(group, 0.07, 1.9, 0.9, dark, 1.24, 1.55, 3.5);
  part(group, 0.07, 1.9, 0.9, dark, 1.24, 1.55, 1.5);
  part(group, 2.5, 0.22, 0.16, dark, 0, 0.52, 5.28);
  part(group, 2.5, 0.22, 0.16, dark, 0, 0.52, -5.28);
  part(group, 0.32, 0.2, 0.06, glow(0xfff1cc, 0.7), -0.85, 0.82, 5.3);
  part(group, 0.32, 0.2, 0.06, glow(0xfff1cc, 0.7), 0.85, 0.82, 5.3);
  const tailL = part(group, 0.3, 0.22, 0.06, glow(0xff2a2a, 0.35).clone(), -0.85, 0.88, -5.3);
  const tailR = part(group, 0.3, 0.22, 0.06, glow(0xff2a2a, 0.35).clone(), 0.85, 0.88, -5.3);
  const wheels = [
    addWheel(group, -1.06, wheelY(1.25), 3.55, true, 1.25),
    addWheel(group, 1.06, wheelY(1.25), 3.55, true, 1.25),
    addWheel(group, -1.06, wheelY(1.25), -3.3, false, 1.25),
    addWheel(group, 1.06, wheelY(1.25), -3.3, false, 1.25),
  ];
  return { wheels, tails: [tailL, tailR], length: 10.6, width: 2.5, radius: 5.3 };
}

function buildTruck(group, color) {
  const paint = solid(color, 0.62, 0.05);
  const dark = solid(0x141618, 0.65, 0.15);
  const glass = solid(0x141c22, 0.1, 0.3);
  part(group, 2.3, 0.32, 6.3, dark, 0, 0.62, -0.1);
  part(group, 2.35, 2.35, 4.6, paint, 0, 1.75, -1.0);
  part(group, 2.1, 2.0, 0.06, solid(0x2a2d30, 0.55, 0.1), 0, 1.7, -3.32);
  part(group, 2.2, 1.7, 2.0, paint, 0, 1.35, 2.2);
  part(group, 2.0, 0.75, 0.06, glass, 0, 1.75, 3.22);
  part(group, 0.06, 0.6, 1.2, glass, -1.11, 1.72, 2.2);
  part(group, 0.06, 0.6, 1.2, glass, 1.11, 1.72, 2.2);
  part(group, 2.4, 0.24, 0.16, dark, 0, 0.5, 3.26);
  part(group, 2.4, 0.24, 0.16, dark, 0, 0.5, -3.36);
  part(group, 0.3, 0.2, 0.06, glow(0xfff1cc, 0.7), -0.8, 0.78, 3.28);
  part(group, 0.3, 0.2, 0.06, glow(0xfff1cc, 0.7), 0.8, 0.78, 3.28);
  const tailL = part(group, 0.28, 0.24, 0.06, glow(0xff2a2a, 0.35).clone(), -0.9, 0.8, -3.38);
  const tailR = part(group, 0.28, 0.24, 0.06, glow(0xff2a2a, 0.35).clone(), 0.9, 0.8, -3.38);
  const wheels = [
    addWheel(group, -0.95, wheelY(1.28), 2.6, true, 1.28),
    addWheel(group, 0.95, wheelY(1.28), 2.6, true, 1.28),
    addWheel(group, -0.95, wheelY(1.28), -1.7, false, 1.28),
    addWheel(group, 0.95, wheelY(1.28), -2.7, false, 1.28),
  ];
  return { wheels, tails: [tailL, tailR], length: 6.6, width: 2.42, radius: 3.3 };
}

function buildExcavator(group, color) {
  const paint = solid(color, 0.58, 0.08);
  const dark = solid(0x1c1e20, 0.7, 0.15);
  const steel = solid(0x6d7275, 0.5, 0.3);
  const glass = solid(0x141c22, 0.1, 0.3);
  part(group, 0.62, 0.75, 3.7, dark, -1.0, 0.55, 0);
  part(group, 0.62, 0.75, 3.7, dark, 1.0, 0.55, 0);
  part(group, 2.3, 0.25, 2.4, dark, 0, 0.98, 0);
  part(group, 2.2, 1.2, 2.7, paint, 0, 1.7, -0.35);
  part(group, 2.25, 0.9, 0.55, paint, 0, 1.55, -1.85);
  part(group, 0.95, 1.15, 1.35, paint, -0.62, 2.05, 0.45);
  part(group, 0.05, 0.75, 1.05, glass, -1.11, 2.12, 0.45);
  part(group, 0.75, 0.7, 0.05, glass, -0.62, 2.15, 1.14);
  part(group, 0.9, 0.55, 1.8, paint, 0.62, 2.0, -0.7);
  beam(group, [0, 1.9, 0.6], [0, 3.2, 2.5], 0.45, paint);
  beam(group, [0, 3.2, 2.5], [0, 1.7, 4.2], 0.32, paint);
  const bucket = part(group, 1.05, 0.7, 0.75, steel, 0, 1.1, 4.35);
  bucket.rotation.x = 0.25;
  beam(group, [0, 1.7, 0.9], [0, 2.75, 1.9], 0.16, steel);
  beam(group, [0, 3.05, 2.4], [0, 1.95, 3.7], 0.14, steel);
  beam(group, [0.45, 2.3, -0.5], [0.45, 2.8, -0.5], 0.12, dark);
  part(group, 0.2, 0.14, 0.2, glow(0xffb020, 0.5), -0.62, 2.7, 0.45);
  return { wheels: [], tails: [], length: 7.0, width: 2.7, radius: 3.6 };
}

function buildTractor(group, color) {
  const paint = solid(color, 0.6, 0.08);
  const dark = solid(0x1a1c1e, 0.7, 0.15);
  const steel = solid(0x6d7275, 0.5, 0.3);
  part(group, 1.0, 0.55, 2.8, paint, 0, 1.0, 0);
  part(group, 0.95, 0.45, 1.5, paint, 0, 1.35, 0.9);
  part(group, 0.9, 0.1, 1.5, dark, 0, 1.6, 0.9);
  part(group, 1.15, 0.55, 0.7, paint, 0, 1.55, -0.35);
  part(group, 0.5, 0.6, 0.15, dark, 0, 1.95, -0.65);
  beam(group, [-0.5, 1.7, -0.7], [-0.5, 2.5, -0.7], 0.1, steel);
  beam(group, [0.5, 1.7, -0.7], [0.5, 2.5, -0.7], 0.1, steel);
  beam(group, [-0.5, 2.5, -0.7], [0.5, 2.5, -0.7], 0.1, steel);
  beam(group, [0.3, 1.55, 1.2], [0.3, 2.2, 1.2], 0.09, dark);
  part(group, 0.2, 0.3, 1.6, paint, -0.88, 1.1, -0.5);
  part(group, 0.2, 0.3, 1.6, paint, 0.88, 1.1, -0.5);
  part(group, 0.16, 0.16, 0.06, glow(0xfff1cc, 0.7), -0.3, 1.35, 1.66);
  part(group, 0.16, 0.16, 0.06, glow(0xfff1cc, 0.7), 0.3, 1.35, 1.66);
  const wheels = [
    addWheel(group, -0.78, wheelY(1.55), -0.75, false, 1.55),
    addWheel(group, 0.78, wheelY(1.55), -0.75, false, 1.55),
    addWheel(group, -0.62, wheelY(0.8), 1.15, true, 0.8),
    addWheel(group, 0.62, wheelY(0.8), 1.15, true, 0.8),
  ];
  return { wheels, tails: [], length: 3.6, width: 1.9, radius: 1.5 };
}

function buildAmbulance(group, color) {
  const paint = solid(color, 0.5, 0.1);
  const red = solid(0xc22a2a, 0.45, 0.1);
  const dark = solid(0x141618, 0.6, 0.2);
  const glass = solid(0x141c22, 0.1, 0.3);
  part(group, 2.0, 1.95, 4.8, paint, 0, 1.35, -0.25);
  part(group, 1.9, 0.75, 1.0, paint, 0, 0.9, 2.45);
  const windshield = part(group, 1.7, 0.75, 0.06, glass, 0, 1.65, 2.38);
  windshield.rotation.x = 0.18;
  part(group, 0.05, 0.55, 0.95, glass, -1.0, 1.65, 1.85);
  part(group, 0.05, 0.55, 0.95, glass, 1.0, 1.65, 1.85);
  part(group, 0.04, 0.28, 4.6, red, -1.01, 1.1, -0.3);
  part(group, 0.04, 0.28, 4.6, red, 1.01, 1.1, -0.3);
  for (const side of [-1, 1]) {
    part(group, 0.03, 0.6, 0.2, red, side * 1.02, 1.65, -0.9);
    part(group, 0.03, 0.2, 0.6, red, side * 1.02, 1.65, -0.9);
  }
  part(group, 0.6, 0.2, 0.03, red, 0, 1.55, -2.66);
  part(group, 0.2, 0.6, 0.03, red, 0, 1.55, -2.66);
  part(group, 1.1, 0.14, 0.32, dark, 0, 2.4, 1.9);
  part(group, 0.4, 0.16, 0.28, glow(0xff3030, 0.6), -0.28, 2.42, 1.9);
  part(group, 0.4, 0.16, 0.28, glow(0x2a6cff, 0.6), 0.28, 2.42, 1.9);
  part(group, 2.04, 0.2, 0.16, dark, 0, 0.48, 2.96);
  part(group, 2.04, 0.2, 0.16, dark, 0, 0.48, -2.68);
  part(group, 0.28, 0.18, 0.06, glow(0xfff1cc, 0.7), -0.64, 0.85, 2.98);
  part(group, 0.28, 0.18, 0.06, glow(0xfff1cc, 0.7), 0.64, 0.85, 2.98);
  const tailL = part(group, 0.26, 0.2, 0.06, glow(0xff2a2a, 0.35).clone(), -0.7, 0.85, -2.7);
  const tailR = part(group, 0.26, 0.2, 0.06, glow(0xff2a2a, 0.35).clone(), 0.7, 0.85, -2.7);
  const wheels = [
    addWheel(group, -0.9, wheelY(), 1.75, true),
    addWheel(group, 0.9, wheelY(), 1.75, true),
    addWheel(group, -0.9, wheelY(), -1.55, false),
    addWheel(group, 0.9, wheelY(), -1.55, false),
  ];
  return { wheels, tails: [tailL, tailR], length: 5.6, width: 2.04, radius: 2.1 };
}

function buildFireTruck(group, color) {
  const paint = solid(color, 0.55, 0.1);
  const dark = solid(0x141618, 0.65, 0.15);
  const glass = solid(0x141c22, 0.1, 0.3);
  const steel = solid(0x9aa0a4, 0.35, 0.45);
  part(group, 2.25, 0.3, 8.2, dark, 0, 0.62, 0);
  part(group, 2.3, 1.85, 2.2, paint, 0, 1.45, 3.0);
  part(group, 2.0, 0.75, 0.06, glass, 0, 1.75, 4.12);
  part(group, 0.06, 0.6, 1.3, glass, -1.16, 1.75, 3.0);
  part(group, 0.06, 0.6, 1.3, glass, 1.16, 1.75, 3.0);
  part(group, 2.4, 2.05, 4.9, paint, 0, 1.75, -1.0);
  for (const z of [0.6, -0.6, -1.8]) {
    part(group, 0.03, 1.2, 1.0, steel, -1.21, 1.55, z);
    part(group, 0.03, 1.2, 1.0, steel, 1.21, 1.55, z);
  }
  part(group, 2.1, 1.7, 0.05, steel, 0, 1.6, -3.47);
  for (const x of [-0.5, 0.5]) {
    part(group, 0.08, 0.08, 4.8, steel, x, 2.95, -1.0);
  }
  for (let i = 0; i < 7; i += 1) {
    part(group, 1.1, 0.06, 0.06, steel, 0, 2.95, -3.0 + i * 0.7);
  }
  part(group, 1.3, 0.14, 0.32, dark, 0, 2.5, 3.0);
  part(group, 0.46, 0.16, 0.28, glow(0xff3030, 0.6), -0.32, 2.52, 3.0);
  part(group, 0.46, 0.16, 0.28, glow(0x2a6cff, 0.6), 0.32, 2.52, 3.0);
  part(group, 2.48, 0.22, 0.16, dark, 0, 0.48, 4.16);
  part(group, 2.48, 0.22, 0.16, dark, 0, 0.48, -3.5);
  part(group, 0.3, 0.2, 0.06, glow(0xfff1cc, 0.7), -0.82, 0.82, 4.18);
  part(group, 0.3, 0.2, 0.06, glow(0xfff1cc, 0.7), 0.82, 0.82, 4.18);
  const tailL = part(group, 0.28, 0.22, 0.06, glow(0xff2a2a, 0.35).clone(), -0.85, 0.85, -3.52);
  const tailR = part(group, 0.28, 0.22, 0.06, glow(0xff2a2a, 0.35).clone(), 0.85, 0.85, -3.52);
  const wheels = [
    addWheel(group, -1.0, wheelY(1.28), 3.1, true, 1.28),
    addWheel(group, 1.0, wheelY(1.28), 3.1, true, 1.28),
    addWheel(group, -1.0, wheelY(1.28), -1.9, false, 1.28),
    addWheel(group, 1.0, wheelY(1.28), -1.9, false, 1.28),
    addWheel(group, -1.0, wheelY(1.28), -2.9, false, 1.28),
    addWheel(group, 1.0, wheelY(1.28), -2.9, false, 1.28),
  ];
  return { wheels, tails: [tailL, tailR], length: 7.8, width: 2.48, radius: 4.0 };
}

function buildPolice(group, color) {
  const built = buildSedan(group, color, false);
  const blue = solid(0x1d4f9c, 0.45, 0.1);
  const dark = solid(0x141618, 0.6, 0.2);
  part(group, 0.04, 0.2, 4.2, blue, -0.9, 0.82, 0);
  part(group, 0.04, 0.2, 4.2, blue, 0.9, 0.82, 0);
  part(group, 1.0, 0.12, 0.3, dark, 0, 1.74, -0.15);
  part(group, 0.38, 0.14, 0.26, glow(0xff3030, 0.7), -0.25, 1.76, -0.15);
  part(group, 0.38, 0.14, 0.26, glow(0x2a6cff, 0.7), 0.25, 1.76, -0.15);
  return built;
}

function buildMixer(group, color) {
  const paint = solid(color, 0.6, 0.08);
  const dark = solid(0x141618, 0.65, 0.15);
  const glass = solid(0x141c22, 0.1, 0.3);
  const steel = solid(0x8a8f92, 0.4, 0.4);
  part(group, 2.2, 0.32, 7.2, dark, 0, 0.62, 0);
  part(group, 2.2, 1.7, 2.2, paint, 0, 1.4, 2.7);
  part(group, 2.0, 0.7, 0.06, glass, 0, 1.7, 3.82);
  part(group, 0.06, 0.55, 1.3, glass, -1.11, 1.7, 2.7);
  part(group, 0.06, 0.55, 1.3, glass, 1.11, 1.7, 2.7);
  const drumTilt = Math.PI / 2 - 0.12;
  const drumAxis = new THREE.Vector3(0, Math.cos(drumTilt), Math.sin(drumTilt));
  const drumCenter = new THREE.Vector3(0, 2.05, -1.0);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.2, 4.0, 14), paint);
  drum.position.copy(drumCenter);
  drum.rotation.x = drumTilt;
  drum.castShadow = true;
  drum.receiveShadow = true;
  group.add(drum);
  for (const t of [-1.4, 0, 1.4]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95 - 0.125 * t + 0.02, 0.055, 6, 18), steel);
    ring.position.copy(drumCenter).addScaledVector(drumAxis, t);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), drumAxis);
    ring.castShadow = true;
    group.add(ring);
  }
  const mouth = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 16), dark);
  mouth.position.copy(drumCenter).addScaledVector(drumAxis, -2.02);
  mouth.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), drumAxis);
  mouth.castShadow = true;
  group.add(mouth);
  beam(group, [0, 1.1, 0.8], [0, 2.0, 0.2], 0.22, steel);
  beam(group, [0, 1.1, -2.6], [0, 2.0, -2.2], 0.22, steel);
  part(group, 1.2, 0.8, 0.8, steel, 0, 1.8, -3.1);
  beam(group, [0, 1.6, -3.2], [0, 1.0, -3.8], 0.25, steel);
  part(group, 2.4, 0.22, 0.16, dark, 0, 0.48, 3.84);
  part(group, 2.4, 0.22, 0.16, dark, 0, 0.48, -3.9);
  part(group, 0.3, 0.2, 0.06, glow(0xfff1cc, 0.7), -0.8, 0.8, 3.86);
  part(group, 0.3, 0.2, 0.06, glow(0xfff1cc, 0.7), 0.8, 0.8, 3.86);
  const tailL = part(group, 0.28, 0.22, 0.06, glow(0xff2a2a, 0.35).clone(), -0.85, 0.82, -3.92);
  const tailR = part(group, 0.28, 0.22, 0.06, glow(0xff2a2a, 0.35).clone(), 0.85, 0.82, -3.92);
  const wheels = [
    addWheel(group, -0.98, wheelY(1.25), 2.7, true, 1.25),
    addWheel(group, 0.98, wheelY(1.25), 2.7, true, 1.25),
    addWheel(group, -0.98, wheelY(1.25), -1.6, false, 1.25),
    addWheel(group, 0.98, wheelY(1.25), -1.6, false, 1.25),
    addWheel(group, -0.98, wheelY(1.25), -2.7, false, 1.25),
    addWheel(group, 0.98, wheelY(1.25), -2.7, false, 1.25),
  ];
  return { wheels, tails: [tailL, tailR], length: 7.8, width: 2.4, radius: 4.0 };
}

const BUILDERS = {
  sedan: buildSedan,
  taxi: buildSedan,
  hatchback: buildHatchback,
  suv: buildSuv,
  pickup: buildPickup,
  sports: buildSports,
  van: buildVan,
  bus: buildBus,
  truck: buildTruck,
  excavator: buildExcavator,
  tractor: buildTractor,
  ambulance: buildAmbulance,
  firetruck: buildFireTruck,
  police: buildPolice,
  mixer: buildMixer,
};

export const VEHICLE_TYPES = Object.keys(BUILDERS);

// Door panels per vehicle type: the lower body side panel on the driver's side.
// Local space of the vehicle: y is the panel centre, z is the hinge (front) edge,
// w/h are the panel size. Vehicles without a cab (excavator, tractor) have none.
const DOOR_SPECS = {
  sedan: { y: 0.72, z: 0.6, w: 1.15, h: 0.42 },
  taxi: { y: 0.72, z: 0.6, w: 1.15, h: 0.42 },
  police: { y: 0.72, z: 0.6, w: 1.15, h: 0.42 },
  hatchback: { y: 0.7, z: 0.5, w: 1.05, h: 0.42 },
  suv: { y: 0.92, z: 0.65, w: 1.2, h: 0.6 },
  pickup: { y: 1.15, z: 1.3, w: 0.85, h: 0.5 },
  sports: { y: 0.6, z: 0.95, w: 1.0, h: 0.38 },
  van: { y: 0.95, z: 1.65, w: 0.95, h: 1.1 },
  bus: { y: 1.7, z: 4.3, w: 1.0, h: 1.8 },
  truck: { y: 1.35, z: 3.15, w: 0.9, h: 1.35 },
  ambulance: { y: 1.2, z: 1.5, w: 0.9, h: 1.2 },
  firetruck: { y: 1.45, z: 3.85, w: 0.9, h: 1.5 },
  mixer: { y: 1.4, z: 3.6, w: 0.9, h: 1.4 },
  excavator: { y: 2.05, z: 1.15, w: 0.95, h: 1.05 },
  tractor: { y: 1.55, z: 0.15, w: 0.7, h: 0.75 },
};

const DOOR_OPEN_ANGLE = 1.2;

// The body paint is the material of the largest box in the build, so the door
// panel matches the body without every builder having to hand it over.
function bodyMaterial(group) {
  let best = null;
  let bestVolume = 0;
  const size = new THREE.Vector3();
  group.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    obj.geometry.computeBoundingBox();
    obj.geometry.boundingBox.getSize(size);
    const volume = size.x * size.y * size.z;
    if (volume > bestVolume) {
      bestVolume = volume;
      best = obj.material;
    }
  });
  return best;
}

// Hinged on the front edge, panel extends backwards, swings out on local -X.
function addDoor(group, width, spec, mat) {
  const paint = mat ? mat.clone() : solid(0x22262a, 0.6);
  if (paint.color) paint.color.multiplyScalar(0.55);
  const hinge = new THREE.Group();
  hinge.position.set(-(width / 2) - 0.04, spec.y, spec.z);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.06, spec.h, spec.w), paint);
  panel.position.set(-0.05, 0, -spec.w / 2);
  panel.castShadow = true;
  panel.receiveShadow = true;
  const window = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, spec.h * 0.42, spec.w * 0.5),
    solid(0x9ec4d4, 0.15, 0.3),
  );
  window.position.set(-0.09, spec.h * 0.12, -spec.w * 0.42);
  hinge.add(panel, window);
  group.add(hinge);
  return hinge;
}

const footprints = new Map();

export function vehicleFootprint(type) {
  const key = type in BUILDERS ? type : 'sedan';
  const cached = footprints.get(key);
  if (cached) return cached;
  const group = new THREE.Group();
  const built = BUILDERS[key](group, 0x888888, key === 'taxi');
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
  });
  const size = { length: built.length, width: built.width };
  footprints.set(key, size);
  return size;
}

export function createVehicle(cfg) {
  const group = new THREE.Group();
  const type = cfg.type in BUILDERS ? cfg.type : 'sedan';
  const built = BUILDERS[type](group, cfg.color, type === 'taxi');
  const state = {
    group,
    type,
    driveable: !!cfg.driveable,
    x: cfg.x,
    z: cfg.z,
    heading: cfg.heading ?? 0,
    speed: 0,
    steer: 0,
    braking: false,
    length: built.length,
    width: built.width,
    radius: built.radius,
    wheels: built.wheels,
    tails: built.tails,
    door: null,
    inUse: false,
    _aabb: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
    sync() {
      group.rotation.order = 'YXZ';
      group.position.set(this.x, this.y || 0, this.z);
      group.rotation.y = this.heading;
      group.rotation.x = this.pitch || 0;
    },
    aabb() {
      const c = Math.abs(Math.cos(this.heading));
      const s = Math.abs(Math.sin(this.heading));
      return {
        hx: (this.length * s + this.width * c) / 2,
        hz: (this.length * c + this.width * s) / 2,
      };
    },
    collider() {
      const { hx, hz } = this.aabb();
      this._aabb.minX = this.x - hx;
      this._aabb.maxX = this.x + hx;
      this._aabb.minZ = this.z - hz;
      this._aabb.maxZ = this.z + hz;
      return this._aabb;
    },
    // Half extent of the body along its own side axis, so a spot beside the
    // car can be placed outside the collider even for a rotated vehicle.
    sideExtent() {
      const c = Math.abs(Math.cos(this.heading));
      const s = Math.abs(Math.sin(this.heading));
      const { hx, hz } = this.aabb();
      return hx * c + hz * s;
    },
    doorSpec() {
      return DOOR_SPECS[type] ?? null;
    },
    openDoor() {
      if (this.door) this.door.target = 1;
    },
    closeDoor() {
      if (this.door) this.door.target = 0;
    },
    updateVisual(dt) {
      this.sync();
      for (const wheel of this.wheels) {
        wheel.roller.rotation.x += (this.speed / wheel.radius) * dt;
        if (wheel.front) wheel.steer.rotation.y = this.steer;
      }
      const glowAmount = this.braking ? 1.6 : 0.28;
      for (const tail of this.tails) tail.material.emissiveIntensity = glowAmount;
      if (this.door) {
        const door = this.door;
        const k = 1 - Math.pow(0.0005, dt);
        door.open += (door.target - door.open) * k;
        if (Math.abs(door.target - door.open) < 0.002) door.open = door.target;
        door.hinge.rotation.y = door.open * DOOR_OPEN_ANGLE;
      }
    },
  };
  const doorSpec = DOOR_SPECS[type];
  if (doorSpec) {
    state.door = { hinge: addDoor(group, built.width, doorSpec, bodyMaterial(group)), open: 0, target: 0 };
  }
  state.sync();
  return state;
}
