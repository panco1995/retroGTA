import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  headless: true,
  args: ['--use-angle=metal', '--window-size=1440,900', '--hide-scrollbars'],
  defaultViewport: { width: 1440, height: 900 },
});

const page = await browser.newPage();
page.on('console', (msg) => console.log('CONSOLE', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('PAGEERROR', err.message));
page.on('requestfailed', (req) => console.log('FAILED', req.url()));
page.on('response', (res) => {
  if (res.status() >= 400) console.log('HTTP', res.status(), res.url());
});
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle0', timeout: 20000 });
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: 'shot-boot.png' });
const state = await page.evaluate(() => ({
  started: window.__game?.started ?? null,
  mode: window.__game?.mode ?? null,
  player: window.__game ? { x: window.__game.player.x, z: window.__game.player.z } : null,
  safe: window.__game?.world?.safehouse ?? null,
  buildings: window.__game?.world?.buildings?.length ?? null,
  gl: !!document.querySelector('canvas').getContext('webgl2'),
}));
console.log('STATE', JSON.stringify(state));
await page.click('#boot');
await new Promise((r) => setTimeout(r, 300));
await page.keyboard.down('KeyS');
await new Promise((r) => setTimeout(r, 700));
await page.keyboard.up('KeyS');
await page.keyboard.down('KeyD');
await new Promise((r) => setTimeout(r, 900));
await page.keyboard.up('KeyD');
await page.screenshot({ path: 'shot-walk.png' });
const walked = await page.evaluate(() => {
  const p = window.__game.player;
  const h = window.__game.hero;
  return {
    x: p.x,
    z: p.z,
    dist: Math.hypot(p.x - h.x, p.z - h.z),
    mode: window.__game.mode,
  };
});
console.log('WALKED', JSON.stringify(walked));
await page.keyboard.press('KeyE');
await new Promise((r) => setTimeout(r, 250));
await page.keyboard.down('KeyW');
await new Promise((r) => setTimeout(r, 1500));
await page.keyboard.up('KeyW');
await page.screenshot({ path: 'shot-drive.png' });
const drove = await page.evaluate(() => ({
  mode: window.__game.mode,
  x: window.__game.hero.x,
  z: window.__game.hero.z,
  speed: window.__game.hero.speed,
  px: window.__game.player.group.parent?.type ?? null,
}));
console.log('DROVE', JSON.stringify(drove));
await page.evaluate(() => {
  const g = window.__game;
  if (g.mode === 'drive') {
    g.hero.x = -8;
    g.hero.z = -3.2;
    g.hero.speed = 0;
    g.hero.heading = Math.PI;
  } else {
    g.player.x = -2;
    g.player.z = 2;
    g.player.group.position.set(-2, 0.11, 2);
  }
  g.yaw = Math.PI;
});
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: 'shot-street.png' });
await browser.close();
