-- Cloudflare D1 初始化迁移
-- 应用命令（对已部署的库重复执行安全）：
--   wrangler d1 migrations apply wedding --remote

-- 宾客回执
CREATE TABLE IF NOT EXISTS rsvp (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  guests     INTEGER NOT NULL DEFAULT 1,
  message    TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 访问事件：按天 + 路径聚合，**不记录 IP / 原始 UA**（隐私最小化）
CREATE TABLE IF NOT EXISTS view_event (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  path       TEXT    NOT NULL DEFAULT '/',
  day        TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 按天聚合统计的索引
CREATE INDEX IF NOT EXISTS idx_view_event_day ON view_event (day);
CREATE INDEX IF NOT EXISTS idx_rsvp_created ON rsvp (created_at);