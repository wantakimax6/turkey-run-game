// The three stages: Farmyard, Autumn Forest, Farmhouse Kitchen. Each builder
// lays out scenery, colliders, hiding spots, pickups, the exit and the chaser
// spawns from a seeded RNG, and returns an object the game loop animates.
// Colliders are AABBs (with a jumpable height) and circles; the player is a
// circle, so collision is circle-vs-box / circle-vs-circle.
import * as THREE from 'three';
import { STAGES } from './config.js';
import { flat, lambert, loadTexture, standard } from './textures.js';

function textTexture(text, fg = '#fff8e0', bg = '#5a3a22', size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size * 2;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
  ctx.fillStyle = fg;
  ctx.font = `bold ${Math.floor(size / 5)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, mat, x, y, z, shadow = true) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  return mesh;
}

function makeTree(rng, barkMat, leafMats) {
  const tree = new THREE.Group();
  const h = rng.range(3.2, 5.2);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, h, 8), barkMat);
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  tree.add(trunk);
  const leafMat = rng.pick(leafMats);
  const blobs = rng.int(2, 4);
  for (let i = 0; i < blobs; i += 1) {
    const r = rng.range(1.4, 2.4);
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), leafMat);
    blob.position.set(rng.range(-1, 1), h + rng.range(0.2, 1.4), rng.range(-1, 1));
    blob.castShadow = true;
    tree.add(blob);
  }
  return tree;
}

function makeBush(rng, leafMat) {
  const bush = new THREE.Group();
  for (let i = 0; i < 3; i += 1) {
    const r = rng.range(0.9, 1.5);
    const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), leafMat);
    blob.position.set(rng.range(-0.7, 0.7), r * 0.55, rng.range(-0.7, 0.7));
    blob.castShadow = true;
    bush.add(blob);
  }
  return bush;
}

function scatterTrees(group, rng, half, count, barkMat, leafMats, keepOut) {
  const placed = [];
  for (let i = 0; i < count; i += 1) {
    const x = rng.range(-half + 4, half - 4);
    const z = rng.range(-half + 4, half - 4);
    if (keepOut.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    const tree = makeTree(rng, barkMat, leafMats);
    tree.position.set(x, 0, z);
    group.add(tree);
    placed.push({ x, z, r: 0.7 });
  }
  return placed;
}

// Circle (player) vs AABB + circle colliders. Objects shorter than the
// player's feet (jumped logs, low fences) are ignored while airborne.
export function resolveCollisions(pos, radius, feetY, colliders, circles) {
  for (const c of colliders) {
    if (feetY > c.h) continue;
    const cx = Math.max(c.x - c.hx, Math.min(pos.x, c.x + c.hx));
    const cz = Math.max(c.z - c.hz, Math.min(pos.z, c.z + c.hz));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 < 1e-6) {
        pos.z = c.z + c.hz + radius;
        continue;
      }
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    }
  }
  for (const c of circles) {
    if (feetY > c.h) continue;
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const d = Math.hypot(dx, dz);
    const min = radius + c.r;
    if (d < min && d > 1e-6) {
      pos.x = c.x + (dx / d) * min;
      pos.z = c.z + (dz / d) * min;
    }
  }
}

export function insideHiding(pos, spots) {
  return spots.some((s) => Math.hypot(pos.x - s.x, pos.z - s.z) < s.r);
}

// ---------------------------------------------------------------- farmyard
function buildFarmyard(rng) {
  const def = STAGES[0];
  const half = def.size / 2;
  const group = new THREE.Group();
  const colliders = [];
  const circles = [];
  const hidingSpots = [];
  const pickups = [];
  const leaves = [];
  const groundMat = lambert(loadTexture('grass.png', 14, 14));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(def.size, def.size), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  // Dirt path from the barn to the north gate.
  const path = new THREE.Mesh(new THREE.PlaneGeometry(7, def.size - 6),
    lambert(loadTexture('dirt.png', 1, 12)));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.02, 0);
  path.receiveShadow = true;
  group.add(path);

  // The red barn Toby escaped from.
  const barnMat = lambert(loadTexture('barnwood.png', 3, 2));
  const barn = new THREE.Group();
  barn.add(box(16, 9, 12, barnMat, 0, 4.5, 0));
  const roofMat = lambert(loadTexture('roof.png', 4, 2));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 8.6, 5, 4, 1), roofMat);
  roof.position.y = 11.4;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1.35, 1, 1.05);
  roof.castShadow = true;
  barn.add(roof);
  const door = box(4.5, 6, 0.3, flat(0x4a2c18), 0, 3, 6.1);
  barn.add(door);
  const cross = box(4, 0.4, 0.1, flat(0xd9b95c), 0, 3, 6.3, false);
  barn.add(cross);
  barn.position.set(-30, 0, -18);
  group.add(barn);
  colliders.push({ x: -30, z: -18, hx: 8, hz: 6, h: 9 });

  // Perimeter fence with a broken gate at the north end (the exit).
  const fenceMat = lambert(loadTexture('fencewood.png', 6, 1));
  function fenceRun(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const mid = new THREE.Group();
    mid.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    mid.rotation.y = Math.atan2(x1 - x0, z1 - z0);
    for (let d = -len / 2; d < len / 2; d += 2.4) {
      mid.add(box(0.25, 1.5, 0.25, fenceMat, 0, 0.75, d));
    }
    for (const y of [0.6, 1.2]) mid.add(box(0.12, 0.14, len, fenceMat, 0, y, 0));
    group.add(mid);
  }
  fenceRun(-half, -half, -4, -half);
  fenceRun(4, -half, half, -half);
  fenceRun(-half, half, half, half);
  fenceRun(-half, -half, -half, half);
  fenceRun(half, -half, half, half);
  colliders.push({ x: 0, z: -half, hx: half, hz: 0.4, h: 1.4 });
  colliders.push({ x: 0, z: half, hx: half, hz: 0.4, h: 1.4 });
  colliders.push({ x: -half, z: 0, hx: 0.4, hz: half, h: 1.4 });
  colliders.push({ x: half, z: 0, hx: 0.4, hz: half, h: 1.4 });

  // Hay bales: cover and hiding spots.
  const hayMat = lambert(loadTexture('hay.png', 2, 1));
  const baleSpots = [[-14, 8], [16, -6], [-8, 26], [22, 18], [-24, 30], [8, -28], [26, -16], [-16, -30]];
  for (const [x, z] of baleSpots) {
    const bale = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.6, 14), hayMat);
    bale.rotation.z = Math.PI / 2;
    bale.rotation.y = rng.range(0, Math.PI);
    bale.position.set(x, 1.6, z);
    bale.castShadow = true;
    bale.receiveShadow = true;
    group.add(bale);
    circles.push({ x, z, r: 1.7, h: 3.2 });
    hidingSpots.push({ x, z, r: 2.6 });
  }

  // Crates stacked by the barn and barrels by the west wall: solid cover
  // the autopilot can route around (all off the central dirt path).
  const crateMat = lambert(loadTexture('crate.png', 1, 1));
  const crateSpots = [[-14, -10, 0], [-12.4, -9, 0.7], [-13.2, -10.2, 1.8], [30, 24, 0.3], [31.6, 23, 1.2]];
  for (const [x, z, y] of crateSpots) {
    const crate = box(1.8, 1.8, 1.8, crateMat, x, 0.9 + y, z);
    crate.rotation.y = rng.range(0, Math.PI / 2);
    group.add(crate);
    if (y < 0.1) colliders.push({ x, z, hx: 1.1, hz: 1.1, h: 1.8 });
  }
  const barrelMat = lambert(loadTexture('barrel.png', 1, 1));
  const barrelSpots = [[-38, -6], [-36, -2], [-40, -12], [34, 20], [36, 24]];
  for (const [x, z] of barrelSpots) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 2.1, 14), barrelMat);
    barrel.position.set(x, 1.05, z);
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    group.add(barrel);
    circles.push({ x, z, r: 1.0, h: 2.1 });
  }

  // Flower meadow patches along the path edges, and a haystack by the barn.
  const flowerMat = lambert(loadTexture('flowers.png', 2, 2), { side: THREE.DoubleSide });
  for (const [x, z, w] of [[7, 20, 7], [-11, -14, 6], [15, 30, 8], [-21, 14, 6], [10, -34, 7]]) {
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.7), flowerMat);
    patch.rotation.x = -Math.PI / 2;
    patch.rotation.z = rng.range(0, Math.PI);
    patch.position.set(x, 0.03, z);
    patch.receiveShadow = true;
    group.add(patch);
  }
  const thatchMat = lambert(loadTexture('thatch.png', 2, 1));
  const haystack = new THREE.Mesh(new THREE.ConeGeometry(3.4, 5.2, 12), thatchMat);
  haystack.position.set(-24, 2.6, -32);
  haystack.castShadow = true;
  group.add(haystack);
  circles.push({ x: -24, z: -32, r: 3.2, h: 5.2 });
  hidingSpots.push({ x: -24, z: -32, r: 4.2 });

  // The scarecrow by the cornfield: pole, crossbar, straw head, floppy hat.
  const scare = new THREE.Group();
  const poleMat = flat(0x6b4a2a);
  scare.add(box(0.3, 4.4, 0.3, poleMat, 0, 2.2, 0));
  scare.add(box(2.6, 0.3, 0.3, poleMat, 0, 3.4, 0));
  const strawMat = lambert(loadTexture('thatch.png', 1, 1));
  const scareHead = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), strawMat);
  scareHead.position.set(0, 4.2, 0);
  scareHead.castShadow = true;
  scare.add(scareHead);
  const hatTop = new THREE.Mesh(new THREE.ConeGeometry(0.6, 0.7, 10), flat(0x8a5a30));
  hatTop.position.set(0, 4.8, 0);
  scare.add(hatTop);
  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.08, 12), flat(0x8a5a30));
  hatBrim.position.set(0, 4.5, 0);
  scare.add(hatBrim);
  const shirt = box(1.6, 1.4, 0.4, lambert(loadTexture('barnwood.png', 1, 1)), 0, 3.0, 0);
  scare.add(shirt);
  scare.position.set(-38, 0, 12);
  group.add(scare);
  circles.push({ x: -38, z: 12, r: 0.7, h: 4.4 });

  // Pumpkins by the barn, a corn wall on the west edge, trees on the rest.
  const pumpkinMat = lambert(loadTexture('pumpkin.png', 2, 2));
  for (let i = 0; i < 9; i += 1) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(rng.range(0.5, 0.8), 12, 10), pumpkinMat);
    p.scale.y = 0.8;
    p.position.set(rng.range(-22, -12), 0.5, rng.range(-8, 2));
    p.castShadow = true;
    group.add(p);
    circles.push({ x: p.position.x, z: p.position.z, r: 0.7, h: 0.8 });
  }
  const cornMat = lambert(loadTexture('cornfield.png', 8, 2), { side: THREE.DoubleSide });
  const cornWall = new THREE.Mesh(new THREE.PlaneGeometry(50, 7), cornMat);
  cornWall.position.set(-half + 1.2, 3.5, 10);
  cornWall.rotation.y = Math.PI / 2;
  group.add(cornWall);

  const barkMat = lambert(loadTexture('bark.png', 1, 2));
  // All three canopy mats use the leaf pattern with warm tints: flat-colour
  // blobs read as plain yellow balloons, the patterned map reads as foliage.
  const leafMats = [
    lambert(loadTexture('leaves.png', 2, 2)),
    lambert(loadTexture('leaves.png', 2, 2), { color: 0xffc890 }),
    lambert(loadTexture('leaves.png', 2, 2), { color: 0xffe0b0 }),
  ];
  const treeCircles = scatterTrees(group, rng, half, 34, barkMat, leafMats,
    [{ x: 0, z: 0, r: 14 }, { x: -30, z: -18, r: 14 }, { x: 0, z: -44, r: 8 }]);
  circles.push(...treeCircles);

  // The broken gate: two leaning posts, a fallen plank, and a sign.
  const gate = new THREE.Group();
  for (const side of [-1, 1]) {
    const post = box(0.5, 3.4, 0.5, fenceMat, side * 3.4, 1.7, 0);
    post.rotation.z = side * 0.18;
    gate.add(post);
  }
  const fallen = box(6.4, 0.4, 0.5, fenceMat, 0, 0.3, 1.2);
  fallen.rotation.y = 0.4;
  gate.add(fallen);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2),
    new THREE.MeshBasicMaterial({ map: textTexture('TO THE WOODS', '#fff8e0', '#5a3a22') }));
  sign.position.set(0, 3.6, 0);
  gate.add(sign);
  gate.position.set(0, 0, -half + 1);
  group.add(gate);

  // Corn pickups along the path, golden feathers tucked away.
  for (let i = 0; i < 14; i += 1) {
    const x = rng.range(-3, 3);
    const z = rng.range(-40, 38);
    pickups.push(makePickup(rng, 'corn', x, z, group));
  }
  pickups.push(makePickup(rng, 'golden', -38, 26, group));
  pickups.push(makePickup(rng, 'golden', 34, -30, group));

  return {
    def, group, colliders, circles, hidingSpots, pickups, leaves,
    spawn: { x: 0, z: 38 },
    exit: { x: 0, z: -half + 2, r: 3.4, label: 'the broken gate' },
    chaserSpawns: [{ kind: 'farmer', x: -6, z: 20 }, { kind: 'dog', x: 10, z: 26 }],
    knives: [], oven: null, stream: null,
    bounds: half - 2,
    animate() {},
  };
}

// ------------------------------------------------------------------ forest
function buildForest(rng) {
  const def = STAGES[1];
  const half = def.size / 2;
  const group = new THREE.Group();
  const colliders = [];
  const circles = [];
  const hidingSpots = [];
  const pickups = [];
  const leaves = [];
  const groundMat = lambert(loadTexture('forestfloor.png', 14, 14));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(def.size, def.size), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(6, def.size - 6),
    lambert(loadTexture('dirt.png', 1, 14)));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.02, 0);
  path.receiveShadow = true;
  group.add(path);

  // The stream: a slow, sparkling crossing halfway up.
  const waterMat = lambert(loadTexture('water.png', 6, 1));
  const stream = new THREE.Mesh(new THREE.PlaneGeometry(def.size - 8, 7), waterMat);
  stream.rotation.x = -Math.PI / 2;
  stream.position.set(0, 0.04, 4);
  stream.receiveShadow = true;
  group.add(stream);
  const streamZone = { x: 0, z: 4, hx: half, hz: 3.5 };

  // Dense autumn trees everywhere except the path and the stream bridge.
  const barkMat = lambert(loadTexture('bark.png', 1, 2));
  const leafMats = [
    lambert(loadTexture('leaves.png', 2, 2)),
    lambert(loadTexture('leaves.png', 2, 2), { color: 0xffc890 }),
    lambert(loadTexture('leaves.png', 2, 2), { color: 0xffe0b0 }),
  ];
  const treeCircles = scatterTrees(group, rng, half, 88, barkMat, leafMats,
    [{ x: 0, z: 0, r: 10 }, { x: 0, z: -48, r: 9 }, { x: 0, z: 4, r: 8 }]);
  circles.push(...treeCircles);

  // Bushes to hide in, fallen logs to jump over, mushrooms for charm.
  const bushMat = lambert(loadTexture('leaves.png', 1, 1));
  for (let i = 0; i < 22; i += 1) {
    const x = rng.range(-half + 8, half - 8);
    const z = rng.range(-half + 8, half - 8);
    if (Math.abs(x) < 5 || Math.abs(z - 4) < 6) continue;
    const bush = makeBush(rng, bushMat);
    bush.position.set(x, 0, z);
    group.add(bush);
    hidingSpots.push({ x, z, r: 2.4 });
    circles.push({ x, z, r: 1.2, h: 1.6 });
  }
  const logMat = lambert(loadTexture('bark.png', 2, 1));
  for (let i = 0; i < 10; i += 1) {
    const x = rng.range(-half + 10, half - 10);
    const z = rng.range(-half + 10, half - 10);
    if (Math.abs(x) < 6) continue;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, rng.range(4, 7), 10), logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = rng.range(0, Math.PI);
    log.position.set(x, 0.55, z);
    log.castShadow = true;
    group.add(log);
    colliders.push({ x, z, hx: 2.6, hz: 0.7, h: 0.9 });
  }
  const capMat = flat(0xc23a2e);
  const stemMat = flat(0xf2ead8);
  for (let i = 0; i < 26; i += 1) {
    const m = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8), stemMat);
    stem.position.y = 0.25;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
    cap.position.y = 0.5;
    m.add(stem, cap);
    m.position.set(rng.range(-half + 6, half - 6), 0, rng.range(-half + 6, half - 6));
    group.add(m);
  }
  // Fern clusters: three crossed green blades each, no collider, pure cover.
  const fernMat = lambert(loadTexture('forestfloor.png', 1, 1));
  for (let i = 0; i < 20; i += 1) {
    const x = rng.range(-half + 8, half - 8);
    const z = rng.range(-half + 8, half - 8);
    if (Math.abs(x) < 5 || Math.abs(z - 4) < 6) continue;
    const fern = new THREE.Group();
    for (let b = 0; b < 3; b += 1) {
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 6), fernMat);
      blade.position.set(rng.range(-0.3, 0.3), 0.6, rng.range(-0.3, 0.3));
      blade.rotation.z = rng.range(-0.4, 0.4);
      blade.castShadow = true;
      fern.add(blade);
    }
    fern.position.set(x, 0, z);
    group.add(fern);
  }

  // The old oak hollow: the exit, marked by a warm glow.
  const oak = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.2, 7, 10), barkMat);
  trunk.position.y = 3.5;
  trunk.castShadow = true;
  oak.add(trunk);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(4.2, 14, 10), leafMats[0]);
  crown.position.y = 8;
  crown.castShadow = true;
  oak.add(crown);
  const hollow = new THREE.Mesh(new THREE.CircleGeometry(1.1, 16),
    new THREE.MeshBasicMaterial({ color: 0xffd27a }));
  hollow.position.set(0, 1.3, 2.05);
  oak.add(hollow);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2),
    new THREE.MeshBasicMaterial({ map: textTexture('OAK HOLLOW', '#fff8e0', '#3a2a18') }));
  sign.position.set(0, 5.4, 2.2);
  oak.add(sign);
  oak.position.set(0, 0, -half + 4);
  group.add(oak);
  circles.push({ x: 0, z: -half + 4, r: 2.0, h: 7 });

  for (let i = 0; i < 16; i += 1) {
    pickups.push(makePickup(rng, 'acorn', rng.range(-30, 30), rng.range(-44, 44), group));
  }
  pickups.push(makePickup(rng, 'golden', -40, -20, group));
  pickups.push(makePickup(rng, 'golden', 38, 30, group));

  // Falling leaves, animated in animate().
  const leafGeo = new THREE.PlaneGeometry(0.35, 0.35);
  const leafMatFlat = flat(0xd08a24, { side: THREE.DoubleSide });
  for (let i = 0; i < 70; i += 1) {
    const leaf = new THREE.Mesh(leafGeo, leafMatFlat);
    leaf.position.set(rng.range(-half, half), rng.range(2, 14), rng.range(-half, half));
    leaf.userData = { fall: rng.range(0.4, 0.9), sway: rng.range(0.5, 1.4), phase: rng.range(0, 6) };
    group.add(leaf);
    leaves.push(leaf);
  }

  return {
    def, group, colliders, circles, hidingSpots, pickups, leaves,
    spawn: { x: 0, z: 46 },
    exit: { x: 0, z: -half + 5.5, r: 3.2, label: 'the oak hollow' },
    chaserSpawns: [
      { kind: 'fox', x: -18, z: 0 }, { kind: 'fox', x: 20, z: -14 }, { kind: 'dog', x: 8, z: 30 },
    ],
    knives: [], oven: null, stream: streamZone,
    bounds: half - 2,
    animate(dt, t) {
      for (const leaf of leaves) {
        const u = leaf.userData;
        leaf.position.y -= u.fall * dt;
        leaf.position.x += Math.sin(t * u.sway + u.phase) * dt * 0.8;
        leaf.rotation.x += dt * 1.2;
        leaf.rotation.y += dt * 0.8;
        if (leaf.position.y < 0.1) leaf.position.y = 14;
      }
      waterMat.map.offset.x = (t * 0.02) % 1;
    },
  };
}

// ----------------------------------------------------------------- kitchen
function buildKitchen(rng) {
  const def = STAGES[2];
  const half = def.size / 2;
  const roomW = 56;
  const roomD = 40;
  const group = new THREE.Group();
  const colliders = [];
  const circles = [];
  const hidingSpots = [];
  const pickups = [];
  const leaves = [];
  const floorMat = lambert(loadTexture('tiles.png', 8, 6));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  const rugMat = lambert(loadTexture('stone.png', 2, 2));
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(10, 7), rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.02, 8);
  rug.receiveShadow = true;
  group.add(rug);

  // Walls: brick below, warm patterned wallpaper above.
  const brickMat = lambert(loadTexture('brick.png', 6, 2));
  const plasterMat = lambert(loadTexture('wallpaper.png', 6, 2));
  function wall(w, h, x, y, z, ry) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), brickMat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    group.add(m);
    const up = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), plasterMat);
    up.position.set(x, h + 1.2, z);
    up.rotation.y = ry;
    group.add(up);
  }
  wall(roomW, 3, 0, 1.5, -roomD / 2, 0);
  wall(roomW, 3, 0, 1.5, roomD / 2, Math.PI);
  wall(roomD, 3, -roomW / 2, 1.5, 0, Math.PI / 2);
  wall(roomD, 3, roomW / 2, 1.5, 0, -Math.PI / 2);
  colliders.push({ x: 0, z: -roomD / 2, hx: roomW / 2, hz: 0.4, h: 6 });
  colliders.push({ x: 0, z: roomD / 2, hx: roomW / 2, hz: 0.4, h: 6 });
  colliders.push({ x: -roomW / 2, z: 0, hx: 0.4, hz: roomD / 2, h: 6 });
  colliders.push({ x: roomW / 2, z: 0, hx: 0.4, hz: roomD / 2, h: 6 });

  // The oven: steel body, glowing door, heat zone in front of it. It stands
  // on the north wall beside the window, so the last run threads between the
  // oven's heat and the cook — the oven guards the way out.
  const metalMat = standard(loadTexture('metal.png', 2, 1), { metalness: 0.55, roughness: 0.4 });
  const oven = new THREE.Group();
  oven.add(box(5, 4.4, 3, metalMat, 0, 2.2, 0));
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0xff7a1e, emissive: 0xff5a00, emissiveIntensity: 1.6, roughness: 0.4,
  });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.6), doorMat);
  door.position.set(0, 1.9, 1.55);
  oven.add(door);
  const handle = box(4.4, 0.25, 0.25, flat(0x2a2018), 0, 3.6, 1.6);
  oven.add(handle);
  const ovenLight = new THREE.PointLight(0xff6a00, 60, 22, 1.6);
  ovenLight.position.set(0, 2.2, 3.5);
  oven.add(ovenLight);
  oven.position.set(-6, 0, -roomD / 2 + 2.5);
  group.add(oven);
  colliders.push({ x: -6, z: -roomD / 2 + 2.5, hx: 2.8, hz: 1.8, h: 4.4 });
  const ovenZone = { x: -6, z: -roomD / 2 + 6.5, r: 5.5 };

  // Warm oven glow spilling across the floor: a soft additive radial pool
  // of light in front of the oven door.
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = 256;
  glowCanvas.height = 256;
  const glowCtx = glowCanvas.getContext('2d');
  const grad = glowCtx.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255, 122, 20, 0.55)');
  grad.addColorStop(0.55, 'rgba(255, 110, 10, 0.22)');
  grad.addColorStop(1, 'rgba(255, 100, 0, 0)');
  glowCtx.fillStyle = grad;
  glowCtx.fillRect(0, 0, 256, 256);
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const ovenGlow = new THREE.Mesh(new THREE.PlaneGeometry(13, 9),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  ovenGlow.rotation.x = -Math.PI / 2;
  ovenGlow.position.set(-6, 0.06, -roomD / 2 + 8);
  group.add(ovenGlow);

  // The big table with the gingham cloth — and the carving board on it.
  const clothMat = lambert(loadTexture('tablecloth.png', 3, 2));
  const table = new THREE.Group();
  table.add(box(10, 0.35, 5, clothMat, 0, 2.4, 0));
  const cloth = box(10.6, 1.1, 5.6, clothMat, 0, 2.0, 0);
  table.add(cloth);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    table.add(box(0.35, 2.4, 0.35, flat(0x4a2c18), sx * 4.6, 1.2, sz * 2.2));
  }
  const board = box(2.2, 0.12, 1.4, flat(0xc9a06a), -2, 2.65, 0);
  table.add(board);
  const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), flat(0xc98d4a));
  loaf.scale.set(1.5, 0.55, 0.9);
  loaf.position.set(-2, 2.85, 0);
  loaf.castShadow = true;
  table.add(loaf);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 0.8, 12),
    standard(null, { color: 0x3a3f46, metalness: 0.7, roughness: 0.35 }));
  pot.position.set(2.5, 2.95, -0.8);
  pot.castShadow = true;
  table.add(pot);
  // Fruit bowl: a wide bowl with apples and an orange.
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.5, 0.4, 14),
    standard(null, { color: 0x7a4a2e, metalness: 0.2, roughness: 0.5 }));
  bowl.position.set(3.2, 2.75, 1.2);
  bowl.castShadow = true;
  table.add(bowl);
  const fruitCols = [0xc23a2e, 0xd84a20, 0x8a2a20, 0xe8821e];
  fruitCols.forEach((c, i) => {
    const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), flat(c));
    fruit.position.set(3.2 + (i % 2 ? 0.3 : -0.3), 3.0, 1.2 + (i < 2 ? -0.25 : 0.25));
    fruit.castShadow = true;
    table.add(fruit);
  });
  // Teapot: squat body, spout and handle.
  const teapot = new THREE.Group();
  const tpBody = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10),
    standard(null, { color: 0x4a6a8a, metalness: 0.3, roughness: 0.4 }));
  tpBody.scale.y = 0.85;
  teapot.add(tpBody);
  const spout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.8, 8),
    standard(null, { color: 0x4a6a8a, metalness: 0.3, roughness: 0.4 }));
  spout.rotation.z = -1.1;
  spout.position.set(0.6, 0.1, 0);
  teapot.add(spout);
  teapot.position.set(0.4, 2.95, 1.4);
  teapot.traverse((o) => { o.castShadow = true; });
  table.add(teapot);
  table.position.set(-6, 0, 2);
  group.add(table);
  colliders.push({ x: -6, z: 2, hx: 5.3, hz: 2.8, h: 2.6 });
  hidingSpots.push({ x: -6, z: 2, r: 6.4 });

  // Warm light hanging over the table, so the kitchen reads warm, not dim.
  const tableLight = new THREE.PointLight(0xffd9a0, 26, 18, 1.6);
  tableLight.position.set(-6, 6, 2);
  group.add(tableLight);

  // Counters along the south wall, each topped with pots and pans.
  const counterMat = lambert(loadTexture('wood.png', 4, 1));
  for (const x of [-18, -10, 10, 18]) {
    const counter = box(7, 2.6, 2.4, counterMat, x, 1.3, roomD / 2 - 2);
    group.add(counter);
    colliders.push({ x, z: roomD / 2 - 2, hx: 3.5, hz: 1.2, h: 2.6 });
    const cPot = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 0.7, 12),
      standard(null, { color: 0x3a3f46, metalness: 0.7, roughness: 0.35 }));
    cPot.position.set(x - 1.2, 2.95, roomD / 2 - 2);
    cPot.castShadow = true;
    group.add(cPot);
    const pan = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 12),
      standard(null, { color: 0x2a2d33, metalness: 0.8, roughness: 0.3 }));
    pan.position.set(x + 1.4, 2.66, roomD / 2 - 2);
    pan.castShadow = true;
    group.add(pan);
    const panHandle = box(1.0, 0.08, 0.16, flat(0x2a2018), x + 2.4, 2.66, roomD / 2 - 2);
    group.add(panHandle);
  }
  const pantryMat = lambert(loadTexture('pantry.png', 3, 2));
  const pantry = box(8, 7, 1.2, pantryMat, -roomW / 2 + 1, 3.5, -12);
  pantry.rotation.y = Math.PI / 2;
  group.add(pantry);
  colliders.push({ x: -roomW / 2 + 1, z: -12, hx: 1.2, hz: 4, h: 7 });

  // Wall shelves on the east wall, jars lined up, and a rail of hanging
  // utensils (ladle, spatula, tongs) swaying gently in the oven's heat.
  const shelfMat = lambert(loadTexture('wood.png', 3, 1));
  const jarCols = [0xb87848, 0x786a50, 0xc8a05a, 0x6e8258, 0xbc6e50];
  for (const [sy, sz] of [[4.6, -6], [4.6, 6], [6.4, 0]]) {
    const shelf = box(0.9, 0.18, 7, shelfMat, roomW / 2 - 0.8, sy, sz);
    group.add(shelf);
    for (let i = 0; i < 4; i += 1) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.85, 10),
        standard(null, { color: jarCols[(i + (sz > 0 ? 2 : 0)) % jarCols.length], roughness: 0.6 }));
      jar.position.set(roomW / 2 - 0.8, sy + 0.5, sz - 2.4 + i * 1.6);
      jar.castShadow = true;
      group.add(jar);
    }
  }
  const rail = box(0.12, 0.12, 6, standard(null, { color: 0x3a3f46, metalness: 0.7, roughness: 0.4 }),
    roomW / 2 - 0.6, 5.4, -14);
  group.add(rail);
  const utensils = [];
  for (let i = 0; i < 3; i += 1) {
    const u = new THREE.Group();
    const stick = box(0.1, 1.4, 0.1, flat(0x8a6a42), 0, -0.7, 0);
    u.add(stick);
    if (i === 0) {
      const bowlU = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
        standard(null, { color: 0x9aa0a8, metalness: 0.8, roughness: 0.3 }));
      bowlU.rotation.x = Math.PI;
      bowlU.position.y = -1.5;
      u.add(bowlU);
    } else if (i === 1) {
      const flatU = box(0.5, 0.7, 0.08, flat(0xc9a06a), 0, -1.7, 0);
      u.add(flatU);
    } else {
      const tong = box(0.34, 0.9, 0.08, standard(null, { color: 0x9aa0a8, metalness: 0.8, roughness: 0.3 }), 0, -1.8, 0);
      u.add(tong);
    }
    u.position.set(roomW / 2 - 0.6, 5.4, -16 + i * 2);
    group.add(u);
    utensils.push(u);
  }

  // The open window on the north wall, off to one side: the way out, with
  // evening light. The cook guards this corner, and a butcher block stands
  // between the door and the window, so the last run is a real gauntlet.
  const windowLight = new THREE.PointLight(0xffe9b8, 50, 26, 1.5);
  windowLight.position.set(-16, 4, -roomD / 2 + 4);
  group.add(windowLight);
  const frame = new THREE.Group();
  frame.add(box(7, 0.4, 0.5, flat(0xf0ede4), 0, 5.6, 0));
  frame.add(box(7, 0.4, 0.5, flat(0xf0ede4), 0, 1.6, 0));
  for (const side of [-1, 1]) frame.add(box(0.4, 4.4, 0.5, flat(0xf0ede4), side * 3.4, 3.6, 0));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6),
    new THREE.MeshBasicMaterial({ color: 0xffe9b8 }));
  glow.position.z = -0.1;
  frame.add(glow);
  const bars = box(0.18, 3.6, 0.1, flat(0x2a2018), 0, 3.6, 0.1);
  frame.add(bars);
  frame.position.set(-16, 0, -roomD / 2 + 0.3);
  group.add(frame);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2),
    new THREE.MeshBasicMaterial({ map: textTexture('FREEDOM!', '#fff8e0', '#a83226') }));
  sign.position.set(-16, 7.2, -roomD / 2 + 0.5);
  group.add(sign);

  // Butcher block in the middle of the room: a solid obstacle to run around.
  const blockMat = lambert(loadTexture('wood.png', 3, 1));
  const block = box(6, 3.2, 3.4, blockMat, 2, 1.6, -4);
  group.add(block);
  colliders.push({ x: 2, z: -4, hx: 3, hz: 1.7, h: 3.2 });
  hidingSpots.push({ x: 2, z: -4, r: 4.2 });

  // Carving knives sliding across the floor on four lanes. The blade is an
  // unlit bright steel so it glints and reads at a glance even in the dim
  // kitchen — a PBR metal would go black without an environment map.
  const bladeMat = new THREE.MeshBasicMaterial({ color: 0xe8ecf2 });
  const knives = [];
  const lanes = [
    { z: -13, from: -22, to: 22, speed: 9, phase: 0 },
    { z: -5, from: 22, to: -22, speed: 11, phase: 0.3 },
    { z: 3, from: -22, to: 22, speed: 8, phase: 0.55 },
    { z: 11, from: 22, to: -22, speed: 10, phase: 0.8 },
  ];
  for (const lane of lanes) {
    const knife = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 0.6), bladeMat);
    blade.castShadow = true;
    knife.add(blade);
    const handleK = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.1, 0.34), flat(0x2a2018));
    handleK.position.x = -1.45;
    knife.add(handleK);
    knife.position.set(lane.from, 0.25, lane.z);
    group.add(knife);
    knives.push({ mesh: knife, ...lane, t: lane.phase });
  }

  // Red-and-cream hazard stripes down each knife lane, so the danger reads
  // at a glance even when the blade itself is at the far end of its slide.
  const stripeCanvas = document.createElement('canvas');
  stripeCanvas.width = 256;
  stripeCanvas.height = 32;
  const stripeCtx = stripeCanvas.getContext('2d');
  for (let i = 0; i < 8; i += 1) {
    stripeCtx.fillStyle = i % 2 ? '#c23a2e' : '#f2ead8';
    stripeCtx.fillRect(i * 32, 0, 32, 32);
  }
  const stripeTex = new THREE.CanvasTexture(stripeCanvas);
  stripeTex.wrapS = THREE.RepeatWrapping;
  stripeTex.repeat.set(11, 1);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  for (const lane of lanes) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(44, 1.1),
      new THREE.MeshBasicMaterial({ map: stripeTex, transparent: true, opacity: 0.45, depthWrite: false }));
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, 0.03, lane.z);
    group.add(stripe);
  }

  for (let i = 0; i < 10; i += 1) {
    pickups.push(makePickup(rng, 'corn', rng.range(-22, 22), rng.range(-14, 16), group));
  }
  pickups.push(makePickup(rng, 'golden', -20, -14, group));
  pickups.push(makePickup(rng, 'golden', 20, 14, group));

  return {
    def, group, colliders, circles, hidingSpots, pickups, leaves,
    spawn: { x: 0, z: 16 },
    exit: { x: -16, z: -roomD / 2 + 2, r: 3.4, label: 'the open window' },
    chaserSpawns: [{ kind: 'cook', x: -10, z: -12 }],
    knives, oven: { ...ovenZone, doorMat, light: ovenLight },
    stream: null,
    bounds: 0, // kitchen uses its own walls
    room: { w: roomW, d: roomD },
    animate(dt, t) {
      for (const k of knives) {
        k.t += dt;
        // Ping-pong along the lane: span is always positive, the signed
        // (to - from) gives the direction, so lanes run either way.
        const span = Math.abs(k.to - k.from);
        const period = (2 * span) / k.speed;
        const p = (((k.t % period) + period) % period) / period;
        const dir = k.to - k.from;
        const x = p < 0.5 ? k.from + p * 2 * dir : k.to - (p - 0.5) * 2 * dir;
        k.mesh.position.x = x;
        const movingPlus = p < 0.5 ? dir > 0 : dir < 0;
        k.mesh.rotation.y = movingPlus ? 0 : Math.PI;
      }
      doorMat.emissiveIntensity = 1.4 + Math.sin(t * 3) * 0.5;
      ovenLight.intensity = 55 + Math.sin(t * 3) * 12;
      // Hanging utensils sway gently in the oven's rising heat.
      for (let i = 0; i < utensils.length; i += 1) {
        utensils[i].rotation.x = Math.sin(t * 1.4 + i * 1.7) * 0.06;
      }
      tableLight.intensity = 25 + Math.sin(t * 2.2) * 1.5;
    },
  };
}

// ------------------------------------------------------------------ pickups
function makePickup(rng, kind, x, z, group) {
  const mesh = new THREE.Group();
  if (kind === 'corn') {
    const cob = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 10), flat(0xf2c230));
    cob.rotation.z = Math.PI / 2;
    cob.castShadow = true;
    mesh.add(cob);
    for (let i = 0; i < 3; i += 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 6), flat(0x6a8a3a));
      leaf.position.set(-0.5, 0.1, (i - 1) * 0.16);
      leaf.rotation.z = 1.1;
      mesh.add(leaf);
    }
  } else if (kind === 'acorn') {
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), flat(0x8a5a30));
    nut.scale.y = 1.2;
    nut.castShadow = true;
    mesh.add(nut);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), flat(0x5a3418));
    cap.position.y = 0.2;
    mesh.add(cap);
  } else {
    const feather = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.2),
      standard(loadTexture('feather.png'), { side: THREE.DoubleSide, emissive: 0x664411, emissiveIntensity: 0.5 }));
    feather.rotation.x = -0.3;
    feather.castShadow = true;
    mesh.add(feather);
  }
  mesh.position.set(x, 0.75, z);
  group.add(mesh);
  return { kind, x, z, mesh, taken: false, bob: rng.range(0, 6) };
}

export function buildStage(index, rng) {
  if (index === 0) return buildFarmyard(rng);
  if (index === 1) return buildForest(rng);
  return buildKitchen(rng);
}
