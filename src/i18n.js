const packs = {
  en: {
    place: 'East Island',
    sub: 'Safehouse',
    onFoot: 'On foot',
    hintFollow: '{move} move · {run} run · {jump} jump · {attack} attack · Mouse look · {camera} camera · {interact} enter · {map} map · Esc pause',
    hintFixed: '{move} move · {run} run · {jump} jump · {attack} attack · {camera} {view} · {interact} enter · {map} map · Esc pause',
    hintDrive: '{move} drive · {brake} brake · {interact} exit · {camera} {view} · {map} map · Esc pause',
    enterCar: 'Get in',
    stealCar: 'Steal car',
    exitCar: 'Exit',
    approachCar: 'Heading to the vehicle',
    noVehicle: 'No vehicle nearby',
    wasted: 'Wasted',
    approachFail: 'Cannot reach the vehicle',
    viewFollow: 'Follow',
    viewFirst: 'First person',
    viewTop: 'Top-down',
    viewIso: '2.5D',
    bindForward: 'Forward',
    bindBack: 'Back',
    bindLeft: 'Left',
    bindRight: 'Right',
    bindRun: 'Run',
    bindAttack: 'Attack',
    bindBrake: 'Jump / brake',
    bindInteract: 'Enter / exit',
    bindCamera: 'Camera',
    bindMap: 'Map',
    controls: 'Controls',
    controlsKeyboard: 'Keyboard',
    view: 'View',
    controlsReset: 'Reset keys',
    pressKey: 'Press a key or mouse button',
    mouseLeft: 'LMB',
    mouseMiddle: 'MMB',
    mouseRight: 'RMB',
    pauseMap: 'Map',
    pauseCheats: 'Cheats',
    cheatSpawn: 'Spawn vehicle',
    cheatVehicle: 'Vehicle',
    cheatSpawnButton: 'Spawn near player',
    cheatSpawned: 'Spawned: {vehicle}',
    cheatNoRoom: 'No room nearby',
    vehicle_sedan: 'Sedan',
    vehicle_taxi: 'Taxi',
    vehicle_hatchback: 'Hatchback',
    vehicle_suv: 'SUV',
    vehicle_pickup: 'Pickup',
    vehicle_sports: 'Sports car',
    vehicle_van: 'Van',
    vehicle_bus: 'City bus',
    vehicle_truck: 'Box truck',
    vehicle_excavator: 'Excavator',
    vehicle_tractor: 'Tractor',
    vehicle_ambulance: 'Ambulance',
    vehicle_firetruck: 'Fire truck',
    vehicle_police: 'Police car',
    vehicle_mixer: 'Cement mixer',
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
    menuAuthor: 'By Panco',
    menuStart: 'Start',
    menuSettings: 'Settings',
    menuAbout: 'About',
    menuCollection: 'Collection',
    menuBack: 'Back',
    collectionVehicles: 'Vehicles',
    collectionPeople: 'People',
    collectionProps: 'Street props',
    collectionBuildings: 'Buildings',
    building_rowhouse: 'Row house',
    building_shopfront: 'Shopfront',
    building_store: 'Convenience store',
    building_watertower: 'Water tower house',
    building_warehouse: 'Warehouse',
    building_safehouse: 'Safehouse',
    collectionHint: 'Drag to rotate · Scroll to zoom · ← → browse',
    collectionHintInterior: 'Drag to rotate · Scroll to zoom · ← → browse · {key} interior',
    collectionPrev: 'Previous item',
    collectionNext: 'Next item',
    collectionInterior: 'Interior view',
    collectionDriver: 'Driver NPC',
    ped_businessman: 'Businessman',
    ped_businesswoman: 'Businesswoman',
    ped_student: 'Student',
    ped_schoolkid: 'Schoolkid',
    ped_tourist: 'Tourist',
    ped_jogger: 'Jogger',
    ped_constructionWorker: 'Construction worker',
    ped_elderly: 'Elderly',
    ped_courier: 'Courier',
    ped_shopper: 'Shopper',
    ped_policeOfficer: 'Police officer',
    ped_punk: 'Punk',
    prop_lamp: 'Street lamp',
    prop_hydrant: 'Fire hydrant',
    prop_trash: 'Trash bags',
    prop_tree: 'Street tree',
    prop_dumpster: 'Dumpster',
    language: 'Language',
    pauseTitle: 'Paused',
    pauseResume: 'Resume',
    pauseRestart: 'Restart',
    pauseExit: 'Exit',
    aboutCopy: 'The east island is yours to roam, on foot or behind the wheel. Walk the blocks, dodge the traffic, throw a punch, or jack a car and follow the ring roads past the crowd. The radar shows what is close; the full map shows the whole island. No timer, no score — just the city and whatever trouble you find.',
    aboutAuthor: 'Author',
    aboutEmail: 'Email',
    aboutHomepage: 'Homepage',
    aboutProgress: 'Progress',
    aboutProgressText: 'Playable free-roam prototype (v0.1): walking, driving, vehicle variety, pedestrians, traffic, the map, and cheats are in. Missions, saving, and sound are still to come.',
  },
  zh: {
    place: '东岛',
    sub: '安全屋',
    onFoot: '徒步',
    hintFollow: '{move} 移动 · {run} 奔跑 · {jump} 跳跃 · {attack} 攻击 · 鼠标 视角 · {camera} 切换 · {interact} 上车 · {map} 地图 · Esc 暂停',
    hintFixed: '{move} 移动 · {run} 奔跑 · {jump} 跳跃 · {attack} 攻击 · {camera} {view} · {interact} 上车 · {map} 地图 · Esc 暂停',
    hintDrive: '{move} 驾驶 · {brake} 刹车 · {interact} 下车 · {camera} {view} · {map} 地图 · Esc 暂停',
    enterCar: '上车',
    stealCar: '抢车',
    exitCar: '下车',
    approachCar: '正在前往载具',
    noVehicle: '附近没有载具',
    wasted: '被车压了',
    approachFail: '无法到达载具',
    viewFollow: '跟随',
    viewFirst: '第一人称',
    viewTop: '俯视',
    viewIso: '2.5D',
    bindForward: '前进',
    bindBack: '后退',
    bindLeft: '向左',
    bindRight: '向右',
    bindRun: '奔跑',
    bindAttack: '攻击',
    bindBrake: '跳跃 / 刹车',
    bindInteract: '上下车',
    bindCamera: '切换视角',
    bindMap: '地图',
    controls: '控制',
    controlsKeyboard: '键盘',
    view: '视角',
    controlsReset: '恢复默认',
    pressKey: '请按键或鼠标',
    mouseLeft: '左键',
    mouseMiddle: '中键',
    mouseRight: '右键',
    pauseMap: '地图',
    pauseCheats: '作弊',
    cheatSpawn: '呼出载具',
    cheatVehicle: '载具',
    cheatSpawnButton: '刷到主角附近',
    cheatSpawned: '已刷出：{vehicle}',
    cheatNoRoom: '附近没有空位',
    vehicle_sedan: '轿车',
    vehicle_taxi: '出租车',
    vehicle_hatchback: '两厢车',
    vehicle_suv: 'SUV',
    vehicle_pickup: '皮卡',
    vehicle_sports: '跑车',
    vehicle_van: '厢式车',
    vehicle_bus: '公交',
    vehicle_truck: '厢式货车',
    vehicle_excavator: '挖掘机',
    vehicle_tractor: '拖拉机',
    vehicle_ambulance: '救护车',
    vehicle_firetruck: '消防车',
    vehicle_police: '警车',
    vehicle_mixer: '水泥搅拌车',
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
    menuAuthor: '作者 Panco',
    menuStart: '开始',
    menuSettings: '设置',
    menuAbout: '关于',
    menuCollection: '收藏',
    menuBack: '返回',
    collectionVehicles: '车辆模型',
    collectionPeople: '人物',
    collectionProps: '街道道具',
    collectionBuildings: '建筑',
    building_rowhouse: '联排住宅',
    building_shopfront: '底商住宅',
    building_store: '便利店',
    building_watertower: '带水箱的住宅',
    building_warehouse: '工业仓库',
    building_safehouse: '安全屋',
    collectionHint: '拖动旋转 · 滚轮缩放 · ← → 切换',
    collectionHintInterior: '拖动旋转 · 滚轮缩放 · ← → 切换 · {key} 车内视角',
    collectionPrev: '上一项',
    collectionNext: '下一项',
    collectionInterior: '车内视角',
    collectionDriver: '司机 NPC',
    ped_businessman: '商务人士',
    ped_businesswoman: '职业女性',
    ped_student: '学生',
    ped_schoolkid: '小学生',
    ped_tourist: '游客',
    ped_jogger: '慢跑者',
    ped_constructionWorker: '建筑工人',
    ped_elderly: '老人',
    ped_courier: '快递员',
    ped_shopper: '购物者',
    ped_policeOfficer: '警察',
    ped_punk: '朋克青年',
    prop_lamp: '路灯',
    prop_hydrant: '消防栓',
    prop_trash: '垃圾袋',
    prop_tree: '行道树',
    prop_dumpster: '垃圾箱',
    language: '语言',
    pauseTitle: '暂停',
    pauseResume: '继续游戏',
    pauseRestart: '重新开始',
    pauseExit: '退出',
    aboutCopy: '东岛随你逛：徒步走街串巷，或者抢辆车沿环路兜风。可以躲车流、跟路人动手，也能只是看看街景；雷达显示附近的情况，全岛地图随时打开。没有倒计时，也没有分数。',
    aboutAuthor: '作者',
    aboutEmail: '邮箱',
    aboutHomepage: '项目主页',
    aboutProgress: '目前进度',
    aboutProgressText: '可玩的自由漫游原型（v0.1）：徒步、驾驶、多种载具、路人群、车流、地图和作弊已经可用；任务、存档和音效还在做。',
  },
};

const htmlLang = { en: 'en', zh: 'zh-CN' };
// Language names are always shown in their own language, so they do not come
// from a pack and each new pack only needs an entry here.
const languageNames = { en: 'English', zh: '中文' };
const storageKey = 'retrogta.lang';
const listeners = new Set();

let current = 'en';

export function languageName(code) {
  return languageNames[code] ?? code;
}

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

function mountLanguages() {
  const root = document.getElementById('lang-options');
  if (!root) return;
  root.replaceChildren();
  for (const code of Object.keys(packs)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.lang = code;
    button.textContent = languageName(code);
    root.append(button);
  }
}

export function initI18n() {
  const saved = localStorage.getItem(storageKey);
  current = packs[saved] ? saved : 'en';
  mountLanguages();
  applyStatic();

  document.querySelectorAll('[data-lang]').forEach((el) => {
    el.addEventListener('click', (event) => {
      event.preventDefault();
      setLang(el.dataset.lang);
    });
  });
}
