/**
 * POST /api/rsvp —— 宾客回执写入 D1（公开接口）。
 *   body: { name: string, guests: number, message?: string }
 */
import { json, rateLimit, securityHeaders, readJson, type Env } from '../_shared';

const MAX_NAME = 40;
const MAX_MSG = 200;

export const onRequestPost: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  const headers = securityHeaders();
  if (!env.DB) return json({ ok: false, error: '未绑定 D1 数据库' }, 500, headers);

  // 每 IP 每小时最多 20 次，防止刷库
  if (!rateLimit(request, 'rsvp', 20, 60 * 60_000)) {
    return json({ ok: false, error: '提交过于频繁，请稍后再试' }, 429, headers);
  }

  const body = await readJson<{ name?: string; guests?: number; message?: string }>(request);
  const name = (body?.name ?? '').trim().slice(0, MAX_NAME);
  if (!name) return json({ ok: false, error: '请填写姓名' }, 400, headers);

  // 人数：整数 1~20，非法值回落为 1
  const raw = Number(body?.guests);
  const guests = Number.isFinite(raw) ? Math.min(20, Math.max(1, Math.round(raw))) : 1;
  const message = (body?.message ?? '').trim().slice(0, MAX_MSG) || null;

  try {
    await env.DB
      .prepare('INSERT INTO rsvp (name, guests, message) VALUES (?, ?, ?)')
      .bind(name, guests, message)
      .run();
  } catch (err) {
    console.error('[rsvp] insert failed', err);
    return json({ ok: false, error: '保存失败，请稍后再试' }, 500, headers);
  }

  return json({ ok: true }, 200, headers);
};

export const onRequest: (ctx: { request: Request }) => Promise<Response> = async () =>
  json({ ok: false, error: 'Method Not Allowed' }, 405, securityHeaders({ Allow: 'POST' }));