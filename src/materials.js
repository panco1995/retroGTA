import * as THREE from 'three';

const cache = new Map();

export const brickTexture = makeBrickTexture();

function makeBrickTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#c8c2ba';
  g.fillRect(0, 0, size, size);
  const rows = 8;
  const rh = size / rows;
  const bw = size / 4;
  for (let y = 0; y < rows; y++) {
    const offset = y % 2 === 0 ? 0 : bw / 2;
    for (let x = -1; x < 5; x++) {
      const n = 214 + ((x * 17 + y * 11) % 28);
      g.fillStyle = `rgb(${n},${n - 6},${n - 12})`;
      g.fillRect(x * bw + offset + 1.5, y * rh + 1.5, bw - 3, rh - 3);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function solid(color, roughness = 0.9, metalness = 0) {
  const key = `${color}:${roughness}:${metalness}`;
  let mat = cache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    cache.set(key, mat);
  }
  return mat;
}

export function glow(color, intensity = 0.6) {
  const key = `g:${color}:${intensity}`;
  let mat = cache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: intensity,
      roughness: 0.4,
    });
    cache.set(key, mat);
  }
  return mat;
}

export function brickMaterial(tint, width, height) {
  const map = brickTexture.clone();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(Math.max(1, width / 1.7), Math.max(1, height / 1.15));
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({
    map,
    color: tint,
    roughness: 0.94,
    metalness: 0,
  });
}

const signCache = new Map();

export function signMaterial(label, bg) {
  const key = `${label}:${bg}`;
  let mat = signCache.get(key);
  if (mat) return mat;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#f4efe4';
  g.font = 'bold 36px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 128, 34);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  mat = new THREE.MeshStandardMaterial({ map, roughness: 0.65 });
  signCache.set(key, mat);
  return mat;
}

export const windowMat = new THREE.MeshStandardMaterial({
  color: 0x1a242c,
  roughness: 0.18,
  metalness: 0.12,
});

export const windowLitMat = new THREE.MeshStandardMaterial({
  color: 0xd8c39a,
  emissive: 0xffd7a2,
  emissiveIntensity: 0.55,
  roughness: 0.42,
});
