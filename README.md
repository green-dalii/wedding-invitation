# wedding-invitation

一款 Vite + TypeScript 编写的电子婚礼请柬：移动端 / 微信优先的单页站点，Hero 区带有一块**认真模拟的软胶物理按压形变**，全站配置完全由环境变量驱动，真实个人信息不进入公开仓库。

![CI](https://img.shields.io/badge/CI-GitHub_Actions-informational) ![License](https://img.shields.io/badge/license-MIT-green) ![Node](https://img.shields.io/badge/node-20%2B-brightgreen) ![Bundle](https://img.shields.io/badge/first%20load%20JS-~12.6KB_gzip-blue)

## 特性

- **软胶物理 Hero**：粘弹双模软体（弹性模 + 蠕变模），按压凹陷、松手回弹、长按缓慢加深再缓慢恢复；拖动用胶囊接触几何，多点按压 smooth union 融合。不是噪声动画，是认真调过参的物理。
- **配置全环境变量驱动**：姓名、日期、场地、坐标、文案、主图焦点……全部通过 `VITE_*` 注入，仓库内零真实个人信息。
- **零重型运行时依赖**：没有框架、没有 UI 库，构建后首屏 JS ≈ **12.6KB gzip**（预算 30KB，构建时自动校验）。
- **移动端 / 微信优先**：针对触控交互与微信分享卡片（og: 元信息 + 分享图）设计，桌面端同样响应式。
- **静态可部署**：纯静态产物，可部署到 Cloudflare Pages、Netlify、Vercel、GitHub Pages 等任意静态托管。
- **内置调参面板**：`?tune` 打开，19 个物理 / 渲染参数实时调整并复制 JSON。
- **测试齐备**：25 项单元测试 + 15 项 Playwright 端到端验证。

## 效果预览

打开页面后是一个沉静的封面：大号日期与两位新人的名字浮在主图上，按住画面轻抚，主图像一块软胶一样被按出凹陷、随手指拖动、松手后缓慢弹回；向下滑动依次是时间倒计时、场地与一键导航、交通指引、婚礼流程与结语。

最直观的方式是自己跑起来看：`npm run dev` 后在浏览器打开（建议用手机或 DevTools 的移动端模拟），按住 Hero 区试一试。

## 快速开始

要求 **Node 20+**。

```bash
git clone <your-repo-url> wedding-invitation
cd wedding-invitation
npm install

# 方式一（推荐）：交互式向导逐项填写，自动生成 .env
npm run setup

# 方式二：手动复制示例再编辑
cp .env.example .env

npm run dev
```

`.env` 中**最小可用**的配置片段（其余变量不填也能跑，页面会显示占位内容）：

```dotenv
VITE_GROOM=新郎
VITE_BRIDE=新娘
VITE_DATE_TEXT=2026.10.18
VITE_VENUE_NAME=婚礼场地
VITE_VENUE_ADDRESS=请在此填写详细地址
VITE_VENUE_LAT=30.2436
VITE_VENUE_LNG=120.1536
VITE_SITE_URL=https://your-domain.example
```

## 配置

所有变量均以 `VITE_` 开头，在 **构建期** 被 Vite 内联进产物。

| 变量 | 类型 | 配置路径 | 说明 |
|---|---|---|---|
| `VITE_GROOM` | string | `wedding.groom` | 新郎姓名 |
| `VITE_BRIDE` | string | `wedding.bride` | 新娘姓名 |
| `VITE_DATE_ISO` | string | `wedding.dateISO` | ISO 8601（含时区），倒计时用 |
| `VITE_DATE_TEXT` | string | `wedding.dateText` | 封面大号日期 |
| `VITE_WEEKDAY` | string | `wedding.weekday` | 星期 |
| `VITE_TIME_TEXT` | string | `wedding.timeText` | 入席时间文案 |
| `VITE_VENUE_NAME` | string | `venue.name` | 场地名 |
| `VITE_VENUE_ADDRESS` | string | `venue.address` | 详细地址 |
| `VITE_VENUE_LAT` | number | `venue.lat` | gcj-02 纬度 |
| `VITE_VENUE_LNG` | number | `venue.lng` | gcj-02 经度 |
| `VITE_VENUE_PHONE` | string | `venue.hotelPhone` | 联系电话 |
| `VITE_KICKER` | string | `copy.kicker` | 封面副标题 |
| `VITE_CLOSING` | string | `copy.closing` | 结语 |
| `VITE_GO_BUTTON` | string | `copy.goButton` | 封面按钮 |
| `VITE_HINT` | string | `copy.hint` | 交互提示 |
| `VITE_HERO_FOCAL_X` | number | `hero.focal.x` | 封面裁切焦点 0~1 |
| `VITE_HERO_FOCAL_Y` | number | `hero.focal.y` | 封面裁切焦点 0~1 |
| `VITE_HOWTOGET_JSON` | JSON 数组 | `howToGet` | 「如何前往」四格（整体替换） |
| `VITE_SCHEDULE_JSON` | JSON 数组 | `schedule` | 「当日流程」（整体替换） |
| `VITE_FLIGHTS_JSON` | JSON 数组 | `flights` | 直达航班（城市+班期，以「飞机」卡片展示，可选） |
| `VITE_TRANSIT_NOTE` | string | `transitNote` | 其他城市中转建议（「其他城市」卡片，可选） |
| `VITE_TRAVEL_TIP` | string | `travelTip` | 小贴士：阳光气候 + 顺路旅游（可选 |
| `VITE_AMAP_KEY` | string | `amap.key` | 高德 JS API key（可选，公开凭据，配域名白名单） |
| `VITE_AMAP_SECURITY_CODE` | string | `amap.securityCode` | 与 key 配套的安全密钥（可选） |
| `VITE_SITE_URL` | string | `siteUrl` | 部署绝对地址，og:url / 分享图 |
| `VITE_SITE_JSON` | JSON | 深合并全配置 | 兜底：一次性覆盖整份配置 |

**优先级**：`占位默认值 < VITE_SITE_JSON < VITE_HOWTOGET_JSON / VITE_SCHEDULE_JSON < VITE_* 标量`（另有代码内 `overrides` 优先级最高，一般不需要动）。

### 数组字段：「如何前往」与「当日流程`

这两块是数组，用专用变量覆盖（**单行 JSON 数组**，传对象会在构建期报错）：

```dotenv
VITE_HOWTOGET_JSON=[{"icon":"🚗","title":"自驾","text":"导航至婚礼场地，凭请柬免费停车 3 小时。"},{"icon":"🚇","title":"地铁","text":"地铁 5 号线 A 口出，步行 600 米。"}]
VITE_SCHEDULE_JSON=[{"time":"11:00","title":"迎宾签到","text":"一层门厅签到"},{"time":"11:30","title":"午宴入席","text":"请按桌号就座"}]
```

不设置则回落到 `src/config/schema.ts` 的占位内容。数组是**整体替换**而非按下标合并——想少写一项就直接少写。

`VITE_SITE_JSON` 是兜底用法，可一次性覆盖整份配置（对象深合并，数组整体替换）。一般优先用上面的数组变量，更易读。单行示例：

```dotenv
VITE_SITE_JSON={"schedule":[{"time":"11:30","title":"宾客入席"},{"time":"12:00","title":"仪式开始"}]}
```

`title` 与 `description` 自动派生，无需配置：`title = "{groom} & {bride} · 婚礼请柬"`，`description = "{dateText} · {kicker}"`。

## 隐私边界

请先读清楚这一段，它决定这个模板该怎么用：

- `VITE_*` 变量在**构建期**被内联进浏览器产物。任何**站点访问者**（以及查看网页源码的人）都能看到这些内容——这是必然的，请柬内容本来就是要给宾客看的。
- 环境变量的作用不是对访客隐藏信息，而是让真实信息**不进入公开的 Git 仓库**：`.env` 已被 `.gitignore` 忽略，你的姓名、地址、坐标、照片只存在于本地和部署平台的构建环境里，不会出现在开源代码中。
- 同理，**`assets-src/` 照片目录也已被 gitignore**。把个人照片放在这个目录里只用于本地生成压缩产物，原图不会提交到仓库。
- 请不要把真实个人信息（姓名、地址、坐标、照片）直接写进任何被跟踪的文件。

## 更换主图

1. 把你的照片放到 `assets-src/hero-source.jpg`（该目录已 gitignore，照片不会入库）。
2. 运行：

   ```bash
   npm run assets:hero
   ```

   脚本会压缩并输出多尺寸的 `assets/hero-{m,l}.{webp,jpg}` 到产物目录。
3. 如果构图重心不在画面中央，用 `VITE_HERO_FOCAL_X` / `VITE_HERO_FOCAL_Y`（0~1）指定裁切焦点。

**获取场地坐标**：在高德地图搜索场地 → 右键场地位置 → 复制坐标（gcj-02，与高德 / 腾讯地图通用），填入 `VITE_VENUE_LAT` / `VITE_VENUE_LNG`，用于「一键导航」。

## 部署到 Cloudflare Pages

1. 把仓库推到 GitHub，然后在 Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git** 选择该仓库。
2. 构建配置：
   - Framework preset：**Vite**
   - Build command：`npm run build`
   - Build output directory：`dist`
3. 在 **Settings → Environment variables** 填入所有 `VITE_*` 变量。建议 **Production 与 Preview 分别配置**，方便用 Preview 环境核对内容后再合并上线。
4. 自定义域名：Pages 项目 → **Custom domains** 绑定你的域名。
5. ⚠️ **`VITE_SITE_URL` 必须填最终域名的绝对地址**（如 `https://wedding.example.com`），否则 og:url / 微信分享图会失效。

其他静态托管同样适用：Netlify / Vercel 用相同的 build command 与 output dir；GitHub Pages 用 GitHub Actions 构建后发布 `dist/` 即可。

## 面板：`/dashboard`（访问量与宾客回执统计）

需 **Cloudflare D1** 与 **Pages Functions**。未部署时页面仍可浏览，回执提交会提示未接入数据库。

### 必须配置的两个服务端变量

| 变量 | 位置 | 说明 |
|---|---|---|
| `DASHBOARD_PASSWORD` | Pages → Settings → Environment variables → **Encrypt** | 面板登录密码。**没有默认值**，未配置时面板直接拒绝服务 |
| `SESSION_SECRET` | 同上 | 会话签名密钥，建议 `openssl rand -hex 32` |

> ⚠️ **这两个变量故意不出现在 `.env` / `.env.example` 的可配置项里。**
> `.env` 中的 `VITE_*` 会被内联进公开的 JS bundle，任何人查看网页源码即可读到；
> 面板密码若放进去，认证等于形同虚设。它必须只存在于服务端。
>
> 本地开发：写入 `.dev.vars`（已 gitignore），并用 `npx wrangler pages dev dist` 启动
> （`vite dev` 不提供 Functions）。
>
> ```bash
> printf 'DASHBOARD_PASSWORD=你的密码\nSESSION_SECRET=%s\n' "$(openssl rand -hex 32)" > .dev.vars
> ```

### D1 初始化

```bash
npx wrangler d1 create wedding        # 把返回的 database_id 填入 wrangler.toml
npx wrangler d1 migrations apply wedding --remote
```

### 认证机制

密码在服务端比对，成功后下发 **HttpOnly + HMAC 签名 Cookie**（8 小时），前端 JS 无法读取。
另有登录限流与常数时间比较。面板统计涵盖每日访问量与回执明细；访问统计**不记录 IP、不存原始 User-Agent**，仅按天与路径聚合。

### 路由注意

面板页构建为 `dashboard/index.html`。**不要**把它改名为 `dashboard.html`（会被 clean-URL 处理重定向到 `/dashboard` 并陷入自环），也**不要**在 `_redirects` 里写 `/dashboard/*` 通配规则。

## 调参（Tuning 面板）

- 访问页面时加上 `?tune` 查询参数，面板自动打开；之后左下角的 **Tune** 按钮随时开关。
- 面板可实时调整 **19 个物理 / 渲染参数**（蠕变档位、阻尼、按压半径、模糊等），即时看到效果，并可一键复制 JSON，方便固化到 `hero.config.ts`。

## 物理模型简介

Hero 的形变不是随机噪声或 CSS 动画，而是一个小型的软体物理模型：

- **粘弹双模**：弹性模负责瞬时按压与回弹，蠕变模负责持续受力下的缓慢加深与松手后的缓慢恢复。
- **蠕变是纯黏性一阶弛豫**（无速度项），因此在数学上**绝不振荡**——不会出现松手后永久的钟摆震荡。
- **拖动接触使用胶囊几何**（与速度无关，避免快滑时的横向条纹），多点按压用 smooth union 融合：双指同时按下时中间是**受压缩的浅鞍**而非高于原面的尖棱——厚软体被两侧挤压后中间应当略微凹陷，而不是被薄膜式地鼓出一道棱。

完整规格见 [`docs/SPEC.md`](docs/SPEC.md)。

## 项目结构

### 两个 HTML 入口

这是一个多入口（multi-page）构建，根目录下有两个 HTML：

```
index.html              →  请柬主页，URL 为 /
dashboard/index.html    →  数据面板，URL 为 /dashboard
```

两者在 `vite.config.ts` 的 `rollupOptions.input` 中显式声明：

```ts
input: {
  main: resolve(__dirname, 'index.html'),
  dashboard: resolve(__dirname, 'dashboard/index.html'),
}
```

- `index.html` 是 Vite 的固定约定，**不可删除**：`npm run dev` 以它为宿主页面，删除则无法启动与构建。
- 它本身几乎是空骨架 —— 姓名、日期等正文在运行时由 `main.ts` / `details.ts` 注入，`<title>` / `og:*` 则在构建期由 `invite-html` 插件替换。这也是它不含任何真实个人信息的原因。
- 面板页**必须用目录式结构**（`dashboard/index.html`）。若改名为 `dashboard.html`，Cloudflare Pages 的 clean-URL 处理会把它 308 重定向到 `/dashboard` 并陷入自环。
- 两者都依赖 Pages 的 **automatic HTML handling** 才能让 `/` 与 `/dashboard/` 正确落到对应文件。

```
web/
├── index.html                  # 入口一：请柬主页（/）
├── dashboard/
│   └── index.html              # 入口二：数据面板（/dashboard）
├── .env.example                # 配置变量示例（复制为 .env 使用）
├── vite.config.ts
├── src/
│   ├── config/                 # 配置层
│   │   ├── schema.ts           #   类型 + 占位默认值
│   │   ├── resolve.ts          #   纯解析器（环境变量 → 配置对象）
│   │   └── index.ts            #   应用入口（读取 import.meta.env）
│   ├── hero/                   # Hero 软胶物理区
│   │   ├── hero.config.ts      #   物理参数集中管理
│   │   ├── softbody.ts         #   软体物理（弹性 + 蠕变）
│   │   ├── renderer.ts         #   Canvas 渲染
│   │   ├── shaders.ts          #   着色器
│   │   ├── hero.ts             #   交互（按压 / 拖动）
│   │   ├── loader.ts           #   主图加载
│   │   └── tune.ts             #   调参面板
│   ├── main.ts                 # 首屏与封面
│   ├── details.ts              # 时间 / 地点 / 交通 / 流程 / 结语
│   └── vite-env.d.ts           # ImportMetaEnv 类型声明
├── tests/                      # 单元测试
│   ├── softbody.test.ts        #   13 项
│   └── config.test.ts          #   12 项
├── scripts/
│   ├── setup.mjs               # 交互式配置向导 → 生成 .env
│   ├── make-placeholder.mjs    # 生成占位主图
│   ├── optimize-hero.mjs       # 主图压缩 → assets/hero-{m,l}.{webp,jpg}
│   ├── e2e.mjs                 # Playwright 端到端验证（15 项）
│   └── check-size.mjs          # 产物体积预算校验
└── docs/
    └── SPEC.md                 # 物理与交互规格
```

## 命令一览

| 命令 | 说明 |
|---|---|
| `npm run setup` | 交互式配置向导，生成 `.env`（已被 gitignore） |
| `npm run dev` | 本地开发服务器（`--host`，局域网可访问） |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览构建产物 |
| `npm run test` | 运行单元测试（Vitest，25 项） |
| `npm run e2e` | 运行 Playwright 端到端验证（15 项） |
| `npm run assets:placeholder` | 生成占位主图 |
| `npm run assets:hero` | 压缩 `assets-src/hero-source.jpg` → 产物主图 |
| `node scripts/check-size.mjs` | 校验产物体积预算（首屏 JS ≤ 30KB gzip） |

## 开发与测试

```bash
npm run test    # 25 项单元测试（softbody 13 项 + config 12 项）
npm run e2e     # 15 项端到端验证（需要本地 Chrome）
```

`npm run e2e` 使用 Playwright 驱动本地 Chrome，请确保机器上装有 Chrome；CI 中默认不跑 e2e。

## 许可证

[MIT](LICENSE) © Copyright (c) 2026 wedding-invitation contributors

## 贡献

欢迎 Issue 与 PR！提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)——尤其是「真实个人信息绝不可提交到仓库」这一条约定。
