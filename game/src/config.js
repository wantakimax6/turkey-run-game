// Toby's Great Escape — shared tuning and stage definitions.
// One turkey, three stages, one farm that wants him for dinner.
export const STEP = 1 / 60;
export const BEST_KEY = 'toby-great-escape-best';

export const PLAYER = {
  radius: 0.9,
  walkSpeed: 9.0,
  runSpeed: 12.5,
  dashSpeed: 22.0,
  dashTime: 0.45,
  dashCooldown: 1.1,
  staminaMax: 100,
  staminaDrain: 42,
  staminaRegen: 26,
  jumpSpeed: 9.5,
  gravity: 26,
  lives: 3,
  decoys: 3,
};

export const CHASER = {
  farmerSpeed: 9.4,
  dogSpeed: 11.0,
  foxSpeed: 10.6,
  cookSpeed: 8.4,
  spotRange: 26,
  spotAngle: 1.15,
  loseTime: 1.6,
  catchRadius: 1.7,
  searchTime: 6,
};

export const SCORE = {
  corn: 10,
  acorn: 10,
  goldenFeather: 50,
  perMetre: 1,
  stageClear: 250,
  escapeBonus: 500,
};

export const STAGES = [
  {
    id: 'farmyard',
    name: 'Stage 1 — The Farmyard',
    hint: 'Reach the broken fence gate. Farmer Hank is watching — hay bales break his line of sight.',
    size: 96,
    sky: 0x9fc7e8,
    fog: 0xcfd9e8,
    ground: 'grass',
    path: 'dirt',
    chasers: [{ kind: 'farmer', count: 1 }, { kind: 'dog', count: 1 }],
    timeLimit: 0,
  },
  {
    id: 'forest',
    name: 'Stage 2 — The Autumn Forest',
    hint: 'Foxes hunt these woods. Crouch in the bushes (H) to vanish — and mind the stream.',
    size: 108,
    sky: 0x8fb4d8,
    fog: 0xb9c9a8,
    ground: 'forestfloor',
    path: 'dirt',
    chasers: [{ kind: 'fox', count: 2 }, { kind: 'dog', count: 1 }],
    timeLimit: 0,
  },
  {
    id: 'kitchen',
    name: 'Stage 3 — The Farmhouse Kitchen',
    hint: 'The oven burns and the carving knives slide. Reach the open window — freedom!',
    size: 64,
    sky: 0x2a2118,
    fog: 0x6b5844,
    ground: 'tiles',
    path: 'stone',
    chasers: [{ kind: 'cook', count: 1 }],
    timeLimit: 0,
  },
];

export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  dash: ['ShiftLeft', 'ShiftRight'],
  hide: ['KeyH'],
  decoy: ['KeyQ'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  confirm: ['Space', 'Enter'],
};
