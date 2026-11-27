// Toby the turkey — built from primitives, animated by hand. A round brown
// body, a fan of real feather-textured tail plumes, waddling orange legs and
// wings that flap when he runs. The fan spreads wide on a dash and droops
// flat when he hides.
import * as THREE from 'three';
import { flat, loadTexture, standard } from './textures.js';

export function buildToby() {
  const group = new THREE.Group();
  const brown = standard(loadTexture('feather.png'), { roughness: 0.95 });
  const darkBrown = flat(0x5a3a22);
  const cream = flat(0xf2e3c2);
  const orange = flat(0xe8821e);
  const red = flat(0xc23a2e);

  // Body: a plump feathered ellipsoid, tilted forward when running.
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 18), brown);
  body.scale.set(1, 0.92, 1.15);
  body.position.y = 1.05;
  body.castShadow = true;
  group.add(body);

  // Breast patch.
  const breast = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), cream);
  breast.scale.set(1, 0.9, 0.6);
  breast.position.set(0, 0.95, 0.62);
  group.add(breast);

  // Neck and head.
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.7, 12), darkBrown);
  neck.position.set(0, 1.85, 0.55);
  neck.rotation.x = 0.25;
  group.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), flat(0xb8563f));
  head.position.set(0, 2.3, 0.72);
  head.castShadow = true;
  group.add(head);

  // Beak, snood and wattle.
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.42, 10), orange);
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 2.28, 1.08);
  group.add(beak);
  const snood = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 8), red);
  snood.rotation.x = Math.PI;
  snood.position.set(0, 2.16, 0.98);
  group.add(snood);
  const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), red);
  wattle.scale.set(1, 1.5, 0.7);
  wattle.position.set(0, 2.05, 0.95);
  group.add(wattle);

  // Eyes: white with a black pupil that looks where Toby runs.
  const eyes = [];
  for (const side of [-1, 1]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), flat(0xffffff));
    white.position.set(side * 0.16, 2.4, 0.95);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), flat(0x14100c));
    pupil.position.set(side * 0.16, 2.4, 1.03);
    group.add(white, pupil);
    eyes.push(pupil);
  }

  // Tail fan: seven feather plumes fanning out behind.
  const tail = new THREE.Group();
  tail.position.set(0, 1.25, -0.85);
  const featherMat = standard(loadTexture('feather.png'), { side: THREE.DoubleSide, roughness: 0.9 });
  const plumes = [];
  for (let i = 0; i < 7; i += 1) {
    const angle = (i - 3) * 0.32;
    const plume = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.15), featherMat);
    plume.position.set(Math.sin(angle) * 0.55, Math.cos(angle) * 0.55, 0);
    plume.rotation.z = -angle;
    plume.rotation.x = -0.35;
    plume.castShadow = true;
    tail.add(plume);
    plumes.push(plume);
  }
  group.add(tail);

  // Wings: flat feathered flaps on the sides.
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 0.78, 1.25, 0.1);
    const flap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), brown);
    flap.scale.set(0.28, 0.9, 1.25);
    flap.position.set(side * 0.1, -0.15, 0);
    flap.castShadow = true;
    wing.add(flap);
    group.add(wing);
    wings.push(wing);
  }

  // Legs: orange stilts with three-toed feet.
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.3, 0.55, 0);
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.55, 8), orange);
    shin.position.y = -0.1;
    leg.add(shin);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.5), orange);
    foot.position.set(0, -0.38, 0.08);
    leg.add(foot);
    group.add(leg);
    legs.push(leg);
  }

  let phase = 0;
  return {
    group,
    setHeading(yaw) {
      group.rotation.y = yaw;
    },
    // speed 0..1, hiding true when crouched in cover, dashing on a dash.
    animate(dt, speed, hiding, dashing) {
      phase += dt * (4 + speed * 14);
      const bob = Math.abs(Math.sin(phase)) * 0.09 * speed;
      body.position.y = 1.05 + bob;
      body.rotation.x = hiding ? 0.25 : speed * 0.22;
      const swing = Math.sin(phase) * 0.7 * speed;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
      legs[0].position.y = 0.55 + Math.max(0, Math.sin(phase)) * 0.12 * speed;
      legs[1].position.y = 0.55 + Math.max(0, -Math.sin(phase)) * 0.12 * speed;
      const flap = (dashing ? 1.1 : 0.55) * speed + (hiding ? 0 : 0.06);
      wings[0].rotation.z = 0.25 + Math.sin(phase * 1.3) * flap;
      wings[1].rotation.z = -0.25 - Math.sin(phase * 1.3) * flap;
      const spread = dashing ? 1.35 : hiding ? 0.45 : 1.0;
      tail.scale.set(spread, spread, 1);
      tail.rotation.x = hiding ? 0.5 : -0.1;
      head.position.y = 2.3 + bob * 0.5;
    },
  };
}
