const packs = {
  en: {
    place: 'East Island',
    sub: 'Safehouse',
    onFoot: 'On foot',
    hintFollow: '{move} move · {run} run · Mouse look · {camera} camera · {interact} enter · Esc pause',
    hintFixed: '{move} move · {run} run · {camera} {view} · {interact} enter · Esc pause',
    hintDrive: '{move} drive · {brake} brake · {interact} exit · {camera} {view} · Esc pause',
    enterCar: '{interact}  Enter',
    viewFollow: 'Follow',
    viewTop: 'Top-down',
    viewIso: '2.5D',
    bootKicker: 'East Island',
    bootKeys: '{move} move · {run} run · Mouse look · {camera} top-down / 2.5D · {interact} enter or exit · {brake} brake · Esc pause',
    bindForward: 'Forward',
    bindBack: 'Back',
    bindLeft: 'Left',
    bindRight: 'Right',
    bindRun: 'Run',
    bindBrake: 'Brake',
    bindInteract: 'Enter / exit',
    bindCamera: 'Camera',
    controls: 'Controls',
    controlsReset: 'Reset keys',
    pressKey: 'Press a key',
    pauseControls: 'Controls',
    keySpace: 'Space',
    keyShift: 'Shift',
    keyShiftRight: 'RShift',
    keyCtrl: 'Ctrl',
    keyCtrlRight: 'RCtrl',
    keyAlt: 'Alt',
    keyAltRight: 'RAlt',
    keyEnter: 'Enter',
    keyBackspace: 'Bksp',
    keyTab: 'Tab',
    keyCaps: 'Caps',
    keyUp: '↑',
    keyDown: '↓',
    keyLeft: '←',
    keyRight: '→',
    menuStart: 'Start',
    menuSettings: 'Settings',
    menuAbout: 'About',
    menuBack: 'Back',
    language: 'Language',
    pauseTitle: 'Paused',
    pauseLang: 'Switch language',
    pauseRestart: 'Restart',
    pauseExit: 'Exit',
    aboutCopy: 'A GTA-like game on the east island. The coast, diagonal road, and bridge are in; buildings are still simple.',
  },
  zh: {
    place: '东岛',
    sub: '安全屋',
    onFoot: '徒步',
    hintFollow: '{move} 移动 · {run} 奔跑 · 鼠标 视角 · {camera} 切换 · {interact} 上车 · Esc 暂停',
    hintFixed: '{move} 移动 · {run} 奔跑 · {camera} {view} · {interact} 上车 · Esc 暂停',
    hintDrive: '{move} 驾驶 · {brake} 刹车 · {interact} 下车 · {camera} {view} · Esc 暂停',
    enterCar: '{interact}  上车',
    viewFollow: '跟随',
    viewTop: '俯视',
    viewIso: '2.5D',
    bootKicker: '东岛',
    bootKeys: '{move} 移动 · {run} 奔跑 · 鼠标 转视角 · {camera} 俯视 / 2.5D · {interact} 上下车 · {brake} 刹车 · Esc 暂停',
    bindForward: '前进',
    bindBack: '后退',
    bindLeft: '向左',
    bindRight: '向右',
    bindRun: '奔跑',
    bindBrake: '刹车',
    bindInteract: '上下车',
    bindCamera: '切换视角',
    controls: '按键',
    controlsReset: '恢复默认',
    pressKey: '请按键',
    pauseControls: '按键设置',
    keySpace: '空格',
    keyShift: 'Shift',
    keyShiftRight: '右 Shift',
    keyCtrl: 'Ctrl',
    keyCtrlRight: '右 Ctrl',
    keyAlt: 'Alt',
    keyAltRight: '右 Alt',
    keyEnter: 'Enter',
    keyBackspace: '退格',
    keyTab: 'Tab',
    keyCaps: 'Caps',
    keyUp: '↑',
    keyDown: '↓',
    keyLeft: '←',
    keyRight: '→',
    menuStart: '开始',
    menuSettings: '设置',
    menuAbout: '关于',
    menuBack: '返回',
    language: '语言',
    pauseTitle: '暂停',
    pauseLang: '切换语言',
    pauseRestart: '重新开始',
    pauseExit: '退出',
    aboutCopy: '类 GTA 游戏，场景在东岛。海岸、斜路和大桥已经铺上，房子仍是简模。',
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

export function toggleLang() {
  setLang(current === 'zh' ? 'en' : 'zh');
}

export function initI18n() {
  const saved = localStorage.getItem(storageKey);
  current = packs[saved] ? saved : 'en';
  applyStatic();

  document.querySelectorAll('[data-lang]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      setLang(el.dataset.lang);
    });
  });
}
