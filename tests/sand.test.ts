/**
 * 沙砾模式的核心不变量（§5.14.3）。
 *
 * 这些断言对应一个容易踩且极难察觉的坑：
 * 静止态「就是原图」靠的是**几何构造**——沙砾方形脚印的边界
 * `i*cell` 与 `(i+1)*cell` 必须落在整数设备像素上，才能严丝合缝铺满画布。
 * 一旦 cell 不是整数，画面会出现半像素错位的缝隙或整体发糊，
 * 而这种退化在缩略图上几乎看不出来 —— 必须由测试守住。
 *
 * 注：曾误写为「必须偶数」。实测 60×60 画布下 cell=1~8 漏缝像素均为 0，
 * **奇偶无关，整数即可**。这条放宽解开了粒径下限，细沙才做得出来。
 */
import { describe, it, expect } from 'vitest';
import { seedAt, normalizeCell, grainGrid } from '../src/hero/modes/sand';

describe('沙砾颗粒边长', () => {
  it('永远是 ≥1 的整数（核心不变量）', () => {
    for (const g of [1, 1.5, 2, 2.4, 2.5, 3, 4, 5, 6, 7, 8, 11, 0, -5, NaN, Infinity]) {
      const c = normalizeCell(g, 1);
      expect(Number.isInteger(c), `grain=${g} → ${c} 非整数`).toBe(true);
      expect(c).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(c)).toBe(true);
    }
  });

  it('粒径以 CSS 像素表达，经 scale 换算到物理像素', () => {
    // 同一 CSS 粒径在不同 DPR 下视觉一致 → 粒子数不随 DPR 平方爆炸
    expect(normalizeCell(2, 1)).toBe(2); // DPR1：2 物理px
    expect(normalizeCell(2, 2)).toBe(4); // DPR2：4 物理px（同样 2 CSSpx）
    expect(normalizeCell(2, 3)).toBe(6); // DPR3 被钳到 2
    expect(normalizeCell(2.5, 2)).toBe(5);
  });

  it('非法 scale 回退 1，不产生 NaN / 0', () => {
    for (const s of [0, -1, NaN, Infinity]) {
      const c = normalizeCell(2, s);
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(1);
    }
  });

  it('受点尺寸上限约束（个别驱动上限很小）', () => {
    expect(normalizeCell(12, 1, 3)).toBe(3);
    expect(normalizeCell(12, 1, 63)).toBe(12);
    expect(normalizeCell(12, 1, 0)).toBe(1); // 退化上线下仍保持合法值
  });

  it('质量降级使颗粒加倍（粒子数降至 1/4）', () => {
    expect(normalizeCell(2, 2, 1024, 1)).toBe(8);
    expect(normalizeCell(2, 2, 1024, 2)).toBe(8); // 不再二次加倍（由 shader 关特效）
  });
});

describe('沙砾网格', () => {
  const W = 780;
  const H = 1688;

  it('方形脚印边界落在整数像素上（严丝合缝铺满的前提）', () => {
    // 小网格全量断言即可证明不变量；在 780×1688 上全量跑会撑到 2100 万次断言
    for (const cell of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { home } = grainGrid(24, 24, cell);
      for (let k = 0; k < home.length; k++) {
        // 脚印 = [home - cell/2, home + cell/2]，两端必须都是整数
        expect(Number.isInteger(home[k] - cell / 2), `cell=${cell} 左边界非整数`).toBe(true);
        expect(Number.isInteger(home[k] + cell / 2), `cell=${cell} 右边界非整数`).toBe(true);
      }
    }
  });

  it('覆盖整块画布（末列末行可越界，但不能留空）', () => {
    for (const cell of [1, 2, 3, 4, 5, 6, 8]) {
      const { cols, rows } = grainGrid(W, H, cell);
      expect(cols * cell).toBeGreaterThanOrEqual(W);
      expect(rows * cell).toBeGreaterThanOrEqual(H);
      // 同时不能浪费太多（多出一整格才算浪费）
      expect(cols * cell - W).toBeLessThan(cell);
      expect(rows * cell - H).toBeLessThan(cell);
    }
  });

  it('相邻沙砾间距恰为一个 cell（首颗在 cell/2 处）', () => {
    const cell = 5;
    const { home, cols } = grainGrid(W, H, cell);
    expect(home[0]).toBe(cell / 2);
    expect(home[1]).toBe(cell / 2);
    expect(home[2] - home[0]).toBe(cell); // 同一行下一颗
    expect(home[cols * 2 + 1] - home[1]).toBe(cell); // 下一行同一列
  });

  it('粒子数 = cols × rows', () => {
    const g = grainGrid(W, H, 4);
    expect(g.count).toBe(g.cols * g.rows);
    expect(g.home.length).toBe(g.count * 2);
    expect(g.seeds.length).toBe(g.count);
  });

  it('每颗随机值确定且落在 [0,1)（重建网格时图案不重排）', () => {
    const a = grainGrid(W, H, 4);
    const b = grainGrid(W, H, 4);
    expect(Array.from(a.seeds.slice(0, 50))).toEqual(Array.from(b.seeds.slice(0, 50)));
    for (const s of a.seeds) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
    expect(seedAt(0, 0)).toBe(seedAt(0, 0));
    expect(seedAt(1, 2)).not.toBe(seedAt(2, 1)); // 不因 i/j 对称而碰撞
  });

  it('细沙粒径下粒子数仍可控（2 CSSpx @DPR2 → 约 82k）', () => {
    const cell = normalizeCell(2, 2);
    const g = grainGrid(W, H, cell);
    expect(g.count).toBeLessThan(120_000);
  });
});
