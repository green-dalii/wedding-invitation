# 电子婚礼请柬 · 实施 SPEC v1.0

> 面向实现者（另一个模型）的可执行规格。所有决策已与业主确认，**不要重新讨论方案**，按本文实现并逐条通过第 12 节验收。
> 业主对视觉与交互要求极高：Hero 页的手感和质感是项目成败的核心，其余模块服务于它。

---

## 0. 一句话目标

移动端（微信内置浏览器）优先的单页请柬：首屏 Hero 是一张照片，表现为**软胶材质**，按住/拖动时产生凹陷并带折射变形，松手弹性回弹（1~2 次轻微过冲，果冻"Q 弹"，无扩散涟漪）；Hero 内**锁定下滑**，仅通过按钮进入下方"时间 / 地点 / 如何前往 / 流程"信息区。轻量、流畅、可部署到 Cloudflare Pages。

## 1. 已确认的决策（不可更改）

| # | 决策 |
|---|------|
| 材质 | **软胶/果冻**：折射为主 + **柔和**高光/遮蔽（光影系数刻意压低，不过重） |
| 拖动手感 | 单一凹坑跟随手指，**后方留会回弹的软拖尾** |
| 松手 | 纯弹性回弹（1~2 次轻微过冲，果冻"Q 弹"），**无向外扩散的涟漪**（波/涟漪是水的质感，不是硅胶/果冻） |
| 多点按压 | **软体物理交互**（非线性、非薄膜）：接触处**深度饱和**（不翻倍）、中间区被压缩**鞍部变浅**（比线性叠加更浅）、各接触平滑合并无折痕、周围是**宽缓低幅的软鼓尾**（随距衰减，非锐棱）。禁止"逐指线性叠加"、禁止"绷面/环脊"（详见 §5.4a） |
| 多点触控 | 支持（双指两个凹坑） |
| 桌面 hover | 鼠标悬停弱凹陷（深度约 16%），按下才是深凹陷 |
| 文字 | **DOM 层，不参与变形**；仅随交互有**微弱位置抖动**（弹簧，≤5px） |
| Hero 滚动 | Hero 内**锁定下滑**；仅"查看详情"按钮可进入下方；回到顶部自动重新锁定 |
| 背景音乐 | **暂不做** |
| 语言 | 纯中文 |
| 风格 | 莫兰迪灰调 + 清新自然绿强调色；视觉细化留待后期，**当前重点是 Hero 交互/特效/性能** |
| 布局 | 移动端竖版全屏；桌面端**左：竖版照片，右：文案** |
| 分享 | og meta 标签（不做 JS-SDK） |
| 部署 | GitHub 仓库 → Cloudflare Pages 自动构建；Vite + TypeScript，**零运行时依赖** |

## 2. 技术栈与硬约束

- Vite 8 + TypeScript（strict）+ 原生 DOM。**禁止引入 three/pixi/gsap/任何运行时库。**
- 渲染：**原生 WebGL1**（`getContext('webgl')`）。不用 WebGL2、不用浮点纹理、不用 FBO —— 目的是让 iOS 12+ / 旧 X5 / 各 Android WebView 走同一条路径。
- 物理：**CPU 小网格**（约 96 列 × ≤~200 行，≤30000 格）JS 模拟，每帧编码成 RGBA8 小纹理上传。
- 性能预算：首屏 JS ≤ **30 KB gzip**；hero 图 ≤ 200 KB（WebP）；CSS ≤ 8 KB gzip。
- 浏览器目标：iOS Safari/WKWebView 13+（含微信）、Android Chrome/系统 WebView/X5、桌面 Chrome/Edge/Safari/Firefox 近两年版本。

## 3. 目录结构与当前状态

图例：✅ 已完成（保留，可小改）　⬜ 待实现

```
web/
├─ package.json                     ✅ scripts: dev/build/preview/test/assets:*/e2e
├─ tsconfig.json                    ✅ strict + noUnusedLocals
├─ vite.config.ts                   ⬜ 见 §10
├─ index.html                       ⬜ 见 §8
├─ .gitignore                       ⬜ node_modules dist assets-src(可选保留占位)
├─ README.md                        ⬜ 换图/改文案/部署 三段
├─ assets-src/hero-source.jpg       ✅ 第 1 张（用户替换）
├─ assets-src/gallery/*.jpg         ✅ 后续各张（按文件名排序）；焦点表 gallery-focal.json 可选
├─ scripts/
│  ├─ make-placeholder.mjs          ✅ 生成 3 张占位图（hero-source + gallery/01,02）
│  ├─ optimize-gallery.mjs          ✅ 产出 src/assets/gallery-NN-{m.webp,l.webp,m.jpg}、src/generated/{gallery,hero-meta}.json、public/og.jpg
│  └─ e2e.mjs                       ✅ 23 项（§12）
├─ public/
│  ├─ _headers                      ⬜ Cloudflare 缓存头 §10
│  ├─ favicon.svg                   ⬜
│  └─ og.jpg                        ✅（脚本生成）
├─ src/
│  ├─ main.ts                       ⬜ 启动编排 §4
│  ├─ config.ts                     ⬜ 全部文案数据 §9
│  ├─ style.css                     ⬜ §8
│  ├─ scrollLock.ts                 ⬜ §7
│  ├─ details.ts                    ⬜ 下方信息区渲染 + 滚动入场 + 复制/导航 §9
│  ├─ hero/
│  │  ├─ softbody.ts                ✅ 物理（已单测通过，含限幅）
│  │  ├─ shaders.ts                 ✅ 顶点/片元着色器（含轮播双纹理 uMix）
│  │  ├─ renderer.ts                ✅ WebGL1 封装，含上下文丢失/恢复 + 双纹理乒乓
│  │  ├─ loader.ts                  ✅ fetch 流进度加载 + webp 检测
│  │  ├─ slideshow.ts               ✅ 轮播状态机（预载/暂停条件/指示器/播放按钮）§5.13
│  │  ├─ hero.config.ts             ✅ 物理/渲染/交互常量集中管理
│  │  └─ hero.ts                    ✅ **核心调度**（输入/循环/休眠/提示/文字抖动/质量自适应/降级）§5–§6
│  ├─ assets/gallery-NN-*.webp|jpg  ✅（占位，gitignore）
│  └─ generated/{gallery,hero-meta}.json  ✅（gitignore）
└─ tests/{softbody,config,gallery}.test.ts  ✅ 45 项通过（`npm test`）
```

