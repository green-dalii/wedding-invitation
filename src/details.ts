/** 下方信息区（SPEC §9）：时间 / 地点 / 如何前往 / 流程 / 回执 / 结语。内容来自 site.config */
import { site, copy } from './config';
import { initAmapEmbed } from './amap';
import { celebrate } from './confetti';

/** 直达航班卡片（与「自驾」同款；仅当 VITE_FLIGHTS_JSON 有数据时渲染，SPEC §9） */
function renderFlights(cities: import('./config/schema').FlightCity[]): string {
  return `
        <div class="get-item reveal">
          <div class="ic">✈️</div>
          <div>
            <h3>飞机</h3>
            <p>以下城市有直达航班 ✈️</p>
            <div class="chips">
              ${cities.map((c) => `<span class="chip"><b>${c.city}</b><i>${c.days}</i></span>`).join('')}
            </div>
          </div>
        </div>`;
}

/** 其他城市中转卡片（与「自驾」同款） */
function renderTransit(note: string): string {
  return `
        <div class="get-item reveal">
          <div class="ic">🚄</div>
          <div>
            <h3>其他城市</h3>
            <p>${note}</p>
          </div>
        </div>`;
}

/** 小贴士（阳光气候 + 顺路旅游），置于交通之后（SPEC §9） */
function renderTip(tip: string): string {
  return `
        <div class="get-item tip reveal">
          <div class="ic">💡</div>
          <div>
            <h3>一点小贴士</h3>
            <p>${tip}</p>
          </div>
        </div>`;
}

function daysUntil(): string {
  const target = new Date(site.dateISO).getTime();
  const now = Date.now();
  const days = Math.ceil((target - now) / 86400000);
  if (days > 1) return `距离婚礼还有 <b>${days}</b> 天`;
  if (days === 1) return '就是 <b>明天</b>';
  if (days === 0) return '<b>今天</b>，我们结婚啦';
  return '婚礼已举行，感谢你的见证';
}

function mapLinks(): string {
  const { name, address, lat, lng } = site.venue;
  const amap = `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(name)}&coordinate=gaode&callnative=1`;
  const qq = `https://apis.map.qq.com/uri/v1/marker?marker=coord:${lat},${lng};title:${encodeURIComponent(name)};addr:${encodeURIComponent(address)}&referer=wedding`;
  return `
    <a class="btn primary" href="${amap}" target="_blank" rel="noopener">高德地图导航</a>
    <a class="btn" href="${qq}" target="_blank" rel="noopener">腾讯地图导航</a>
    <button class="btn" type="button" id="copy-addr">复制地址</button>`;
}

