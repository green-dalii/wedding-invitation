/**
 * 高德 JS API 懒加载（约数百 KB，在高德 CDN 上，不进本站产物）。
 *
 * 仅在配置了 VITE_AMAP_KEY 时由 details.ts 调用，且滚动接近「地点」板块
 * 才开始加载 —— 不拖累首屏。加载或初始化失败一律静默移除容器，
 * 保留原有的导航链接，不影响宾客获取地址信息。
 *
 * 凭据说明：JS API 的 key 属公开凭据（靠域名白名单限权），安全密钥
 * securityJsCode 需在前端设置 —— 这是高德 2.0 的既定接入方式，
 * 两者均由使用者的 .env / Pages 加密变量注入，不入库。
 */
interface AMapNS {
  Map: new (el: HTMLElement, opts: { zoom: number; center: [number, number]; viewMode?: string }) => unknown;
  Marker: new (opts: { position: [number, number]; title?: string; map?: unknown }) => unknown;
}

declare global {
  interface Window {
    _AMapSecurityConfig?: { securityJsCode: string };
    AMap?: AMapNS;
  }
}

export function initAmapEmbed(
  container: HTMLElement,
  opts: { lng: number; lat: number; title: string; key: string; securityCode: string },
): void {
  let started = false;

  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting) && !started) {
        started = true;
        io.disconnect();
        void load();
      }
    },
    { rootMargin: '240px' },
  );
  io.observe(container);

  function fail(): void {
    container.closest('.amap-box')?.remove();
  }

  async function load(): Promise<void> {
    try {
      if (opts.securityCode) {
        window._AMapSecurityConfig = { securityJsCode: opts.securityCode };
      }
      await inject(`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(opts.key)}`, 9000);
      const AMap = window.AMap;
      if (!AMap) return fail();
      const map = new AMap.Map(container, { zoom: 15, center: [opts.lng, opts.lat], viewMode: '2D' });
      new AMap.Marker({ position: [opts.lng, opts.lat], title: opts.title, map });
      container.closest('.amap-box')?.querySelector('.amap-tip')?.remove();
    } catch {
      fail();
    }
  }

  function inject(src: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const timer = window.setTimeout(() => {
        s.remove();
        reject(new Error('amap timeout'));
      }, timeoutMs);
      s.src = src;
      s.async = true;
      s.onload = () => {
        window.clearTimeout(timer);
        resolve();
      };
      s.onerror = () => {
        window.clearTimeout(timer);
        s.remove();
        reject(new Error('amap script error'));
      };
      document.head.appendChild(s);
    });
  }
}