> 已有 `renderer.ts / shaders.ts / loader.ts` 尚未做过 `tsc` 与浏览器实测。实现者第一步：`npx tsc --noEmit`，修正后再往下做。着色器/渲染器若有 bug 直接修，接口保持：`Renderer.create / setImage / setFieldSize / uploadField / resize / draw / tuning / onRestore / lost / maxTextureSize`。

## 4. 启动流程（main.ts）

1. 读取 `config.ts`，把 Hero 文案与下方信息区渲染进 DOM（此时 loader 覆盖全屏，无 FOUC）。
2. `initScrollLock()`（§7），默认 `locked`。
3. `initHero()`（§5），返回 `Promise<void>`（图片就绪且首帧渲染后 resolve）。
4. 首帧后：loader 淡出（300ms）→ Hero 文案错峰入场（每行 90ms 延迟，`opacity+translateY(12px)`）→ 700ms 后显示 `.hint` 提示文案（§5.8，**无任何自动交互演示**）。
5. 下方 `details.ts` 在 `requestIdleCallback`（无则 `setTimeout 300`）里初始化，不阻塞首屏。

**Loader（内联在 index.html 的 `<style>`/HTML 中，首次绘制即可见）**：全屏莫兰迪底色；中央新人姓名首字或"囍"字标 + 一条 2px 细进度线 + 百分比文字。进度 = `max(真实进度, 假进度)`，假进度以 `1-exp(-t/1.2s)*0.9` 逼近 90%，**只增不减**，完成时补满 100%。渲染用 `requestAnimationFrame` 平滑追赶，不出现倒退和卡死。图片加载失败：显示"图片加载失败，点击重试"，且 Hero 降级为静态。

## 5. Hero 规格（hero.ts，核心）

### 5.1 DOM 约定（index.html 提供）

```html
<section id="hero">
  <div class="hero-photo" style="background-image:url(__LQIP__)">   <!-- 输入监听在此 -->
    <canvas></canvas>
    <div class="hero-scrim"></div>                                   <!-- 仅移动端，保证文字可读，pointer-events:none -->
    <p class="hint">哈哈镜~来戳我</p>
    <!-- .hero-bar（指示器 + 播放/暂停）由 slideshow.ts 在运行时插入；
         静态模式另插入两层 .hero-layer -->
  </div>
  <div class="hero-copy">                                            <!-- pointer-events:none；按钮单独 auto -->
    <p data-jit="0.5" class="kicker">诚邀您见证我们的婚礼</p>
    <h1 data-jit="1" class="names">…</h1>
    <p data-jit="0.75" class="date">…</p>
    <button class="go" type="button">查看详情</button>
  </div>
</section>
```

### 5.2 尺寸与网格

- `ResizeObserver` 监听 `.hero-photo`。CSS 尺寸 `cw × ch`。
- 网格：`cols = 96`，`cell = cw / cols`，`rows = ceil(ch / cell)`；若 `cols*rows > 30000` 则等比降低 `cols`。**仅当 cols/rows 改变时重建 `SoftField` 并 `renderer.setFieldSize`**（重建 = 状态清零，可接受）。
- 绘制缓冲：`renderScale = min(devicePixelRatio, 2)`（后续由质量自适应下调，§5.9）；`renderer.resize(round(cw*s), round(ch*s))`。
- 尺寸变化阈值：`ResizeObserver` 回调用 `requestAnimationFrame` 合并；**变化 <2px 忽略**（微信/iOS 地址栏伸缩会频繁触发）。

### 5.3 图片纹理准备

**素材管线（构建期，`scripts/optimize-gallery.mjs`）**

