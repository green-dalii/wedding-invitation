/// <reference types="vite/client" />

/**
 * 请柬配置环境变量（构建期注入）。
 * 全部为 `VITE_` 前缀 —— 会被内联进客户端产物，属于**公开**内容，
 * 作用是让真实信息不进入 Git 仓库，而非对访问者保密。详见 README。
 */
interface ImportMetaEnv {
  readonly VITE_GROOM?: string;
  readonly VITE_BRIDE?: string;
  readonly VITE_DATE_ISO?: string;
  readonly VITE_DATE_TEXT?: string;
  readonly VITE_WEEKDAY?: string;
  readonly VITE_TIME_TEXT?: string;
  readonly VITE_VENUE_NAME?: string;
  readonly VITE_VENUE_ADDRESS?: string;
  readonly VITE_VENUE_LAT?: string;
  readonly VITE_VENUE_LNG?: string;
  readonly VITE_VENUE_PHONE?: string;
  readonly VITE_KICKER?: string;
  readonly VITE_CLOSING?: string;
  readonly VITE_GO_BUTTON?: string;
  readonly VITE_HINT?: string;
  /** Hero 交互模式：sand（沙砾，默认）| soft（软胶）。非法值回退默认 */
  readonly VITE_HERO_MODE?: string;
  readonly VITE_HERO_FOCAL_X?: string;
  readonly VITE_HERO_FOCAL_Y?: string;
  /** 整块 JSON 覆盖（用于流程 / 交通等数组字段） */
  readonly VITE_SITE_JSON?: string;
  /** 部署后的绝对地址，用于 og:url 与分享图 */
  readonly VITE_SITE_URL?: string;
  /** 其他城市中转建议，以「其他城市」卡片展示 */
  readonly VITE_TRANSIT_NOTE?: string;
  /** 小贴士：阳光气候与顺路旅游建议 */
  readonly VITE_TRAVEL_TIP?: string;
  /** 高德 JS API key（公开凭据，靠域名白名单限权） */
  readonly VITE_AMAP_KEY?: string;
  /** 高德 JS API 安全密钥（与 key 配套） */
  readonly VITE_AMAP_SECURITY_CODE?: string;
  /** 直达航班信息（JSON 数组，整体替换 flights） */
  readonly VITE_FLIGHTS_JSON?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** 构建期由 vite.config.ts 注入的农历文案（详见 vite.config.ts 的 define） */
declare const __LUNAR__: string;
