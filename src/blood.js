import * as THREE from 'three';

const poolMat = new THREE.MeshStandardMaterial({
  color: 0x7a1218,
  roughness: 0.42,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
const dropMat = new THREE.MeshStandardMaterial({
  color: 0x9a1c22,
  roughness: 0.38,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

const MAX_STAINS = 90;

export function createBlood(scene) {
  const poolGeo = new THREE.CircleGeometry(1, 8);
  poolGeo.rotateX(-Math.PI / 2);
  const dropGeo = new THREE.CircleGeometry(1, 5);
  dropGeo.rotateX(-Math.PI / 2);
  const stains = [];

  function add(x, z, y, radius, geo, mat, life) {
    if (stains.length >= MAX_STAINS) {
      const old = stains.shift();
      scene.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.045, z);
    mesh.scale.setScalar(radius);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    scene.add(mesh);
    stains.push({ mesh, life, radius });
  }

  function spill(x, z, y, heavy) {
    add(x, z, y, heavy ? 0.95 : 0.48, poolGeo, poolMat, heavy ? 32 : 18);
    const drops = heavy ? 6 : 3;
    for (let i = 0; i < drops; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.2 + Math.random() * (heavy ? 1.45 : 0.75);
      add(
        x + Math.cos(angle) * dist,
        z + Math.sin(angle) * dist,
        y,
        0.1 + Math.random() * 0.16,
        dropGeo,
        dropMat,
        10 + Math.random() * 12,
      );
    }
  }

  function drip(x, z, y) {
    add(
      x + (Math.random() - 0.5) * 0.35,
      z + (Math.random() - 0.5) * 0.35,
      y,
      0.08 + Math.random() * 0.08,
      dropGeo,
      dropMat,
      7,
    );
  }

  function update(dt) {
    for (let i = stains.length - 1; i >= 0; i -= 1) {
      const stain = stains[i];
      stain.life -= dt;
      if (stain.life > 0) continue;
      scene.remove(stain.mesh);
      stains.splice(i, 1);
    }
  }

  function reset() {
    for (let i = 0; i < stains.length; i += 1) scene.remove(stains[i].mesh);
    stains.length = 0;
  }

  return { spill, drip, update, reset };
}