- 源：`assets-src/hero-source.jpg`（第 1 张，也是 `og.jpg` 来源）+ `assets-src/gallery/*.jpg`（按文件名排序）。
- **按画框比例预裁切**：Hero 画框很竖（手机实测 390×844 = **0.462**，桌面 605×900 = **0.672**），而相册混有横图（1.43~1.50）。若只缩宽度交给运行时 cover，横图会被拉伸到竖向画框 —— 实测放大 **2.5 倍**，明显发糊。因此构建期先裁到 `-m` = **0.70** / `-l` = **0.68**，再按**高度**缩放（`-m` 1700px、`-l` 1800px），运行时只做极小二次裁切。
- 三档产物：`gallery-NN-m.webp`(1190×1700) / `gallery-NN-l.webp` / `gallery-NN-m.jpg`（WebP 兜底）。
- 构图焦点：`assets-src/gallery-focal.json`（可选，不入库），`{ "文件名": [x, y] }`，默认 `[0.5, 0.4]`（略偏上，给底部文案留空间）。
- 清单：`src/generated/gallery.json`（id/尺寸，**刻意不含 LQIP** —— 11 张内联 base64 会白增约 3KB gzip）；`src/generated/hero-meta.json` 只放第 1 张的 LQIP 供 `__LQIP__` 使用。

**运行时**

- 变体选择：`cw * min(dpr,2) > 900` 用 `-l`，否则 `-m`；`supportsWebp()` 为 false 时用 `-m.jpg`。URL 经 `import.meta.glob('../assets/gallery-*', { eager:true, query:'?url' })` 获得（带 hash，可永久缓存；图片数量由使用者决定，代码无需改动）。
- **中转 canvas**（`texCanvas`，单张复用）尺寸 `tw = clamp(round(cw*min(dpr,2)), 256, min(1600, maxTextureSize))`，`th = round(tw*ch/cw)`；按 **cover** 绘制，焦点来自 `VITE_HERO_FOCAL_X/Y`（`config.hero.focal`，默认 0.5/0.4）。
- **纹理单元分配（不可随意改）**：`0` = 当前图 `uImg`，`1` = 高度场 `uField`，`2` = 淡入目标图 `uImgB`。高度场固定在单元 1，第二张图必须另占单元 2，否则 `uploadField` 会把图覆盖掉。
- **双纹理乒乓**：无论相册多少张，显存里永远只有 2 张图纹理。淡入结束后槽位互换，旧图所在槽位直接作为下一次上传目标。实测：11 张图相册，`createTexture` 调用数恒为 **3**（2 图 + 1 场）。
- `cw/ch` 宽高比或宽度相对上次变化 >25% 时重新裁剪上传；其余情况沿用。原图 `HTMLImageElement` 常驻以便重裁。
- shader 的 `uZoom=0.94` 已给边缘变形留余量，勿去掉。

### 5.4 物理循环（固定步长）

- 物理步长固定 1/60 s。`accumulator += dt`（dt 夹到 ≤50ms），`while (acc >= 1/60 && steps<3)`。120Hz 屏幕自然每两帧一步。
- 每个子步内顺序：**更新所有指针 → 对每个指针调用 `field.press()` → `field.step()`**。
- 每帧末尾（若本帧至少推进了一步）：`field.encode(buf)` → `renderer.uploadField(buf)` → `renderer.draw()`。`buf` 为复用的 `Uint8Array(cols*rows*4)`，禁止每帧分配。

### 5.4a 软体物理模型（第一性原理 · 本项目最重要的正确性约束）

**形变只由"解析目标场"驱动，场内不存在任何动力学耦合**（无 `smooth·∇²h` 拉普拉斯项，那是液体涟漪的根源）。目标场由**接触几何**生成，经**粘弹松弛谱（双模）**演化：

**① 接触几何：胶囊（capsule）**
手指拖动 = 圆沿路径扫掠 = 点与线段的 **Minkowski 和 = 胶囊**。用 `field.pressSegment(x0,y0,x1,y1,p)` 一次成形，**与速度/采样率无关** → 快速拖动也是连续沟槽，无扇贝/串珠/断裂。（离散点采样在快速滑动时必然产生串珠。）

**② 粘弹松弛谱（双模，总形变 = 弹性 + 蠕变）**
真实软体是弹簧+阻尼的**松弛谱**，不是单弹簧。关键是有**蠕变档**：
```
弹性模(快)： v  = (v − stiff·h·(1+harden·|h|/depth))·damp ;  h += v   ← 瞬时按下/回弹
蠕变模(慢·无惯性)： hc += (target·creepFrac − hc)·creepRate   ← 受力时缓慢跟进
                    hc *= exp(−1/creepTau)                  ← 离开后**指数**回 0
```
- 弹性模 → 按下即凹、松手即弹（Q 弹）
- 蠕变模 → 持续受力**缓慢加深**（真实蠕变），卸载后**单调指数恢复** → 拖动留下会缓慢合拢的沟槽
- **蠕变必须是纯黏性弛豫（一阶、无速度项）**：若用“带速度的弹簧”实现，蠕变就变成**独立的欠阻尼振子**（creepDamp≈0.975 时几乎不耗散）→ 松手后像**钟摆一样永久震荡**。这是本项目曾多次反复的核心缺陷。粘弹恢复在物理上是**黏性流动**，数学上就是**单调指数**，不应有任何惯性项。
- 场内无任何耦合 → 作用域外 `|h| < 1e-4`（单测守护）

**③ 多点按压（非线性、厚软体式）**
1. **平滑合并（smooth union）** `u = 1 − Π(1 − gᵢ)`：深度饱和（不翻倍）、无中垂线折痕、重叠区比线性叠加更浅（压缩硬化）。
2. **宽缓软鼓尾** `tail = rim·max(0, blur(dent) − dent)`（blur 宽而缓）：多指尾叠加成宽缓软包；**绝非窄环/尖棱**（薄膜绷紧面观感，液体化错误来源）。
3. 作用域严格圆形；尾与凹陷均随时间衰减，不跑出成波。

