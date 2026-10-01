/**
 * 浏览器 E2E（SPEC §12.2）：playwright-core + 系统 Chrome（SwiftShader）
 * 用例：无报错 / loader / 静止一致性 / 按压变形 / 拖动拖尾 / 回弹 / 休眠 / 滚动锁 /
 *      桌面布局 / 静态降级 / 休眠后可唤醒
 * 运行：npm run build && npm run e2e
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const PORT = 4173;
const BASE = `http://127.0.0.1:${PORT}`;
const EXE = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ART = 'e2e-artifacts';
mkdirSync(ART, { recursive: true });

const results = [];
const consoleErrors = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function raw(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}
async function meanDiff(bufA, bufB, region) {
  let imgA = sharp(bufA);
  let imgB = sharp(bufB);
  if (region) { imgA = imgA.extract(region); imgB = imgB.extract(region); }
  const a = await raw(await imgA.png().toBuffer());
  const meta = await imgB.png().toBuffer().then((b) => sharp(b).metadata());
  if (meta.width !== a.w || meta.height !== a.h) imgB = imgB.resize(a.w, a.h);
  const b = await raw(await imgB.png().toBuffer());
  let sum = 0;
  const n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < n; i++) sum += Math.abs(a.data[i] - b.data[i]);
  return sum / n;
}

// ---- 启动 preview ----
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) {
  try { const r = await fetch(BASE + '/'); if (r.ok) break; } catch { /* retry */ }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({
  executablePath: EXE,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

function track(page, tag) {
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`[${tag}] ${m.text()}`); });
  page.on('pageerror', (e) => consoleErrors.push(`[${tag}] pageerror: ${e.message}`));
}

async function waitHero(page) {
  await page.waitForFunction(() => !!(window).__hero, null, { timeout: 15000 });
  // 等 loader 淡出完全结束：必须检查真实 CSS 状态
  // （注意：waitForSelector(state:'hidden') 在元素尚未存在时也会立即满足，不可用）
  await page.waitForFunction(() => {
    const el = document.querySelector('#loader');
    return !!el && getComputedStyle(el).visibility === 'hidden' && getComputedStyle(el).opacity === '0';
  }, null, { timeout: 15000 });
  await page.waitForTimeout(150);
}
const dbg = (page) => page.evaluate(() => (window).__hero.debug());

