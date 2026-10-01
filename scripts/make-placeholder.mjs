// 生成拟真占位图（正式使用时替换为真实照片）：
//   assets-src/hero-source.jpg          第 1 张（首屏，也是 og.jpg 来源）
//   assets-src/gallery/01-placeholder.jpg
//   assets-src/gallery/02-placeholder.jpg
//
// 要点：有机内容（不规则散景/柔焦/胶片颗粒），**不含规则网格或同心圆**——
// 规则纹理会被折射扭曲成假的"横纹竖纹鬼影"，干扰材质评估。
// 3 张的配色与构图各不相同，便于肉眼确认轮播淡入淡出是否真的在切图。
import sharp from 'sharp';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

/** 确定性伪随机 */
function rng(seed) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

/** 生成一张婚礼感的抽象场景（同一套画法，换种子/配色/构图） */
function scene(seed, pal) {
  const W = 1600, H = 2400;
  const rnd = rng(seed);
  const rr = (a, b) => a + rnd() * (b - a);

  // 不规则散景光斑（照片感，尺寸/位置随机，非同心）
  let bokeh = '';
  for (let i = 0; i < 90; i++) {
    const cx = rr(0, W), cy = rr(0, H * 0.75);
    const r = rr(14, 90);
    const op = rr(0.05, 0.22).toFixed(3);
    const warm = rnd() > 0.4;
    const fill = warm ? `rgba(255,241,214,${op})` : `rgba(226,238,222,${op})`;
    bokeh += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="${fill}"/>`;
  }

  // 柔和的远景层次（柔焦，避免硬边）—— 只在中下部，上方留亮
  let layers = '';
  for (let i = 0; i < 4; i++) {
    const y = H * (0.58 + i * 0.1) + rr(-30, 30);
    const op = (0.1 + i * 0.04).toFixed(2);
    const col = pal.layers[i];
    const amp = rr(50, 120);
    layers += `<path d="M0 ${y.toFixed(0)} C ${W * 0.3} ${(y - amp).toFixed(0)}, ${W * 0.7} ${(y + amp).toFixed(0)}, ${W} ${(y - amp * 0.5).toFixed(0)} L ${W} ${H} L 0 ${H} Z" fill="${col}" opacity="${op}"/>`;
  }

  // 前景清晰枝叶（不规则、较锐利，提供折射可辨的细节）
  let leaves = '';
  for (let i = 0; i < 46; i++) {
    const x = rr(-40, W + 40), y = H * rr(0.62, 1.02);
    const len = rr(70, 230), w = rr(12, 40);
    const rot = rr(-1.2, 1.2);
    const op = rr(0.35, 0.8).toFixed(2);
    const col = pal.leaves[Math.floor(rnd() * 3)];
    leaves += `<g transform="translate(${x.toFixed(0)},${y.toFixed(0)}) rotate(${(rot * 57).toFixed(0)})" opacity="${op}">
    <ellipse cx="0" cy="0" rx="${w.toFixed(0)}" ry="${(len / 2).toFixed(0)}" fill="${col}"/>
  </g>`;
  }

  // 主体：两位新人的柔和剪影（浅色，与背景形成对比，便于观察折射/形变）
  const ax = W * pal.ax, bx = W * pal.bx;
  let subject = '';
  subject += `<path d="M${ax} ${H * 0.55} c-8 -60 6 -110 40 -120 c34 -10 54 22 50 62 c-4 44 -18 70 -46 74 c-30 4 -40 -6 -44 -16 Z" fill="#e9e4d6" opacity="0.95"/>`;
  subject += `<path d="M${bx} ${H * 0.56} c-6 -58 8 -106 42 -116 c32 -10 52 22 48 60 c-4 42 -18 68 -44 72 c-30 4 -42 -6 -46 -16 Z" fill="#ded8c8" opacity="0.95"/>`;
  subject += `<path d="M${W * 0.3} ${H * 0.74} c40 -40 90 -56 130 -30 c40 26 60 20 90 -6 c30 -26 60 -18 80 12 l0 220 l-400 0 Z" fill="#f2ede1" opacity="0.95"/>`;
  // 花束：大量不规则小花瓣
  for (let i = 0; i < 120; i++) {
    const a = rr(0, Math.PI * 2), r = Math.pow(rnd(), 0.6) * 130;
    const px = bx + Math.cos(a) * r, py = H * 0.53 + Math.sin(a) * r * 0.8;
    const pr = rr(6, 18);
    const op = rr(0.5, 0.95).toFixed(2);
    const col = pal.bloom[Math.floor(rnd() * 4)];
    subject += `<circle cx="${px.toFixed(0)}" cy="${py.toFixed(0)}" r="${pr.toFixed(0)}" fill="${col}" opacity="${op}"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${pal.sky[0]}"/><stop offset=".45" stop-color="${pal.sky[1]}"/>
    <stop offset=".75" stop-color="${pal.sky[2]}"/><stop offset="1" stop-color="${pal.sky[3]}"/>
  </linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="softer" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feColorMatrix in="n" type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0.05"/></feComponentTransfer><feComposite operator="over" in2="SourceGraphic"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#sky)"/>
<g filter="url(#softer)">${bokeh}</g>
<g filter="url(#soft)">${layers}</g>
<g filter="url(#soft)">${leaves}</g>
<g>${subject}</g>
<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.35"/>
</svg>`;
}

const JOBS = [
  {
    file: 'assets-src/hero-source.jpg',
    seed: 20261018,
    pal: {
      sky: ['#eef0e4', '#f2ecdc', '#dfe0cc', '#c6ceba'],
      layers: ['#aab8a3', '#93a68d', '#7d9079', '#667a68'],
      leaves: ['#42553f', '#33452f', '#4e6047'],
      bloom: ['#fbf7ee', '#f0dcc9', '#e3c3ae', '#f7ece0'],
      ax: 0.38, bx: 0.6,
    },
  },
  {
    file: 'assets-src/gallery/01-placeholder.jpg',
    seed: 771103,
    pal: {
      sky: ['#f1ece2', '#f4e6d8', '#e6d5c6', '#cdbdb0'],
      layers: ['#c0ac9c', '#a99384', '#8f7c70', '#75655c'],
      leaves: ['#5b4a3c', '#473a2f', '#6b5847'],
      bloom: ['#fff8ee', '#f3ddc8', '#e0bfa4', '#f8ecdd'],
      ax: 0.32, bx: 0.62,
    },
  },
  {
    file: 'assets-src/gallery/02-placeholder.jpg',
    seed: 4242,
    pal: {
      sky: ['#e6ecec', '#dfe9e6', '#c8d8d3', '#a9beb8'],
      layers: ['#8fa8a1', '#78938c', '#637d77', '#4f6862'],
      leaves: ['#2f4440', '#243633', '#3b534e'],
      bloom: ['#f6fbf9', '#dfeae6', '#c4d6d1', '#eef5f2'],
      ax: 0.42, bx: 0.58,
    },
  },
];

// 安全阀：**已有真实照片时不得覆盖**。
// npm install 会触发 prepare 脚本；若此时用占位图覆盖使用者的真实照片，
// 部署上线就会变成占位图。仅在文件不存在，或显式 --force 时才生成。
async function main() {
  const force = process.argv.includes('--force');
  mkdirSync('assets-src', { recursive: true });
  mkdirSync('assets-src/gallery', { recursive: true });
  for (const job of JOBS) {
    mkdirSync(dirname(job.file), { recursive: true });
    if (existsSync(job.file) && !force) {
      const { size } = statSync(job.file);
      console.log(`SKIP ${job.file} 已存在（${Math.round(size / 1024)} KB），不覆盖。`);
      continue;
    }
    await sharp(Buffer.from(scene(job.seed, job.pal))).jpeg({ quality: 92 }).toFile(job.file);
    console.log(`OK   ${job.file} 1600x2400 (拟真占位，无网格/无同心圆)`);
  }
  console.log('     如需重新生成占位图：npm run assets:placeholder -- --force');
}

await main();
