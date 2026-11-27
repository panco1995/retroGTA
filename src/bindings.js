import { onLangChange, t } from './i18n.js';

const ACTIONS = ['forward', 'back', 'left', 'right', 'run', 'brake', 'attack', 'interact', 'camera', 'map'];

const LABELS = {
  forward: 'bindForward',
  back: 'bindBack',
  left: 'bindLeft',
  right: 'bindRight',
  run: 'bindRun',
  attack: 'bindAttack',
  brake: 'bindBrake',
  interact: 'bindInteract',
  camera: 'bindCamera',
  map: 'bindMap',
};

const DEFAULTS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: 'ShiftLeft',
  attack: 'Mouse0',
  brake: 'Space',
  interact: 'KeyE',
  camera: 'KeyV',
  map: 'KeyM',
};

const storageKey = 'retrogta.keys';
const CODE = /^(?:Mouse[0-2]|[A-Za-z0-9]{1,24})$/;
const listeners = new Set();
const buttons = new Map();
let swallowClick = false;

let bindings = load();
let listening = null;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
    const next = {};
    const used = new Set();

    // Keep every saved binding, including ones from before a new action existed.
    for (const action of ACTIONS) {
      const saved = raw?.[action];
      if (saved == null) continue;
      if (typeof saved !== 'string' || !CODE.test(saved) || saved === 'Escape') {
        return { ...DEFAULTS };
      }
      if (used.has(saved)) return { ...DEFAULTS };
      next[action] = saved;
      used.add(saved);
    }

    // Fill newly added actions without stealing a saved key.
    for (const action of ACTIONS) {
      if (next[action]) continue;
      const pool = [DEFAULTS[action], 'KeyG', 'KeyH', 'KeyJ', 'KeyK'];
      const code = pool.find((candidate) => !used.has(candidate));
      if (!code) return { ...DEFAULTS };
      next[action] = code;
      used.add(code);
    }
    return next;
  } catch {
    return { ...DEFAULTS };
  }
}

function save() {
  localStorage.setItem(storageKey, JSON.stringify(bindings));
}

function pair(code) {
  if (code === 'ShiftLeft' || code === 'ShiftRight') return ['ShiftLeft', 'ShiftRight'];
  if (code === 'ControlLeft' || code === 'ControlRight') return ['ControlLeft', 'ControlRight'];
  if (code === 'AltLeft' || code === 'AltRight') return ['AltLeft', 'AltRight'];
  return [code];
}

export function codesFor(action) {
  const code = bindings[action];
  return pair(code).filter((candidate) => {
    if (candidate === code) return true;
    return !ACTIONS.some((other) => bindings[other] === candidate);
  });
}

export function isCapturing() {
  return listening !== null;
}

function namedKey(code) {
  const named = {
    Space: 'keySpace',
    ShiftLeft: 'keyShift',
    ShiftRight: 'keyShiftRight',
    ControlLeft: 'keyCtrl',
    ControlRight: 'keyCtrlRight',
    AltLeft: 'keyAlt',
    AltRight: 'keyAltRight',
    Enter: 'keyEnter',
    NumpadEnter: 'keyEnter',
    Backspace: 'keyBackspace',
    Tab: 'keyTab',
    CapsLock: 'keyCaps',
    ArrowUp: 'keyUp',
    ArrowDown: 'keyDown',
    ArrowLeft: 'keyLeft',
    ArrowRight: 'keyRight',
  };
  return named[code] ? t(named[code]) : '';
}

export function keyName(code) {
  const named = namedKey(code);
  if (named) return named;
  if (code === 'Mouse0') return t('mouseLeft');
  if (code === 'Mouse1') return t('mouseMiddle');
  if (code === 'Mouse2') return t('mouseRight');
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return code.slice(6);
  return code;
}

export function keyVars() {
  return {
    move: ['forward', 'left', 'back', 'right'].map((action) => keyName(bindings[action])).join(' '),
    run: keyName(bindings.run),
    jump: keyName(bindings.brake),
    attack: keyName(bindings.attack),
    brake: keyName(bindings.brake),
    interact: keyName(bindings.interact),
    camera: keyName(bindings.camera),
    map: keyName(bindings.map),
  };
}

function refreshButtons() {
  for (const [key, button] of buttons) {
    const action = key.slice(key.indexOf(':') + 1);
    const active = listening === action;
    button.classList.toggle('listening', active);
    button.textContent = active ? t('pressKey') : keyName(bindings[action]);
  }
}

function refreshCopy() {
  const about = document.getElementById('boot-keys');
  if (about) about.textContent = t('bootKeys', keyVars());
  refreshButtons();
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function onBindingsChange(listener) {
  listeners.add(listener);
}

export function cancelCapture() {
  if (!listening) return;
  listening = null;
  refreshButtons();
}

function assign(action, code) {
  const other = ACTIONS.find((item) => item !== action && bindings[item] === code);
  if (other) bindings[other] = bindings[action];
  bindings[action] = code;
  listening = null;
  save();
  refreshCopy();
  notify();
}

function startCapture(action) {
  listening = action;
  refreshButtons();
}

function mount(root) {
  root.replaceChildren();
  for (const action of ACTIONS) {
    const row = document.createElement('div');
    row.className = 'control-row';
    const label = document.createElement('span');
    label.dataset.i18n = LABELS[action];
    label.textContent = t(LABELS[action]);
    const button = document.createElement('button');
    button.type = 'button';
    button.addEventListener('click', () => startCapture(action));
    row.append(label, button);
    root.append(row);
    buttons.set(`${root.id}:${action}`, button);
  }
}

function resetBindings() {
  listening = null;
  bindings = { ...DEFAULTS };
  save();
  refreshCopy();
  notify();
}

export function initBindings() {
  mount(document.getElementById('controls'));
  refreshCopy();
  onLangChange(refreshCopy);

  document.getElementById('controls-reset').addEventListener('click', resetBindings);

  window.addEventListener('keydown', (event) => {
    if (event.repeat || listening === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape' || event.code === 'Unidentified') {
      cancelCapture();
      return;
    }
    assign(listening, event.code);
  }, true);

  window.addEventListener('mousedown', (event) => {
    if (listening === null || event.button > 2) return;
    event.preventDefault();
    event.stopPropagation();
    swallowClick = true;
    assign(listening, `Mouse${event.button}`);
  }, true);

  window.addEventListener('click', (event) => {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);

  window.addEventListener('contextmenu', (event) => {
    if (listening === null && !swallowClick) return;
    event.preventDefault();
  }, true);
}
