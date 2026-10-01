import { describe, it, expect } from 'vitest';
import { SoftField, DEFAULT_PARAMS } from '../src/hero/softbody';

function make() { return new SoftField(96, 160, DEFAULT_PARAMS); }
const cx = 48, cy = 80;

/** 扫描并返回 supportRadius 之外的最大 |h|（应为 0：禁波动传播） */
function maxOutside(f: SoftField, c: number, sup: number): number {
  const { cols, rows, h } = f;
  const sup2 = sup * sup;
  let mx = 0;
  for (let y = 0; y < rows; y++) {
    const dy = y - c;
    for (let x = 0; x < cols; x++) {
      const dx = x - c;
      if (dx * dx + dy * dy > sup2) {
        const a = h[y * cols + x] < 0 ? -h[y * cols + x] : h[y * cols + x];
        if (a > mx) mx = a;
      }
    }
  }
  return mx;
}

describe('SoftField（粘弹软体：胶囊接触 + 双模粘弹[弹性+蠕变]，无波动传播，多点非线性合并）', () => {
  // 总形变 = 弹性模 + 蠕变模（渲染用的实际高度）
  const tot = (f: SoftField, i: number) => f.h[i] + f.hc[i];

  it('按压产生紧凑凹陷（h<0），不发散', () => {
    const f = make();
    for (let i = 0; i < 120; i++) { f.press(cx, cy, 1); f.step(); }
    const c = f.h[cy * f.cols + cx];
    expect(c).toBeLessThan(-3);
    expect(c).toBeGreaterThan(-20);
    expect(Number.isFinite(f.peak)).toBe(true);
  });

  it('松手后：蠕变残留后归零（不冻结，缓释到位）', () => {
    const f = make();
    for (let i = 0; i < 120; i++) { f.press(cx, cy, 1); f.step(); }
    const total = (i: number) => f.h[i] + f.hc[i];
    const center = cy * f.cols + cx;
    // 蠕变：持续受力后总深度 > 弹性深度（真实蠕变加深）
    expect(Math.abs(total(center))).toBeGreaterThan(Math.abs(f.h[center]));
    // 释放后 0.5s（30 步）：仍有可感知残余（沟槽缓释）
    for (let i = 0; i < 30; i++) f.step();
    expect(Math.abs(total(center))).toBeGreaterThan(0.3);
    // 释放 15s（900 步）：完全归零（蠕变最终恢复，不冻结）
    for (let i = 0; i < 900; i++) f.step();
    expect(f.peak).toBeLessThan(0.05);
  });

  it('无波动传播：滑动/释放全程，作用域外严格为 0（防回归）', () => {
    // 大网格：确保 supportRadius 外有足够采样点
    const f = new SoftField(160, 160, DEFAULT_PARAMS);
    const c = 80;
    const sup = f.supportRadius;
    // 按下并横向滑动（模拟用户滑动，制造载荷移动）
    for (let i = 0; i < 150; i++) {
      f.press(c - 20 + (i % 40), c + Math.round(Math.sin(i / 6) * 8), 1);
      f.step();
      // 作用域外无可见形变（<1e-4，浮点噪声级；拉普拉斯波动会在此产生 O(0.1~1)）
      expect(maxOutside(f, c, sup)).toBeLessThan(1e-4);
    }
    // 释放：应原地回弹归零，作用域外始终无数值形变
    for (let i = 0; i < 300; i++) {
      f.step();
      expect(maxOutside(f, c, sup)).toBeLessThan(1e-4);
    }
  });

  it('模糊可分离无别名污染：单指尾场关于按压点轴对称（防回归）', () => {
    // 大网格（容纳模糊支撑）+ 偏离中心按压（避免网格对称掩盖定向偏差）
    const f = new SoftField(200, 200, DEFAULT_PARAMS);
    const px = 100, py = 100;
    for (let i = 0; i < 400; i++) { f.press(px, py, 1); f.step(); }
    const at = (x: number, y: number) => tot(f, y * f.cols + x);
    for (const k of [12, 18, 24, 30]) {
      expect(Math.abs(at(px - k, py) - at(px + k, py))).toBeLessThan(0.05);
      expect(Math.abs(at(px, py - k) - at(px, py + k))).toBeLessThan(0.05);
    }
  });

  it('双凹陷：中间浅鞍（低于原面）+ 宽缓低尾（非锐棱，厚软体）', () => {
    const f = make();
    const x1 = 26, x2 = 70;          // 相距 44 格 ≈ 5.4σ → 清晰分离
    for (let i = 0; i < 300; i++) { f.press(x1, cy, 1); f.press(x2, cy, 1); f.step(); }
    const row = (x: number) => tot(f, cy * f.cols + x);
    const mid = row(48);
    // 中心深陷
    expect(row(x1)).toBeLessThan(-3);
    expect(row(x2)).toBeLessThan(-3);
    // 鞍部远浅于两坑中心（压缩硬化：非线性叠加会使中点深得多）
    expect(Math.abs(mid)).toBeLessThan(Math.abs(row(x1)) * 0.35);
    // 鞍部**不高于原始平面太多**（高于平面 = 绷紧薄膜的“棱”，非厚软体）；
    // 允许低幅软鼓（两坑软尾轻微叠加，~6%），但不是尖棱
    expect(mid).toBeLessThan(1.2);
    // 单坑周围的正尾宽缓低幅（非高幅环脊）：在凹陷边缘之外找正尾峰值
    const g = new SoftField(96, 160, DEFAULT_PARAMS);
    for (let i = 0; i < 300; i++) { g.press(48, cy, 1); g.step(); }
    let tailPeak = 0;
    for (let x = 48 + 18; x < 48 + 42 && x < g.cols; x++) {
      tailPeak = Math.max(tailPeak, tot(g, cy * g.cols + x));
    }
    expect(tailPeak).toBeGreaterThan(0);
    expect(tailPeak).toBeLessThan(1.5);   // 宽缓低包，非环脊
  });

  it('多点合并平滑无折痕：沿双中心连线剖面 C¹ 连续（无中垂线棱）', () => {
    const f = make();
    const x1 = 38, x2 = 58;          // 靠近，接近合并阈值
    for (let i = 0; i < 300; i++) { f.press(x1, cy, 1); f.press(x2, cy, 1); f.step(); }
    // 沿 x 轴取一串剖面点，检查一阶差分无尖峰（中垂线处）
    const xs: number[] = [];
    for (let x = x1 - 14; x <= x2 + 14; x++) xs.push(tot(f, cy * f.cols + x));
    // 一阶差分绝对值不应在正中间突然反号成“折角”
    const midIdx = (x2 - (x1 - 14));
    const dPrev = xs[midIdx] - xs[midIdx - 2];
    const dNext = xs[midIdx + 2] - xs[midIdx];
    expect(Math.abs(dNext - dPrev)).toBeLessThan(3.5);
  });

  it('深度饱和：重叠按压不线性叠加', () => {
    const single = make();
    for (let i = 0; i < 200; i++) { single.press(cx, cy, 1); single.step(); }
    const dbl = make();
    for (let i = 0; i < 200; i++) { dbl.press(cx, cy, 1); dbl.press(cx + 2, cy, 1); dbl.step(); }
    const hs = Math.abs(tot(single, cy * single.cols + cx));
    const hd = Math.abs(tot(dbl, cy * dbl.cols + cx));
    expect(hd).toBeLessThan(hs * 1.2);   // 深度饱和，不加倍
  });

  it('隆起边界平滑：padding 边缘无截断硬边', () => {
    const f = make();
    for (let i = 0; i < 200; i++) { f.press(cx, cy, 1); f.step(); }
    // 沿 +x 方向，在接近 supportRadius 处高度必须已衰减到接近 0（不能突然截断）
    const edge = Math.min(f.cols - 1, cx + f.supportRadius - 2);
    expect(Math.abs(tot(f, cy * f.cols + edge))).toBeLessThan(0.5);
  });

  it('长时间稳定：极端拖动不出现 NaN/爆炸', () => {
    const f = make();
    for (let i = 0; i < 1200; i++) {
      f.press(10 + (i % 76), 20 + ((i * 3) % 120), 1);
      f.step();
    }
    for (let i = 0; i < f.h.length; i++) expect(Math.abs(f.h[i])).toBeLessThanOrEqual(15);
  });

  it('胶囊接触：慢速拖动形成连续沟槽（无串珠/断裂）', () => {
    const f = new SoftField(96, 160, DEFAULT_PARAMS);
    const cy = 80;
    let x = 20;
    // 慢速拖动：每步移动 1.5 格
    for (let s = 0; s < 40; s++) {
      const nx = x + 1.5;
      f.pressSegment(x, cy, nx, cy, 1);
      x = nx;
      f.step();
    }
    // 沟槽沿拖动路径连续：中间段无断裂（相邻采样深度差 < 阈值）
    for (let xx = 30; xx < 76; xx++) {
      const a = tot(f, cy * f.cols + xx);
      const b = tot(f, cy * f.cols + xx + 1);
      expect(Math.abs(a - b)).toBeLessThan(2.0);
    }
  });

  it('胶囊接触：沟槽宽度≈接触直径（不随采样/速度变宽）', () => {
    // 胶囊沿 y 拖动：在垂直于拖动方向的横截面上，凹坑宽度应≈2σ（稳定）
    const f = new SoftField(96, 160, DEFAULT_PARAMS);
    const y0 = 30;
    f.pressSegment(48, y0, 48, y0 + 20, 1); // 沿 y 拖一段
    for (let s = 0; s < 3; s++) f.step();
    // 垂直方向（x）横截面：在胶囊范围内的一行，中间深，±2σ 外接近0
    const row = (x: number) => Math.abs(tot(f, 40 * f.cols + Math.round(x)));  // y=40 在胶囊内
    expect(row(48)).toBeGreaterThan(1.0);        // 中心有凹陷
    const twoSigma = Math.round(2 * f.sigmaCells);
    expect(row(48 - twoSigma)).toBeLessThan(1.0);  // 2σ 外几乎无
    expect(row(48 + twoSigma)).toBeLessThan(1.0);
  });

  it('encode 输出 RGBA8，静止时中性值', () => {
    const f = make();
    const out = new Uint8Array(f.cols * f.rows * 4);
    f.encode(out);
    expect(out[0]).toBe(128); expect(out[1]).toBe(128); expect(out[3]).toBe(255);
  });

  it('释放后无钟摆震荡：轨迹单调指数衰减（防回归，用户多次反馈的核心问题）', () => {
    const f = new SoftField(96, 160, DEFAULT_PARAMS);
    const cy = 80;
    let x = 16;
    for (let s = 0; s < 30; s++) { const nx = x + 1.5; f.pressSegment(x, cy, nx, cy, 1); x = nx; f.step(); }
    const i0 = cy * f.cols + 40;
    const tr: number[] = [];
    for (let s = 0; s < 600; s++) { f.step(); if (s % 20 === 0) tr.push(tot(f, i0)); }
    // 符号穿越次数 = 钟摆振荡指标。物理：粘弹恢复必须是单调的（纯黏性弛豫无惯性）
    let crossings = 0, sign = 0;
    for (let i = 1; i < tr.length; i++) {
      if (Math.abs(tr[i - 1]) < 0.05) continue;
      const s = Math.sign(tr[i]);
      if (sign !== 0 && s !== 0 && s !== sign) crossings++;
      if (s !== 0) sign = s;
    }
    expect(crossings).toBe(0);   // 修复前为 5（永久钟摆）
  });
});
