import { codesFor, isCapturing } from './bindings.js';

const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();
  let aim = false;

  function mouseCode(button) {
    return button >= 0 && button <= 2 ? `Mouse${button}` : '';
  }

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
    if (isCapturing()) return;
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

  const held = (action) => codesFor(action).some((code) => down.has(code));

  return {
    get w() { return held('forward'); },
    get a() { return held('left'); },
    get s() { return held('back'); },
    get d() { return held('right'); },
    get run() { return held('run'); },
    get brake() { return held('brake'); },
    consume(action) {
      const codes = codesFor(action);
      if (!codes.some((code) => pressed.has(code))) return false;
      for (const code of codes) pressed.delete(code);
      return true;
    },
    release() {
      down.clear();
      pressed.clear();
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