export function renderDetails(root: HTMLElement): void {
  if (root.childElementCount > 0) return;
  root.innerHTML = `
  <section class="sec">
    <div class="sec-inner">
      <h2 class="sec-title">时间</h2>
      <p class="sec-sub">Time</p>
      <div class="reveal">
        <div class="count-big">${site.dateText}</div>
        <p class="count-note">${site.weekday} · ${site.timeText}</p>
        <p class="count-note lunar">${__LUNAR__}</p>
        <p class="count-note">${daysUntil()}</p>
      </div>
    </div>
  </section>

  <section class="sec alt">
    <div class="sec-inner">
      <h2 class="sec-title">地点</h2>
      <p class="sec-sub">Venue</p>
      <div class="venue-card reveal">
        <h3 class="venue-name">${site.venue.name}</h3>
        <p class="venue-addr">${site.venue.address}</p>
        <div class="venue-actions">${mapLinks()}</div>
          ${site.amap.key ? `<div class="amap-box reveal"><div id="amap-map" aria-label="婚礼场地地图"></div><p class="amap-tip">地图加载中…</p></div>` : ''}
      </div>
    </div>
  </section>

  <section class="sec">
    <div class="sec-inner">
      <h2 class="sec-title">如何前往</h2>
      <p class="sec-sub">How to get there</p>
      <div class="get-grid">
        ${site.howToGet.map((g, i) => `
        <div class="get-item reveal" style="transition-delay:${i * 60}ms">
          <div class="ic">${g.icon.trim() ? g.icon : '·'}</div>
          <div><h3>${g.title}</h3><p>${g.text}</p></div>
        </div>`).join('')}
        ${site.flights.length ? renderFlights(site.flights) : ''}
        ${site.transitNote ? renderTransit(site.transitNote) : ''}
        ${site.travelTip ? renderTip(site.travelTip) : ''}
      </div>
    </div>
  </section>

  <section class="sec alt">
    <div class="sec-inner">
      <h2 class="sec-title">当日流程</h2>
      <p class="sec-sub">Schedule</p>
      <ul class="timeline">
        ${site.schedule.map((s) => `
        <li class="reveal">
          <div class="tl-time">${s.time}</div>
          <h3 class="tl-title">${s.title}</h3>
          <p class="tl-text">${s.text}</p>
        </li>`).join('')}
      </ul>
    </div>
  </section>

  <section class="sec">
    <div class="sec-inner">
      <h2 class="sec-title">宾客回执</h2>
      <p class="sec-sub">RSVP</p>
      <form class="rsvp reveal" id="rsvp-form" novalidate>
        <label class="fld">
          <span class="lbl">您的姓名 <i>*</i></span>
          <input class="inp" name="name" type="text" maxlength="40" required autocomplete="name" placeholder="请输入姓名或称呼" />
        </label>
        <label class="fld">
          <span class="lbl">出席人数</span>
          <div class="stepper">
            <button class="stp" type="button" data-step="-1" aria-label="减少人数">−</button>
            <input class="inp num" name="guests" type="number" min="1" max="20" value="1" inputmode="numeric" aria-label="出席人数" />
            <button class="stp" type="button" data-step="1" aria-label="增加人数">＋</button>
          </div>
        </label>
        <label class="fld">
          <span class="lbl">给我们的话</span>
          <textarea class="inp" name="message" rows="3" maxlength="200" placeholder="祝福或留言（选填）"></textarea>
        </label>
        <button class="btn rsvp-submit" type="submit"><span class="rsvp-btn-txt">我要出席</span></button>
        <p class="rsvp-msg" id="rsvp-msg" role="status" aria-live="polite"></p>
      </form>
    </div>
  </section>

  <section class="closing">
    <div class="reveal">
      <div class="c-line"></div>
      <p class="c-text">${copy.closing}</p>
      <p class="c-names">${site.couple.groom} &amp; ${site.couple.bride}</p>
      <p class="made-by">Made with care by
        <a class="made-link" href="https://greenerdalii.top" target="_blank" rel="noopener noreferrer">Greener-Dalii<span class="made-arrow" aria-hidden="true">↗</span></a>
      </p>
      <button class="btn back-inline" type="button" onclick="window.scrollTo({top:0,behavior:'smooth'})">回到封面</button>
    </div>
  </section>`;

  // 复制地址
  const copyBtn = root.querySelector<HTMLButtonElement>('#copy-addr');
  copyBtn?.addEventListener('click', async () => {
    const text = site.venue.address;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast('地址已复制');
  });

  initRsvp(root);

  // 高德地图懒加载（仅在配置了 VITE_AMAP_KEY 时渲染容器）
  const mapEl = root.querySelector<HTMLElement>('#amap-map');
  if (mapEl && site.amap.key) {
    initAmapEmbed(mapEl, {
      lng: site.venue.lng,
      lat: site.venue.lat,
      title: site.venue.name,
      key: site.amap.key,
      securityCode: site.amap.securityCode,
    });
  }

  // 访问统计：先探测 /api/ping 是否可用（纯静态托管下不存在 Functions）。
  // 探测只做一次并缓存结果；未部署时完全不再发起请求，
  // 否则每次 404 都会污染控制台并触发 E2E 的“无错误”断言。
  let apiAvailable: boolean | null = null;
  function trackView(): void {
    if (apiAvailable === false) return;
    if (apiAvailable === null) {
      apiAvailable = false;
      void fetch('/api/ping', { method: 'GET', keepalive: true })
        .then(async (res) => {
          // SPA 回退下未部署的 /api/ping 会返回 200 HTML（首页），故必须校验内容。
          const ctype = res.headers.get('Content-Type') ?? '';
          if (!res.ok || !ctype.includes('application/json')) {
            apiAvailable = false;
            return;
          }
          const data = (await res.json()) as { service?: string };
          if (data.service !== 'wedding-invitation') {
            apiAvailable = false;
            return;
          }
          apiAvailable = true;
          void fetch('/api/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
            keepalive: true,
          }).catch(() => {});
        })
        .catch(() => {});
      return;
    }
    void fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      keepalive: true,
    }).catch(() => {});
  }
  trackView();

  // 入场动画
  const els = root.querySelectorAll<HTMLElement>('.reveal');
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      }
    }, { threshold: 0.15 });
    els.forEach((el) => io.observe(el));
  } else {
    els.forEach((el) => el.classList.add('in'));
  }
}

