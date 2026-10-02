/**
 * 配置解析器（纯函数，同构：浏览器与 Node/vite.config 通用）。
 *
 * 优先级（后者覆盖前者）：
 *   1. DEFAULTS          出厂占位值（入库，开源模板的一部分）
 *   2. VITE_SITE_JSON    整块 JSON 深合并 —— 用于数组（流程 / 交通）等复杂字段
 *   3. VITE_* 标量       单字段覆盖
 *
 * 所有 VITE_* 值在**构建期**被 Vite 内联进产物。这是刻意的：
 * 请柬内容本就属于「来访者可见」的公开信息，环境变量的作用是让真实信息
 * **只存在于使用者的部署环境（Cloudflare Pages Dashboard / 本地 .env），
 * 而不进入开源仓库的 Git 历史**。详见 README「隐私边界」一节。
 */
import { DEFAULTS, isHeroMode, type DeepPartial, type EnvRecord, type SiteConfig } from './schema';

/** 标量环境变量 → 配置路径 */
const SCALAR_ENV: ReadonlyArray<readonly [string, readonly string[], 'string' | 'number']> = [
  ['VITE_GROOM', ['wedding', 'groom'], 'string'],
  ['VITE_BRIDE', ['wedding', 'bride'], 'string'],
  ['VITE_DATE_ISO', ['wedding', 'dateISO'], 'string'],
  ['VITE_DATE_TEXT', ['wedding', 'dateText'], 'string'],
  ['VITE_WEEKDAY', ['wedding', 'weekday'], 'string'],
  ['VITE_TIME_TEXT', ['wedding', 'timeText'], 'string'],
  ['VITE_VENUE_NAME', ['venue', 'name'], 'string'],
  ['VITE_VENUE_ADDRESS', ['venue', 'address'], 'string'],
  ['VITE_VENUE_LAT', ['venue', 'lat'], 'number'],
  ['VITE_VENUE_LNG', ['venue', 'lng'], 'number'],
  ['VITE_VENUE_PHONE', ['venue', 'hotelPhone'], 'string'],
  ['VITE_KICKER', ['copy', 'kicker'], 'string'],
  ['VITE_CLOSING', ['copy', 'closing'], 'string'],
  ['VITE_GO_BUTTON', ['copy', 'goButton'], 'string'],
  ['VITE_HINT', ['copy', 'hint'], 'string'],
  ['VITE_HERO_FOCAL_X', ['hero', 'focal', 'x'], 'number'],
  ['VITE_HERO_FOCAL_Y', ['hero', 'focal', 'y'], 'number'],
  ['VITE_SITE_URL', ['siteUrl'], 'string'],
  ['VITE_TRANSIT_NOTE', ['transitNote'], 'string'],
  ['VITE_TRAVEL_TIP', ['travelTip'], 'string'],
  ['VITE_AMAP_KEY', ['amap', 'key'], 'string'],
  ['VITE_AMAP_SECURITY_CODE', ['amap', 'securityCode'], 'string'],
];

/** 数组字段专用变量（比整块 JSON 更好用）：单行 JSON 数组，整体替换 */
const ARRAY_ENV: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['VITE_HOWTOGET_JSON', ['howToGet']],
  ['VITE_SCHEDULE_JSON', ['schedule']],
  ['VITE_FLIGHTS_JSON', ['flights']],
];

/** 标量环境变量名清单（供文档与配置生成脚本复用，避免三处维护） */
export const SCALAR_ENV_KEYS: readonly string[] = SCALAR_ENV.map(([k]) => k);
export const ARRAY_ENV_KEYS: readonly string[] = ARRAY_ENV.map(([k]) => k);

/** Hero 交互模式变量（联合类型，需白名单校验，故不走 SCALAR_ENV） */
export const HERO_MODE_ENV = 'VITE_HERO_MODE';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 深合并：对象递归合并，**数组整体替换**（避免按下标错位合并） */
function merge<T>(base: T, patch: unknown): T {
  if (patch === undefined || patch === null) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? merge(base[k], v) : v;
  }
  return out as T;
}

function writePath(obj: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!isPlainObject(cur[key])) cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  cur[path[path.length - 1]] = value;
}

/** 把环境变量里的字符串转成目标类型；数字非法时忽略（不污染配置） */
function coerce(raw: string, kind: 'string' | 'number'): string | number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  if (kind === 'number') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return v;
}

/**
 * 解析最终配置。
 * @param env       环境变量字典（`import.meta.env` 或 Vite 的 `loadEnv(...)` 结果）
 * @param overrides 代码级覆盖（优先级最高，供测试与特殊场景使用）
 */
export function resolveSite(env: EnvRecord = {}, overrides?: DeepPartial<SiteConfig>): SiteConfig {
  let cfg: SiteConfig = structuredClone(DEFAULTS);

  // ① 整块 JSON
  const rawJson = env.VITE_SITE_JSON;
  if (typeof rawJson === 'string' && rawJson.trim()) {
    try {
      cfg = merge(cfg, JSON.parse(rawJson) as DeepPartial<SiteConfig>);
    } catch (err) {
      // 配置错误必须在构建期暴露，而不是静默用默认值
      throw new Error(`VITE_SITE_JSON 不是合法 JSON：${(err as Error).message}`);
    }
  }

  // ② 标量
  for (const [key, path, kind] of SCALAR_ENV) {
    const raw = env[key];
    if (typeof raw !== 'string') continue;
    const val = coerce(raw, kind);
    if (val !== undefined) writePath(cfg as unknown as Record<string, unknown>, path, val);
  }

  // ②b 数组字段专用变量（必须是数组，否则报错而不是静默忽略）
  for (const [key, path] of ARRAY_ENV) {
    const raw = env[key];
    if (typeof raw !== 'string' || !raw.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`${key} 不是合法 JSON：${(err as Error).message}`);
    }
    if (!Array.isArray(parsed)) throw new Error(`${key} 必须是 JSON 数组，如 [{"title":"自驾"}]`);
    writePath(cfg as unknown as Record<string, unknown>, path, parsed);
  }

  // ②c 交互模式：联合类型，需白名单校验。
  // 拼错时**回退默认而不是抛错** —— 线上不该因为一个多余空格就白屏。
  const rawMode = env[HERO_MODE_ENV];
  if (typeof rawMode === 'string' && rawMode.trim()) {
    const m = rawMode.trim().toLowerCase();
    if (isHeroMode(m)) cfg.hero.mode = m;
    else console.warn(`[config] ${HERO_MODE_ENV}="${rawMode}" 不是 sand|soft|none，已回退 "${cfg.hero.mode}"`);
  }

  // ③ 代码级覆盖
  if (overrides) cfg = merge(cfg, overrides);

  // ④ 派生字段：title / description 始终跟随内容，避免第二处硬编码
  const { wedding, copy, siteUrl } = cfg;
  const base = siteUrl.replace(/\/$/, '');
  cfg.siteUrl = base;
  cfg.title = `${wedding.groom} & ${wedding.bride} · 婚礼请柬`;
  cfg.description = `${wedding.dateText} · ${copy.kicker}`;

  return cfg;
}
