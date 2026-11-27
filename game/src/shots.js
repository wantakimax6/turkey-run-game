// Deterministic screenshot scenes and the autopilot.
// ?shot=title|play|kitchen|escaped stages a real scene by playing the real
// rules forward from a seeded world, so a screenshot is what a short game
// really looks like — and the same seed always gives the same frame. The
// autopilot steers with the same virtual input a player would use, so it
// also proves the game can be finished (?test=autoplay).
import { STEP, PLAYER } from './config.js';
import { ACTION_DASH, ACTION_DECOY, ACTION_HIDE } from './input.js';
import { resolveCollisions } from './world.js';

// Would a circle of the player's radius at (x, z) overlap anything solid?
function blockedAt(stage, x, z) {
  const probe = { x, z };
  const before = { x, z };
  resolveCollisions(probe, PLAYER.radius, 0, stage.colliders, stage.circles);
  return Math.hypot(probe.x - before.x, probe.z - before.z) > 0.01;
}

function nearestChaser(game) {
  let best = null;
  let bestD = Infinity;
  for (const c of game.chasers) {
    const d = Math.hypot(c.pos.x - game.player.pos.x, c.pos.z - game.player.pos.z);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { chaser: best, dist: bestD };
}

function knifeThreat(game) {
  const p = game.player.pos;
  for (const k of game.stage.knives || []) {
    const dx = k.mesh.position.x - p.x;
    const dz = k.mesh.position.z - p.z;
    if (Math.abs(dz) < 2.2 && Math.abs(dx) < 6) return { dx, dz };
  }
  return null;
}

// One autopilot decision per step. Steers toward the exit, probes ahead for
// walls, jumps low logs, dashes from close chasers, hides in cover when
// cornered, and drops a decoy when nothing else will do.
export function autopilot(game, dt) {
  const p = game.player;
  const stage = game.stage;
  const exit = stage.exit;
  let dx = exit.x - p.pos.x;
  let dz = exit.z - p.pos.z;
  const exitDist = Math.hypot(dx, dz);
  dx /= exitDist || 1;
  dz /= exitDist || 1;

  // Knife about to cross our lane? Wait for it to pass.
  const threat = knifeThreat(game);
  if (threat && Math.abs(threat.dx) < 3.5) {
    game._input.setVirtual(0, 0, false, 0);
    return;
  }

  // Probe ahead; if blocked, try turning left and right until clear.
  let dirX = dx;
  let dirZ = dz;
  let jump = false;
  const probeDist = 3.2;
  if (blockedAt(stage, p.pos.x + dx * probeDist, p.pos.z + dz * probeDist)) {
    let found = false;
    for (const ang of [0.7, -0.7, 1.4, -1.4, 2.1, -2.1]) {
      const rx = dx * Math.cos(ang) - dz * Math.sin(ang);
      const rz = dx * Math.sin(ang) + dz * Math.cos(ang);
      if (!blockedAt(stage, p.pos.x + rx * probeDist, p.pos.z + rz * probeDist)) {
        dirX = rx;
        dirZ = rz;
        found = true;
        break;
      }
    }
    if (!found) {
      // A low log or fence right ahead: jump it.
      jump = true;
    }
  }

  // Chaser pressure: dash away, hide, or decoy.
  const { chaser, dist } = nearestChaser(game);
  let actions = 0;
  if (chaser && chaser.mode === 'chase' && dist < 7 && game.stamina > 40) {
    actions |= ACTION_DASH;
  }
  if (chaser && chaser.mode === 'chase' && dist < 5) {
    let bestSpot = null;
    let bestD = 7;
    for (const s of stage.hidingSpots) {
      const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z);
      if (d < bestD) {
        bestD = d;
        bestSpot = s;
      }
    }
    if (bestSpot) {
      dirX = (bestSpot.x - p.pos.x) / (bestD || 1);
      dirZ = (bestSpot.z - p.pos.z) / (bestD || 1);
      if (bestD < 2.2) actions |= ACTION_HIDE;
    } else if (game.decoys > 0 && !game.decoy) {
      actions |= ACTION_DECOY;
    }
  }

  // Input is camera-relative: forward is -z in input space. Convert the
  // world direction into the camera's frame (camera yaw follows the player).
  const yaw = game.camYaw;
  const fwdX = Math.sin(yaw);
  const fwdZ = Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);
  // input z=-1 means forward; x=+1 means right.
  const ix = dirX * rightX + dirZ * rightZ;
  const iz = -(dirX * fwdX + dirZ * fwdZ);
  game._input.setVirtual(ix, iz, jump, actions);
}

function runFor(game, ctx, seconds, capSeconds) {
  const steps = Math.floor(Math.min(seconds, capSeconds) / STEP);
  for (let i = 0; i < steps; i += 1) {
    if (game.screen !== 'play') break;
    autopilot(game, STEP);
    ctx.step(STEP);
  }
}

export function stageShot(name, game, ctx) {
  game._input = ctx.input;
  if (name === 'title') {
    ctx.loadStage(0, 0);
    ctx.setScreen('title');
    // A slow orbit over the farmyard, Toby by the barn.
    ctx.camera.position.set(26, 14, 30);
    ctx.camera.lookAt(0, 2, 0);
    ctx.toby.group.position.set(0, 0, 30);
    ctx.toby.setHeading(2.6);
    ctx.toby.animate(0.5, 0, false, false);
    return { screen: 'title' };
  }
  if (name === 'forest') {
    ctx.startRun();
    ctx.loadStage(1, 0);
    ctx.hud.clearBanner();
    // Mid-forest: foxes on the prowl, the stream ahead, Toby in the trees.
    // (3 s — the autopilot crosses the whole forest in about six.)
    runFor(game, ctx, 3, 3);
    return { screen: 'play' };
  }
  if (name === 'kitchen') {
    ctx.startRun();
    ctx.loadStage(2, 0);
    ctx.hud.clearBanner();
    // 2.6 s in: Toby rounds the table toward the window, the oven glowing
    // beside it, Chef Mabel ahead, and a knife lane striped ahead of him.
    runFor(game, ctx, 2.6, 2.6);
    return { screen: 'play' };
  }
  if (name === 'escaped') {
    // Play the whole escape for real; retry with a fresh world salt until the
    // autopilot makes it out (or the attempts run out).
    for (let attempt = 0; attempt < 4; attempt += 1) {
      ctx.startRun();
      game._salt = attempt;
      // Rebuild stage 0 with this attempt's salt by re-running startRun's load.
      ctx.loadStage(0, attempt * 101);
      game.screen = 'play';
      runFor(game, ctx, 600, 600);
      if (game.screen === 'end' && game.overReason === 'escaped') return { screen: 'end' };
      if (game.screen === 'end') continue;
    }
    // Last resort: the play scene, so the shot is still a real game frame.
    return { screen: 'play' };
  }
  // Default: the farmyard mid-chase, a few seconds in — Toby mid-field,
  // the farmer already on his tail, corn on the path ahead.
  ctx.startRun();
  runFor(game, ctx, 6, 6);
  return { screen: 'play' };
}
