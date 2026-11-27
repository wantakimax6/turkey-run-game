// The chasers: Farmer Hank (pitchfork, straw hat), Biscuit the farm dog,
// Rusty the fox, and Chef Mabel (carving knife, tall white hat). Each is
// built from primitives and walks with a simple leg/arm swing.
import * as THREE from 'three';
import { flat, standard, loadTexture } from './textures.js';

function limb(color, radius, length) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.85, length, 8), color);
  mesh.castShadow = true;
  return mesh;
}

function makeWalker({ bodyMat, headMat, height, legLen, armLen }) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, height, 12), bodyMat);
  body.position.y = legLen + height / 2;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), headMat);
  head.position.y = legLen + height + 0.32;
  head.castShadow = true;
  group.add(head);
  const legs = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.2, legLen, 0);
    const leg = limb(flat(0x3a3230), 0.09, legLen);
    leg.position.y = -legLen / 2;
    pivot.add(leg);
    group.add(pivot);
    legs.push(pivot);
  }
  const arms = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.5, legLen + height - 0.1, 0);
    const arm = limb(bodyMat, 0.08, armLen);
    arm.position.y = -armLen / 2;
    pivot.add(arm);
    group.add(pivot);
    arms.push(pivot);
  }
  return { group, head, legs, arms, topY: legLen + height + 0.62 };
}

function animateWalker(walker, phase, speed, lean) {
  const swing = Math.sin(phase) * 0.65 * speed;
  walker.legs[0].rotation.x = swing;
  walker.legs[1].rotation.x = -swing;
  walker.arms[0].rotation.x = -swing * 0.8;
  walker.arms[1].rotation.x = swing * 0.8;
  walker.group.rotation.x = lean;
}

export function buildFarmer() {
  const shirt = flat(0xa83226);
  const walker = makeWalker({
    bodyMat: shirt, headMat: flat(0xd9a077), height: 0.95, legLen: 0.85, armLen: 0.75,
  });
  const { group, head } = walker;
  // Blue overalls over the shirt.
  const overalls = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.6, 0.5), flat(0x2e4a7a));
  overalls.position.y = 1.05;
  group.add(overalls);
  // Straw hat: brim disc + dome.
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), flat(0xd9b95c));
  brim.position.y = walker.topY - 0.05;
  group.add(brim);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), flat(0xd9b95c));
  dome.position.y = walker.topY - 0.03;
  group.add(dome);
  // Moustache and angry brows.
  const mo = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), flat(0x6b4a2a));
  mo.position.set(0, walker.topY - 0.32, 0.28);
  group.add(mo);
  // Pitchfork held in the right hand.
  const fork = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 8), flat(0x8a6a42));
  fork.add(shaft);
  for (const dx of [-0.09, 0, 0.09]) {
    const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6),
      standard(null, { color: 0xb8bcc2, metalness: 0.7, roughness: 0.35 }));
    prong.position.set(dx, 0.95, 0);
    fork.add(prong);
  }
  fork.position.set(0.55, 1.1, 0.25);
  fork.rotation.x = 0.3;
  group.add(fork);
  let phase = 0;
  return {
    group,
    animate(dt, speed, chasing) {
      phase += dt * (5 + speed * 9);
      animateWalker(walker, phase, speed, chasing ? 0.22 : 0.06);
      head.rotation.y = Math.sin(phase * 0.5) * (chasing ? 0.1 : 0.5);
    },
  };
}

export function buildDog() {
  const group = new THREE.Group();
  const fur = flat(0x8a5a30);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), fur);
  body.scale.set(1, 0.85, 1.7);
  body.position.y = 0.75;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10), fur);
  head.position.set(0, 1.05, 0.85);
  head.castShadow = true;
  group.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.42), flat(0x6b4222));
  snout.position.set(0, 0.95, 1.2);
  group.add(snout);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 8), flat(0x5a3418));
    ear.position.set(side * 0.22, 1.32, 0.8);
    ear.rotation.z = side * -0.25;
    group.add(ear);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.6, 8), fur);
  tail.position.set(0, 1.05, -0.95);
  tail.rotation.x = -0.9;
  group.add(tail);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.55, 8), fur);
    leg.position.set(sx * 0.3, 0.28, sz * 0.55);
    leg.castShadow = true;
    group.add(leg);
    legs.push(leg);
  }
  let phase = 0;
  return {
    group,
    animate(dt, speed) {
      phase += dt * (6 + speed * 12);
      legs[0].rotation.x = Math.sin(phase) * 0.8 * speed;
      legs[3].rotation.x = Math.sin(phase) * 0.8 * speed;
      legs[1].rotation.x = -Math.sin(phase) * 0.8 * speed;
      legs[2].rotation.x = -Math.sin(phase) * 0.8 * speed;
      tail.rotation.y = Math.sin(phase * 1.7) * 0.5;
      group.position.y = Math.abs(Math.sin(phase)) * 0.06 * speed;
    },
  };
}

