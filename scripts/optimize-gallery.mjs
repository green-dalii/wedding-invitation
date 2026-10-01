// ═══════════════════════════════════════════════════════════════
// 相册资源管线：assets-src/ → src/assets/ + src/generated/
//
//   assets-src/hero-source.jpg      第 1 张（首屏），同时作为 og.jpg 来源
//   assets-src/gallery/*.jpg        后续图片，按文件名排序
//
// ── 为什么必须「预裁切」而不是只缩尺寸 ──────────────────────────
// Hero 画框很竖（手机 390×844 = 0.462，桌面 605×900 = 0.672），而相册里
// 混有横图（1.43~1.50）。若直接把横图缩到 1000px 宽交由运行时 cover，
// 运行时会为了填满竖向画框把 667px 高拉伸到 1688px —— **放大 2.5 倍，明显发糊**。
// 因此这里按各断点的画框比例先裁切到固定宽高比，再按**高度**缩放，
// 使运行时只需做极小的二次裁切，不产生放大。
//
// 产出（均被 .gitignore 忽略，不入库）：
//   src/assets/gallery-NN-m.webp    移动端 0.70 比例 / 1700px 高
//   src/assets/gallery-NN-l.webp    桌面端 0.68 比例 / 1800px 高
//   src/assets/gallery-NN-m.jpg     WebP 不支持时的兜底
//   src/generated/gallery.json      清单：尺寸 / LQIP
//   src/generated/hero-meta.json    第 1 张的宽高 + LQIP（vite 注入首屏占位背景）
//   public/og.jpg                   微信分享缩略图（保持取自 hero-source）
//
// 构图焦点：assets-src/gallery-focal.json（可选，不入库）
//   { "123_0049": [0.5, 0.45] }   // 文件名（不含扩展名）→ [x, y]，0~1
//   x=0 保留左侧、x=1 保留右侧；y 同理。默认 [0.5, 0.4]（略偏上，给底部文案留空间）
// ═══════════════════════════════════════════════════════════════
import sharp from 'sharp';
import { mkdirSync, writeFileSync, statSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { basename, extname } from 'node:path';

const HERO = 'assets-src/hero-source.jpg';
const GALLERY_DIR = 'assets-src/gallery';
const FOCAL_FILE = 'assets-src/gallery-focal.json';

/** 默认焦点：略高于正中，避免主体顶到画面边缘 */
const DEFAULT_FOCAL = [0.5, 0.4];

/**
 * 各断点的产出规格。
 * ratio 是**画框宽高比**（手机实测 0.462、桌面 0.672），
 * 刻意取得比画框略宽一点，让运行时仍有少量二次裁切余量，
 * 同时避免为极窄机型过度裁掉两侧内容。
 */
const VARIANTS = [
  { suffix: '-m.webp', ratio: 0.7, height: 1700, fmt: 'webp' },
  { suffix: '-l.webp', ratio: 0.68, height: 1800, fmt: 'webp' },
  { suffix: '-m.jpg', ratio: 0.7, height: 1700, fmt: 'jpg' },
];

const QUALITY = { webp: 82, jpg: 86 };

mkdirSync('src/assets', { recursive: true });
mkdirSync('src/generated', { recursive: true });
mkdirSync('public', { recursive: true });

// ── 收集源文件：hero-source 第一，其余按文件名排序（业主指定的顺序）──
function sources() {
  const list = [];
  if (existsSync(HERO)) list.push(HERO);
  else console.log(`  ⚠️ 缺少 ${HERO}（先跑 npm run assets:placeholder）`);
  if (existsSync(GALLERY_DIR)) {
    list.push(
      ...readdirSync(GALLERY_DIR)
        .filter((f) => /\.jpe?g$/i.test(f))
        .sort()
        .map((f) => `${GALLERY_DIR}/${f}`)
    );
  }
  return list;
}

const files = sources();
if (!files.length) {
  console.error('✗ 没有任何源图，无法生成清单。先运行：npm run assets:placeholder');
  process.exit(1);
}

// ── 清理陈年派生物 ──────────────────────────────────────────────
// src/assets/ 完全由本管线拥有：只保留本轮的 gallery-NN-* 。
// 否则旧单图管线的 hero-*.webp / 删掉照片后残留的产物会一起被打包，
// 既浪费体积，也会让产物数量校验失真。
const KEEP = /^gallery-\d{2}-(m\.webp|l\.webp|m\.jpg)$/;
let pruned = 0;
for (const f of readdirSync('src/assets')) {
  if (!KEEP.test(f)) {
    rmSync(`src/assets/${f}`, { force: true });
    pruned++;
  }
}
if (pruned) console.log(`▸ 清理了 ${pruned} 个陈年派生物`);

// ── 焦点表（可选）──
let focals = {};
if (existsSync(FOCAL_FILE)) {
  try {
    focals = JSON.parse(readFileSync(FOCAL_FILE, 'utf8'));
    console.log(`▸ 读取焦点表 ${FOCAL_FILE}（${Object.keys(focals).length} 项）`);
  } catch (e) {
    console.error(`✗ ${FOCAL_FILE} 解析失败：${e.message}`);
    process.exit(1);
  }
}

/** 按目标宽高比裁切，再按高度缩放。返回实际产出尺寸。 */
async function emit(src, out, { ratio, height, fmt }, focal) {
  const meta = await sharp(src).metadata();
  const iw = meta.width;
  const ih = meta.height;

  // 裁到目标比例：谁「多余」就裁谁，只做一次提取，不放大
  let cropW;
  let cropH;
  if (iw / ih > ratio) {
    cropH = ih;
    cropW = Math.round(ih * ratio);
  } else {
    cropW = iw;
    cropH = Math.round(iw / ratio);
  }
  const left = Math.max(0, Math.min(iw - cropW, Math.round((iw - cropW) * focal[0])));
  const top = Math.max(0, Math.min(ih - cropH, Math.round((ih - cropH) * focal[1])));

  const pipe = sharp(src)
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ height, withoutEnlargement: true });

  await (fmt === 'webp'
    ? pipe.webp({ quality: QUALITY.webp, effort: 5 })
    : pipe.jpeg({ quality: QUALITY.jpg, mozjpeg: true })
  ).toFile(out);

  const m = await sharp(out).metadata();
  return { width: m.width, height: m.height, bytes: statSync(out).size };
}