> **禁止的实现（用户多次明确否决）**：① 波动方程/拉普拉斯动力学耦合（液体涟漪）；② 多指线性叠加或 `max()` 折痕；③ 无输入时的自动交互演示；④ 离散采样拼拖动（串珠）。全部有单测/E2E 守护。

### 5.5 指针模型

每个活动指针：`{ id, type, rawX, rawY (网格坐标), sx, sy (平滑坐标), pressure, target }`。

- **跟随**：每子步 `s += (raw - s) * 0.7`（零延迟紧跟随）。
- **拖动接触**：从上一子步 `s` 到本子步 `s`，一次 `field.pressSegment(s, s', pressure)` 形成**胶囊**（速度无关的连续沟槽，见 §5.4a）。
- **快滑抗条纹**：快速滑动时浏览器把帧内多个 `pointermove` **合并（coalesce）**为一个事件（只有终态）。必须用 `getCoalescedEvents()` 取回帧内**全部原始采样点**逐段胶囊成形，否则中间轨迹丢失 → 离散跳点 → **横纹/断裂**。
- **压力**：每子步 `pressure += (target - pressure) * 0.28`（瞬时成形，无流体缓入）。
  - `pointerdown`（touch/pen/mouse 按下）：`target = 1`
  - 鼠标悬停（无按键）：`target = 0.16`
  - `pointerup / cancel / leave`：**立即从表中移除**（外力消失即回弹）。
- **事件**：监听 `.hero-photo` 上的 `pointerdown/move/up/cancel/leave`（`{passive:true}`）；`pointerdown` 后对鼠标 `setPointerCapture`；`.hero-photo` CSS `touch-action:none`（仅 locked 态，§7）。无 `window.PointerEvent` 时降级用 `touchstart/move/end + mousedown/move/up`（逻辑同上）。
- 坐标：`getBoundingClientRect()` 换算为网格坐标（`(clientX-rect.left)/cell`）。
- 任何真实 `pointerdown` 立即让 `.hint` 淡出（一次性，之后不再出现）。**无输入时不允许任何自动注入的形变**。

### 5.6 休眠（省电，必做）

- 唤醒条件：有活动指针、文字弹簧未静止、`field.peak > 0.008`。
- 连续 20 个子步 `peak < 0.008` 且无指针 → `field.reset()` → 编码上传并 `draw()` 最后一帧 → **停止 rAF**。任意输入/resize/可见性恢复时重新启动。
- 休眠期间 CPU/GPU 占用应为 0（无空转 rAF）。

### 5.7 可见性

- `IntersectionObserver(threshold 0.05)` 观察 `#hero`：不可见 → 停循环；可见且需唤醒 → 恢复。
- `document.visibilitychange`：隐藏时停，恢复时按需唤醒。
- WebGL 上下文丢失：`renderer.lost=true` 时不绘制；`onRestore` 后重新 `setImage(offscreen)`、`setFieldSize`、`draw()`（renderer 已内置重建，hero 仅需重新唤醒一帧）。

### 5.8 提示文案（无自动演示）

`ready` 后 700ms 显示 `.hint` 文案（"按住画面，轻轻抚过"），首次真实交互或 4.7s 后淡出。**不播放任何自动交互演示**：无用户输入时画面必须逐像素静止（不合成虚拟指针、不产生任何形变）。

### 5.9 质量自适应

采样 `awake` 状态下的帧间隔 EMA（忽略 >100ms 的间隔）。连续 45 帧 EMA > 21ms 则降一级（最多 3 级）：
1. `renderer.tuning.dispersion = 0`（省 2 次纹理采样）
2. `renderScale *= 0.8`（下限 1.0），重新 `renderer.resize`
3. `renderScale *= 0.8`（下限 1.0）

降级不可逆（本次会话内）。

### 5.10 文字微抖动（DOM）

- 全局弹簧状态 `(x,y,vx,vy)`，每帧积分：`a = -K·x - C·v`，`K=180, C=9`（约 2Hz 欠阻尼，可见 1–2 次晃动）。
- 输入驱动：
  - 指针移动：`v += velocityPx * 0.06 * pressure`（`velocityPx` 为该帧指针位移，CSS px）。
  - 按下：沿"指针 → 文案中心"方向加冲量 `40px/s * pressure`；抬起：反向 `25px/s`。
  - 位移夹到 ±5px。
- 每个 `[data-jit]` 元素 `transform: translate3d(x*f, y*f, 0)`，`f = parseFloat(data-jit)`（层次感）。`will-change: transform`。
- 静止判据：`|x|,|y| < 0.02 && |v| < 0.02` 时归零并停止写样式。`prefers-reduced-motion` 下整体关闭。

### 5.11 渲染参数（初值，业主稍后微调）

| 项 | 值 | 位置 |
|---|---|---|
| 物理 `stiff/damp/grip` | 0.06 / 0.45 / 0.6（**高刚度+强阻尼**=硅胶；damp<0.5 是消除拖动"呼吸"振荡的关键） | `softbody.ts` DEFAULT_PARAMS |
| 蠕变 `creepRate/creepTau/creepFrac` | 0.06 / 90 (≈1.5s) / 0.12（**纯黏性弛豫，无速度项**；tau 越大沟槽留得越久） | 同上 |
| 形变 `depth/sigma/rim/harden` | 11 / 0.085 / 0.4 / 1.0（σ 默认更大=接触半径更宽；harden=1 抵抗感） | 同上 |
| 折射 `refract` | 5 | `renderer.ts` DEFAULT_TUNING |
| 色散 `dispersion` | 0.018 | 同上 |
| 高光 `light` | 0.18 | 同上 |
| `zoom` | 0.94 | 同上 |

