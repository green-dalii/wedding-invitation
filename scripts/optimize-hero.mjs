// assets-src/hero-source.jpg → src/assets/hero-{m,l}.webp + hero-m.jpg + LQIP(内联占位) + 元数据
import sharp from 'sharp';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';

const SRC = 'assets-src/hero-source.jpg';
mkdirSync('src/assets', { recursive: true });
mkdirSync('src/generated', { recursive: true });
const meta = await sharp(SRC).metadata();

const jobs = [
  ['src/assets/hero-m.webp', 1000, 'webp'],
  ['src/assets/hero-l.webp', 1600, 'webp'],
  ['src/assets/hero-m.jpg', 1000, 'jpg'],
];
for (const [out, w, fmt] of jobs) {
  const p = sharp(SRC).resize({ width: w, withoutEnlargement: true });
  // 质量调高：之前 80 会把平滑图压到 7KB（过度压缩→发糊）
  await (fmt === 'webp' ? p.webp({ quality: 86, effort: 5 }) : p.jpeg({ quality: 88, mozjpeg: true })).toFile(out);
  console.log(out, (statSync(out).size / 1024).toFixed(0) + ' KB');
}
const lq = await sharp(SRC).resize({ width: 24 }).blur(1).jpeg({ quality: 60 }).toBuffer();
const dataUri = 'data:image/jpeg;base64,' + lq.toString('base64');
writeFileSync('src/generated/hero-meta.json', JSON.stringify({
  width: meta.width, height: meta.height, lqip: dataUri,
}, null, 2));
// og 分享图（微信分享卡片缩略图，方形 300+）
await sharp(SRC).resize(600, 600, { fit: 'cover', position: 'centre' }).jpeg({ quality: 80 }).toFile('public/og.jpg');
console.log('LQIP bytes:', dataUri.length, ' og.jpg ok');
