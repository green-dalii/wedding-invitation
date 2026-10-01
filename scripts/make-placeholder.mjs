// 生成拟真占位主图 assets-src/hero-source.jpg（正式使用时替换为真实照片）
// 要点：有机内容（不规则散景/柔焦/胶片颗粒），**不含规则网格或同心圆**——
// 规则纹理会被折射扭曲成假的"横纹竖纹鬼影"，干扰材质评估。
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const W = 1600, H = 2400;

// 确定性伪随机
let seed = 20261018;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
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
  const op = (0.10 + i * 0.04).toFixed(2);
  const col = ['#aab8a3', '#93a68d', '#7d9079', '#667a68'][i];
  const amp = rr(50, 120);
  layers += `<path d="M0 ${y.toFixed(0)} C ${W*0.3} ${(y-amp).toFixed(0)}, ${W*0.7} ${(y+amp).toFixed(0)}, ${W} ${(y-amp*0.5).toFixed(0)} L ${W} ${H} L 0 ${H} Z" fill="${col}" opacity="${op}"/>`;
}

// 前景清晰枝叶（不规则、较锐利，提供折射可辨的细节）
let leaves = '';
for (let i = 0; i < 46; i++) {
  const x = rr(-40, W + 40), y = H * rr(0.62, 1.02);
  const len = rr(70, 230), w = rr(12, 40);
  const rot = rr(-1.2, 1.2);
  const op = rr(0.35, 0.8).toFixed(2);
  const col = ['#42553f', '#33452f', '#4e6047'][Math.floor(rnd() * 3)];
  leaves += `<g transform="translate(${x.toFixed(0)},${y.toFixed(0)}) rotate(${(rot*57).toFixed(0)})" opacity="${op}">
    <ellipse cx="0" cy="0" rx="${w.toFixed(0)}" ry="${(len/2).toFixed(0)}" fill="${col}"/>
  </g>`;
}

// 主体：两位新人的柔和剪影（浅色，与背景形成对比，便于观察折射/形变）
let subject = '';
subject += `<path d="M${W*0.38} ${H*0.55} c-8 -60 6 -110 40 -120 c34 -10 54 22 50 62 c-4 44 -18 70 -46 74 c-30 4 -40 -6 -44 -16 Z" fill="#e9e4d6" opacity="0.95"/>`; // 头肩A
subject += `<path d="M${W*0.60} ${H*0.56} c-6 -58 8 -106 42 -116 c32 -10 52 22 48 60 c-4 42 -18 68 -44 72 c-30 4 -42 -6 -46 -16 Z" fill="#ded8c8" opacity="0.95"/>`; // 头肩B
subject += `<path d="M${W*0.30} ${H*0.74} c40 -40 90 -56 130 -30 c40 26 60 20 90 -6 c30 -26 60 -18 80 12 l0 220 l-400 0 Z" fill="#f2ede1" opacity="0.95"/>`; // 礼服
// 花束：大量不规则小花瓣
for (let i = 0; i < 120; i++) {
  const a = rr(0, Math.PI * 2), r = Math.pow(rnd(), 0.6) * 130;
  const bx = W * 0.60 + Math.cos(a) * r, by = H * 0.53 + Math.sin(a) * r * 0.8;
  const pr = rr(6, 18);
  const op = rr(0.5, 0.95).toFixed(2);
  const col = ['#fbf7ee', '#f0dcc9', '#e3c3ae', '#f7ece0'][Math.floor(rnd() * 4)];
  subject += `<circle cx="${bx.toFixed(0)}" cy="${by.toFixed(0)}" r="${pr.toFixed(0)}" fill="${col}" opacity="${op}"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#eef0e4"/><stop offset=".45" stop-color="#f2ecdc"/>
    <stop offset=".75" stop-color="#dfe0cc"/><stop offset="1" stop-color="#c6ceba"/>
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

mkdirSync('assets-src', { recursive: true });
await sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toFile('assets-src/hero-source.jpg');
console.log('OK assets-src/hero-source.jpg', W, H, '(拟真占位，无网格/无同心圆)');
