/**
 * Hero 调度器（SPEC §5）：输入 → 物理子步 → 纹理上传 → 绘制；
 * 休眠 / 质量自适应 / 引导动画 / 文字微抖 / 静态降级。
 */
import { SoftField, DEFAULT_PARAMS } from './softbody';
import { Renderer } from './renderer';
import { loadImage, supportsWebp } from './loader';
import heroMWebp from '../assets/hero-m.webp';
import heroLWebp from '../assets/hero-l.webp';
import heroMJpg from '../assets/hero-m.jpg';
import { HERO_CONST as C } from './hero.config';

const SUB_DT = 1 / 60;
const MAX_STEPS = 3;
const SLEEP_EPS = 0.008;
const IDLE_FRAMES_TO_SLEEP = 30;
const COLS = C.COLS;
const MAX_CELLS = C.MAX_CELLS;
/** 文字抖动：力增益（px/s² 每 px/s 指针速度），稳态偏移 ≈ 3px */
const JF = C.JF;
const JIMPULSE_DOWN = 40;
const JIMPULSE_UP = 25;
const JIT_LIMIT = C.JIT_LIMIT;

export interface HeroDebug {
  mode: 'gl' | 'static';
  awake: boolean;
  frames: number;
  fps: number;
  renderScale: number;
  level: number;
  cols: number;
  rows: number;
}

/** 供 ?tune 调参面板使用 */
export const runtime: {
  field: SoftField | null;
  renderer: Renderer | null;
  wake: () => void;
} = { field: null, renderer: null, wake: () => {} };

interface Ptr {
  id: number | string;
  /** 原始目标（网格坐标） */
  px: number;
  py: number;
  /** 平滑坐标 = 已按压位置 */
  sx: number;
  sy: number;
  pressure: number;
  target: number;
}

