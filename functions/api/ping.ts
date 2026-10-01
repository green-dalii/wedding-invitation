/**
 * GET /api/ping —— 轻量存活探测。
 * 前端用它判断当前部署是否包含 Pages Functions；
 * 不存在时（纯静态托管）前端便完全不再发起统计请求，避免 404 噪音。
 */
import { json, securityHeaders } from '../_shared';

export const onRequestGet: () => Response = () =>
  json({ ok: true, service: 'wedding-invitation', time: new Date().toISOString() }, 200, securityHeaders());

export const onRequest: () => Response = () =>
  json({ ok: false, error: 'Method Not Allowed' }, 405, securityHeaders({ Allow: 'GET' }));