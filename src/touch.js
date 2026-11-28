import { onLangChange, t } from './i18n.js';

// A phone or tablet. `pointer: coarse` is the primary input being a finger;
// the second test catches a device with a touch screen and no mouse at all.
// It deliberately leaves out a touch-screen laptop, which has a mouse and a
// keyboard and should play the desktop way.
export const isTouch = window.matchMedia('(pointer: coarse)').matches
  || (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches);

const STORE = 'retrogta.touchPad';
// How far the stick travels from its rest point, as a share of its radius.
const TRAVEL = 0.82;
// Radians per pixel of drag. A slow drag must still turn, a fast one must not
// spin the camera round twice.
const LOOK_SPEED = 0.0032;

// Every button of the pad. `tap` fires once, `holds` lists the actions to hold
// down while the finger is on it - a list rather than one action because the
// brake in a car is also the reverse, the way the S key is on a keyboard. A
// key only appears in the mode it belongs to, and the label is picked by mode
// because a brake is a jump when walking.
//
// Where each one sits is the stylesheet's business: it places them by action,
// so the bottom slot can hold the punch on foot and the throttle in a car
// without either of them knowing about the other.
const BUTTONS = [
  { action: 'attack', tap: true, modes: 'foot', label: () => t('touchAttack') },
  { action: 'forward', modes: 'drive', holds: () => ['forward'], label: () => t('touchThrottle') },
  {
    // In a car the trigger is the key S is on a keyboard: it is the reverse,
    // and the reverse is also the brake, because a negative throttle takes
    // speed off while the car is still rolling forward. It must not hold the
    // foot brake as well: 22 m/s² of braking against 7.5 m/s² of reverse
    // cancels out and the car sits at a crawl.
    action: 'brake',
    tap: true,
    holds: (mode) => (mode === 'drive' ? ['back'] : ['brake']),
    label: (mode) => t(mode === 'drive' ? 'touchBrake' : 'touchJump'),
  },
  { action: 'interact', tap: true, label: (mode) => t(mode === 'drive' ? 'touchExit' : 'touchEnter') },
  { action: 'camera', tap: true, small: true, label: () => t('touchCamera') },
  { action: 'map', tap: true, small: true, label: () => t('touchMap') },
];

// Driving is two arrows and a throttle. A stick is the wrong shape for it: a
// car keeps only what the wheel is doing, so a thumb held at a spot to hold a
// turn is more work than a thumb on a key, and the throttle is a key of its
// own rather than a direction the wheel shares.
const STEER = [
  { action: 'left', holds: () => ['left'], label: () => '‹' },
  { action: 'right', holds: () => ['right'], label: () => '›' },
];

let padVisible = loadVisible();

function loadVisible() {
  try {
    return localStorage.getItem(STORE) !== '0';
  } catch {
    return true;
  }
}

function saveVisible(next) {
  padVisible = next;
  try {
    localStorage.setItem(STORE, next ? '1' : '0');
  } catch {
    // A private window has no storage; the setting just does not stick.
  }
}

// The pad lives in the game (it needs the input object), but the setting that
// shows it belongs to the menus, so it is reachable from both sides. Both
// write the same body class, so the setting holds whether or not the pad is
// mounted yet.
let activePad = null;
const padListeners = new Set();

export function onTouchPadChange(listener) {
  padListeners.add(listener);
}

export function setTouchPadEnabled(next) {
  saveVisible(next);
  document.body.classList.toggle('pad-off', !next);
  activePad?.syncVisible();
  refreshPadOptions();
  padListeners.forEach((listener) => listener(padVisible));
  return padVisible;
}

function refreshPadOptions() {
  document.querySelectorAll('[data-pad-visible]').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.dataset.padVisible) === String(padVisible) ? 'true' : 'false');
  });
}

