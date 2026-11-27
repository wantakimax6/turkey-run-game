// Toby's Great Escape — the program that hands the game in (Node 22, standard
// library only). It copies game/ and screenshots/ from beside this file to
// /output (or MAKEFUN_OUTPUT_DIR outside the grader) and writes
// /output/dossier.json with the vendored make.fun library, the summary the
// judge reads. Before it writes anything it checks the entry against the
// bounty caps itself — game/ at most 48 MiB and 993 files, index.html at most
// 1 MiB, 3 or 4 screenshots each at most 256 KiB — so a bad build fails here,
// loudly, instead of failing the gate silently later.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The bounty caps (RULES.txt, gate rows game_files and screenshots).
const GAME_MAX_BYTES = 48 * 1024 * 1024;
const GAME_MAX_FILES = 993;
const INDEX_MAX_BYTES = 1024 * 1024;
const SHOTS_MAX = 4;
const SHOTS_MIN = 3;
const SHOT_MAX_BYTES = 256 * 1024;

function walk(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

function checkGame() {
  const gameDir = join(here, 'game');
  const files = walk(gameDir);
  if (files.length > GAME_MAX_FILES) {
    throw new Error(`game/ has ${files.length} files, over the ${GAME_MAX_FILES} cap`);
  }
  const bytes = files.reduce((sum, f) => sum + statSync(f).size, 0);
  if (bytes > GAME_MAX_BYTES) {
    throw new Error(`game/ is ${bytes} bytes, over the ${GAME_MAX_BYTES} cap`);
  }
  const index = statSync(join(gameDir, 'index.html'));
  if (index.size > INDEX_MAX_BYTES) {
    throw new Error(`game/index.html is ${index.size} bytes, over the ${INDEX_MAX_BYTES} cap`);
  }
  return { files: files.length, bytes };
}

function checkShots() {
  const shotsDir = join(here, 'screenshots');
  if (!existsSync(shotsDir)) throw new Error('screenshots/ is missing');
  const shots = readdirSync(shotsDir).filter((n) => !n.startsWith('.')).sort();
  if (shots.length < SHOTS_MIN || shots.length > SHOTS_MAX) {
    throw new Error(`screenshots/ holds ${shots.length} images, need ${SHOTS_MIN}-${SHOTS_MAX}`);
  }
  for (const name of shots) {
    const size = statSync(join(shotsDir, name)).size;
    if (size > SHOT_MAX_BYTES) {
      throw new Error(`screenshots/${name} is ${size} bytes, over the ${SHOT_MAX_BYTES} cap`);
    }
  }
  return shots;
}

const game = checkGame();
const shots = checkShots();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse (more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files, in all, or a path under game/ over 1000 bytes: game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json).
const dossierPath = join(out, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// Read the output back and confirm what the grader will see: the dossier
// exists and is within its 1.5 MiB cap, and the game and screenshots landed.
const dossierBytes = statSync(dossierPath).size;
if (dossierBytes > 1572864) {
  throw new Error(`dossier.json is ${dossierBytes} bytes, over the 1.5 MiB cap`);
}
const outGame = readdirSync(join(out, 'game'));
if (!outGame.includes('index.html')) throw new Error('/output/game/index.html is missing');
const outShots = readdirSync(join(out, 'screenshots')).filter((n) => !n.startsWith('.'));
if (outShots.length !== shots.length) {
  throw new Error(`/output/screenshots holds ${outShots.length} images, expected ${shots.length}`);
}

console.log(
  `Toby's Great Escape handed in: game/ ${game.files} files, `
  + `${(game.bytes / 1048576).toFixed(2)} MiB; screenshots: ${shots.join(', ')}; `
  + `dossier.json ${(dossierBytes / 1024).toFixed(1)} KiB`,
);
