import { cancelCapture } from './bindings.js';

const MENUS = ['menu', 'pause'];

// Panels that belong to one menu. The settings panel is shared by both and
// is moved into whichever menu opens it, so it is not listed here.
const PAGES = {
  menu: { about: 'menu-about' },
  pause: { cheats: 'pause-cheats-panel', map: 'pause-map-panel' },
};

// Pages inside the shared settings panel, drilled down in this order.
const SETTINGS_PAGES = {
  settings: 'settings-home',
  language: 'settings-language-page',
  controls: 'settings-controls-page',
};

const listeners = new Set();

let current = { menu: 'menu', page: 'home' };

function root(name) {
  return document.getElementById(name);
}

function homeEl(name) {
  return document.getElementById(`${name}-home`);
}

function card(name) {
  return root(name).querySelector('.menu-card');
}

export function showPage(menu, page) {
  cancelCapture();
  current = { menu, page };

  for (const name of MENUS) {
    homeEl(name).hidden = !(name === menu && page === 'home');
    for (const id of Object.values(PAGES[name])) {
      document.getElementById(id).hidden = true;
    }
  }

  const panel = document.getElementById('settings-panel');
  const inSettings = Object.hasOwn(SETTINGS_PAGES, page);
  panel.hidden = !inSettings;
  if (inSettings) {
    card(menu).append(panel);
    for (const [name, id] of Object.entries(SETTINGS_PAGES)) {
      document.getElementById(id).hidden = name !== page;
    }
    document.getElementById('settings-back').hidden = page !== 'settings';
  }
  document.body.classList.toggle('rebinding', page === 'controls');

  if (PAGES[menu][page]) {
    document.getElementById(PAGES[menu][page]).hidden = false;
  }

  for (const listener of listeners) listener(current);
}

export function onPageChange(listener) {
  listeners.add(listener);
}

export function currentPage() {
  return { ...current };
}

// Steps one level up inside the menus. Returns false when already at the
// menu home, so the caller can close the menu itself.
export function backPage() {
  if (current.page === 'language' || current.page === 'controls') {
    showPage(current.menu, 'settings');
    return true;
  }
  if (current.page !== 'home') {
    showPage(current.menu, 'home');
    return true;
  }
  return false;
}

export function showPauseHome() {
  showPage('pause', 'home');
}

export function openMainMenu() {
  showPage('menu', 'home');
}

export function initMenu() {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-page]');
    if (!trigger) return;
    const menu = trigger.closest('#menu, #pause');
    if (!menu) return;
    event.preventDefault();
    showPage(menu.id, trigger.dataset.page);
  });

  // The pause menu's Escape handling lives in game.js; this only backs out of
  // the main menu's sub-pages.
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape' || event.repeat) return;
    if (root('menu').classList.contains('hidden')) return;
    event.preventDefault();
    backPage();
  });
}
