// Chaser AI: patrol, chase, search and distracted.
// A chaser spots Toby when he is close, in front of it, and no obstacle sits
// between them. When Toby hides in cover the chaser loses him, searches the
// last place it saw him, then goes back to patrolling. A feather decoy pulls
// every chaser to the decoy for a few seconds. When chasing, a chaser aims at
// where Toby will be, so it can cut him off — but it is a little slower than
// Toby's run, so a fair escape is always possible.
import { CHASER } from './config.js';
import { buildCook, buildDog, buildFarmer, buildFox } from './characters.js';

const BUILDERS = { farmer: buildFarmer, dog: buildDog, fox: buildFox, cook: buildCook };
const SPEEDS = { farmer: CHASER.farmerSpeed, dog: CHASER.dogSpeed, fox: CHASER.foxSpeed, cook: CHASER.cookSpeed };

function blockedByObstacle(ax, az, bx, bz, colliders, circles) {
  // Sample the segment; an obstacle close to the line blocks the sight.
  const steps = 10;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    for (const c of colliders) {
      if (c.h > 2 && Math.abs(x - c.x) < c.hx + 0.3 && Math.abs(z - c.z) < c.hz + 0.3) return true;
    }
    for (const c of circles) {
      if (c.h > 2 && Math.hypot(x - c.x, z - c.z) < c.r + 0.3) return true;
    }
  }
  return false;
}

export function createChaser(kind, x, z, rng) {
  const built = BUILDERS[kind]();
  const speed = SPEEDS[kind];
  const state = {
    kind,
    mesh: built.group,
    animate: built.animate,
    pos: { x, z },
    heading: rng.range(0, Math.PI * 2),
    mode: 'patrol',
    target: { x, z },
    lastSeen: null,
    loseTimer: 0,
    searchTimer: 0,
    distractTimer: 0,
    waypoint: { x, z },
    waitTimer: rng.range(0, 2),
    speed,
    stepPhase: 0,
  };
  state.mesh.position.set(x, 0, z);
  return state;
}

export function updateChaser(c, dt, player, world, decoy, rng) {
  const { pos } = c;
  const dx = player.pos.x - pos.x;
  const dz = player.pos.z - pos.z;
  const dist = Math.hypot(dx, dz);
  const toPlayer = Math.atan2(dx, dz);
  let facing = c.heading;
  let turn = ((toPlayer - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;

  // Can the chaser see Toby? Close, roughly in front, nothing tall between,
  // and Toby not hidden in cover.
  const canSee = !player.hidden
    && dist < CHASER.spotRange
    && Math.abs(turn) < CHASER.spotAngle
    && !blockedByObstacle(pos.x, pos.z, player.pos.x, player.pos.z, world.colliders, world.circles);

  if (decoy && c.distractTimer <= 0) {
    c.distractTimer = 3;
    c.mode = 'distracted';
  }
  if (c.distractTimer > 0) {
    c.distractTimer -= dt;
    // The decoy may be picked up or expire while chasers are still walking
    // to it: fall back to the last seen spot, never a null target.
    c.target = decoy || c.lastSeen || c.waypoint;
    if (c.distractTimer <= 0) c.mode = 'search';
  } else if (canSee) {
    c.mode = 'chase';
    c.lastSeen = { x: player.pos.x, z: player.pos.z };
    c.loseTimer = CHASER.loseTime;
  } else if (c.mode === 'chase') {
    c.loseTimer -= dt;
    if (c.loseTimer <= 0) {
      c.mode = 'search';
      c.searchTimer = CHASER.searchTime;
    }
  } else if (c.mode === 'search') {
    c.searchTimer -= dt;
    if (c.searchTimer <= 0) c.mode = 'patrol';
  }

  let moveSpeed = 0;
  if (c.mode === 'chase') {
    // Aim a little ahead of Toby to cut him off.
    const lead = 0.55;
    c.target = {
      x: player.pos.x + player.vel.x * lead,
      z: player.pos.z + player.vel.z * lead,
    };
    moveSpeed = c.speed;
  } else if (c.mode === 'distracted' || c.mode === 'search') {
    c.target = c.mode === 'distracted' ? (decoy || c.lastSeen || c.waypoint) : (c.lastSeen || c.waypoint);
    moveSpeed = c.speed * 0.62;
  } else {
    // Patrol: drift between waypoints, pausing to look around.
    if (c.waitTimer > 0) {
      c.waitTimer -= dt;
    } else if (Math.hypot(c.waypoint.x - pos.x, c.waypoint.z - pos.z) < 1.5) {
      c.waypoint = {
        x: pos.x + rng.range(-18, 18),
        z: pos.z + rng.range(-18, 18),
      };
      c.waitTimer = rng.range(0.5, 2.5);
    }
    c.target = c.waypoint;
    moveSpeed = c.speed * 0.4;
  }

  const tx = c.target.x - pos.x;
  const tz = c.target.z - pos.z;
  const td = Math.hypot(tx, tz);
  if (td > 0.4 && moveSpeed > 0) {
    const want = Math.atan2(tx, tz);
    let diff = ((want - c.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    c.heading += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff));
    pos.x += Math.sin(c.heading) * moveSpeed * dt;
    pos.z += Math.cos(c.heading) * moveSpeed * dt;
  }
  c.mesh.position.set(pos.x, 0, pos.z);
  c.mesh.rotation.y = c.heading;
  c.animate(dt, Math.min(1, moveSpeed / 12), c.mode === 'chase');
  return { dist, chasing: c.mode === 'chase' };
}

export function chaserCaught(c, player) {
  return Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) < CHASER.catchRadius;
}

export function resetChaser(c, spawn) {
  c.pos.x = spawn.x;
  c.pos.z = spawn.z;
  c.mode = 'patrol';
  c.lastSeen = null;
  c.distractTimer = 0;
  c.mesh.position.set(spawn.x, 0, spawn.z);
}
