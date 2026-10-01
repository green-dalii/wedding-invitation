/**
 * 回执提交成功后的庆祝礼花（SPEC §14a）。
 *
 * 设计取舍：
 * - **两侧喷射**：与常见庆祝交互一致；且按钮在手机屏偏下时，
 *   往上喷射容易全部飞出可视区。
 * - **迸发感而非"一坨"**，靠四件事：
 *   ① 大张角扇面（±0.78 rad ≈ 89°），几乎覆盖从水平到垂直的全部方向
 *   ② 速度**高方差**（480~1560 px/s），快的射得远、慢的早早飘落 → 纵深
 *   ③ **错峰发射**（0~140ms），避免所有粒子同帧出现而结成源头块
 *   ④ 纸片阻力大于重力 → 先冲高再翻 fluttering 下落，符合真实纸屑
 * - **canvas 而非 DOM**：110 个粒子用 DOM 会引发重排；canvas 单层绘制更稳。
 * - **沿用站内莫兰迪配色**，不用彩虹色 —— 彩虹纸屑会让请柬瞬间廉价。
 * - `pointer-events: none`：绝不挡滚动与点击。
 * - 粒子全部死亡后移除 canvas 并停止 rAF，不留常驻开销。
 * - 尊重 `prefers-reduced-motion`：该模式改为上半屏静止彩带淡出，不喷射。
 */

/** 莫兰迪绿 + 奶油 + 柔和金，与站内设计变量一致 */
const COLORS = ['#b7d2c0', '#6f9a7d', '#4f7a60', '#f4f2ea', '#d9c9a3', '#c9a9a0'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vrot: number;
  color: string;
  /** 发射延迟（秒）：错峰发射，避免源头结块 */
  delay: number;
  /** 剩余寿命（秒） */
  life: number;
  ttl: number;
}

const GRAVITY = 700;      // px/s²（小于纸片阻力 → 先冲高再飘落）
const DRAG = 0.955;       // 每帧速度保留率（0.955 飞得更远，铺满屏幕）
const TTL = 3.4;          // 粒子寿命（秒）
const PER_SIDE = 105;     // 每侧粒子数
const EMIT_WINDOW = 0.42; // 错峰发射窗口（秒）——纵向铺开的关键

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** 触发庆祝礼花：自屏幕左右两侧向内上方成宽扇面迸发 */
export function celebrate(): void {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-layer';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const reduced = prefersReducedMotion();
  const particles: Particle[] = [];

  // 两个发射口：屏幕左右边缘**偏下**（86% 高度），留出整屏向上的展开空间，
  // 以 45° 为中心向内上方大开扇面。
  const cannons = [
    { x: -18, y: h * 0.86, dir: -Math.PI / 4 },           // 左 → 右上
    { x: w + 18, y: h * 0.86, dir: (Math.PI * 3) / 4 },  // 右 → 左上
  ];

  let i = 0;
  for (const c of cannons) {
    for (let n = 0; n < PER_SIDE; n++, i++) {
      // 大扇面（±0.78rad ≈ 89°）：从近乎水平到近乎垂直全覆盖
      const angle = c.dir + (Math.random() - 0.5) * 1.56;
      // 速度分布：**轻度平方偏置**（pow≈1.35）。
    // 之前 pow=1.7 过度集中于低速端 → 粒子在底部堆积、视觉稀疏；
    // 均匀分布又会让远近一致而结成一条带。1.35 在两者之间。
    const speed = 560 + Math.pow(Math.random(), 1.35) * 1900;
      particles.push({
        x: c.x + (Math.random() - 0.5) * 26,
        y: c.y + (Math.random() - 0.5) * 50,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 5 + Math.random() * 6,
        h: 10 + Math.random() * 14,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 11,
        color: COLORS[i % COLORS.length],
        // 发射延迟升到 0~420ms：**错峰是纵向铺开的关键** ——
        // 若全部同时出发，即便速度有差异，也会在相近时间抵达相近高度而结带。
        delay: Math.pow(Math.random(), 1.35) * 0.42,
        life: TTL,
        ttl: TTL,
      });
    }
  }

  // 减弱动效：上半屏静止彩带柔和淡出（不喷射、不坠落）
  if (reduced) {
    for (const p of particles) {
      p.x = Math.random() * w;
      p.y = Math.random() * h * 0.5;
      p.vx = 0;
      p.vy = 0;
      p.vrot = 0;
      p.delay = 0;
      p.life = 1.2;
      p.ttl = 1.2;
    }
  }

  document.body.appendChild(canvas);

  let raf = 0;
  let last = performance.now();

  function frame(now: number): void {
    // dt 上限 1/30s：切后台再回来时不会瞬移
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;

    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx!.clearRect(0, 0, w, h);

    let alive = 0;
    for (const p of particles) {
      if (p.life <= 0) continue;

      // 错峰发射：延迟未到的粒子暂不发射。
      // ⚠️ 它们仍需计入 alive —— 否则首帧所有粒子都在延迟窗口内，
      // 会让 alive 短暂为 0 而误判为“已结束”，导致画布被立即移除。
      if (p.delay > 0) {
        p.delay -= dt;
        alive++;
        continue;
      }

      alive++;

      if (!reduced) {
        p.vy += GRAVITY * dt;
        p.vx *= DRAG;
        p.vy *= DRAG;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;
        p.life -= dt;
      }

      // 末段淡出
      const alpha = reduced ? p.life / p.ttl : Math.min(1, p.life / (p.ttl * 0.35));
      ctx!.globalAlpha = Math.max(0, alpha);
      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rot);
      ctx!.fillStyle = p.color;
      // 上下摆动模拟纸片翻面
      const flip = Math.abs(Math.cos(p.rot * 1.7));
      ctx!.fillRect(-p.w / 2, (-p.h / 2) * flip, p.w, Math.max(1, p.h * flip));
      ctx!.restore();
    }
    ctx!.globalAlpha = 1;

    if (alive > 0 && !reduced) {
      raf = requestAnimationFrame(frame);
    } else {
      cancelAnimationFrame(raf);
      if (reduced) {
        // 减弱动效：静止彩带整体淡出后移除
        let op = 1;
        const fade = () => {
          op -= 0.08;
          canvas.style.opacity = String(Math.max(0, op));
          if (op > 0) requestAnimationFrame(fade);
          else canvas.remove();
        };
        fade();
      } else {
        canvas.remove();
      }
    }
  }

  raf = requestAnimationFrame(frame);

  // 兜底：极端情况下（标签页隐藏）也要清理，避免 canvas 残留
  window.setTimeout(() => {
    cancelAnimationFrame(raf);
    canvas.remove();
  }, (TTL + EMIT_WINDOW + 0.6) * 1000);
}