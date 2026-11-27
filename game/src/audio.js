// All sound is synthesised live with WebAudio — no audio files, no network.
// Gobbles, footsteps, pickup chimes, the spotted alarm, the chase sting, the
// escape fanfare and a soft autumn birdsong bed. M toggles mute.
// Maximal pass: stage-aware ambience (wind + birdsong in the forest, a
// clucking yard, the oven's sizzle in the kitchen) and a heavier chase layer
// (low thump and snare on the music ticks) — all through the master gain,
// so mute still silences everything.
export function createAudio() {
  // Screenshot staging runs the game synchronously with no sound device:
  // return a silent stub so thousands of staged steps stay fast.
  if (new URLSearchParams(window.location.search).get('shot')) {
    const noop = () => {};
    return {
      unlock: noop, setChase: noop, setMuted: noop, isMuted: () => true,
      setStage: noop,
      gobble: noop, step: noop, pickup: noop, golden: noop, alarm: noop,
      hurt: noop, dash: noop, hide: noop, decoy: noop, knife: noop,
      fanfare: noop, caughtSting: noop,
    };
  }
  let ctx = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let ambientTimer = null;
  let chaseMode = false;
  let stageId = 'farmyard';
  let windGain = null;
  let sizzleGain = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  // A looping noise bed through a filter: wind (lowpass) or oven sizzle
  // (highpass). The gain ramps with the stage; the source loops forever.
  function loopedNoise(filterType, filterFreq) {
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
    return gain;
  }

  function startAmbience() {
    if (windGain) return;
    windGain = loopedNoise('lowpass', 420);
    sizzleGain = loopedNoise('highpass', 2600);
    if (!ambientTimer) {
      ambientTimer = setInterval(() => {
        if (!ctx || muted) return;
        const r = Math.random();
        if (stageId === 'forest' && r < 0.3) chirp();
        else if (stageId === 'farmyard' && r < 0.14) cluck();
        else if (stageId === 'kitchen' && r < 0.4) crackle();
      }, 600);
    }
    applyStageGains();
  }

  function applyStageGains() {
    if (!ctx || !windGain) return;
    const t = ctx.currentTime;
    const windTarget = stageId === 'kitchen' ? 0 : stageId === 'forest' ? 0.055 : 0.035;
    const sizzleTarget = stageId === 'kitchen' ? 0.05 : 0;
    windGain.gain.linearRampToValueAtTime(windTarget, t + 1.2);
    sizzleGain.gain.linearRampToValueAtTime(sizzleTarget, t + 1.2);
  }

  // A bird chirp: two or three quick rising sine peeps at a random pitch.
  function chirp() {
    const base = 2200 + Math.random() * 1400;
    const peeps = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < peeps; i += 1) {
      tone(base + i * 260, 0.07, 'sine', 0.045, base + i * 260 + 500, i * 0.09);
    }
  }

  // A distant hen cluck: two low square blips.
  function cluck() {
    tone(320, 0.07, 'square', 0.05, 190);
    tone(280, 0.09, 'square', 0.04, 160, 0.12);
  }

  // An oven crackle: a short bright noise pop.
  function crackle() {
    noise(0.05, 0.09, 5200);
  }

  function tone(freq, dur, type, vol, slideTo, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol, filterFreq, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  // A turkey gobble: three fast descending "gob-gob-gob" blurts.
  function gobble() {
    for (let i = 0; i < 3; i += 1) {
      tone(340 - i * 30, 0.09, 'sawtooth', 0.16, 150, i * 0.11);
      tone(680 - i * 60, 0.09, 'square', 0.05, 320, i * 0.11);
    }
  }

  function step() {
    noise(0.05, 0.1, 500);
  }

  function pickup() {
    tone(880, 0.09, 'sine', 0.16);
    tone(1318, 0.14, 'sine', 0.14, null, 0.08);
  }

  function golden() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.15, null, i * 0.07));
  }

  function alarm() {
    tone(660, 0.16, 'square', 0.12, 880);
    tone(880, 0.16, 'square', 0.12, 660, 0.17);
  }

  function hurt() {
    tone(220, 0.25, 'sawtooth', 0.2, 90);
    noise(0.18, 0.14, 900);
  }

  function dash() {
    noise(0.22, 0.12, 2400);
    tone(300, 0.2, 'sine', 0.08, 620);
  }

  function hide() {
    noise(0.3, 0.07, 1200);
  }

  function decoy() {
    tone(1200, 0.08, 'sine', 0.12, 900);
    tone(900, 0.1, 'sine', 0.1, 1400, 0.09);
  }

  function knife() {
    noise(0.35, 0.1, 4200);
    tone(1800, 0.3, 'sine', 0.05, 700);
  }

  function fanfare() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.35, 'triangle', 0.16, null, i * 0.12));
    [262, 330, 392].forEach((f) => tone(f, 0.6, 'sine', 0.07, null, 0.5));
  }

  function caughtSting() {
    [392, 370, 349, 311].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.12, null, i * 0.16));
  }

  // Music bed: a gentle autumn waltz when calm, a driving minor pulse when
  // a chaser is on Toby's tail. Two bars looped on a timer. The chase layer
  // adds a low thump on every beat and a snare hiss on the backbeat.
  const CALM = [262, 330, 392, 523, 392, 330, 294, 392];
  const CHASE = [220, 233, 220, 196, 220, 262, 233, 196];
  let bar = 0;
  function musicTick() {
    if (!ctx || muted) return;
    const seq = chaseMode ? CHASE : CALM;
    const note = seq[bar % seq.length];
    tone(note, 0.32, chaseMode ? 'sawtooth' : 'triangle', chaseMode ? 0.05 : 0.06);
    if (bar % 2 === 0) tone(note / 2, 0.3, 'sine', 0.05);
    if (chaseMode) {
      tone(110, 0.16, 'sine', 0.1);
      if (bar % 4 === 2) noise(0.09, 0.07, 1800);
      if (bar % 8 === 6) tone(440, 0.2, 'sawtooth', 0.04, 880);
    }
    bar += 1;
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
      if (!musicTimer) musicTimer = setInterval(musicTick, 340);
      startAmbience();
    },
    setStage(id) {
      stageId = id;
      applyStageGains();
    },
    setChase(on) {
      chaseMode = on;
    },
    setMuted(on) {
      muted = on;
      if (master) master.gain.value = on ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    gobble,
    step,
    pickup,
    golden,
    alarm,
    hurt,
    dash,
    hide,
    decoy,
    knife,
    fanfare,
    caughtSting,
  };
}
