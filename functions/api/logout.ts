/**
 * POST /api/logout —— 清除会话。
 */
import { clearSessionCookie, json, securityHeaders, verifySession, type Env } from '../_shared';

export const onRequestPost: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  const headers = securityHeaders();
  if (!(await verifySession(request, env))) {
    return json({ ok: false, error: '未登录' }, 401, headers);
  }
  return json({ ok: true }, 200, { ...headers, 'Set-Cookie': clearSessionCookie() });
};

export const onRequest: (ctx: { request: Request }) => Promise<Response> = async () =>
  json({ ok: false, error: 'Method Not Allowed' }, 405, securityHeaders({ Allow: 'POST' }));