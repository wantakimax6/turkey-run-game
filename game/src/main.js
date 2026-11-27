// Toby's Great Escape — boot, the one loop, and the game itself.
// Fixed 1/60 s steps, a third-person camera behind Toby, three stages from
// the farmyard to the kitchen window, and five screens: title, play, paused,
// stage clear, and the end (caught or escaped). ?shot=title|play|kitchen|
// escaped stages a deterministic scene for screenshots; ?test=autoplay lets
// a headless browser prove a full escape.
import * as THREE from 'three';
import { BEST_KEY, CHASER, PLAYER, SCORE, STAGES, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  ACTION_CONFIRM, ACTION_DASH, ACTION_DECOY, ACTION_HIDE, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import { createAudio } from './audio.js';
import { buildToby } from './turkey.js';
import { buildStage, insideHiding, resolveCollisions } from './world.js';
import { chaserCaught, createChaser, resetChaser, updateChaser } from './chasers.js';
import { createHud } from './hud.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const testMode = params.get('test');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a6a42, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe8b8, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
sun.shadow.camera.far = 220;
sun.shadow.bias = -0.0006;
scene.add(sun);
scene.add(sun.target);

const audio = createAudio();
const hud = createHud();
const input = createInput(canvas);
const toby = buildToby();
scene.add(toby.group);

const clouds = [];
for (let i = 0; i < 9; i += 1) {
  const mat = new THREE.MeshBasicMaterial({
    map: new THREE.TextureLoader().load('./assets/cloud.png'), transparent: true, opacity: 0.85, depthWrite: false,
  });
  const cloud = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), mat);
  cloud.position.set(-90 + i * 22, 42 + (i % 3) * 7, -70 + (i % 4) * 38);
  cloud.userData.speed = 0.4 + (i % 3) * 0.25;
  scene.add(cloud);
  clouds.push(cloud);
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage off: the best score lasts this visit only.
  }
}

// ------------------------------------------------------------- game state
const game = {
  screen: 'title',
  stageIndex: 0,
  stage: null,
  chasers: [],
  rng: createRandom(seed),
  score: 0,
  scorePickups: 0,
  scoreBonus: 0,
  best: readBest(),
  lives: PLAYER.lives,
  stamina: PLAYER.staminaMax,
  decoys: PLAYER.decoys,
  time: 0,
  stageTime: 0,
  distanceScore: 0,
  player: {
    pos: { x: 0, z: 38 },
    y: 0,
    vy: 0,
    vel: { x: 0, z: 0 },
    heading: Math.PI,
    dashTimer: 0,
    dashCooldown: 0,
    invuln: 0,
    hidden: false,
    hiding: false,
    stillTimer: 0,
    grounded: true,
  },
  decoy: null,
  ovenTimer: 0,
  shake: 0,
  camYaw: Math.PI,
  camYawOffset: 0,
  overReason: '',
};
game._input = input; // the autopilot drives the same input object

function setScreen(name) {
  game.screen = name;
  for (const id of ['title', 'pause', 'end', 'stageclear']) {
    document.getElementById(`overlay-${id}`).classList.toggle('show', name === id);
  }
  document.getElementById('hud').classList.toggle('hidden', name === 'title' || name === 'end');
}

function showEnd(title, sub, scoreLine) {
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-sub').textContent = sub;
  document.getElementById('end-score').textContent = scoreLine;
  setScreen('end');
}

