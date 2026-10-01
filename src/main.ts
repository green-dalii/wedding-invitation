/** 启动编排（SPEC §4）：DOM 渲染 → 滚动锁 → Hero → loader 收尾 → 信息区 */
import './style.css';
import { site, copy as text } from './config';
import { initHero } from './hero/hero';
import { initScrollLock } from './scrollLock';
import { renderDetails } from './details';

const params = new URLSearchParams(location.search);

// ---- Hero 文案（§5.1） ----
const copy = document.querySelector<HTMLElement>('.hero-copy');
if (copy) {
  copy.innerHTML = `
    <p class="kicker" data-jit="0.5">${text.kicker}</p>
    <h1 class="names" data-jit="1">${site.couple.groom}<span class="amp">&amp;</span>${site.couple.bride}</h1>
    <p class="date" data-jit="0.75">${site.dateText}<span class="sep"></span><span class="wd">${site.weekday} · ${site.timeText}</span></p>
    <button class="go" type="button" aria-label="查看详情，滚动到婚礼信息">${text.goButton} <span class="arrow">↓</span></button>`;
}

initScrollLock();

// ---- Loader（§4）：进度 = max(真实, 假进度)，只增不减 ----
function createLoader() {
  const el = document.getElementById('loader');
  const bar = el?.querySelector<HTMLElement>('.l-bar i');
  const pct = el?.querySelector<HTMLElement>('.l-pct');
  const t0 = performance.now();
  let real = 0;
  let shown = 0;
  let finished = false;
  let raf = 0;

  const tick = () => {
    const fake = 0.9 * (1 - Math.exp(-(performance.now() - t0) / 1200));
    const target = Math.min(finished ? 1 : Math.max(real, fake), 1);
    shown += (target - shown) * 0.16;
    if (target === 1 && shown > 0.995) shown = 1;
    if (bar) bar.style.width = `${(shown * 100).toFixed(1)}%`;
    if (pct) pct.textContent = `${Math.round(shown * 100)}%`;
    if (shown >= 1) {
      el?.classList.add('done');
      raf = 0;
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    onProgress(loaded: number, total: number) {
      if (total > 0) real = Math.max(real, loaded / total);
      else real = Math.max(real, 0.5); // 无 Content-Length：给一个可信的中间值
    },
    finish() {
      finished = true;
      if (!raf) raf = requestAnimationFrame(tick);
    },
  };
}

const loader = createLoader();

initHero({ onProgress: loader.onProgress })
  .then(() => {
    loader.finish();
    // Hero 就绪后才开调参面板：openTunePanel 依赖 field/renderer，
    // 过早调用会因 Hero 未就绪而直接 return（竞态）。
    if (wantsTune) void import('./hero/tune').then((m) => m.openTunePanel());
  })
  .catch((err) => {
    console.error('[hero] init failed', err);
    loader.finish();
  });

// ---- 信息区：空闲时渲染，不阻塞首屏（§4） ----
const details = document.getElementById('details');
function initDetails() {
  if (details) renderDetails(details);
}
if ('requestIdleCallback' in window) {
  (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(initDetails);
} else {
  setTimeout(initDetails, 300);
}
document.querySelector('.go')?.addEventListener('click', initDetails, { once: true });

// ---- Tuning 面板（业主调参用）：默认完全隐藏，仅由 /tune 或 ?tune 唤醒 ----
// 注意：绝不放浮动按钮（面板含内部参数，公开页面不应暴露入口）
const wantsTune =
  import.meta.env.DEV || params.has('tune') || /(^|\/)tune\/?$/.test(location.pathname);
