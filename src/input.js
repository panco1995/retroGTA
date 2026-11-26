import { codesFor, isCapturing } from './bindings.js';

const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();

  window.addEventListener('keydown', (e) => {
    if (e.repeat || isCapturing()) return;
    down.add(e.code);
    pressed.add(e.code);
    if (BLOCK.has(e.code)) e.preventDefault();
  });

  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
  });

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
  };
}