function loadStage(index, salt = 0) {
  if (game.stage) {
    scene.remove(game.stage.group);
    game.stage.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
  }
  // Old chasers are added to the scene, not to the stage group: take them out
  // too, or a forest fox would haunt the kitchen forever.
  for (const c of game.chasers) scene.remove(c.mesh);
  game.stageIndex = index;
  game.stage = buildStage(index, createRandom(seed * 31 + index * 7 + 3 + salt));
  scene.add(game.stage.group);
  const def = game.stage.def;
  scene.background = new THREE.Color(def.sky);
  scene.fog = new THREE.Fog(def.fog, 55, 170);
  const kitchen = def.id === 'kitchen';
  sun.intensity = kitchen ? 0.5 : 2.4;
  sun.position.set(kitchen ? -20 : 45, kitchen ? 30 : 70, kitchen ? -10 : 25);
  hemi.intensity = kitchen ? 0.45 : 0.9;
  for (const cloud of clouds) cloud.visible = !kitchen;
  game.chasers = game.stage.chaserSpawns.map((s) => {
    const c = createChaser(s.kind, s.x, s.z, game.rng);
    scene.add(c.mesh);
    return c;
  });
  game.player.pos.x = game.stage.spawn.x;
  game.player.pos.z = game.stage.spawn.z;
  game.player.y = 0;
  game.player.vy = 0;
  game.player.heading = Math.PI;
  game.player.vel = { x: 0, z: 0 };
  game.stageTime = 0;
  game.decoy = null;
  hud.setStage(def.name);
  hud.setDecoys(game.decoys);
  hud.setHearts(game.lives);
}

function startRun() {
  game.score = 0;
  game.scorePickups = 0;
  game.scoreBonus = 0;
  game.lives = PLAYER.lives;
  game.stamina = PLAYER.staminaMax;
  game.decoys = PLAYER.decoys;
  game.time = 0;
  game.distanceScore = 0;
  game.player.invuln = 0;
  loadStage(0);
  setScreen('play');
  hud.showBanner('STAGE 1 — THE FARMYARD', 'Farmer Hank wants you for dinner. RUN, Toby, RUN!');
  audio.unlock();
  audio.gobble();
  status.textContent = 'Playing. Escape the farmyard.';
}

function stageClear() {
  game.scoreBonus += SCORE.stageClear;
  if (game.stageIndex < STAGES.length - 1) {
    const next = STAGES[game.stageIndex + 1];
    if (shot) {
      // Deterministic staging: switch stages at once, no real-time wait.
      loadStage(game.stageIndex + 1, game._salt || 0);
      setScreen('play');
      return;
    }
    document.getElementById('stageclear-title').textContent = `STAGE CLEAR! +${SCORE.stageClear}`;
    document.getElementById('stageclear-sub').textContent = `Next: ${next.name} — ${next.hint}`;
    setScreen('stageclear');
    audio.golden();
    setTimeout(() => {
      if (game.screen !== 'stageclear') return;
      loadStage(game.stageIndex + 1);
      setScreen('play');
      hud.showBanner(STAGES[game.stageIndex].name.toUpperCase(), STAGES[game.stageIndex].hint);
    }, 2400);
  } else {
    escape();
  }
}

function escape() {
  game.scoreBonus += SCORE.escapeBonus;
  game.score = Math.floor(game.distanceScore) + game.scorePickups + game.scoreBonus;
  if (game.score > game.best) {
    game.best = game.score;
    saveBest(game.best);
  }
  audio.fanfare();
  game.overReason = 'escaped';
  showEnd(
    'ESCAPED! 🦃',
    'Toby slipped out of the window, over the fence and into the wild — Thanksgiving is cancelled!',
    `Final score ${game.score}   •   Best ${game.best}   •   Time ${Math.floor(game.time)}s`,
  );
  status.textContent = `Escaped! Score ${game.score}.`;
  if (window.__onEnd) window.__onEnd('escaped', game.score);
}

function caught() {
  if (game.score > game.best) {
    game.best = game.score;
    saveBest(game.best);
  }
  audio.caughtSting();
  game.overReason = 'caught';
  showEnd(
    'CAUGHT! 🍗',
    'Farmer Hank has you by the drumstick… the oven is already warm. Try again, Toby!',
    `Score ${game.score}   •   Best ${game.best}   •   Reached ${STAGES[game.stageIndex].name}`,
  );
  status.textContent = `Caught. Score ${game.score}.`;
  if (window.__onEnd) window.__onEnd('caught', game.score);
}

