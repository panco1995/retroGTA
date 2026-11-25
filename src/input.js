export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    down.add(e.code);
    pressed.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    down.delete(e.code);
  });

  window.addEventListener('blur', () => {
    down.clear();
    pressed.clear();
  });

  const has = (...codes) => codes.some((code) => down.has(code));

  return {
    get w() { return has('KeyW', 'ArrowUp'); },
    get a() { return has('KeyA', 'ArrowLeft'); },
    get s() { return has('KeyS', 'ArrowDown'); },
    get d() { return has('KeyD', 'ArrowRight'); },
    get run() { return has('ShiftLeft', 'ShiftRight'); },
    get brake() { return has('Space'); },
    consume(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    lock() {
      const pending = canvas.requestPointerLock?.();
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
    },
  };
}
