/**
 * 应用侧配置入口：把构建期环境变量解析成最终站点配置。
 *
 * 真实姓名/地址等由使用者在 `.env`（本地）或 Cloudflare Pages 环境变量
 * （部署）中注入，**不写入仓库**。
 */
import { resolveSite } from './resolve';
import type { Site, WeddingInfo, VenueInfo, CopyInfo } from './schema';

export type { Site, SiteConfig, DeepPartial, EnvRecord } from './schema';
export { resolveSite, SCALAR_ENV_KEYS } from './resolve';

const cfg = resolveSite({ ...import.meta.env });

/**
 * 全局配置对象。
 * 除分组字段（wedding/venue/copy/hero）外，另提供扁平别名
 * （site.groom / site.dateText …），让模板读写更直观。
 */
export const site: Site = {
  ...cfg,
  // 扁平别名 —— 与分组字段保持引用一致
  get groom() { return cfg.wedding.groom; },
  get bride() { return cfg.wedding.bride; },
  get dateISO() { return cfg.wedding.dateISO; },
  get dateText() { return cfg.wedding.dateText; },
  get weekday() { return cfg.wedding.weekday; },
  get timeText() { return cfg.wedding.timeText; },
  couple: cfg.wedding,
};

export const wedding: WeddingInfo = cfg.wedding;
export const venue: VenueInfo = cfg.venue;
export const copy: CopyInfo = cfg.copy;
export const howToGet = cfg.howToGet;
export const schedule = cfg.schedule;