**调参入口**：开发环境（`import.meta.env.DEV`）或 URL 带 `?tune` 时，在 Hero 右上角显示一个轻量调参面板（原生 `<input type=range>`，无库），实时修改上表全部数值并支持"复制当前参数为 JSON"。**生产构建默认不加载面板代码**（动态 `import()`，`?tune` 时才加载，避免增体积）。视觉验收时会用它对手感做最终定参，请把定参结果回写到默认值。

### 5.12 降级链

`Renderer.create()` 返回 `null`（无 WebGL / 软件渲染 `failIfMajorPerformanceCaveat` / 着色器失败）→ **静态模式**：
- `canvas` 隐藏；`.hero-photo` 内插入两层 `.hero-layer`（`background-image` + `background-size:cover`），首张 opacity 1、次张 0。
- 轮播复用**同一套 `Slideshow` 逻辑**，宿主换成「改下一层的 `background-image` + 写 opacity」，因此静态模式同样有指示器、播放/暂停与淡入淡出（由一段短命 `requestAnimationFrame` 驱动，结束即停）。
- 交互：`pointerdown` 时给 `.hero-photo` 加 `transform:scale(.985)` 的 CSS 过渡（150ms 按下、350ms 弹回），聊胜于无。
- 页面其余功能不受影响。
- 测试/CI 用：URL 带 `?gl=force` 时传 `allowSoftware:true`（headless SwiftShader 需要）；`?gl=off` 强制静态模式。

### 5.13 相册轮播（slideshow.ts）

**参数**：`ADVANCE_MS = 5000`、`FADE_MS = 900`（`hero.config.ts`）。

**关键：物理与图片完全解耦。** 高度场不参与图片运算（只用于算 UV 偏移），
所以换图 / 淡入淡出**对软体特效零影响**，`softbody.ts` 无需任何改动。

**淡入淡出用双纹理 + `uMix`（GPU 混合），不做 JS 合成**：
- 两张图**共用同一个 `off`**，所以过渡期间形变完全一致（不会“一张在动、另一张不动”）。
- 光影在 `mix` **之后**统一施加，只算一次；`uMix` 用 uniform 分支，静止态零额外采样。
- 缓动：`smootherstep`（`t³(t(6t-15)+10)`）—— 线性 crossfade 中段会发灰。
- 反例（已否决）：JS 逐帧把两张图合成到一个 canvas 再 `texImage2D`，
  相当于每秒 60 次 1.3MP 纹理上传，手机会卡。

**重活一律放在停留期（性能关键）**：
`cover` 裁切（`drawImage` 一张 ~1.3MP 图）+ `texImage2D` 上传都在**预载完成时**做（`host.prepare`），
淡入开始帧只需改一个 uniform + 唤醒循环。实测淡入 934ms / 55 帧 / p50 16.7ms /
**p95 18.6ms（无掉帧）**。

**省电**：停留 5s 用 `setTimeout`，主循环保持休眠（不常驻 rAF）；
只有淡入的 ~900ms 唤醒循环，结束后自然回到休眠。即每 5s 只唤醒 0.9s。

**绝不出现空白帧**：每张图展示期间就预载下一张；若到点仍未载好，跳过本轮并在 600ms 后重试。

**暂停条件**（`canAdvance()`）：页面前台 + Hero 在视口内 + 用户未按压。
- **“真实按压”不能用 `pointers.size` 判定**：鼠标划过照片会留下 hover 指针（目标压力仅 0.16）。
  必须用单独的 `target===1` 计数（`pressing`），否则鼠标一动轮播就静默停住。
- 悬停静止（`HOVER_TAIL_MS = 2600`）后允许休眠，否则鼠标停在照片上会让循环永跑 60fps。
- **指示器容器只拦 `pointerdown`/`touchstart`/`mousedown`/`click`**（防误触软体），
  **`pointerup` 必须放行**：否则鼠标移向指示器时产生的 hover 指针会永久残留（既卡轮播又永不休眠）。

**定时器纪律**：清待触发计时**必须用 `clearDwell()`**（`clearTimeout` + 置 0），
不可写 `this.timer = 0` —— 那会孤立仍在排队的定时器，表现为“已暂停却又自己切了一张”。
`goTo()` 也必须先 `clearDwell()`：用户的选择优先于排队的停留计时。

**预载代数（`gen`）**：落定与指定切换都递增；`onload` 回调带旧代数的直接丢弃。
否则用户快速连点圆点时，先前发出的预载回调会在新目标就位后回来把 `nextIndex` 改回旧图。

**降级**：`prefers-reduced-motion` → `fadeMs = 0`（直接落定，无透明度动画）
且**默认不自动播放**（仍可用播放按钮手动开启）。

