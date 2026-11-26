import { cancelCapture } from './bindings.js';

let showMenu = () => {};

export function initMenu() {
  const home = document.getElementById('menu-home');
  const panels = {
    settings: document.getElementById('menu-settings'),
    about: document.getElementById('menu-about'),
  };

  showMenu = (name) => {
    cancelCapture();
    home.hidden = name !== 'home';
    for (const [key, panel] of Object.entries(panels)) panel.hidden = key !== name;
  };

  document.querySelectorAll('#menu [data-menu]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      showMenu(el.dataset.menu);
    });
  });
}

export function openMainMenu() {
  showMenu('home');
}
