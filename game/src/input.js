// Keyboard + mouse input. Movement keys report a held direction; action keys
// report one-shot presses the game loop consumes (confirm, pause, dash, hide,
// decoy, mute). A virtual pad lets the autopilot drive the same interface.
import { KEYS } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_HIDE = 8;
export const ACTION_DECOY = 16;
export const ACTION_MUTE = 32;

export function createInput(canvas) {
  const held = new Set();
  const queue = [];
  let dragYaw = 0;
  let dragging = false;
  let lastX = 0;

  function codeToAction(code) {
    if (KEYS.confirm.includes(code)) return ACTION_CONFIRM;
    if (KEYS.pause.includes(code)) return ACTION_PAUSE;
    if (KEYS.dash.includes(code)) return ACTION_DASH;
    if (KEYS.hide.includes(code)) return ACTION_HIDE;
    if (KEYS.decoy.includes(code)) return ACTION_DECOY;
    if (KEYS.mute.includes(code)) return ACTION_MUTE;
    return 0;
  }

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    const action = codeToAction(event.code);
    if (action) queue.push(action);
    if (KEYS.jump.includes(event.code)) event.preventDefault();
  }
  function onKeyUp(event) {
    held.delete(event.code);
  }
  function onMouseDown(event) {
    dragging = true;
    lastX = event.clientX;
  }
  function onMouseMove(event) {
    if (!dragging) return;
    dragYaw += (event.clientX - lastX) * 0.005;
    lastX = event.clientX;
  }
  function onMouseUp() {
    dragging = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // The autopilot (and the test harness) writes here instead of keys.
  const virtual = { x: 0, z: 0, jump: false, actions: 0 };

  return {
    direction() {
      let x = virtual.x;
      let z = virtual.z;
      if (KEYS.left.some((c) => held.has(c))) x -= 1;
      if (KEYS.right.some((c) => held.has(c))) x += 1;
      if (KEYS.up.some((c) => held.has(c))) z -= 1;
      if (KEYS.down.some((c) => held.has(c))) z += 1;
      const len = Math.hypot(x, z);
      if (len > 1) {
        x /= len;
        z /= len;
      }
      return { x, z };
    },
    jumpHeld() {
      return virtual.jump || KEYS.jump.some((c) => held.has(c));
    },
    takeActions() {
      let out = virtual.actions;
      virtual.actions = 0;
      while (queue.length) out |= queue.shift();
      return out;
    },
    takeDragYaw() {
      const yaw = dragYaw;
      dragYaw = 0;
      return yaw;
    },
    setVirtual(x, z, jump, actions) {
      virtual.x = x;
      virtual.z = z;
      virtual.jump = jump;
      virtual.actions |= actions;
    },
    clearVirtual() {
      virtual.x = 0;
      virtual.z = 0;
      virtual.jump = false;
      virtual.actions = 0;
    },
  };
}