**指示器 / 播放按钮**：
- `.hero-bar` 由 JS 插入 `.hero-photo` 内，位于 Hero 底部（`bottom: 15px + safe-area`）；`.hero-copy` 底部内边距相应加大到 50px 让位。
- 圆点 8px，激活态拉伸为 20px 胶囊 + **主题绿 `var(--green)`**（与站内「&」分隔符、chip、按钮描边同色）；用 `::after` 把可点区域撑到 44px（左右只扩 3px，避免相邻重叠）。
  （favicon 与 Loading 页的囍仍为莫兰迪红 `#b4656b`，那是「婚礼」点缀色；指示器属功能性 UI，跟随主题绿。）
- 无障碍：`role="tablist"` + 每颗 `aria-label="第 N 张照片"` / `aria-selected`；`aria-pressed` / `aria-label` 随播放状态切换。
- 只有一张图时**完全不显示**任何控件。
- 诊断钩子：`window.__hero.gallery()` → `{ index, total, mix, fading, autoplay, pressing, canAdvance, visible, docVisible, log }`；`log` 记录每次切换触发原因。

## 6. 着色器与视觉要点（shaders.ts 已实现，验收关注）

- 折射：`uv' = uv + slope * uRefract`（从外侧取样 → 内容向凹陷中心收拢，"陷入"感）。若实测方向显得像"鼓包"，把 `off` 取反即可，**以视觉为准**。
- 光照：法线 `normalize(vec3(-slope*2.4, 1))`，光源左上；漫反射 `.28`、高光 `light=0.18`、凹陷遮蔽 `.006` —— **柔和不抢戏**；凹陷剖面为超高斯（平底陡壁=实体压痕），排挤凸缘为环形（r=σ 峰值）；**静止时画面必须与原图逐像素一致（无偏色/无泛光）**。
- 凹陷内 `col *= 1 + h*0.010` 做柔和遮蔽。
- 必要验收：静止帧与直接绘制原图的平均色差 < 2/255（e2e 中做）。

## 7. 滚动锁（scrollLock.ts）

状态：`locked`（默认） / `open`。以 `<html>` 的 class 表示。

- `html.locked, html.locked body { overflow:hidden; height:100%; }`，`html.locked .hero-photo { touch-action:none; }`，`open` 态 `.hero-photo{touch-action:pan-y}`。
- `locked` 时在 `#hero` 上注册**非被动**的 `touchmove` 与 `wheel`，`preventDefault()`（兜底 iOS 旧内核）。
- `.go` 按钮点击：`open` → `requestAnimationFrame` 后 `details.scrollIntoView({behavior:'smooth'})`（不支持 smooth 则直接跳）；记录 `openedAt`。
- `open` 态监听 `scroll`（passive）：`scrollY <= 1` 且距 `openedAt` > 800ms → 回到 `locked`。
- 下方页面有固定的"回到封面"小按钮（`scrollTo top`，到顶后自动 lock）。
- 键盘：locked 时 `Space/PageDown/ArrowDown` 不滚动（overflow hidden 已保证）；`.go` 按钮可用键盘触发，并有 `:focus-visible` 样式与 `aria-label`。

## 8. 布局与样式

**CSS 变量（莫兰迪 + 自然绿）**
```
--bg:#e9e7e1  --bg-2:#dedbd2  --ink:#3a3d38  --ink-soft:#6b6f68
--green:#6f9a7d  --green-deep:#4f7a60  --line:rgba(58,61,56,.16)
```
字体：`font-family: "Noto Serif SC","Songti SC","STSong","Source Han Serif SC",serif`（当前用系统字体；后期视觉阶段再做子集化 webfont，**本阶段不加载任何 webfont**）。

**移动端（默认）**
- `#hero{position:relative; height:100vh; height:100svh; overflow:hidden;}`（`100dvh` 作为增强，`@supports`）
- `.hero-photo{position:absolute; inset:0; background-size:cover; background-position:50% 40%;}`（LQIP 作为底图，canvas 就绪后 `opacity 0→1`，300ms）。
- `.hero-scrim`：底部 0→55% 高度的 `linear-gradient(transparent, rgba(30,34,30,.55))`。
- `.hero-copy`：`position:absolute; inset:0; display:flex; flex-direction:column; justify-content:flex-end; padding:0 24px calc(28px + env(safe-area-inset-bottom)); color:#f4f2ea; pointer-events:none`。`.go{pointer-events:auto}`。
- 排版：kicker 13px 字距 .3em；names 40–48px 字重 500、行距 1.15，姓名间 "&" 用 `--green` 的浅色；date 大号数字 `2026.10.18` + 星期，细线分隔；`.go` 为玻璃质感圆角胶囊（`backdrop-filter` 若不支持则纯半透明），箭头做 2s 循环轻微上下浮动（`transform`，且 reduced-motion 关闭）。
- `.hint`：位于照片上部 18%，12px，白 70%，`animation` 淡入淡出。

**桌面端 `@media (min-width:900px) and (min-aspect-ratio:1/1)`**
- `#hero{display:grid; grid-template-columns: min(42vw, 78svh) 1fr;}`
- `.hero-photo` 变为 grid 左列（`position:relative`，全高），无 scrim。
- `.hero-copy` 变为右列：`justify-content:center; padding: 0 8vw; color:var(--ink); background:var(--bg)`；names 可放大至 `clamp(56px, 5.2vw, 88px)`；`.go` 在该列内下方，深色文字 + 绿色描边。
- 该布局下 `.hero-photo` 宽高比接近竖版 ~0.72；`cols=96` 网格逻辑不变。

