/**
 * 请柬配置的**类型定义与出厂默认值**。
 *
 * ⚠️ 本文件是开源模板的一部分，必须保持「占位内容」，不得写入真实姓名/地址/时间。
 *    使用者的真实信息通过**构建期环境变量**注入（见 resolve.ts 与 README），
 *    从而不会进入 Git 仓库历史。
 */

/** 双方与时间 */
export interface WeddingInfo {
  groom: string;
  bride: string;
  /** ISO 8601，用于倒计时；含时区偏移 */
  dateISO: string;
  /** 封面大号日期，如 2026.10.18 */
  dateText: string;
  /** 星期，如 星期日 */
  weekday: string;
  /** 入席时间文案，如 11:30 入席 */
  timeText: string;
}

/** 场地。坐标为 gcj-02（高德/腾讯地图通用），用于「一键导航」 */
export interface VenueInfo {
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** 场地联系电话（可空） */
  hotelPhone: string;
}

/** 界面文案 */
export interface CopyInfo {
  /** 封面副标题 */
  kicker: string;
  /** 结语 */
  closing: string;
  /** 封面按钮 */
  goButton: string;
  /** 交互提示 */
  hint: string;
}

/** 封面图裁切焦点（0~1，CSS object-position 语义） */
export interface HeroInfo {
  focal: { x: number; y: number };
}

export interface ScheduleItem {
  time: string;
  title: string;
  text: string;
}

export interface HowToGetItem {
  icon: string;
  title: string;
  text: string;
}

/** 直达航班：只保留展示所需的最小字段（城市 + 班期） */
export interface FlightCity {
  city: string;
  /** 班期，如「每日一班」「每周一、三、五、日」 */
  days: string;
}

/** 高德 JS API 凭据（key 本身公开，靠域名白名单限权；不入库） */
export interface AmapInfo {
  key: string;
  securityCode: string;
}

/** 完整站点配置 */
export interface SiteConfig {
  wedding: WeddingInfo;
  venue: VenueInfo;
  copy: CopyInfo;
  hero: HeroInfo;
  howToGet: HowToGetItem[];
  schedule: ScheduleItem[];
  /** 直达航班（为空则不渲染该板块） */
  flights: FlightCity[];
  /** 其他城市中转建议（为空则不渲染） */
  transitNote: string;
  /** 小贴士：阳光与顺路旅游（为空则不渲染） */
  travelTip: string;
  /** 高德地图嵌入凭据（未配置 key 时不渲染地图，只保留导航链接） */
  amap: AmapInfo;
  /** 部署后的绝对地址，用于 og:url / 微信分享图；本地留空 */
  siteUrl: string;
  /** <title> 与 og:title，由 wedding + copy 派生 */
  title: string;
  /** meta description 与 og:description */
  description: string;
}

/** 递归可选类型（用于局部覆盖 / JSON 注入） */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly (infer U)[]
    ? U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

/** 环境变量字典（未定义的键一律忽略） */
export type EnvRecord = Record<string, string | boolean | undefined>;

/** 出厂默认值 —— 开源模板请保持占位内容 */
export const DEFAULTS: SiteConfig = {
  wedding: {
    groom: '新郎',
    bride: '新娘',
    dateISO: '2026-10-18T11:30:00+08:00',
    dateText: '2026.10.18',
    weekday: '星期日',
    timeText: '11:30 入席',
  },
  venue: {
    name: '婚礼场地',
    address: '请在此填写详细地址',
    lat: 30.2436,
    lng: 120.1536,
    hotelPhone: '',
  },
  copy: {
    kicker: '诚邀您见证我们的婚礼',
    closing: '期待与你相见',
    goButton: '查看详情',
    hint: '哈哈镜~来戳我',
  },
  hero: { focal: { x: 0.5, y: 0.4 } },
  howToGet: [
    { icon: '🚗', title: '自驾', text: '导航至婚礼场地，凭请柬免费停车。' },
    { icon: '🚇', title: '地铁', text: '请填写地铁线路与步行距离。' },
    { icon: '🚄', title: '高铁', text: '请填写到达车站与交通方式。' },
    { icon: '🅿️', title: '停车', text: '请填写停车位置与车位信息。' },
  ],
  flights: [],
  transitNote: '',
  travelTip: '',
  amap: { key: '', securityCode: '' },
  schedule: [
    { time: '11:00', title: '迎宾签到', text: '签到台领取伴手礼' },
    { time: '11:30', title: '午宴入席', text: '请按桌号就座' },
    { time: '12:08', title: '婚礼仪式', text: '诚邀您一同见证' },
    { time: '13:00', title: '午宴开席', text: '佳肴与祝福，都不辜负' },
  ],
  siteUrl: '',
  title: '',
  description: '',
};

/** 兼容模板中的扁平写法（site.groom）与分组写法（site.couple.groom） */
export type Site = SiteConfig &
  WeddingInfo & { couple: { groom: string; bride: string } };