export async function initHero(opts: { onProgress?: (loaded: number, total: number) => void } = {}): Promise<void> {
  const photo = document.querySelector<HTMLElement>('.hero-photo');
  const canvas = photo?.querySelector('canvas');
  const copy = document.querySelector<HTMLElement>('.hero-copy');
  const hintEl = document.querySelector<HTMLElement>('.hint');
  if (!photo || !canvas) return;

  const params = new URLSearchParams(location.search);
  const glFlag = params.get('gl');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const debugOn = import.meta.env.DEV || params.has('debug');

  // ---- 尺寸与网格 ----
  let cssW = 1, cssH = 1, cell = 1, cols = COLS, rows = 1;
  let renderScale = Math.min(window.devicePixelRatio || 1, 2);
  let drawDirty = true;
  // 循环状态（提前声明：静态降级提前 return，但 debug() 闭包仍会访问）
  let rafId = 0;
  let last = 0;
  let acc = 0;
  let idleFrames = 0;
  let frames = 0;
  let emaDt = 1 / 60;
  let slowFrames = 0;
  let level = 0;
  let visible = true;
  let field = new SoftField(COLS, 8, DEFAULT_PARAMS);
  let buf = new Uint8Array(0);
  let texCanvas: HTMLCanvasElement | null = null;
  let texAspect = 0;

  function measure(): void {
    const r = photo!.getBoundingClientRect();
    cssW = Math.max(1, r.width);
    cssH = Math.max(1, r.height);
    cell = cssW / cols;
    rows = Math.max(2, Math.ceil(cssH / cell));
    while (cols * rows > MAX_CELLS && cols > 24) {
      cols = Math.floor(cols * 0.9);
      cell = cssW / cols;
      rows = Math.max(2, Math.ceil(cssH / cell));
    }
  }

  // ---- 图片选择与加载（§5.3） ----
  measure();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const needed = cssW * dpr;
  let url = needed > 900 ? heroLWebp : heroMWebp;
  if (!(await supportsWebp())) url = heroMJpg;

  const img = await loadImage(url, (loaded, total) => opts.onProgress?.(loaded, total));
  opts.onProgress?.(1, 1);

  // ---- 静态降级（§5.12） ----
  if (glFlag === 'off') {
    enterStatic();
    return;
  }

  const renderer = Renderer.create(canvas, { allowSoftware: glFlag === 'force' });
  if (!renderer) {
    enterStatic();
    return;
  }
  runtime.renderer = renderer;

  function enterStatic(): void {
    photo!.style.backgroundImage = `url(${url})`;
    photo!.classList.add('static-mode');
    canvas!.style.display = 'none';
    const on = () => photo!.classList.add('pressing');
    const off = () => photo!.classList.remove('pressing');
    photo!.addEventListener('pointerdown', on, { passive: true });
    photo!.addEventListener('pointerup', off, { passive: true });
    photo!.addEventListener('pointercancel', off, { passive: true });
    photo!.addEventListener('pointerleave', off, { passive: true });
    exposeDebug('static');
    finishCopy();
    opts.onProgress?.(1, 1);
  }

  function finishCopy(): void {
    requestAnimationFrame(() => copy?.classList.add('in'));
  }

  // ---- GL 模式 ----
  function buildTexture(): void {
    const maxTex = renderer!.maxTextureSize;
    let tw = Math.min(Math.max(Math.round(cssW * dpr), 256), Math.min(1600, maxTex));
    let th = Math.round((tw * cssH) / cssW);
    if (th > maxTex) {
      th = maxTex;
      tw = Math.round((th * cssW) / cssH);
    }
    const c = texCanvas ?? document.createElement('canvas');
    c.width = tw;
    c.height = th;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const scale = Math.max(tw / img.width, th / img.height);
    const sw = tw / scale;
    const sh = th / scale;
    const fx = 0.5;
    const fy = 0.4;
    g.drawImage(img, (img.width - sw) * fx, (img.height - sh) * fy, sw, sh, 0, 0, tw, th);
    texCanvas = c;
    texAspect = cssW / cssH;
    renderer!.setImage(c);
    drawDirty = true;
  }

  function rebuildGrid(): void {
    measure();
    if (field.cols !== cols || field.rows !== rows) {
      field = new SoftField(cols, rows, field.params);
      runtime.field = field;
      buf = new Uint8Array(cols * rows * 4);
      renderer!.setFieldSize(cols, rows);
    }
    renderer!.resize(Math.round(cssW * renderScale), Math.round(cssH * renderScale));
  }

  rebuildGrid();
  buildTexture();
  runtime.field = field;

  // ---- 指针模型（§5.5） ----
  const pointers = new Map<number | string, Ptr>();
  let moveAccX = 0, moveAccY = 0, movePressSum = 0, moveCount = 0;

  function toGrid(cx: number, cy: number): [number, number] {
    const r = photo!.getBoundingClientRect();
    return [(cx - r.left) / cell, (cy - r.top) / cell];
  }

  function beginPointer(id: number | string, cx: number, cy: number, type: string, buttons: number): void {
    onFirstTouch();
    const target = buttons > 0 || type !== 'mouse' ? 1 : C.HOVER_PRESSURE;
    const [gx, gy] = toGrid(cx, cy);
    pointers.set(id, { id, px: gx, py: gy, sx: gx, sy: gy, pressure: 0, target });
    jitterImpulse(cx, cy, JIMPULSE_DOWN * target, 1);
    wake();
  }

  function movePointer(id: number | string, cx: number, cy: number, type: string, buttons: number, dx: number, dy: number): void {
    let p = pointers.get(id);
    if (!p) {
      if (buttons > 0) beginPointer(id, cx, cy, type, buttons);
      else if (type === 'mouse') beginPointer(id, cx, cy, type, 0);
      else return;
      p = pointers.get(id)!;
    }
    const [gx, gy] = toGrid(cx, cy);
    p.px = gx;
    p.py = gy;
    if (type === 'mouse') p.target = buttons > 0 ? 1 : C.HOVER_PRESSURE;
    moveAccX += dx;
    moveAccY += dy;
    movePressSum += p.target;
    moveCount++;
    wake();
  }

  function endPointer(id: number | string): void {
    const p = pointers.get(id);
    if (!p) return;
    const r = photo!.getBoundingClientRect();
    jitterImpulse(r.left + p.sx * cell, r.top + p.sy * cell, JIMPULSE_UP, -1);
    pointers.delete(id);
  }

  // 事件绑定（PointerEvent 或 touch/mouse 降级）
  const lastTouchX = new Map<number, number>();
  const lastTouchY = new Map<number, number>();
  if ('PointerEvent' in window) {
    photo.addEventListener('pointerdown', (e) => {
      beginPointer(e.pointerId, e.clientX, e.clientY, e.pointerType, e.buttons || 1);
      if (e.pointerType !== 'touch') photo!.setPointerCapture?.(e.pointerId);
    }, { passive: true });
    photo.addEventListener('pointermove', (e) => {
      // 快速滑动：浏览器会把帧内多个 move 合并为一个事件（终态）。
      // 用 getCoalescedEvents() 取回帧内所有原始采样点，逐段胶囊成形
      // → 任意速度都连续，消除快滑横纹/断裂。
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
      if (evs && evs.length > 1) {
        for (const ev of evs) {
          movePointer(e.pointerId, ev.clientX, ev.clientY, e.pointerType, e.buttons, ev.movementX ?? 0, ev.movementY ?? 0);
        }
        // 用最后一个合并事件的终态收尾
        const last = evs[evs.length - 1];
        movePointer(e.pointerId, last.clientX, last.clientY, e.pointerType, e.buttons, 0, 0);
      } else {
        movePointer(e.pointerId, e.clientX, e.clientY, e.pointerType, e.buttons, e.movementX ?? 0, e.movementY ?? 0);
      }
    }, { passive: true });
    photo.addEventListener('pointerup', (e) => endPointer(e.pointerId), { passive: true });
    photo.addEventListener('pointercancel', (e) => endPointer(e.pointerId), { passive: true });
    photo.addEventListener('pointerleave', (e) => endPointer(e.pointerId), { passive: true });
  } else {
    photo.addEventListener('touchstart', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        lastTouchX.set(t.identifier, t.clientX);
        lastTouchY.set(t.identifier, t.clientY);
        beginPointer(t.identifier, t.clientX, t.clientY, 'touch', 1);
      }
    }, { passive: true });
    photo.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) movePointer(t.identifier, t.clientX, t.clientY, 'touch', 1, t.clientX - (lastTouchX.get(t.identifier) ?? t.clientX), t.clientY - (lastTouchY.get(t.identifier) ?? t.clientY));
      for (const t of Array.from(e.changedTouches)) { lastTouchX.set(t.identifier, t.clientX); lastTouchY.set(t.identifier, t.clientY); }
    }, { passive: true });
    photo.addEventListener('touchend', (e) => { for (const t of Array.from(e.changedTouches)) endPointer(t.identifier); }, { passive: true });
    photo.addEventListener('touchcancel', (e) => { for (const t of Array.from(e.changedTouches)) endPointer(t.identifier); }, { passive: true });
    photo.addEventListener('mousedown', (e) => beginPointer(-1, e.clientX, e.clientY, 'mouse', 1), { passive: true });
    photo.addEventListener('mousemove', (e) => movePointer(-1, e.clientX, e.clientY, 'mouse', e.buttons, e.movementX ?? 0, e.movementY ?? 0), { passive: true });
    photo.addEventListener('mouseup', () => endPointer(-1), { passive: true });
    photo.addEventListener('mouseleave', () => endPointer(-1), { passive: true });
  }

  // ---- 物理子步（§5.4） ----
  function updatePointers(): void {
    for (const p of pointers.values()) {
      // 紧跟随（固态感：材料被手指顶着走，而非稀软地拖着流）
      const nx = p.sx + (p.px - p.sx) * C.FOLLOW;
      const ny = p.sy + (p.py - p.sy) * C.FOLLOW;
      p.pressure += (p.target - p.pressure) * C.PRESSURE_RAMP;
      // 胶囊接触：手指从上一位置扫到新位置，一次成形 → 连续沟槽、
      // 与速度/采样率无关（消除扇贝/重影）
      field.pressSegment(p.sx, p.sy, nx, ny, p.pressure);
      p.sx = nx;
      p.sy = ny;
    }
  }

  // ---- 文字微抖（§5.10） ----
  const jitEls = Array.from(document.querySelectorAll<HTMLElement>('[data-jit]'));
  const jit = { x: 0, y: 0, vx: 0, vy: 0, running: false };
  let copyCx = 0, copyCy = 0;

  function measureCopy(): void {
    const r = copy?.getBoundingClientRect();
    copyCx = r ? r.left + r.width / 2 : 0;
    copyCy = r ? r.top + r.height / 2 : 0;
  }

  function jitterImpulse(cx: number, cy: number, mag: number, sign: number): void {
    if (reduced || !jitEls.length) return;
    measureCopy();
    let dx = copyCx - cx;
    let dy = copyCy - cy;
    const d = Math.hypot(dx, dy) || 1;
    jit.vx += (dx / d) * mag * sign;
    jit.vy += (dy / d) * mag * sign;
    jit.running = true;
  }

  function jitterStep(dt: number): boolean {
    if (reduced) { moveAccX = moveAccY = 0; moveCount = 0; return false; }
    if (moveCount > 0) {
      const p = movePressSum / moveCount;
      const inv = 1 / Math.max(dt, 1 / 240);
      jit.vx += moveAccX * inv * JF * p * dt;
      jit.vy += moveAccY * inv * JF * p * dt;
      moveAccX = moveAccY = 0;
      movePressSum = 0;
      moveCount = 0;
      jit.running = true;
    }
    if (!jit.running) return false;
    const K = C.JIT_K, D = C.JIT_C;
    jit.vx += (-K * jit.x - D * jit.vx) * dt;
    jit.vy += (-K * jit.y - D * jit.vy) * dt;
    jit.x += jit.vx * dt;
    jit.y += jit.vy * dt;
    jit.x = Math.max(-JIT_LIMIT, Math.min(JIT_LIMIT, jit.x));
    jit.y = Math.max(-JIT_LIMIT, Math.min(JIT_LIMIT, jit.y));
    if (Math.abs(jit.x) < 0.02 && Math.abs(jit.y) < 0.02 && Math.abs(jit.vx) < 0.02 && Math.abs(jit.vy) < 0.02) {
      jit.x = jit.y = jit.vx = jit.vy = 0;
      jit.running = false;
      for (const el of jitEls) el.style.transform = '';
      copy?.classList.remove('jittering');
      return false;
    }
    if (!copy?.classList.contains('jittering')) copy?.classList.add('jittering');
    for (const el of jitEls) {
      const f = parseFloat(el.dataset.jit || '1');
      el.style.transform = `translate3d(${(jit.x * f).toFixed(3)}px, ${(jit.y * f).toFixed(3)}px, 0)`;
    }
    return true;
  }

  // ---- 提示文案（§5.8 修订：不播放任何自动交互演示） ----
  let userTouched = false;

  function hideHint(): void {
    hintEl?.classList.remove('show');
  }

  function onFirstTouch(): void {
    userTouched = true;
    hideHint();
  }

  setTimeout(() => { if (!userTouched) hintEl?.classList.add('show'); }, C.HINT_DELAY);
  setTimeout(hideHint, C.HINT_FADE);

  // 提示不能只出现一次：淡出后，用户主动点「回到封面」时以极淡样式再浮现一次。
  // 否则二次访客与稍晚阅读的用户将永远不知道 Hero 可以按压。
  // 触发点用 .back-top 而非滚动监听：Hero 有滚动锁，回到封面必须走这个按钮。
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement | null)?.closest?.('.back-top') && !userTouched) {
      window.setTimeout(() => hintEl?.classList.add('show', 'again'), 650);
    }
  });

  // ---- 主循环 / 休眠 / 质量自适应（§5.6 §5.9） ----
  function frame(now: number): void {
    rafId = 0;
    const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05);
    last = now;

    const simActive = pointers.size > 0 || field.peak > SLEEP_EPS;
    if (simActive) {
      acc += dt;
      let steps = 0;
      while (acc >= SUB_DT && steps < MAX_STEPS) {
        updatePointers();
        field.step();
        acc -= SUB_DT;
        steps++;
      }
      if (steps > 0) {
        field.encode(buf);
        renderer!.uploadField(buf);
        drawDirty = true;
      }
    }

    const jitMoving = jitterStep(dt);

    if (drawDirty) {
      renderer!.draw();
      drawDirty = false;
    }

    frames++;
    if (dt > 0 && dt < 0.1) {
      emaDt = emaDt * 0.9 + dt * 0.1;
      if (emaDt > C.QUALIFY_EMA) {
        if (++slowFrames >= C.QUALITY_SLOW_FRAMES) {
          slowFrames = 0;
          degrade();
        }
      } else slowFrames = 0;
    }

    if (!simActive && pointers.size === 0 && !jitMoving) {
      if (++idleFrames >= IDLE_FRAMES_TO_SLEEP) {
        sleep();
        return;
      }
    } else idleFrames = 0;

    if (visible) rafId = requestAnimationFrame(frame);
    else rafId = 0;
  }

  function degrade(): void {
    level++;
    if (level === 1) {
      renderer!.tuning.dispersion = 0;
    } else {
      renderScale = Math.max(1, renderScale * 0.8);
      renderer!.resize(Math.round(cssW * renderScale), Math.round(cssH * renderScale));
    }
    drawDirty = true;
  }

  function sleep(): void {
    field.reset();
    field.encode(buf);
    renderer!.uploadField(buf);
    renderer!.draw();
    drawDirty = false;
    idleFrames = 0;
    rafId = 0;
  }

  function wake(): void {
    if (rafId || !visible) return;
    last = performance.now();
    acc = 0;
    idleFrames = 0;
    rafId = requestAnimationFrame(frame);
  }

  runtime.wake = wake;

  // ---- 可见性（§5.7） ----
  const hero = document.getElementById('hero')!;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) wake();
      else if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    }, { threshold: 0.05 }).observe(hero);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    } else wake();
  });

  // ---- resize（§5.2） ----
  let resizeQueued = false;
  function onResize(): void {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      const r = photo!.getBoundingClientRect();
      const w = r.width, h = r.height;
      if (Math.abs(w - cssW) < 2 && Math.abs(h - cssH) < 2) return;
      const aspectChanged = Math.abs(w / h / texAspect - 1) > 0.01;
      const widthChanged = Math.abs(w - cssW) > cssW * 0.25;
      cssW = Math.max(1, w);
      cssH = Math.max(1, h);
      rebuildGrid();
      if (aspectChanged || widthChanged) buildTexture();
      wake();
    });
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(photo);
  else window.addEventListener('resize', onResize, { passive: true });

  // ---- debug 暴露（§12.2） ----
  function exposeDebug(mode: 'gl' | 'static'): void {
    if (!debugOn) return;
    const w = window as unknown as Record<string, unknown>;
    w.__hero = {
      debug: (): HeroDebug => ({
        mode,
        awake: !!rafId,
        frames,
        fps: Math.round(1 / emaDt),
        renderScale,
        level,
        cols: field.cols,
        rows: field.rows,
      }),
      // 仅 ?debug：诊断/隔离实验用（关闭折射、高光等定位伪影来源）
      setTuning: (t: Partial<{ refract: number; dispersion: number; light: number; zoom: number }>) => {
        Object.assign(renderer!.tuning, t);
        drawDirty = true;
        wake();
      },
      refDataURL: () => {
        if (mode !== 'gl' || !texCanvas) return '';
        const c = document.createElement('canvas');
        c.width = Math.round(cssW);
        c.height = Math.round(cssH);
        const g = c.getContext('2d')!;
        const z = renderer!.tuning.zoom;
        g.drawImage(texCanvas, texCanvas.width * (1 - z) / 2, texCanvas.height * (1 - z) / 2, texCanvas.width * z, texCanvas.height * z, 0, 0, c.width, c.height);
        return c.toDataURL('image/png');
      },
    };
  }

  // ---- 首帧 ----
  buildTexture();
  field.encode(buf);
  renderer.uploadField(buf);
  renderer.draw();
  canvas.classList.add('ready');
  exposeDebug('gl');
  finishCopy();
  wake();
}
