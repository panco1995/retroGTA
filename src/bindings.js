import { onLangChange, t } from './i18n.js';

const ACTIONS = ['forward', 'back', 'left', 'right', 'run', 'brake', 'interact', 'camera'];

const LABELS = {
  forward: 'bindForward',
  back: 'bindBack',
  left: 'bindLeft',
  right: 'bindRight',
  run: 'bindRun',
  brake: 'bindBrake',
  interact: 'bindInteract',
  camera: 'bindCamera',
};

const DEFAULTS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  run: 'ShiftLeft',
  brake: 'Space',
  interact: 'KeyE',
  camera: 'KeyV',
};

const storageKey = 'retrogta.keys';
const listeners = new Set();
const buttons = new Map();

let bindings = load();
let listening = null;

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null');
    const next = {};
    const seen = new Set();
    for (const action of ACTIONS) {
      const code = raw?.[action];
      if (typeof code !== 'string' || !/^[A-Za-z0-9]{1,24}$/.test(code) || code === 'Escape') {
        return { ...DEFAULTS };
      }
      if (seen.has(code)) return { ...DEFAULTS };
      seen.add(code);
      next[action] = code;
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
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return code.slice(6);
  return code;
}

export function keyVars() {
  return {
    move: ['forward', 'left', 'back', 'right'].map((action) => keyName(bindings[action])).join(' '),
    run: keyName(bindings.run),
    brake: keyName(bindings.brake),
    interact: keyName(bindings.interact),
    camera: keyName(bindings.camera),
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

function pauseControlsOpen() {
  const pause = document.getElementById('pause');
  const panel = document.getElementById('pause-controls-panel');
  return Boolean(pause && panel && !pause.classList.contains('hidden') && !panel.hidden);
}

function showPauseHome() {
  cancelCapture();
  const home = document.getElementById('pause-home');
  const panel = document.getElementById('pause-controls-panel');
  if (home) home.hidden = false;
  if (panel) panel.hidden = true;
  document.body.classList.remove('rebinding');
}

export function resetPauseControls() {
  showPauseHome();
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
  mount(document.getElementById('pause-controls-list'));
  refreshCopy();
  onLangChange(refreshCopy);

  document.getElementById('controls-reset').addEventListener('click', resetBindings);
  document.getElementById('pause-controls-reset').addEventListener('click', resetBindings);
  document.getElementById('pause-controls').addEventListener('click', () => {
    cancelCapture();
    document.getElementById('pause-home').hidden = true;
    document.getElementById('pause-controls-panel').hidden = false;
    document.body.classList.add('rebinding');
  });
  document.getElementById('pause-controls-back').addEventListener('click', showPauseHome);

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const capturing = listening !== null;
    const backToPause = !capturing && event.code === 'Escape' && pauseControlsOpen();
    if (!capturing && !backToPause) return;
    event.preventDefault();
    event.stopPropagation();
    if (backToPause || event.code === 'Escape' || event.code === 'Unidentified') {
      if (backToPause) showPauseHome();
      else cancelCapture();
      return;
    }
    assign(listening, event.code);
  }, true);
}
