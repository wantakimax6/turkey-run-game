// Texture loading and material helpers. Every texture is a self-made PNG in
// game/assets (see tools/gen_textures.py); nothing is fetched from the web.
import * as THREE from 'three';

const cache = new Map();

export function loadTexture(name, repeatX = 1, repeatY = 1) {
  const key = `${name}|${repeatX}|${repeatY}`;
  if (cache.has(key)) return cache.get(key);
  const tex = new THREE.TextureLoader().load(`./assets/${name}`);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}

export function lambert(map, opts = {}) {
  return new THREE.MeshLambertMaterial({ map, ...opts });
}

export function standard(map, opts = {}) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0.0, ...opts });
}

export function flat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

// A soft round shadow blob for characters that run where the sun map is thin.
export function blobShadow(radius) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.42)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  return mesh;
}