let toastEl: HTMLElement | null = null;
let toastTimer = 0;

function showToast(msg: string): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  requestAnimationFrame(() => toastEl!.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl!.classList.remove('show'), 1600);
}

/**
 * 宾客回执表单（SPEC §12）。
 * 后端为 Cloudflare Pages Functions + D1（functions/api/rsvp.ts）。
 * 本地 `vite dev` 没有 Functions，提交会 404 —— 此时给出明确提示而非静默失败。
 */
function initRsvp(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('#rsvp-form');
  const msg = root.querySelector<HTMLElement>('#rsvp-msg');
  if (!form || !msg) return;

  const num = form.querySelector<HTMLInputElement>('input[name="guests"]');

  // 人数步进
  form.querySelectorAll<HTMLButtonElement>('.stp').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!num) return;
      const next = (Number(num.value) || 1) + Number(btn.dataset.step ?? '0');
      num.value = String(Math.min(20, Math.max(1, next)));
      num.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });

  const say = (text: string, ok: boolean) => {
    msg.textContent = text;
    msg.classList.toggle('err', !ok);
    msg.classList.toggle('ok', ok);
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') ?? '').trim();
    if (!name) return say('请填写您的姓名', false);

    const btn = form.querySelector<HTMLButtonElement>('.rsvp-submit');
    if (btn && !btn.classList.contains('done')) { btn.disabled = true; btn.textContent = '提交中…'; }
    say('正在提交…', true);

    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          guests: Number(num?.value ?? 1),
          message: String(data.get('message') ?? '').trim(),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !json.ok) {
        // 本地开发无 Functions → 404；给出可操作提示
        if (res.status === 404) {
          say('当前环境未接入数据库（本地开发）。请用 wrangler pages dev 启动以保存回执。', false);
        } else {
          say(json.error ?? '提交失败，请稍后再试', false);
        }
        return;
      }

      form.reset();
      if (num) num.value = '1';
      // 仪式感：一笔勾 + 一句话收尾 + 彩带（克制：莫兰迪配色，非彩虹）
      const btn = form.querySelector<HTMLButtonElement>('.rsvp-submit');
      if (btn) {
        btn.classList.add('done');
        btn.innerHTML = `
          <svg class="rsvp-check" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4.5 12.5l5 5 10-11" />
          </svg>
          <span>已收到，等你入席</span>`;
        celebrate();
      }
      say('如需更改人数或行程，随时告诉我们。', true);
    } catch {
      say('网络异常，请检查连接后重试', false);
    } finally {
      if (btn && !btn.classList.contains('done')) {
        btn.disabled = false;
        btn.innerHTML = `<span class="rsvp-btn-txt">我要出席</span>`;
      }
    }
  });
}