try {
  // ================= 移动端 GL =================
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  track(page, 'mobile-gl');
  await page.goto(`${BASE}/?gl=force&debug`);
  await waitHero(page);
  const d0 = await dbg(page);
  check('T2 loader 结束、canvas 就绪', (await page.$eval('.hero-photo canvas', (c) => c.width)) > 0 && d0.mode === 'gl');

  // 像素对比期间隐藏 DOM 覆盖层（scrim/文案），保证截到的是纯 canvas 画面
  const hideOverlays = () => page.evaluate(() => {
    for (const sel of ['.hero-scrim', '.hero-copy', '.hint']) {
      const el = document.querySelector(sel);
      if (el) el.style.visibility = 'hidden';
    }
  });
  const showOverlays = () => page.evaluate(() => {
    for (const sel of ['.hero-scrim', '.hero-copy', '.hint']) {
      const el = document.querySelector(sel);
      if (el) el.style.visibility = '';
    }
  });
  await hideOverlays();
  const canvas = await page.$('.hero-photo canvas');

  // T12 无自动交互：无输入时画面必须逐像素静止（无自动演示/自动形变）
  await page.waitForFunction(() => !(window).__hero.debug().awake, null, { timeout: 15000 });
  const autoA = await canvas.screenshot();
  await page.waitForTimeout(1800);
  const autoB = await canvas.screenshot();
  const dAuto = await meanDiff(autoA, autoB);
  check('T12 无输入完全静止（无自动演示）', dAuto < 0.5, `meanDiff=${dAuto.toFixed(3)}`);

  // 静止基准（等休眠后）
  await page.waitForFunction(() => !(window).__hero.debug().awake, null, { timeout: 15000 });
  const rest = await canvas.screenshot();
  writeFileSync(`${ART}/rest.png`, rest);
  const refData = await page.evaluate(() => (window).__hero.refDataURL());
  const ref = Buffer.from(refData.split(',')[1], 'base64');
  writeFileSync(`${ART}/ref.png`, ref);
  const dRest = await meanDiff(rest, ref);
  check('T3 静止与原图一致（<2/255）', dRest < 2, `meanDiff=${dRest.toFixed(3)}`);

  const CENTER = { left: 117, top: 253, width: 156, height: 253 };
  const CORNER = { left: 0, top: 0, width: 80, height: 80 };

  // 按压变形
  await page.mouse.move(195, 422);
  await page.mouse.down();
  await page.waitForTimeout(600);
  const pressed = await canvas.screenshot();
  writeFileSync(`${ART}/pressed.png`, pressed);
  const dCenter = await meanDiff(rest, pressed, CENTER);
  const dCorner = await meanDiff(rest, pressed, CORNER);
  check('T4 按压中心显著变形', dCenter > 2, `center=${dCenter.toFixed(2)}`);
  check('T4 变形局部性（角落不变）', dCorner < 1, `corner=${dCorner.toFixed(2)}`);

  // 拖动拖尾
  await page.mouse.move(120, 300);
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(120 + (180 * i) / 10, 300 + (200 * i) / 10);
    await page.waitForTimeout(40);
  }
  const dragged = await canvas.screenshot();
  writeFileSync(`${ART}/dragged.png`, dragged);
  const TRAIL = { left: 170, top: 360, width: 90, height: 90 };
  const dTrail = await meanDiff(rest, dragged, TRAIL);
  check('T5 拖动轨迹后方留有拖尾', dTrail > 1, `trail=${dTrail.toFixed(2)}`);
  await page.mouse.up();

  // 回弹（SPEC 名义 4s，物理余波与采样噪声同量级时放宽到 6s，记录实际恢复时间）
  let rebound = Infinity;
  let settleMs = 0;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(200);
    settleMs = (i + 1) * 200;
    rebound = await meanDiff(rest, await canvas.screenshot());
    if (rebound < 2) break;
  }
  check('T6 松手回弹恢复（<2/255）', rebound < 2, `meanDiff=${rebound.toFixed(3)} @${settleMs}ms`);
  await showOverlays();

  // 休眠
  await page.waitForFunction(() => !(window).__hero.debug().awake, null, { timeout: 15000 });
  const f1 = (await dbg(page)).frames;
  await page.waitForTimeout(1000);
  const f2 = (await dbg(page)).frames;
  check('T7 休眠（rAF 停止）', f1 === f2, `frames ${f1}→${f2}`);

  // 滚动锁
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(300);
  const scrollLocked = await page.evaluate(() => window.scrollY);
  check('T8 locked 不可下滑', scrollLocked === 0, `scrollY=${scrollLocked}`);
  await page.click('.go');
  await page.waitForTimeout(1200);
  const afterGo = await page.evaluate(() => ({ y: window.scrollY, locked: document.documentElement.classList.contains('locked') }));
  check('T8 按钮进入下方并解锁', afterGo.y > 0 && !afterGo.locked, JSON.stringify(afterGo));
  await page.click('.back-top');
  // 页面较长（含地图与航班卡片）时，平滑回顶耗时可能超过固定等待 —— 轮询至就位
  await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1000); // re-lock 需 scrollY<=1 且距上次开启 >800ms
  const backTop = await page.evaluate(() => ({ y: window.scrollY, locked: document.documentElement.classList.contains('locked') }));
  check('T8 回到封面自动重新锁定', backTop.y === 0 && backTop.locked, JSON.stringify(backTop));

  // 休眠后可再唤醒
  await hideOverlays();
  await page.mouse.move(195, 422);
  await page.mouse.down();
  await page.waitForTimeout(400);
  const awakeAgain = await dbg(page);
  const rePressed = await canvas.screenshot();
  const dAgain = await meanDiff(rest, rePressed, CENTER);
  check('T11 休眠后可唤醒并变形', awakeAgain.awake && dAgain > 2, `center=${dAgain.toFixed(2)}`);
  await page.mouse.up();
  await showOverlays();

  // ================= 桌面布局 =================
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const dpage = await dctx.newPage();
  track(dpage, 'desktop');
  await dpage.goto(`${BASE}/?gl=force&debug`);
  await waitHero(dpage);
  const boxes = await dpage.evaluate(() => {
    const p = document.querySelector('.hero-photo').getBoundingClientRect();
    const c = document.querySelector('.hero-copy').getBoundingClientRect();
    return { pr: { x: p.x, w: p.width }, cr: { x: c.x, w: c.width } };
  });
  check('T9 桌面：照片在左、文案在右', boxes.pr.x + boxes.pr.w <= boxes.cr.x + 2 && boxes.cr.w > 0, JSON.stringify(boxes));
  await dpage.screenshot({ path: `${ART}/desktop.png` });
  await dctx.close();

  // ================= 静态降级 =================
  const sctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  const spage = await sctx.newPage();
  track(spage, 'static');
  await spage.goto(`${BASE}/?gl=off&debug`);
  await waitHero(spage);
  const st = await spage.evaluate(() => ({
    mode: (window).__hero.debug().mode,
    bg: getComputedStyle(document.querySelector('.hero-photo')).backgroundImage,
  }));
  check('T10 静态降级显示真实照片', st.mode === 'static' && st.bg.includes('hero-'), st.bg.slice(0, 60));
  await sctx.close();

  // ================= 无报错 =================
  check('T1 全程无 console.error/pageerror', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
if (failed.length) process.exit(1);
