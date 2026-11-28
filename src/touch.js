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

// Every button of the pad. `tap` fires once, `hold` stays down while the
// finger is on it. The label is picked by mode, because a brake is a jump
// when the player is on foot.
const BUTTONS = [
  { action: 'attack', tap: true, label: () => t('touchAttack') },
  { action: 'brake', tap: true, hold: true, label: (mode) => t(mode === 'drive' ? 'touchBrake' : 'touchJump') },
  { action: 'interact', tap: true, label: (mode) => t(mode === 'drive' ? 'touchExit' : 'touchEnter') },
  { action: 'camera', tap: true, small: true, label: () => t('touchCamera') },
  { action: 'map', tap: true, small: true, label: () => t('touchMap') },
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

export function touchPadVisible() {
  return padVisible;
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
    entry.el.setAttribute('aria-label', entry.spec.label(mode));
  }

  for (const spec of BUTTONS) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `touch-btn${spec.small ? ' small' : ''}`;
    el.dataset.action = spec.action;
    const entry = { spec, el, down: false };
    entries.push(entry);

    const press = (event) => {
      if (entry.down) return;
      stopTouch(event);
      entry.down = true;
      el.classList.add('pressed');
      capture(el, event.pointerId);
      if (spec.hold) input.hold(spec.action);
      if (spec.tap) input.tap(spec.action);
    };
    const release = (event) => {
      if (!entry.down) return;
      stopTouch(event);
      entry.down = false;
      el.classList.remove('pressed');
      if (spec.hold) input.unhold(spec.action);
    };

    el.addEventListener('pointerdown', press);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    el.addEventListener('contextmenu', (event) => event.preventDefault());
    pad.append(el);
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

  const api = {
    get visible() { return !root.classList.contains('hidden'); },
    setMode(next) {
      if (next === mode) return;
      mode = next;
      for (const entry of entries) label(entry);
    },
    // The pad itself is mounted whenever the game is playing; the setting only
    // hides the stick and the buttons, leaving the look area and the pause key.
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
      for (const entry of entries) {
        if (!entry.down) continue;
        entry.down = false;
        entry.el.classList.remove('pressed');
        if (entry.spec.hold) input.unhold(entry.spec.action);
      }
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
  activePad = api;
  return api;
}
