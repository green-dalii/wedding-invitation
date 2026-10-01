#!/usr/bin/env node
/**
 * 交互式配置向导：生成 .env（已被 .gitignore 忽略，不会进入仓库）。
 *
 *   npm run setup
 *
 * 所有回答仅写入本地 .env；仓库内只保留占位默认值（src/config/schema.ts）。
 */
import { writeFileSync, existsSync, renameSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env');
const EXAMPLE = join(ROOT, '.env.example');

/** 变量定义：[键, 提示, 默认值, 校验器] */
const FIELDS = [
  ['VITE_GROOM', '新郎姓名', '新郎', (v) => v.length > 0],
  ['VITE_BRIDE', '新娘姓名', '新娘', (v) => v.length > 0],
  ['VITE_DATE_TEXT', '婚礼日期（封面大号，如 2026.10.18）', '2026.10.18', () => true],
  ['VITE_WEEKDAY', '星期（如 星期日）', '星期日', () => true],
  ['VITE_TIME_TEXT', '入席时间（如 11:30 入席）', '11:30 入席', () => true],
  ['VITE_VENUE_NAME', '场地名称', '婚礼场地', (v) => v.length > 0],
  ['VITE_VENUE_ADDRESS', '详细地址', '', () => true],
  ['VITE_VENUE_LAT', '场地纬度（高德地图右键复制，gcj-02）', '30.2436', isNum],
  ['VITE_VENUE_LNG', '场地经度（高德地图右键复制，gcj-02）', '120.1536', isNum],
  ['VITE_VENUE_PHONE', '场地电话（可留空）', '', () => true],
  ['VITE_SITE_URL', '部署后的域名（可先留空，部署时再补）', '', () => true],
];

function isNum(v) {
  return v === '' || Number.isFinite(Number(v));
}

async function main() {
  if (!existsSync(EXAMPLE)) {
    console.error('✗ 找不到 .env.example，无法生成配置');
    process.exit(1);
  }

  // 已存在则先备份，避免覆盖用户已填内容
  if (existsSync(ENV_PATH)) {
    const bak = `${ENV_PATH}.bak`;
    renameSync(ENV_PATH, bak);
    console.log(`⚠️  已存在 .env，已备份为 .env.bak\n`);
  }

  if (stdin.isTTY) {
    console.log('╭──────────────────────────────────────────────╮');
    console.log('│  婚礼请柬配置向导                            │');
    console.log('╰──────────────────────────────────────────────╯');
    console.log('直接回车使用默认值；坐标可留空，部署前再补。\n');
  }

  // 非 TTY（管道 / CI）时答案可能在提问前就已到达而被丢弃，故预先整体读取
  const isTTY = Boolean(stdin.isTTY);
  let scripted = [];
  if (!isTTY) {
    stdin.setEncoding('utf8');
    let raw = '';
    for await (const chunk of stdin) raw += chunk;
    scripted = raw.split('\n').map((l) => l.trim());
  }

  const values = {};
  const rl = isTTY ? createInterface({ input: stdin, output: stdout }) : null;
  let cursor = 0;
  let pending = null;
  /**
   * rl.question 返回的 Promise 在 EOF 时永不 resolve（Node 会静默退出），
   * 因此监听 'close' 主动以空值放行。
   */
  rl?.on('close', () => {
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve('');
    }
  });
  const ask = () =>
    new Promise((resolve) => {
      if (!rl) return resolve(scripted[cursor++] ?? '');
      if (rl.closed) return resolve('');
      pending = resolve;
      rl.question('', (answer) => {
        if (pending === resolve) pending = null;
        resolve(answer.trim());
      });
    });

  for (const [key, prompt, fallback, validate] of FIELDS) {
    let answer;
    for (;;) {
      if (isTTY) process.stdout.write(`${prompt}\n  ${key} [${fallback || '留空'}]：`);
      answer = await ask();
      if (!answer) answer = fallback;
      if (validate(answer)) break;
      if (isTTY) console.log('  ⚠️  输入无效，请重试');
    }
    values[key] = answer;
  }
  rl?.close();

  // 写入实际值。注释指向 .env.example（不内嵌模板，避免变量重复定义）
  const body = Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const out = [
    '# 本文件由 `npm run setup` 生成，仅存于本地，已被 .gitignore 忽略。',
    '#',
    '# ⚠️ VITE_* 会被内联进网页产物，站点访问者可见。',
    '#    请勿在此放置密码、密钥等敏感凭据（请柬信息本身要给宾客看）。',
    '#',
    '# 未列出的变量（VITE_KICKER / VITE_CLOSING / VITE_HERO_FOCAL_X 等）',
    '# 将回落到 src/config/schema.ts 的占位默认值。',
    '# 完整变量说明与进阶用法见 .env.example。',
    '',
    body,
    '',
  ].join('\n');

  writeFileSync(ENV_PATH, out, 'utf8');
  console.log('\n✓ 已生成 .env');
  console.log('  下一步： npm run assets:hero   # 放入 assets-src/hero-source.jpg 后压缩主图');
  console.log('         npm run dev            # 本地预览');
  console.log('  部署前记得补全 VITE_SITE_URL 与场地坐标。');
}

main().catch((err) => {
  console.error('✗ 配置向导出错：', err.message);
  process.exit(1);
});
