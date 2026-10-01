/**
 * GET /api/stats —— 面板统计数据（**需登录**）。
 *
 * 返回：汇总卡片（访问总量 / 今日 / 回执数 / 到场人数）+ 每日访问折线数据 + 回执明细。
 */
import { assertConfigured, json, verifySession, securityHeaders, type Env } from '../_shared';

interface DailyRow {
  day: string;
  views: number;
}
interface RsvpRow {
  name: string;
  guests: number;
  message: string | null;
  created_at: string;
}

export const onRequestGet: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  const headers = securityHeaders();
  const missing = assertConfigured(env);
  if (missing) return json({ ok: false, error: missing }, 500, headers);

  if (!(await verifySession(request, env))) {
    return json({ ok: false, error: '未登录' }, 401, headers);
  }
  if (!env.DB) return json({ ok: false, error: '未绑定 D1 数据库' }, 500, headers);

  try {
    const [total, today, daily, rsvps, guestsSum, rsvpToday] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS n FROM view_event').first<{ n: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM view_event WHERE day = ?')
        .bind(new Date().toISOString().slice(0, 10)).first<{ n: number }>(),
      env.DB.prepare('SELECT day, COUNT(*) AS views FROM view_event GROUP BY day ORDER BY day ASC')
        .all<DailyRow>(),
      env.DB.prepare('SELECT name, guests, message, created_at FROM rsvp ORDER BY id DESC LIMIT 500')
        .all<RsvpRow>(),
      env.DB.prepare('SELECT COALESCE(SUM(guests), 0) AS n FROM rsvp').first<{ n: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM rsvp WHERE date(created_at) = date(\'now\')')
        .first<{ n: number }>(),
    ]);

    return json({
      ok: true,
      summary: {
        totalViews: total?.n ?? 0,
        todayViews: today?.n ?? 0,
        rsvpCount: rsvps.results.length,
        totalGuests: guestsSum?.n ?? 0,
        rsvpToday: rsvpToday?.n ?? 0,
      },
      daily: daily.results,
      rsvps: rsvps.results,
    }, 200, headers);
  } catch (err) {
    console.error('[stats] query failed', err);
    return json({ ok: false, error: '读取统计失败' }, 500, headers);
  }
};

/** 未认证的其他方法也走校验，避免绕过 */
export const onRequest: (ctx: { request: Request; env: Env }) => Promise<Response> = async ({ request, env }) => {
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'Method Not Allowed' }, 405, securityHeaders({ Allow: 'GET' }));
  }
  return json({ ok: false, error: '未登录' }, 401, securityHeaders());
};