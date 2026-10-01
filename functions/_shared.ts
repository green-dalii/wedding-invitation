/**
 * Pages Functions 共享工具：会话签名、限流、JSON 响应。
 *
 * ⚠️ 安全边界（务必理解后再改）：
 *   面板密码与会话密钥必须是**不带 VITE_ 前缀**的 Pages 环境变量/密钥。
 *   VITE_ 前缀的值会被 Vite 内联进公开的客户端 bundle，任何人查看网页源码
 *   即可读到 —— 用它做认证等于没有认证。
 */

/** 环境变量读取（Pages Functions 运行时通过 env 访问） */
export interface Env {
  /** 面板登录密码（明文或哈希，由部署者设置） */
  DASHBOARD_PASSWORD?: string;
  /** 会话签名密钥，建议 `openssl rand -hex 32` */
  SESSION_SECRET?: string;
  /** D1 绑定名，需与 wrangler 配置一致 */
  DB?: D1Database;
}

/** D1 类型（结构化声明，避免依赖 @cloudflare/workers-types） */
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
  all<T = unknown>(): Promise<{ results: T[] }>;
}

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 常数时间比较，避免时序侧信道 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export { timingSafeEqual };

/** HMAC-SHA256 签名 */
export async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(payload)));
}

export const SESSION_COOKIE = 'inv_session';
/** 会话有效期：8 小时 */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** 校验会话 Cookie；有效返回 true */
export async function verifySession(request: Request, env: Env): Promise<boolean> {
  const secret = env.SESSION_SECRET;
  if (!secret) return false;
  const token = parseCookies(request.headers.get('Cookie'))[SESSION_COOKIE];
  if (!token) return false;
  const [expStr, mac] = token.split('.');
  if (!expStr || !mac) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = await sign(expStr, secret);
  return timingSafeEqual(mac, expected);
}

/** 生成会话 Cookie 头 */
export async function sessionCookie(env: Env): Promise<string> {
  const exp = Date.now() + SESSION_TTL_MS;
  const mac = await sign(String(exp), env.SESSION_SECRET ?? '');
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${exp}.${mac}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/**
 * 固定窗口内存限流。Workers 实例可能随时重建，故这是「抬高门槛」而非严格限流；
 * 真正的防护还需 Cloudflare Rate Limiting 规则。
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): boolean {
  const ip =
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown';
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || now > cur.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  cur.count += 1;
  return cur.count <= limit;
}

export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

/** 统一的安全响应头 */
export function securityHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    ...extra,
  };
}

/** 读取并校验 JSON 请求体 */
export async function readJson<T>(request: Request, maxBytes = 4096): Promise<T | null> {
  const len = Number(request.headers.get('Content-Length') ?? 0);
  if (len > maxBytes) return null;
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** 环境自检：缺密钥时给出明确且可操作的报错，便于部署者自查 */
export function assertConfigured(env: Env): string | null {
  const hint =
    '请在 Cloudflare Pages → Settings → Environment variables → Encrypt 中配置' +
    '（本地开发请写入 .dev.vars）。面板无默认密码，未配置时拒绝服务。';
  if (!env.DASHBOARD_PASSWORD) return `未配置 DASHBOARD_PASSWORD。${hint}`;
  if (!env.SESSION_SECRET) return `未配置 SESSION_SECRET。${hint}`;
  return null;
}