function hurt(source, kx, kz) {
  const p = game.player;
  if (p.invuln > 0 || game.screen !== 'play') return;
  game.lives -= 1;
  game.shake = 0.5;
  p.invuln = 2;
  audio.hurt();
  hud.setHearts(game.lives);
  const dx = p.pos.x - kx;
  const dz = p.pos.z - kz;
  const d = Math.hypot(dx, dz) || 1;
  p.vel.x = (dx / d) * 14;
  p.vel.z = (dz / d) * 14;
  document.getElementById('flash').classList.add('show');
  setTimeout(() => document.getElementById('flash').classList.remove('show'), 180);
  if (game.lives <= 0) {
    caught();
  } else {
    hud.toast(source === 'oven' ? 'The oven burns! Get away!' : 'Ouch! One less feather in the cap…');
    for (const c of game.chasers) resetChaser(c, game.stage.chaserSpawns[game.chasers.indexOf(c)]);
  }
}

// ------------------------------------------------------------- one step
function step(dt) {
  const p = game.player;
  const stage = game.stage;
  game.time += dt;
  game.stageTime += dt;
  stage.animate(dt, game.time);

  // Camera-relative movement.
  const dir = input.direction();
  const camForward = { x: Math.sin(game.camYaw), z: Math.cos(game.camYaw) };
  const camRight = { x: Math.cos(game.camYaw), z: -Math.sin(game.camYaw) };
  let mx = camForward.x * -dir.z + camRight.x * dir.x;
  let mz = camForward.z * -dir.z + camRight.z * dir.x;
  const mLen = Math.hypot(mx, mz);
  if (mLen > 1) {
    mx /= mLen;
    mz /= mLen;
  }

  const actions = input.takeActions();
  if (actions & ACTION_MUTE) {
    audio.setMuted(!audio.isMuted());
    hud.toast(audio.isMuted() ? 'Sound off (M to turn back on)' : 'Sound on');
  }
  if (actions & ACTION_DECOY && game.decoys > 0 && !game.decoy) {
    game.decoys -= 1;
    game.decoy = { x: p.pos.x, z: p.pos.z, timer: 6 };
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0x8a5a30 }));
    mesh.position.set(p.pos.x, 0.7, p.pos.z);
    scene.add(mesh);
    game.decoy.mesh = mesh;
    audio.decoy();
    hud.setDecoys(game.decoys);
    hud.toast('Feather decoy! They chase the fake Toby…');
  }

  // Dash: a short burst, paid for in stamina.
  if (actions & ACTION_DASH && p.dashCooldown <= 0 && game.stamina > 25 && mLen > 0.1) {
    p.dashTimer = PLAYER.dashTime;
    p.dashCooldown = PLAYER.dashCooldown;
    game.stamina -= 25;
    audio.dash();
  }
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  if (p.dashTimer <= 0) game.stamina = Math.min(PLAYER.staminaMax, game.stamina + PLAYER.staminaRegen * dt);
  p.dashTimer = Math.max(0, p.dashTimer - dt);

  // Speed: dash, run, or slowed by the stream.
  let speed = PLAYER.runSpeed;
  if (stage.stream && Math.abs(p.pos.x - stage.stream.x) < stage.stream.hx
    && Math.abs(p.pos.z - stage.stream.z) < stage.stream.hz) speed *= 0.55;
  if (p.dashTimer > 0) speed = PLAYER.dashSpeed;

  const accel = p.grounded ? 14 : 6;
  p.vel.x += (mx * speed - p.vel.x) * Math.min(1, accel * dt);
  p.vel.z += (mz * speed - p.vel.z) * Math.min(1, accel * dt);
  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;

  // Jump and gravity.
  if (input.jumpHeld() && p.grounded) {
    p.vy = PLAYER.jumpSpeed;
    p.grounded = false;
  }
  p.vy -= PLAYER.gravity * dt;
  p.y += p.vy * dt;
  if (p.y <= 0) {
    p.y = 0;
    p.vy = 0;
    p.grounded = true;
  }

  // Stay inside the arena.
  if (stage.room) {
    const hw = stage.room.w / 2 - 1.2;
    const hd = stage.room.d / 2 - 1.2;
    p.pos.x = Math.max(-hw, Math.min(hw, p.pos.x));
    p.pos.z = Math.max(-hd, Math.min(hd, p.pos.z));
  } else {
    const b = stage.bounds;
    p.pos.x = Math.max(-b, Math.min(b, p.pos.x));
    p.pos.z = Math.max(-b, Math.min(b, p.pos.z));
  }
  resolveCollisions(p.pos, PLAYER.radius, p.y, stage.colliders, stage.circles);

  // Heading follows movement; the turkey model faces its travel.
  const speedNow = Math.hypot(p.vel.x, p.vel.z);
  if (speedNow > 1.5) {
    const want = Math.atan2(p.vel.x, p.vel.z);
    let diff = ((want - p.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    p.heading += Math.max(-8 * dt, Math.min(8 * dt, diff));
  }
  toby.setHeading(p.heading);
  toby.group.position.set(p.pos.x, p.y, p.pos.z);

  // Hiding: inside cover and either holding H or standing still.
  const inCover = insideHiding(p.pos, stage.hidingSpots);
  const hiding = inCover && ((actions & ACTION_HIDE) || p.stillTimer > 1 || game.player.hiding);
  if (inCover && speedNow < 0.5) p.stillTimer += dt;
  else p.stillTimer = 0;
  if (hiding && !p.hiding) audio.hide();
  p.hiding = hiding;
  p.hidden = hiding;
  if (mLen > 0.1) p.hiding = false;
  p.hidden = p.hiding;

  // Footstep sounds and distance score.
  game.distanceScore += speedNow * dt * SCORE.perMetre;
  game.score = Math.floor(game.distanceScore) + game.scorePickups + game.scoreBonus;
  if (speedNow > 3 && p.grounded) {
    game.stepTimer = (game.stepTimer || 0) + dt;
    if (game.stepTimer > 0.32) {
      game.stepTimer = 0;
      audio.step();
    }
  }

  // Pickups.
  for (const pk of stage.pickups) {
    if (pk.taken) continue;
    pk.mesh.position.y = 0.75 + Math.sin(game.time * 2 + pk.bob) * 0.12;
    pk.mesh.rotation.y += dt;
    if (Math.hypot(pk.x - p.pos.x, pk.z - p.pos.z) < 1.5) {
      pk.taken = true;
      pk.mesh.visible = false;
      const pts = pk.kind === 'golden' ? SCORE.goldenFeather : SCORE.corn;
      game.scorePickups += pts;
      if (pk.kind === 'golden') {
        audio.golden();
        hud.toast('Golden feather! +50');
      } else {
        audio.pickup();
      }
    }
  }

  // The oven burns anyone who lingers in its heat.
  if (stage.oven) {
    const d = Math.hypot(p.pos.x - stage.oven.x, p.pos.z - stage.oven.z);
    if (d < stage.oven.r) {
      hud.alert('THE OVEN BURNS — GET AWAY!', true);
      game.ovenTimer += dt;
      if (game.ovenTimer > 1) {
        game.ovenTimer = 0;
        hurt('oven', stage.oven.x, stage.oven.z);
      }
    } else {
      hud.alert('', false);
      game.ovenTimer = 0;
    }
  }

  // Carving knives slide across the kitchen floor.
  if (stage.knives) {
    for (const k of stage.knives) {
      if (Math.hypot(k.mesh.position.x - p.pos.x, k.mesh.position.z - p.pos.z) < 1.4 && p.y < 0.6) {
        audio.knife();
        hurt('knife', k.mesh.position.x, k.mesh.position.z);
      }
    }
  }

  // Decoy timer.
  if (game.decoy) {
    game.decoy.timer -= dt;
    if (game.decoy.timer <= 0) {
      scene.remove(game.decoy.mesh);
      game.decoy = null;
    }
  }

  // Chasers.
  let anyChase = false;
  for (const c of game.chasers) {
    const res = updateChaser(c, dt, { pos: p.pos, vel: p.vel, hidden: p.hidden }, stage, game.decoy, game.rng);
    if (res.chasing) anyChase = true;
    if (chaserCaught(c, p) && p.invuln <= 0) {
      audio.alarm();
      hurt(c.kind, c.pos.x, c.pos.z);
    }
  }
  audio.setChase(anyChase);
  if (anyChase && !game.chaseAnnounced) {
    game.chaseAnnounced = true;
    hud.toast('SPOTTED! Run!');
    audio.alarm();
  } else if (!anyChase) {
    game.chaseAnnounced = false;
  }

  p.invuln = Math.max(0, p.invuln - dt);
  toby.group.visible = p.invuln <= 0 || Math.floor(game.time * 12) % 2 === 0;

  // Exit reached?
  const exit = stage.exit;
  if (Math.hypot(p.pos.x - exit.x, p.pos.z - exit.z) < exit.r) {
    stageClear();
    return;
  }

  // Camera: behind Toby, mouse drag orbits, gentle shake on a hit.
  // camYaw tracks the turkey's heading, so the camera sits behind him and
  // looks where he is going — never in front of him.
  game.camYawOffset += input.takeDragYaw();
  game.camYawOffset *= 0.96;
  const wantYaw = p.heading + game.camYawOffset;
  let yawDiff = ((wantYaw - game.camYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  game.camYaw += yawDiff * Math.min(1, 3.5 * dt);
  const camDist = 11;
  const camHeight = 5.2;
  const shakeX = game.shake > 0 ? (Math.random() - 0.5) * game.shake * 0.7 : 0;
  const shakeY = game.shake > 0 ? (Math.random() - 0.5) * game.shake * 0.5 : 0;
  game.shake = Math.max(0, game.shake - dt);
  camera.position.set(
    p.pos.x - Math.sin(game.camYaw) * camDist + shakeX,
    p.y + camHeight + shakeY,
    p.pos.z - Math.cos(game.camYaw) * camDist,
  );
  camera.lookAt(p.pos.x + Math.sin(p.heading) * 2, p.y + 1.6, p.pos.z + Math.cos(p.heading) * 2);

  // Toby's own animation.
  toby.animate(dt, Math.min(1, speedNow / PLAYER.runSpeed), p.hiding, p.dashTimer > 0);

  // Clouds drift (outdoor stages).
  if (!stage.def.id.includes('kitchen')) {
    for (const cloud of clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 120) cloud.position.x = -120;
      cloud.lookAt(camera.position);
    }
  }

  // HUD (skipped while staging screenshots: thousands of synchronous steps).
  if (!shot) {
    hud.setScore(game.score, game.best);
    hud.setStamina(game.stamina);
    hud.setDistance(Math.hypot(p.pos.x - exit.x, p.pos.z - exit.z) - exit.r);
    hud.setTime(game.time);
    hud.drawMinimap(stage, p, game.chasers, stage.pickups, game.decoy);
  }
}

// ------------------------------------------------------------- the loop
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function announce(message) {
  status.textContent = message;
}

function runGame() {
  loadStage(0);
  setScreen('title');
  hud.setScore(0, game.best);
  announce('Toby\'s Great Escape. Press Space or click Start to play.');
  let last = performance.now();
  let accumulator = 0;
  let titleAngle = 0;

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (game.screen === 'title' || game.screen === 'end')) {
      startRun();
    } else if (actions & ACTION_PAUSE && game.screen === 'play') {
      setScreen('pause');
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && game.screen === 'pause') {
      setScreen('play');
      announce('Playing.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (game.screen === 'title') {
      // Idle orbit over the farmyard behind the title screen.
      titleAngle += 0.0004;
      camera.position.set(Math.sin(titleAngle) * 34, 16, Math.cos(titleAngle) * 34);
      camera.lookAt(0, 2, 0);
      game.stage.animate(STEP, game.time);
      game.time += STEP;
      toby.animate(STEP, 0, false, false);
    } else if (game.screen === 'play') {
      while (accumulator >= STEP) {
        step(STEP);
        accumulator -= STEP;
        if (game.screen !== 'play') {
          accumulator = 0;
          break;
        }
      }
    } else {
      accumulator = 0;
      game.stage.animate(STEP, game.time);
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------- shots/tests
function refreshHud() {
  const stage = game.stage;
  const p = game.player;
  const exit = stage.exit;
  hud.setScore(game.score, game.best);
  hud.setStamina(game.stamina);
  hud.setDistance(Math.hypot(p.pos.x - exit.x, p.pos.z - exit.z) - exit.r);
  hud.setTime(game.time);
  hud.setHearts(game.lives);
  hud.setDecoys(game.decoys);
  hud.drawMinimap(stage, p, game.chasers, stage.pickups, game.decoy);
}

if (shot) {
  loadStage(0);
  setScreen('title');
  const scene2 = stageShot(shot, game, {
    step, loadStage, startRun, input, renderer, camera, toby, scene, setScreen, hud,
  });
  refreshHud();
  let painted = 0;
  function paint() {
    renderer.render(scene, camera);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
} else if (testMode === 'autoplay') {
  // Headless proof: the autopilot plays the real game until it escapes or is
  // caught, logging every stage and the final result for the test driver.
  loadStage(0);
  startRun();
  window.__testResult = null;
  window.__onEnd = (result, score) => {
    window.__testResult = { result, score, stage: game.stageIndex, time: game.time };
    console.log(`TEST_RESULT ${result} score=${score} stage=${game.stageIndex} time=${game.time.toFixed(1)}`);
  };
  import('./shots.js').then((shots) => {
    let last = performance.now();
    let acc = 0;
    const t0 = performance.now();
    function frame(now) {
      requestAnimationFrame(frame);
      acc += Math.min((now - last) / 1000, MAX_FRAME);
      last = now;
      if (game.screen === 'play' || game.screen === 'stageclear') {
        while (acc >= STEP) {
          if (game.screen === 'play') {
            shots.autopilot(game, STEP);
            step(STEP);
          }
          acc -= STEP;
          if (performance.now() - t0 > 300000) {
            window.__testResult = { result: 'timeout', score: game.score, stage: game.stageIndex };
            console.log('TEST_RESULT timeout');
            return;
          }
        }
      } else if (game.screen === 'end') {
        return;
      }
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  });
} else {
  runGame();
}

// Buttons (mouse): every overlay button works with a click.
for (const btn of document.querySelectorAll('[data-action]')) {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    audio.unlock();
    if (action === 'start') startRun();
    else if (action === 'resume') setScreen('play');
    else if (action === 'restart') startRun();
    else if (action === 'mute') {
      audio.setMuted(!audio.isMuted());
      btn.textContent = audio.isMuted() ? '🔇 Sound off' : '🔊 Sound on';
    }
  });
}
document.getElementById('mute-btn').addEventListener('click', (e) => {
  audio.setMuted(!audio.isMuted());
  e.target.textContent = audio.isMuted() ? '🔇' : '🔊';
});

// Public handle for the test driver and the screenshot stager.
window.__game = game;
window.__step = step;
window.__loadStage = loadStage;
window.__startRun = startRun;