**无障碍**：`<h1>` 为姓名；`prefers-reduced-motion` 关闭抖动/引导/浮动；对比度 ≥ 4.5:1（移动端文字在 scrim 上）。

## 9. 内容与下方信息区

**`src/config.ts`**（唯一内容数据源，全部为**占位文案**，业主后续提供真实信息；占位处用【占位】字样在 README 标注）：

```ts
export const site = {
  title, description, siteUrl: import.meta.env.VITE_SITE_URL ?? '',
  couple: { groom: '陈北辰', bride: '林知夏' },            // 占位
  dateISO: '2026-10-18T11:30:00+08:00', dateText: '2026.10.18', weekday: '星期日', timeText: '11:30 入席',
  venue: { name, address, lat, lng, hotelPhone? },         // 占位，含 gcj02 坐标
  hero: { focal: { x: .5, y: .4 } },
  howToGet: [{ icon, title, text }, …],                    // 自驾/地铁/高铁/停车
  schedule: [{ time, title, text }, …],                    // 当日流程
  closing: '期待与你相见',
};
```

**details.ts 渲染的区块**（垂直顺序）：
1. **时间**：大号日期/时刻 + "距离婚礼还有 N 天"（婚礼当天及之后显示"今天/已完成"文案）。
2. **地点**：场地名称、地址；按钮 ×3：`高德地图导航`、`腾讯地图导航`、`复制地址`。
   - 高德：`https://uri.amap.com/marker?position=${lng},${lat}&name=${enc(name)}&coordinate=gaode&callnative=1`
   - 腾讯：`https://apis.map.qq.com/uri/v1/marker?marker=coord:${lat},${lng};title:${enc(name)};addr:${enc(address)}&referer=wedding`
   - 复制：`navigator.clipboard.writeText`，失败回退 `document.execCommand('copy')`；成功显示 1.6s 的底部 toast"地址已复制"。
3. **如何前往**：卡片列表。
4. **当日流程**：竖向时间轴（绿色节点）。
5. **结语 + 回到封面按钮**。

**入场动画**：`IntersectionObserver`（threshold .15）给区块加 `.in`：`opacity 0→1 + translateY(16px→0)`，仅执行一次；reduced-motion 直接显示。卡片交错 60ms。
**样式**：莫兰迪底色分段（`--bg` / `--bg-2` 交替），绿色仅用于强调（按钮、节点、标题下短线）。此阶段做到"整洁、克制、可用"即可。

## 10. 构建、缓存、部署

**vite.config.ts**
- 自定义 `transformIndexHtml` 插件：替换 `__LQIP__`（来自 `src/generated/hero-meta.json`）、`__TITLE__`、`__DESC__`、`__OG_IMAGE__`、`__SITE_URL__`（env `VITE_SITE_URL`，空则用相对路径并在 README 提示 **微信分享图必须为绝对 URL**）。
- `build.target='es2019'`；`build.cssCodeSplit=false`；`assetsInlineLimit=0`（图片不内联）；无 sourcemap。
- 调参面板走动态 import，自然拆分为独立 chunk。

**index.html `<head>` 必备**
`viewport`（含 `viewport-fit=cover, maximum-scale=1`）、`theme-color`、`og:title/description/image/type/url`、`format-detection: telephone=no`、favicon、内联的 loader 与首屏关键 CSS（背景色 + loader 样式）、`<meta name="x5-fullscreen" content="true">` 无需。

**public/_headers**
```
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/
  Cache-Control: public, max-age=0, must-revalidate
/og.jpg
  Cache-Control: public, max-age=86400
```

**Cloudflare Pages 设置**：框架 None；构建命令 `npm run build`；输出目录 `dist`；环境变量 `VITE_SITE_URL=https://你的域名`；Node 20+。

## 11. 微信/iOS/Android 兼容清单（实现时逐项确认）

- `touch-action:none` 仅 locked 态；配合非被动 `touchmove preventDefault` 兜底。
- 全屏高度用 `100svh`（回退 `100vh`）；不要依赖 `window.innerHeight` 做布局。
- iOS 内存：纹理 ≤1600px；不使用 mipmap/NPOT 以外特性；上传后释放对离屏 canvas 之外的大对象引用。
- `webglcontextlost` 必须 `preventDefault` 并支持恢复（已在 renderer 实现）。
- 不使用 `createImageBitmap`（旧 WKWebView 不稳），用 `Image`。
- 不使用 `OffscreenCanvas`、`ResizeObserver` 缺失时回退 `window.resize`。
- 微信内点击链接跳转地图用 https 链接（已选），不用 `androidamap://` 之类 scheme。
- `-webkit-tap-highlight-color: transparent`；`user-select:none` 于 Hero；禁用长按图片菜单（`-webkit-touch-callout:none`）。

## 12. 验收（全部通过才算完成）

### 12.1 命令级
```
npm test                       # 物理单测全绿（必须包含：无波动传播、作用域外严格为0、双凹陷隆起、深度饱和、方形边界无伪影）
npx tsc --noEmit               # 0 错误
npm run build                  # 成功；输出 gzip 大小
```
构建后校验（写入 `scripts/e2e.mjs` 或 CI 脚本）：**入口 JS gzip ≤ 30KB，CSS gzip ≤ 8KB，`dist/assets` 中 hero 图 ≤ 200KB**，否则失败。

