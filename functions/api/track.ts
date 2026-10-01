/**
 * POST /api/track —— 记录一次页面访问（公开接口）。
 *
 * 隐私取舍：**不记录 IP、不存原始 User-Agent**。只按天聚合与路径维度统计，
 * UA 若需要则仅存加盐哈希。这足以支撑「访问量」看板，又避免收集可识别个人的数据。
 */
import { json, rateLimit, securityHeaders, type Env } from '../_shared';

export const onRequestPost: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  const headers = securityHeaders();
  if (!env.DB) return json({ ok: true }, 200, headers); // 未绑定时静默忽略，不影响前台

  if (!rateLimit(request, 'track', 60, 60_000)) {
    return json({ ok: true }, 200, headers); // 限流也静默成功，前台无需处理错误
  }

  // 只保留页面路径，不接收调用方传入的自由文本
  let path = '/';
  try {
    const ref = request.headers.get('Referer') ?? '';
    if (ref) path = new URL(ref).pathname.slice(0, 64);
  } catch {
    /* 忽略非法 Referer */
  }

  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)

  try {
    await env.DB.prepare('INSERT INTO view_event (path, day) VALUES (?, ?)').bind(path, day).run();
  } catch (err) {
    console.error('[track] insert failed', err);
  }
  return json({ ok: true }, 200, headers);
};

export const onRequest: (ctx: { request: Request }) => Promise<Response> = async () =>
  json({ ok: false, error: 'Method Not Allowed' }, 405, securityHeaders({ Allow: 'POST' }));