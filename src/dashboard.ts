/**
 * 请柬面板 `/dashboard`（SPEC §13）。
 *
 * 认证模型（关键）：
 *   密码与签名密钥是**非 VITE_ 前缀**的 Pages 密钥，只存在于服务端。
 *   浏览器端永远拿不到密码，只能把输入发给 /api/login 校验；
 *   成功后由服务端下发 HttpOnly 签名 Cookie，前端 JS 无法读取。
 *   ⚠️ 切勿把密码写进 VITE_* —— 那会被内联进公开 bundle，认证即刻失效。
 */
import './style.css';

interface Summary {
  totalViews: number;
  todayViews: number;
  rsvpCount: number;
  totalGuests: number;
  rsvpToday: number;
}
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
interface StatsResponse {
  ok: boolean;
  error?: string;
  summary?: Summary;
  daily?: DailyRow[];
  rsvps?: RsvpRow[];
}

const root = document.getElementById('dash-root')!;
const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const fmtDay = (day: string): string => day.slice(5); // MM-DD

async function api<T>(url: string, init?: RequestInit): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({ ok: false, error: '响应解析失败' }))) as T;
  return { status: res.status, data };
}

/** 登录表单 */
function renderLogin(err = ''): void {
  root.innerHTML = `
    <div class="dash">
      <div class="login">
        <h1 class="dash-title">请柬面板</h1>
        <p class="dash-err" id="err">${esc(err)}</p>
        <form id="login-form">
          <input class="inp" id="pwd" type="password" autocomplete="current-password"
                 placeholder="面板密码" aria-label="面板密码" />
          <button class="btn" type="submit" style="width:100%">进入</button>
        </form>
        <p class="hint" style="margin-top:14px;font-size:12px;color:var(--ink-3)">
          密码由部署者在 Cloudflare Pages 环境变量 <code>DASHBOARD_PASSWORD</code> 中设置。
        </p>
      </div>
    </div>`;

  root.querySelector<HTMLFormElement>('#login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pwd = (root.querySelector<HTMLInputElement>('#pwd')?.value ?? '').trim();
    const btn = root.querySelector<HTMLButtonElement>('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = '验证中…'; }
    try {
      const { status, data } = await api<{ ok: boolean; error?: string }>('/api/login', {
        method: 'POST',
        body: JSON.stringify({ password: pwd }),
      });
      if (data.ok) {
        location.reload();
        return;
      }
      renderLogin(status === 401 ? '密码错误' : (data.error ?? '登录失败'));
    } catch {
      renderLogin('网络异常；若为本地开发，请用 wrangler pages dev 启动');
    }
  });
}

/** 纯 SVG 柱状图（无第三方依赖） */
function renderChart(daily: DailyRow[]): string {
  if (!daily.length) return `<p class="empty-note">暂无访问数据</p>`;

  const W = 760;
  const H = 140;
  const pad = 22;
  const n = daily.length;
  const max = Math.max(...daily.map((d) => d.views), 1);
  const gap = 3;
  const bw = Math.max(3, Math.min(28, (W - pad * 2) / n - gap));
  const step = (W - pad * 2) / n;

  const bars = daily
    .map((d, i) => {
      const h = Math.max(2, ((H - pad * 2) * d.views) / max);
      const x = pad + i * step + (step - bw) / 2;
      const y = H - pad - h;
      return `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}"
                    width="${bw.toFixed(1)}" height="${h.toFixed(1)}">
                <title>${esc(d.day)}：${d.views} 次</title>
              </rect>`;
    })
    .join('');

  // x 轴标签：最多 6 个，避免拥挤
  const labels = daily
    .map((d, i) => ({ i, t: fmtDay(d.day) }))
    .filter(({ i }) => n <= 6 || i % Math.ceil(n / 6) === 0)
    .map(({ i, t }) => {
      const x = pad + i * step + step / 2;
      return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(t)}</text>`;
    })
    .join('');

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="每日访问量">
    <line class="axis" x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" />
    ${bars}${labels}
  </svg>`;
}

function renderDash(s: Summary, daily: DailyRow[], rsvps: RsvpRow[]): void {
  const tiles: Array<[string, number]> = [
    ['总访问量', s.totalViews],
    ['今日访问', s.todayViews],
    ['回执份数', s.rsvpCount],
    ['预计到场', s.totalGuests],
    ['今日回执', s.rsvpToday],
  ];

  root.innerHTML = `
    <div class="dash">
      <div class="dash-head">
        <h1 class="dash-title">请柬面板</h1>
        <button class="btn" id="logout" type="button" style="padding:8px 16px;font-size:13px">退出</button>
      </div>

      <div class="tiles">
        ${tiles.map(([k, v]) => `<div class="tile"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`).join('')}
      </div>

      <section class="panel">
        <h2>每日访问量</h2>
        <p class="hint">仅统计页面路径与日期，不记录 IP 与设备指纹</p>
        ${renderChart(daily)}
      </section>

      <section class="panel">
        <h2>回执明细</h2>
        <p class="hint">共 ${rsvps.length} 份（最多显示最近 500 条）</p>
        ${
          rsvps.length === 0
            ? `<p class="empty-note">还没有宾客提交回执</p>`
            : `<div class="scroll-x"><table class="dtable">
                 <thead><tr><th>姓名</th><th>人数</th><th>留言</th><th>提交时间</th></tr></thead>
                 <tbody>${rsvps
                   .map(
                     (r) => `<tr>
                       <td>${esc(r.name)}</td>
                       <td class="num">${r.guests}</td>
                       <td class="msg">${esc(r.message ?? '—')}</td>
                       <td>${esc(r.created_at)}</td>
                     </tr>`,
                   )
                   .join('')}</tbody>
               </table></div>`
        }
      </section>

      <p class="made-by">Made with care by
        <a class="made-link" href="https://greenerdalii.top" target="_blank" rel="noopener noreferrer">Greener-Dalii<span class="made-arrow" aria-hidden="true">↗</span></a>
      </p>
    </div>`;

  root.querySelector<HTMLButtonElement>('#logout')?.addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST', body: '{}' }).catch(() => {});
    location.reload();
  });
}

async function boot(): Promise<void> {
  const { status, data } = await api<StatsResponse>('/api/stats');
  if (data.ok && data.summary && data.daily && data.rsvps) {
    renderDash(data.summary, data.daily, data.rsvps);
  } else if (status === 401) {
    renderLogin();
  } else {
    root.innerHTML = `<div class="dash"><p class="empty-note">${esc(data.error ?? '加载失败')}</p></div>`;
  }
}

void boot().catch(() => renderLogin('加载失败；若为本地开发，请用 wrangler pages dev 启动'));