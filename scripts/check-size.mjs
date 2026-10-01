/** 构建产物体积校验（SPEC §12.1）：入口 JS ≤30KB gz、CSS ≤8KB gz、hero 图 ≤200KB */
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
let failed = false;
const fail = (msg) => { console.error('FAIL:', msg); failed = true; };

let jsTotal = 0;
for (const [, f] of html.matchAll(/src="(\/[^"]+\.js)"/g)) {
  const gz = gzipSync(readFileSync(join(dist, f.slice(1)))).length;
  jsTotal += gz;
  console.log('JS  ', f, '→ gzip', kb(gz));
}
for (const [, f] of html.matchAll(/href="(\/[^"]+\.css)"/g)) {
  const gz = gzipSync(readFileSync(join(dist, f.slice(1)))).length;
  console.log('CSS ', f, '→ gzip', kb(gz));
  if (gz > 8 * 1024) fail(`CSS gzip ${kb(gz)} > 8 KB`);
}
console.log('入口 JS 合计 gzip', kb(jsTotal));
if (jsTotal > 30 * 1024) fail(`入口 JS gzip ${kb(jsTotal)} > 30 KB`);

for (const f of readdirSync(join(dist, 'assets'))) {
  if (/hero-/.test(f)) {
    const size = readFileSync(join(dist, 'assets', f)).length;
    console.log('IMG ', f, '→', kb(size));
    if (size > 200 * 1024) fail(`hero 图 ${f} ${kb(size)} > 200 KB`);
  }
}

if (failed) process.exit(1);
console.log('SIZE OK');
