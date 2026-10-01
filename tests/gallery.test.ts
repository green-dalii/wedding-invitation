/**
 * 相册产物不变量（scripts/optimize-gallery.mjs 的输出）。
 *
 * 这些断言不是形式主义，每一条都对应一个踩过的坑：
 *  - 比例：横图不预裁切就会在手机竖版画框里被放大 2.5 倍 → 发糊
 *  - 清单不含 LQIP：11 张内联 base64 会白白撑大首屏包体约 3KB gzip
 *  - 三档齐备：缺 -m.jpg 时老 WebView 会白屏
 */
import { describe, it, expect } from 'vitest';
import { existsSync, statSync, readFileSync } from 'node:fs';
import manifest from '../src/generated/gallery.json';

const M = manifest.images;

/** 手机画框实测比例（390×844），预裁切必须不窄于它 */
const MIN_RATIO = 0.66;
/** 桌面画框实测比例（605×900） */
const DESKTOP_RATIO = 0.66;

describe('相册产物', () => {
  it('清单非空且字段完整', () => {
    expect(M.length).toBeGreaterThan(0);
    for (const im of M) {
      expect(im.id).toMatch(/^gallery-\d{2}$/);
      expect(im.width).toBeGreaterThan(0);
      expect(im.height).toBeGreaterThan(0);
    }
  });

  it('编号连续，从 gallery-01 开始（顺序即轮播顺序）', () => {
    const expected = M.map((_, i) => `gallery-${String(i + 1).padStart(2, '0')}`);
    expect(M.map((im) => im.id)).toEqual(expected);
  });

  it('每张都有 m/l/jpg 三档产物', () => {
    for (const im of M) {
      for (const suffix of ['-m.webp', '-l.webp', '-m.jpg']) {
        const p = `src/assets/${im.id}${suffix}`;
        expect(existsSync(p), `缺少 ${p}`).toBe(true);
        expect(statSync(p).size).toBeGreaterThan(1000);
      }
    }
  });

  it('预裁切比例不窄于手机画框（否则运行时会放大 → 发糊）', () => {
    for (const im of M) {
      const ratio = im.width / im.height;
      expect(ratio, `${im.id} 比例 ${ratio.toFixed(3)} 过窄`).toBeGreaterThanOrEqual(MIN_RATIO);
      expect(ratio, `${im.id} 比例 ${ratio.toFixed(3)} 不适合桌面`).toBeLessThanOrEqual(
        DESKTOP_RATIO + 0.06
      );
    }
  });

  it('清单里不得内联 LQIP（只该留在 hero-meta.json）', () => {
    const raw = JSON.stringify(manifest);
    expect(raw).not.toContain('data:image');
    expect(raw.length).toBeLessThan(4000);
  });

  it('首屏 LQIP 存在且为小体积 data URI', () => {
    const meta = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('node:fs').readFileSync('src/generated/hero-meta.json', 'utf8')
    ) as { width: number; height: number; lqip: string };
    expect(meta.lqip.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(meta.lqip.length).toBeLessThan(2000); // 24px 模糊图，不该超过 2KB
    expect(meta.width).toBeGreaterThan(0);
  });

  it('src/assets 里没有遗留的旧 hero-* 产物', () => {
    // 旧的单图管线产物若残留，会与 gallery-01 重复打包
    for (const stale of ['hero-m.webp', 'hero-l.webp', 'hero-m.jpg']) {
      expect(existsSync(`src/assets/${stale}`), `应清理 src/assets/${stale}`).toBe(false);
    }
  });

  it('焦点表（若存在）只引用真实存在的源图', () => {
    const FOCAL = 'assets-src/gallery-focal.json';
    if (!existsSync(FOCAL)) return; // 未自定义构图时该文件不存在
    const focals = JSON.parse(readFileSync(FOCAL, 'utf8')) as Record<string, number[]>;
    // 拼错文件名会静默失效（回退默认焦点），所以这里必须当头一棒
    for (const [stem, xy] of Object.entries(focals)) {
      expect(
        existsSync(`assets-src/gallery/${stem}.jpg`) || existsSync(`assets-src/${stem}.jpg`),
        `焦点表里的 "${stem}" 找不到对应源图`
      ).toBe(true);
      expect(Array.isArray(xy) && xy.length === 2, `${stem} 的焦点应为 [x, y]`).toBe(true);
      expect(xy[0]).toBeGreaterThanOrEqual(0);
      expect(xy[0]).toBeLessThanOrEqual(1);
    }
  });
});