### 12.2 浏览器 E2E（`npm run e2e`，playwright-core + 系统 Chrome）
使用 `chromium.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] })`，访问 `vite preview` 的 `?gl=force`。用例：

1. **无报错**：加载全程 `console.error`/`pageerror` 为 0。
2. **Loader**：出现进度并最终消失；消失后 canvas 可见且 `canvas.width>0`。
3. **静止一致性**：静止截图与直绘原图平均色差 < 2/255（§6）。
4. **按压变形**：移动端视口（390×844, DPR2, touch）在中心 `pointerdown` 持续 500ms 截图，与静止截图对比，中心区域像素差异显著（> 阈值）；四角区域几乎不变（局部性）。
5. **拖动拖尾**：按住并横向拖动，截图中路径后方仍有形变残留。
6. **回弹**：`pointerup` 后 4s 内画面恢复至静止一致性阈值内（允许 1–2 帧余震）。
7. **休眠**：恢复后 500ms 起，采样 1s 内 `requestAnimationFrame` 回调计数为 0（通过页面暴露 `window.__hero.debug()` 返回 `{awake,fps,renderScale,level}`；仅 `?debug` 或 DEV 暴露）。
8. **滚动锁**：locked 态下 `mouse.wheel(0,800)` 后 `scrollY===0`；点击 `.go` 后 `scrollY>0` 且 `html` 不再有 `locked`；点"回到封面"后重新有 `locked`。
9. **桌面布局**：1440×900 下 `.hero-photo` 在 `.hero-copy` 左侧，二者不重叠。
10. **降级**：不带 `?gl=force`（headless 软件渲染被拒）时，页面进入静态模式，仍显示真实照片、无报错。
11. **休眠后再次交互**：可再次唤醒并变形。
12. **无自动交互**：无任何输入时，静止后连续两帧截图逐像素一致（meanDiff < 0.5），不出现自动演示/自动形变。
13. **多点按压**：两个相距 ~2.5σ 的凹陷之间**隆起**（中点高度为正），且无折痕（沿两中心连线的高度剖面 C¹ 连续）。

### 12.3 手动验收（业主执行，实现者提供说明）
- iPhone 微信 / Android 微信打开预览链接：60fps 主观流畅；地址栏伸缩不导致重置；在 Hero 上下滑不会滚页；点按钮才进入下方。
- 提供 `?tune` 调参面板，业主调出满意手感后，实现者将参数写回默认值。

## 13. 实施顺序（推荐，逐阶段提交 git）

| 阶段 | 内容 | 出口 |
|---|---|---|
| P0 | `tsc` 通过既有文件；补 `vite.config.ts / index.html / style.css(最小) / main.ts` 让页面能跑 | `npm run dev` 出现占位图 |
| P1 | **`hero.ts` 完整实现**（§5）+ loader UI + 静态降级 + `window.__hero.debug` | 12.2 用例 1–7、10、11 |
| P2 | `scrollLock.ts` + `config.ts` + `details.ts` + 桌面布局 | 12.2 用例 8、9 |
| P3 | 调参面板（`?tune`）+ `e2e.mjs` + 体积校验 + README + `_headers` + `.gitignore` | 12.1 / 12.2 全绿 |
| P4 | 交付：`git init` 提交、README 三段说明、业主试玩后按反馈调参 | 业主验收 |

## 14. 明确不做（本阶段）

背景音乐、微信 JS-SDK 定制分享、webfont 子集化、相册、多语言、PWA/离线。

**加入日历**：不做。Web 无法可靠地跳转到手机原生日历并预填事件 ——
iOS Safari 不开放该能力；微信内置浏览器拦截外部 scheme；
Google Calendar 网页模板在微信内与国内网络均不可靠；`.ics` 下载需用户手动导入，过于繁琐。
若日后接入微信公众号，可用 JS-SDK 的 `addPhoneCalendar`（需公众号 + 已备案域名）。

## 14a. UX 细节约定

- **提示文案不可只出现一次**：首次淡出后，用户点「回到封面」时以 `opacity:.5` 再次浮现（加 `.again`）。
  触发点必须是 `.back-top` 按钮而非滚动监听 —— Hero 有滚动锁，回到封面只能走该按钮。
- **回执提交成功**：按钮原地替换为「一笔勾（420ms 描边生长）+ `已收到，等你入席`」，不撒花、不弹窗。
- **署名**：结语区末尾（及 `/dashboard` 底部）淡字 `Made with care by Greener-Dalii ↗`
  链接到 `https://greenerdalii.top`，`target=_blank rel=noopener noreferrer`。
  保持克制，不做页脚横幅或 Logo 墙。
- **文案基调**：面向宾客而非技术。如按钮用「我要出席」而非「提交回执」。
- **不做**：长按特殊效果、倒计时翻牌动画、成就系统、多地图切换 UI。

## 15. 需要业主后续提供的素材

- **相册**：竖版为主（建议 ≥1600×2400），放 `assets-src/gallery/`，然后 `npm run assets:gallery`。
  第 1 张仍为 `assets-src/hero-source.jpg`（也是 og.jpg 来源）。横图可用，管线会按画框比例预裁切；
  若主体被切偏，在 `assets-src/gallery-focal.json` 里给该文件名指定 `[x, y]` 焦点。
- 新人姓名、日期时间、场地名称与详细地址及坐标、交通指引、当日流程、分享缩略图文案。
  全部只需改 `.env`。