const images = [];
let totalBytes = 0;
/** 第 1 张的 LQIP（内联模糊占位），仅用于首屏；必须提到循环外供后续写入 */
let lqip = '';

for (let i = 0; i < files.length; i++) {
  const src = files[i];
  const id = `gallery-${String(i + 1).padStart(2, '0')}`;
  const stem = basename(src, extname(src));
  const raw = focals[stem] ?? DEFAULT_FOCAL;
  const focal = [Number(raw[0]) || 0.5, Number(raw[1]) || 0.4];
  const srcMeta = await sharp(src).metadata();

  let mSize = null;
  for (const v of VARIANTS) {
    const r = await emit(src, `src/assets/${id}${v.suffix}`, v, focal);
    totalBytes += r.bytes;
    if (!mSize) mSize = r; // 第一个变体即 -m.webp
  }

  // LQIP（24px 模糊图）：**只有第 1 张需要**（vite 注入首屏占位背景）。
  // 不写进 gallery.json：那是运行时清单，LQIP 内联进去只会白增 ~16KB 包体。
  if (i === 0) {
    lqip =
      'data:image/jpeg;base64,' +
      (await sharp(src).resize({ width: 24 }).blur(1).jpeg({ quality: 60 }).toBuffer()).toString('base64');
  }

  images.push({
    id,
    source: basename(src),
    width: mSize.width,
    height: mSize.height,
  });

  console.log(
    `  ${id}  ${basename(src).padEnd(20)} ${String(srcMeta.width).padStart(4)}x${String(srcMeta.height).padEnd(4)}` +
      ` → ${mSize.width}x${mSize.height} 焦点[${focal.join(', ')}]  ${(mSize.bytes / 1024).toFixed(0)}KB`
  );
}

// ── 清单 ──（**不含 LQIP**：运行时用不到，内联只会白增包体）
writeFileSync('src/generated/gallery.json', JSON.stringify({ images }, null, 2));

// ── 首屏 LQIP + og（og 保持取自第 1 张 → 与历史行为一致）──
const firstMeta = await sharp(files[0]).metadata();
writeFileSync(
  'src/generated/hero-meta.json',
  JSON.stringify({ width: firstMeta.width, height: firstMeta.height, lqip }, null, 2)
);
await sharp(files[0])
  .resize(600, 600, { fit: 'cover', position: 'centre' })
  .jpeg({ quality: 80 })
  .toFile('public/og.jpg');

console.log('');
console.log(`✓ ${images.length} 张 → src/assets/  合计 ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
console.log('✓ src/generated/gallery.json、hero-meta.json（首屏 LQIP）、public/og.jpg');
if (images.length === 1) {
  console.log('  ℹ️ 仅 1 张（未放入 assets-src/gallery/），轮播将不显示指示器');
}