function mountPadOptions() {
  const root = document.getElementById('touch-pad-options');
  if (!root) return;
  root.replaceChildren();
  for (const [value, key] of [[true, 'touchPadOn'], [false, 'touchPadOff']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.i18n = key;
    button.dataset.padVisible = String(value);
    button.textContent = t(key);
    button.addEventListener('click', () => setTouchPadEnabled(value));
    root.append(button);
  }
  refreshPadOptions();
}

// Landscape is what the game is laid out for. Fullscreen comes first because
// a browser only lets a page lock its orientation while it fills the screen.
export function requestLandscape() {
  const root = document.documentElement;
  const lock = () => {
    const pending = screen.orientation?.lock?.('landscape');
    if (pending && typeof pending.catch === 'function') pending.catch(() => {});
  };
  if (document.fullscreenElement) {
    lock();
    return;
  }
  const pending = root.requestFullscreen?.();
  if (pending && typeof pending.then === 'function') pending.then(lock).catch(() => {});
}

export function initTouch() {
  mountPadOptions();
  onLangChange(mountPadOptions);
  if (!isTouch) return;
  document.documentElement.classList.add('touch');

  const rotate = document.getElementById('rotate');
  const goLandscape = document.getElementById('rotate-go');
  goLandscape?.addEventListener('click', () => requestLandscape());
  rotate?.addEventListener('click', (event) => {
    if (event.target === rotate) requestLandscape();
  });
}

export function createTouchPad({ input, onLook, onPause }) {
  const root = document.getElementById('touch');
  const stick = document.getElementById('touch-stick');
  const knob = document.getElementById('touch-stick-knob');
  const look = document.getElementById('touch-look');
  const pad = document.getElementById('touch-buttons');
  const pauseEl = document.getElementById('touch-pause');
  const entries = [];
  let mode = 'foot';
  let stickId = null;
  let lookId = 0;
  let lookX = 0;
  let lookY = 0;

  function stopTouch(event) {
    // The pad floats over the canvas: nothing it does may reach the game
    // underneath, or a tap would also count as a click that grabs the mouse.
    event.preventDefault();
    event.stopPropagation();
  }

  // A pointer can be gone by the time the capture is asked for - a stray event
  // from a browser that has already dropped it - and a throw here would take
  // the whole press with it.
  function capture(el, id) {
    try {
      el.setPointerCapture?.(id);
    } catch {
      // Not a live pointer; the events still arrive.
    }
  }

  function label(entry) {
    entry.el.textContent = entry.spec.label(mode);
    entry.el.setAttribute('aria-label', specLabel(entry.spec));
  }

  // The arrows are a glyph, so naming them for a screen reader takes the
  // spelled-out words rather than the character.
  function specLabel(spec) {
    if (spec.action === 'left') return t('touchLeft');
    if (spec.action === 'right') return t('touchRight');
    return spec.label(mode);
  }

  // A button is only on the pad in the mode it belongs to: no throttle while
  // walking, no punch while driving.
  function shown(spec) {
    return !spec.modes || spec.modes === mode;
  }

  // Lets go of everything one button is holding. Kept outside makeButton
  // because the mode switch has to do it too, for a key that vanished from
  // under a thumb.
  function release(entry) {
    if (!entry.down) return;
    entry.down = false;
    entry.el.classList.remove('pressed');
    for (const action of entry.held) input.unhold(action);
    entry.held = [];
  }

  // One press-and-hold button. The pad's cluster and the steering arrows are
  // the same thing with a different place in the layout, so they are built by
  // the same function.
  function makeButton(spec, parent, className) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.dataset.action = spec.action;
    const entry = { spec, el, down: false, held: [] };
    entries.push(entry);

    // What this key is holding this press. Kept on the entry rather than read
    // from the spec at release, because the mode may have changed under it: a
    // brake pressed on foot is let go of as a brake, not as the reverse the
    // same key would mean in a car.
    const press = (event) => {
      if (entry.down) return;
      stopTouch(event);
      entry.down = true;
      entry.held = spec.holds?.(mode) ?? [];
      el.classList.add('pressed');
      capture(el, event.pointerId);
      for (const action of entry.held) input.hold(action);
      if (spec.tap) input.tap(spec.action);
    };
    const lift = (event) => {
      if (!entry.down) return;
      stopTouch(event);
      release(entry);
    };

    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', lift);
    el.addEventListener('pointercancel', lift);
    el.addEventListener('lostpointercapture', lift);
    el.addEventListener('contextmenu', (event) => event.preventDefault());
    parent.append(el);
    return entry;
  }

  for (const spec of BUTTONS) {
    spec.el = makeButton(spec, pad, `touch-btn${spec.small ? ' small' : ''}`).el;
  }

  // The two steering arrows, left thumb, only while driving.
  const steerEl = document.getElementById('touch-steer');
  for (const spec of STEER) {
    spec.el = makeButton(spec, steerEl, 'touch-btn touch-steer-btn').el;
    spec.el.textContent = spec.label();
    spec.el.setAttribute('aria-label', specLabel(spec));
  }

  // The stick: a fixed base with a knob that follows the thumb. Pushing it
  // further is how the player runs, so no extra button is needed for that.
  function stickTo(event) {
    const rect = stick.getBoundingClientRect();
    const max = Math.max(24, Math.min(rect.width, rect.height) / 2);
    let dx = event.clientX - (rect.left + rect.width / 2);
    let dy = event.clientY - (rect.top + rect.height / 2);
    const limit = max * TRAVEL;
    const len = Math.hypot(dx, dy);
    if (len > limit) {
      dx = (dx / len) * limit;
      dy = (dy / len) * limit;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // Screen y grows downward; forward is up.
    input.setStick(dx / limit, -dy / limit);
  }

  stick.addEventListener('pointerdown', (event) => {
    if (stickId !== null) return;
    stopTouch(event);
    stickId = event.pointerId;
    capture(stick, event.pointerId);
    stick.classList.add('active');
    stickTo(event);
  });
  stick.addEventListener('pointermove', (event) => {
    if (event.pointerId !== stickId) return;
    stopTouch(event);
    stickTo(event);
  });
  const dropStick = (event) => {
    if (event.pointerId !== stickId) return;
    stopTouch(event);
    stickId = null;
    stick.classList.remove('active');
    knob.style.transform = '';
    input.clearStick();
  };
  stick.addEventListener('pointerup', dropStick);
  stick.addEventListener('pointercancel', dropStick);
  stick.addEventListener('lostpointercapture', dropStick);

  // Everything that is neither the stick nor a button is the look area, so a
  // drag anywhere on the screen turns the camera.
  look.addEventListener('pointerdown', (event) => {
    if (lookId !== 0) return;
    lookId = event.pointerId;
    lookX = event.clientX;
    lookY = event.clientY;
    capture(look, event.pointerId);
  });

  look.addEventListener('pointermove', (event) => {
    if (event.pointerId !== lookId) return;
    const dx = event.clientX - lookX;
    const dy = event.clientY - lookY;
    lookX = event.clientX;
    lookY = event.clientY;
    if (dx || dy) onLook?.(dx * LOOK_SPEED, dy * LOOK_SPEED);
  });
  const dropLook = (event) => {
    if (event.pointerId !== lookId) return;
    lookId = 0;
  };
  look.addEventListener('pointerup', dropLook);
  look.addEventListener('pointercancel', dropLook);
  look.addEventListener('lostpointercapture', dropLook);

  pauseEl.addEventListener('pointerdown', (event) => {
    stopTouch(event);
    onPause?.();
  });

  // The mode picks which set of keys is on screen: the stick and the punch on
  // foot, the arrows and the throttle in a car. Anything that changes shape
  // with the mode is redrawn here, and nothing that is being held is left
  // behind - a stick that vanished under a thumb would keep walking.
  function applyMode() {
    const driving = mode === 'drive';
    root.classList.toggle('driving', driving);
    if (!driving) {
      // The stick is only on foot, so a car gets its turn without one.
      stickId = null;
      stick.classList.remove('active');
      knob.style.transform = '';
      input.clearStick();
    }
    for (const entry of entries) {
      label(entry);
      entry.el.hidden = !shown(entry.spec);
      // A key that is being held when the mode flips is released, so it cannot
      // stick down with no button to let go of.
      if (!shown(entry.spec) && entry.down) {
        release(entry);
      }
    }
  }

  const api = {
    get visible() { return !root.classList.contains('hidden'); },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      applyMode();
    },
    // The pad itself is mounted whenever the game is playing; the setting only
    // hides the keys, leaving the look area and the pause key.
    show() {
      root.classList.remove('hidden');
      api.syncVisible();
    },
    hide() {
      root.classList.add('hidden');
      api.reset();
    },
    syncVisible() {
      document.body.classList.toggle('pad-off', !padVisible);
    },
    reset() {
      for (const entry of entries) release(entry);
      stickId = null;
      lookId = 0;
      stick.classList.remove('active');
      knob.style.transform = '';
      input.clearStick();
    },
    refresh() {
      for (const entry of entries) label(entry);
    },
  };

  for (const entry of entries) label(entry);
  onLangChange(() => api.refresh());
  api.syncVisible();
  applyMode();
  activePad = api;
  return api;
}
