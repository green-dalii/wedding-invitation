import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveSite, SCALAR_ENV_KEYS, ARRAY_ENV_KEYS, HERO_MODE_ENV } from '../src/config/resolve';
import { DEFAULTS } from '../src/config/schema';

describe('配置解析（环境变量 → 站点配置）', () => {
  it('无环境变量时回落到占位默认值，且标题/描述自动派生', () => {
    const s = resolveSite({});
    expect(s.wedding.groom).toBe(DEFAULTS.wedding.groom);
    expect(s.title).toBe(`${DEFAULTS.wedding.groom} & ${DEFAULTS.wedding.bride} · 婚礼请柬`);
    expect(s.description).toContain(DEFAULTS.wedding.dateText);
  });

  it('标量环境变量覆盖默认值', () => {
    const s = resolveSite({
      VITE_GROOM: '张三',
      VITE_BRIDE: '李四',
      VITE_DATE_TEXT: '2099.01.02',
      VITE_VENUE_NAME: '和平饭店',
      VITE_CLOSING: '不见不散',
    });
    expect(s.wedding.groom).toBe('张三');
    expect(s.wedding.bride).toBe('李四');
    expect(s.wedding.dateText).toBe('2099.01.02');
    expect(s.venue.name).toBe('和平饭店');
    expect(s.copy.closing).toBe('不见不散');
    // 派生字段跟随内容，不需单独配置
    expect(s.title).toBe('张三 & 李四 · 婚礼请柬');
    expect(s.description).toBe('2099.01.02 · 诚邀您见证我们的婚礼');
  });

  it('数字型变量正确转型；非法数字被忽略而不污染配置', () => {
    const s = resolveSite({ VITE_VENUE_LAT: '31.2304', VITE_VENUE_LNG: '121.4737' });
    expect(s.venue.lat).toBe(31.2304);
    expect(s.venue.lng).toBe(121.4737);
    const bad = resolveSite({ VITE_VENUE_LAT: 'not-a-number' });
    expect(bad.venue.lat).toBe(DEFAULTS.venue.lat);
  });

  it('空字符串与纯空白视为未设置', () => {
    const s = resolveSite({ VITE_GROOM: '   ', VITE_VENUE_NAME: '' });
    expect(s.wedding.groom).toBe(DEFAULTS.wedding.groom);
    expect(s.venue.name).toBe(DEFAULTS.venue.name);
  });

  it('VITE_SITE_JSON 深合并，对象递归、数组整体替换', () => {
    const s = resolveSite({
      VITE_SITE_JSON: JSON.stringify({
        venue: { name: 'JSON 场地' },
        schedule: [{ time: '09:00', title: '单环节', text: '仅一项' }],
      }),
    });
    expect(s.venue.name).toBe('JSON 场地');       // 深合并生效
    expect(s.venue.address).toBe(DEFAULTS.venue.address); // 未提及的字段保留
    expect(s.schedule).toHaveLength(1);            // 数组整体替换，而非按下标合并
    expect(s.howToGet).toHaveLength(DEFAULTS.howToGet.length); // 未提及的数组不动
  });

  it('标量优先于 VITE_SITE_JSON', () => {
    const s = resolveSite({
      VITE_SITE_JSON: JSON.stringify({ wedding: { groom: '来自JSON' } }),
      VITE_GROOM: '来自标量',
    });
    expect(s.wedding.groom).toBe('来自标量');
  });

  it('VITE_SITE_JSON 非法时报错（构建期失败优于静默降级）', () => {
    expect(() => resolveSite({ VITE_SITE_JSON: '{ 坏掉的 json' })).toThrow(/JSON/);
  });

  it('VITE_SITE_URL 去除末尾斜杠', () => {
    expect(resolveSite({ VITE_SITE_URL: 'https://a.test/' }).siteUrl).toBe('https://a.test');
  });

  it('代码级 overrides 优先级最高', () => {
    const s = resolveSite(
      { VITE_GROOM: '环境变量' },
      { wedding: { groom: '代码覆盖' } },
    );
    expect(s.wedding.groom).toBe('代码覆盖');
  });

  it('DEFAULTS 不被调用方意外修改（structuredClone 隔离）', () => {
    resolveSite({ VITE_GROOM: '改我' });
    expect(DEFAULTS.wedding.groom).not.toBe('改我');
  });

  /**
   * 防回归：vite-env.d.ts 里声明的每个 VITE_* 变量都必须被解析器处理。
   * 曾发生「.env.example 与类型都声明了 VITE_SITE_URL，解析器却漏掉」，
   * 导致 og:url 静默为空。此测试让遗漏在 CI 立刻暴露。
   */
  it('声明的每个 VITE_* 变量都被解析器覆盖', () => {
    const dts = readFileSync('src/vite-env.d.ts', 'utf8');
    const declared = [...dts.matchAll(/VITE_[A-Z0-9_]+/g)].map((m) => m[0]);
    const jsonVar = 'VITE_SITE_JSON';
    // HERO_MODE_ENV 是联合类型变量（走白名单校验而非 SCALAR_ENV），单独计入
    const handled = new Set([...SCALAR_ENV_KEYS, ...ARRAY_ENV_KEYS, jsonVar, HERO_MODE_ENV]);
    const missing = [...new Set(declared)].filter((k) => !handled.has(k));
    expect(missing).toEqual([]);
  });

  it('.env.example 与解析器变量集保持同步', () => {
    const example = readFileSync('.env.example', 'utf8');
    const known = new Set([...SCALAR_ENV_KEYS, ...ARRAY_ENV_KEYS, 'VITE_SITE_JSON', HERO_MODE_ENV]);
    const documented = [...example.matchAll(/^#?\s*(VITE_[A-Z0-9_]+)=/gm)].map((m) => m[1]);
    const undocumented = [...known].filter((k) => !documented.includes(k));
    expect(undocumented).toEqual([]);
  });
});

/**
 * 文档与代码的一致性：README 的环境变量表必须与解析器保持同步。
 * 开源项目最容易腐化的地方就是「文档写了但代码不支持」或反之。
 */
describe('README 与配置实现同步', () => {
  it('README 表格覆盖解析器支持的全部变量', async () => {
    const { readFileSync } = await import('node:fs');
    const readme = readFileSync('README.md', 'utf8');
    const missing = [...SCALAR_ENV_KEYS, ...ARRAY_ENV_KEYS].filter((k) => !readme.includes(k));
    expect(missing).toEqual([]);
  });

  it('README 不宣称对访客保密（隐私边界诚实性）', async () => {
    const { readFileSync } = await import('node:fs');
    const readme = readFileSync('README.md', 'utf8');
    const forbidden = ['加密', '保密', '访客无法', '访客不能', '只有你能'];
    const hit = forbidden.filter((w) => readme.includes(w));
    expect(hit).toEqual([]);
  });
});

describe('新增环境变量（数组字段）', () => {
  it('VITE_HOWTOGET_JSON / VITE_SCHEDULE_JSON 可覆盖数组', () => {
    const s = resolveSite({
      VITE_HOWTOGET_JSON: '[{"icon":"🚕","title":"出租","text":"打车直达"}]',
      VITE_SCHEDULE_JSON: '[{"time":"10:00","title":"唯一环节","text":"只有一项"}]',
    });
    expect(s.howToGet).toHaveLength(1);
    expect(s.howToGet[0].title).toBe('出租');
    expect(s.schedule).toHaveLength(1);
    expect(s.schedule[0].time).toBe('10:00');
  });

  it('数组变量非法 JSON 时报错', () => {
    expect(() => resolveSite({ VITE_SCHEDULE_JSON: '{坏掉的' })).toThrow(/JSON/);
  });

  it('数组变量传入非数组时报错', () => {
    expect(() => resolveSite({ VITE_HOWTOGET_JSON: '{"不是":"数组"}' })).toThrow(/数组/);
  });

  it('未设置时回落到默认数组', () => {
    const s = resolveSite({});
    expect(s.howToGet.length).toBeGreaterThan(0);
    expect(s.schedule.length).toBeGreaterThan(0);
  });
});

describe('安全边界：面板凭据不得使用 VITE_ 前缀', () => {
  it('vite-env.d.ts 不得声明密码类凭据变量', async () => {
    const { readFileSync } = await import('node:fs');
    const dts = readFileSync('src/vite-env.d.ts', 'utf8');
    const declared = [...dts.matchAll(/VITE_[A-Z0-9_]+/g)].map((m) => m[0]);
    // 只拦截真正的秘密（密码 / 密钥 / 令牌）。注意 VITE_AMAP_KEY 与
    // VITE_AMAP_SECURITY_CODE 是**公开凭据**（JS API key 本就随页面下发，
    // 靠域名白名单限权），不在此列。
    const dangerous = declared.filter((k) => /_(PASSWORD|SECRET|TOKEN)$/.test(k));
    expect(dangerous).toEqual([]);
  });

  it('客户端代码不得出现面板密码字段', async () => {
    const { readFileSync } = await import('node:fs');
    const dash = readFileSync('src/dashboard.ts', 'utf8');
    expect(dash).not.toMatch(/import\.meta\.env\.[A-Z_]*(PASSWORD|SECRET)/);
    // 密码只能经由 /api/login 发往服务端
    expect(dash).toContain('/api/login');
  });
});

describe('航班 / 中转 / 高德凭据', () => {
  it('VITE_FLIGHTS_JSON 整体替换 flights（城市+班期最小结构）', () => {
    const s = resolveSite({
      VITE_FLIGHTS_JSON: JSON.stringify([
        { city: '甲城', days: '每日一班' },
        { city: '乙城', days: '每周一、三、五、日' },
      ]),
    });
    expect(s.flights).toHaveLength(2);
    expect(s.flights[0]).toEqual({ city: '甲城', days: '每日一班' });
    expect(s.flights[1].days).toBe('每周一、三、五、日');
  });

  it('未设置时 flights 为空数组（不渲染板块）', () => {
    expect(resolveSite({}).flights).toEqual([]);
  });

  it('VITE_TRANSIT_NOTE 标量注入', () => {
    const s = resolveSite({ VITE_TRANSIT_NOTE: '先飞昆明，再转动车' });
    expect(s.transitNote).toBe('先飞昆明，再转动车');
    expect(resolveSite({}).transitNote).toBe('');
  });

  it('高德凭据注入；未配置时为空字符串', () => {
    const s = resolveSite({ VITE_AMAP_KEY: 'k1', VITE_AMAP_SECURITY_CODE: 's1' });
    expect(s.amap).toEqual({ key: 'k1', securityCode: 's1' });
    expect(resolveSite({}).amap).toEqual({ key: '', securityCode: '' });
  });

  it('flights 传入非数组时报错', () => {
    expect(() => resolveSite({ VITE_FLIGHTS_JSON: '{"city":"x"}' })).toThrow(/数组/);
  });
});
