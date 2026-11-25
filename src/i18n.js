const packs = {
  en: {
    place: 'East Island',
    sub: 'Safehouse',
    onFoot: 'On foot',
    clickToStart: 'Click to start',
    hintFollow: 'WASD move · Shift run · Mouse look · V camera · E enter',
    hintFixed: 'WASD move · Shift run · V {view} · E enter',
    hintDrive: 'WASD drive · Space brake · E exit · V {view}',
    enterCar: 'E  Enter',
    viewFollow: 'Follow',
    viewTop: 'Top-down',
    viewIso: '2.5D',
    bootKicker: 'East Island',
    bootCopy: 'A GTA-like game. Click to enter the east island. The coast, diagonal road, and bridge are in; buildings are still simple.',
    bootKeys: 'WASD move · Shift run · Mouse look · V top-down / 2.5D · E enter or exit · Space brake',
    settings: 'Settings',
    language: 'Language',
  },
  zh: {
    place: '东岛',
    sub: '安全屋',
    onFoot: '徒步',
    clickToStart: '点击画面开始',
    hintFollow: 'WASD 移动 · Shift 奔跑 · 鼠标 视角 · V 切换 · E 上车',
    hintFixed: 'WASD 移动 · Shift 奔跑 · V {view} · E 上车',
    hintDrive: 'WASD 驾驶 · 空格 刹车 · E 下车 · V {view}',
    enterCar: 'E  上车',
    viewFollow: '跟随',
    viewTop: '俯视',
    viewIso: '2.5D',
    bootKicker: '东岛',
    bootCopy: '类 GTA 游戏。点击进入东岛，海岸、斜路和大桥已经铺上，房子仍是简模。',
    bootKeys: 'WASD 移动 · Shift 奔跑 · 鼠标 转视角 · V 俯视 / 2.5D · E 上下车 · 空格 刹车',
    settings: '设置',
    language: '语言',
  },
};

const htmlLang = { en: 'en', zh: 'zh-CN' };
const storageKey = 'retrogta.lang';
const listeners = new Set();

let current = 'en';

function fill(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? '');
}

export function t(key, vars) {
  const pack = packs[current] ?? packs.en;
  const value = pack[key] ?? packs.en[key] ?? key;
  return fill(value, vars);
}

export function getLang() {
  return current;
}

export function onLangChange(listener) {
  listeners.add(listener);
}

function applyStatic() {
  document.documentElement.lang = htmlLang[current] ?? 'en';
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });
  document.querySelectorAll('[data-lang]').forEach((el) => {
    const selected = el.dataset.lang === current;
    el.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
}

export function setLang(next) {
  if (!packs[next] || next === current) {
    applyStatic();
    return;
  }
  current = next;
  localStorage.setItem(storageKey, current);
  applyStatic();
  listeners.forEach((listener) => listener(current));
}

export function initI18n() {
  const saved = localStorage.getItem(storageKey);
  current = packs[saved] ? saved : 'en';
  applyStatic();

  const toggle = document.getElementById('settings-toggle');
  const panel = document.getElementById('settings-panel');
  const close = () => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  panel.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('click', close);

  document.querySelectorAll('[data-lang]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.stopPropagation();
      event.preventDefault();
      setLang(el.dataset.lang);
      close();
    });
  });
}
