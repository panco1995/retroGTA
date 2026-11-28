import { codesFor, isCapturing } from './bindings.js';

const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

// A resting thumb must not walk the character, so the stick only counts once
// it is pushed past this and the value is re-scaled to 0..1 above it.
const STICK_DEAD = 0.2;
// Pushed all the way, the stick is a run: that saves a button under the thumb
// that is already busy steering.
const STICK_RUN = 0.88;
// A touch also fires compatibility mouse events. Mouse input is ignored for a
// moment after a touch, so tapping the attack button does not fire twice.
const TOUCH_GRACE = 600;

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  // Actions a virtual button is holding down, and the ones it only taps.
  const touchHeld = new Set();
  const touchTapped = new Set();
  // The virtual stick: x is right, y is forward, both -1..1.
  const stick = { x: 0, y: 0 };
  let lastTouch = -Infinity;
  let aim = false;

  function mouseCode(button) {
    return button >= 0 && button <= 2 ? `Mouse${button}` : '';
  }

  const touchedRecently = () => performance.now() - lastTouch < TOUCH_GRACE;

  window.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') lastTouch = performance.now();
  }, true);

  window.addEventListener('keydown', (e) => {
    if (e.repeat || isCapturing()) return;
    down.add(e.code);
    pressed.add(e.code);
    if (BLOCK.has(e.code)) e.preventDefault();
  });

  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
  });

  window.addEventListener('mousedown', (e) => {
    if (isCapturing() || touchedRecently()) return;
    const code = mouseCode(e.button);
    if (!code) return;
    const locked = document.pointerLockElement === canvas;
    if (!locked && e.target !== canvas) return;
    // Follow camera uses the first click to lock the pointer, not to attack.
    if (aim && !locked) return;
    down.add(code);
    pressed.add(code);
    if (e.button !== 0) e.preventDefault();
  });

  window.addEventListener('mouseup', (e) => {
    const code = mouseCode(e.button);
    if (code) down.delete(code);
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('blur', () => {
    down.clear();
    pressed.clear();
  });

  const held = (action) => touchHeld.has(action) || codesFor(action).some((code) => down.has(code));
  const stickLength = () => Math.hypot(stick.x, stick.y);
  // A key is a full push of the stick, so the two sources can be added up.
  const keys = (plus, minus) => (held(plus) ? 1 : 0) - (held(minus) ? 1 : 0);

  return {
    get w() { return held('forward') || stick.y > STICK_DEAD; },
    get a() { return held('left') || stick.x < -STICK_DEAD; },
    get s() { return held('back') || stick.y < -STICK_DEAD; },
    get d() { return held('right') || stick.x > STICK_DEAD; },
    get run() { return held('run') || stickLength() > STICK_RUN; },
    get brake() { return held('brake'); },
    // The two sources stay separate for walking, because a key is a walk and a
    // full push of the stick is a run: adding them would make a key run too.
    get keysX() { return keys('right', 'left'); },
    get keysY() { return keys('forward', 'back'); },
    get stickX() { return stick.x; },
    get stickY() { return stick.y; },
    // Driving only cares how hard and which way, so the sources are one number
    // there: a stick can feather the throttle, a key is the full push.
    get throttle() { return Math.max(-1, Math.min(1, this.keysY + stick.y)); },
    // Steering is the other way round: turning right lowers the heading, so
    // the stick's right and D both read negative.
    get steer() { return Math.max(-1, Math.min(1, -(this.keysX + stick.x))); },
    consume(action) {
      let hit = touchTapped.delete(action);
      for (const code of codesFor(action)) {
        if (!pressed.has(code)) continue;
        pressed.delete(code);
        hit = true;
      }
      return hit;
    },
    // Virtual controls: a stick that is held, a button that is held, and a
    // button that only fires once, for the one-shot actions.
    setStick(x, y) {
      const len = Math.hypot(x, y);
      if (len <= STICK_DEAD) {
        stick.x = 0;
        stick.y = 0;
        return;
      }
      const mag = Math.min(1, (len - STICK_DEAD) / (1 - STICK_DEAD));
      stick.x = (x / len) * mag;
      stick.y = (y / len) * mag;
    },
    clearStick() {
      stick.x = 0;
      stick.y = 0;
    },
    hold(action) {
      touchHeld.add(action);
    },
    unhold(action) {
      touchHeld.delete(action);
    },
    tap(action) {
      touchTapped.add(action);
    },
    // Drops the keyboard and mouse state, and any press that has not been
    // read yet. The stick and the held buttons belong to the pad: a thumb that
    // is still down has not let go just because a car was entered, and the pad
    // clears them itself when it is hidden or the game is paused.
    release() {
      down.clear();
      pressed.clear();
      touchTapped.clear();
    },
    lock() {
      const pending = canvas.requestPointerLock?.();
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    },
    setAim(next) {
      aim = next;
    },
  };
}