export function buildFox() {
  const group = new THREE.Group();
  const fur = flat(0xc65a1e);
  const white = flat(0xf2ead8);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12), fur);
  body.scale.set(1, 0.8, 1.6);
  body.position.y = 0.68;
  body.castShadow = true;
  group.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), white);
  chest.scale.set(1, 1, 0.7);
  chest.position.set(0, 0.6, 0.55);
  group.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), fur);
  head.position.set(0, 0.95, 0.78);
  head.castShadow = true;
  group.add(head);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 8), white);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.9, 1.1);
  group.add(snout);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 6), fur);
    ear.position.set(side * 0.18, 1.22, 0.72);
    group.add(ear);
  }
  // Big bushy tail, the fox's calling card.
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.1, 10), fur);
  tail.rotation.x = -1.9;
  tail.position.set(0, 0.75, -1.05);
  tail.castShadow = true;
  group.add(tail);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 8), white);
  tip.rotation.x = -1.9;
  tip.position.set(0, 0.95, -1.5);
  group.add(tip);
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.5, 8), flat(0x3a2418));
    leg.position.set(sx * 0.26, 0.25, sz * 0.48);
    group.add(leg);
    legs.push(leg);
  }
  let phase = 0;
  return {
    group,
    animate(dt, speed) {
      phase += dt * (6 + speed * 12);
      legs[0].rotation.x = Math.sin(phase) * 0.8 * speed;
      legs[3].rotation.x = Math.sin(phase) * 0.8 * speed;
      legs[1].rotation.x = -Math.sin(phase) * 0.8 * speed;
      legs[2].rotation.x = -Math.sin(phase) * 0.8 * speed;
      tail.rotation.y = Math.sin(phase * 0.9) * 0.35;
    },
  };
}

export function buildCook() {
  const walker = makeWalker({
    bodyMat: flat(0xf0ede4), headMat: flat(0xd9a077), height: 0.95, legLen: 0.85, armLen: 0.75,
  });
  const { group } = walker;
  // Tall white chef's hat.
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.55, 14), flat(0xffffff));
  hat.position.y = walker.topY + 0.1;
  hat.castShadow = true;
  group.add(hat);
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 8), flat(0xffffff));
  puff.scale.set(1, 0.6, 1);
  puff.position.y = walker.topY + 0.4;
  group.add(puff);
  // Apron with a tomato stain.
  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.08), flat(0x7a9cc2));
  apron.position.set(0, 1.25, 0.42);
  group.add(apron);
  const stain = new THREE.Mesh(new THREE.CircleGeometry(0.09, 10), flat(0xa83226));
  stain.position.set(0.1, 1.2, 0.47);
  group.add(stain);
  // The carving knife, held high.
  const knife = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.65, 0.015),
    standard(null, { color: 0xd8dce2, metalness: 0.85, roughness: 0.25 }));
  blade.position.y = 0.45;
  knife.add(blade);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.04), flat(0x2a2018));
  handle.position.y = 0.02;
  knife.add(handle);
  knife.position.set(0.55, 1.35, 0.3);
  knife.rotation.z = -0.5;
  group.add(knife);
  let phase = 0;
  return {
    group,
    animate(dt, speed, chasing) {
      phase += dt * (5 + speed * 9);
      animateWalker(walker, phase, speed, chasing ? 0.25 : 0.05);
      knife.rotation.z = -0.5 + Math.sin(phase * 2) * (chasing ? 0.35 : 0.1);
    },
  };
}
