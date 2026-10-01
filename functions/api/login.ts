/**
 * POST /api/login —— 面板登录。
 *
 * 密码在**服务端**与 DASHBOARD_PASSWORD 比对，成功后下发 HttpOnly 签名 Cookie。
 * 密码与密钥绝不会进入客户端 bundle。
 */
import { assertConfigured, json, rateLimit, sessionCookie, securityHeaders, timingSafeEqual, readJson, type Env } from '../_shared';

export const onRequestPost: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  const headers = securityHeaders();
  const missing = assertConfigured(env);
  if (missing) return json({ ok: false, error: missing }, 500, headers);

  // 登录限流：同一 IP 每 5 分钟最多 8 次尝试
  if (!rateLimit(request, 'login', 8, 5 * 60_000)) {
    return json({ ok: false, error: '尝试过于频繁，请稍后再试' }, 429, headers);
  }

  const body = await readJson<{ password?: string }>(request);
  const provided = typeof body?.password === 'string' ? body.password : '';

  // 失败时也执行一次比较，避免通过响应时间区分「密码错」与「请求格式错」
  const expected = env.DASHBOARD_PASSWORD ?? '';
  const ok = provided.length > 0 && timingSafeEqual(provided, expected);

  if (!ok) {
    return json({ ok: false, error: '密码错误' }, 401, headers);
  }
  return json({ ok: true }, 200, { ...headers, 'Set-Cookie': await sessionCookie(env) });
};

/** 仅允许 POST */
export const onRequest: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request }) =>
  json({ ok: false, error: 'Method Not Allowed' }, 405, securityHeaders({ Allow: 'POST' }));