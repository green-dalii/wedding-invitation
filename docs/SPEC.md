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
| **交互模式** | Hero 提供两种可切换的交互模式：**沙砾（默认）**与**软胶（原预设完整保留）**。选择优先级 `?mode=` > `VITE_HERO_MODE` > 默认 `sand`；`/tune` 面板可实时切换（§5.14） |
| **沙砾材质** | 颗粒取向：像素级沙砾。**静止态就是原图**（由几何构造保证，非调参结果）；按压处沙砾向外扩散露出底色，松手拼回。**不引入任何粒子/图形库** |
| **沙砾缝隙底色** | 米色 `--bg` `#e9e7e1`（业主已定；非深灰、非模糊底） |
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
│  │  ├─ modes/                     ✅ 交互模式（§5.14）
│  │  │  ├─ types.ts                HeroMode 接口
│  │  │  ├─ bank.ts                 TextureBank（双纹理乒乓）+ FieldTexture（两模式共用）
│  │  │  ├─ glutil.ts               program 编译/链接
│  │  │  ├─ soft.ts                 软胶模式（现有实现原样搬移）
│  │  │  └─ sand.ts                 沙砾模式（GL_POINTS）
│  │  ├─ softbody.ts                ✅ 物理（已单测通过，含限幅）
│  │  ├─ shaders.ts                 ✅ 软体 + 沙砾着色器（含轮播双纹理 uMix）
│  │  ├─ renderer.ts                ✅ 调度器（上下文/纹理银行/高度场/模式）
│  │  ├─ loader.ts                  ✅ 图片加载 + webp 检测
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

### 5.11 参数（初值，业主稍后微调）

**物理参数**（两模式共用；`hero.config.ts` → `HERO_PARAMS` → `softbody.ts` DEFAULT_PARAMS）

| 项 | 值 | 位置 |
|---|---|---|
| 物理 `stiff/damp/grip` | 0.06 / 0.45 / 0.6（**高刚度+强阻尼**=硅胶；damp<0.5 是消除拖动"呼吸"振荡的关键） | `softbody.ts` DEFAULT_PARAMS |
| 蠕变 `creepRate/creepTau/creepFrac` | 0.06 / 90 (≈1.5s) / 0.12（**纯黏性弛豫，无速度项**；tau 越大沟槽留得越久） | 同上 |
| 形变 `depth/sigma/rim/harden` | 11 / 0.1224 / 0.4 / 1.0（σ 已两次 ×1.2 放大；harden=1 抵抗感） | 同上 |

**渲染参数**（按模式各自持有）

| 模式 | 参数 | 值 | 位置 |
|---|---|---|---|
| soft | `refract/dispersion/light/zoom` | 5 / 0.018 / 0.18 / 0.94 | `HERO_RENDER` → `renderer.softTuning` |
| sand | `grain/spread/scatter/settle/shrink/shadow/zoom` | 见 §5.14.5 | `SAND_PARAMS` → `renderer.sandTuning` |

两个 tuning 对象由调度器持有（**不随模式重建而丢失**），模式实例只引用它们。

**调参入口**：`import.meta.env.DEV` 或 URL 带 `?tune` 时显示面板（原生 `<input type=range>`，无库）。
面板顶部为「交互模式」分段控件（`沙砾` / `软胶`），参数按当前模式显隐，避免调错组；
「复制参数 JSON」同时导出物理参数**与两个模式的渲染参数**。
**生产构建默认不加载面板代码**（动态 `import()`，`?tune` 时才加载）；生产的模式开关是 `VITE_HERO_MODE`。

### 5.12 降级链

**总链：`sand → soft → static`**（沙砾能力不足 → 软胶 → 无 WebGL 则静态，见 §5.14.3）。

`Renderer.create()` 返回 `null`（无 WebGL / 软件渲染 `failIfMajorPerformanceCaveat` / 着色器失败）→ **静态模式**：
- `canvas` 隐藏；`.hero-photo` 内插入两层 `.hero-layer`（`background-image` + `background-size:cover`），首张 opacity 1、次张 0。
- 轮播复用**同一套 `Slideshow` 逻辑**，宿主换成「改下一层的 `background-image` + 写 opacity」，因此静态模式同样有指示器、播放/暂停与淡入淡出（由一段短命 `requestAnimationFrame` 驱动，结束即停）。
- 交互：`pointerdown` 时给 `.hero-photo` 加 `transform:scale(.985)` 的 CSS 过渡（150ms 按下、350ms 弹回），聊胜于无。
- 页面其余功能不受影响。
- 测试/CI 用：URL 带 `?gl=force` 时传 `allowSoftware:true`（headless SwiftShader 需要）；`?gl=off` 强制静态模式。

### 5.13 相册轮播（slideshow.ts）

11 张图（当前 Hero 图第一张，其余按文件名排序）无限循环。

#### 5.13.1 时序：**每张图总共 3 秒**（`CYCLE_MS = 3000`）

**过渡时长含在 3 秒之内**，不是额外叠加。

> **勘误**：早前实现是「停留 `ADVANCE_MS=3000` + 过渡 `FADE_MS=900`」，
> 实测相邻切换间隔 **3920ms** —— 也就是「每图 3.9 秒」。
> 这正是业主反馈的「并不是按照每图3秒的顺序时机来的」。
> 现在 `advanceMs = CYCLE_MS - FADE_MS`，实测间隔 **3017 / 3025 / 2997 / 3016 / 3015 ms**。

#### 5.13.2 过渡：交叉淡入淡出（`mix(A, B, t)`，S 曲线缓动）

`m = 0` 显示 A、`m = 1` 显示 B，中间线性混合后经 `ease()` 缓动。

> **勘误（两处真实缺陷，业主反馈「淡入淡出后又叠加了直接切换，双切换跳变」）**：
>
> 1. **`Renderer.setMix()` 漏转发 `noneMode`**
>    → `none` 模式的 `uMix` 恒为 0，**完全没有淡入淡出**，
>    只剩 `commit()` 换槽那一刻的硬切。
> 2. **`Renderer.commit()` 换槽后没有复位 `uMix`**（**「双切换」的真凶**）
>    → 落定时 uniform 停在 1，而此时单元0=新图、单元2=旧图，
>    着色器算的是 `mix(新, 旧, 1)` = **旧图**。
>    于是切换后整段停留期显示上一张，直到下次 `beginFade` 的 `setMix(0)` 才弹回
>    新图 —— 观感就是「淡入淡出之后又硬切一下」。
>
> 修复：`commit()` 内 `bank.commit()` 之后立刻 `setMix(0)`；`setMix()` 补上
> `noneMode`。实测 `mix` 逐帧 0.02→0.29→0.56→0.79 平滑推进，
> 落定后 +0ms 与 +1.2s 画面**差异 0.0%**（无弹回），三个模式一致。
>
> **曾一度改成「淡到米色再淡入」（画布 V 形透明度）以规避双重曝光，
> 但业主反馈该形态「像多加了一次切换」而撤回 —— 真正该修的是上面两个缺陷，
> 不是过渡形态本身。**

#### 5.13.3 提示文案只在「有特效」时显示

`VITE_HINT`（「哈哈镜~来戳我」）属于**交互引导**：`none` 无特效模式下画面里
根本没有可按压的东西，显示它是错误引导。

- 判定：`renderer.mode !== 'none'`；`none` 时给 `.hint` 加 `hidden` 属性（不占位）
- 静态降级路径在更早处就 return，提示保持默认 `opacity: 0`，同样不显示
- 判定写在**每次要显示的时刻**（延迟浮现、回顶二次浮现），而不是只在初始化时判一次
  —— 这样之后切模式也不会漏出提示
- E2E T24：`?mode=none` → `hidden=true, show=false`；`?mode=soft` → 延迟后 `show=true`

#### 5.13.4 不变式（保持原有约束）

- **绝不切到未加载的图**：展示期就预载下一张；未就位则 `RETRY_MS=600` 重试。
- **硬件永远只有 2 张图纹理**（双纹理乒乓，与相册张数无关）。
- **按压期间不切图**（真实按压计数 `pressing`，hover 指针不算）。
- 指示器：圆点 + 播放/暂停；只拦「会产生按压」的事件。
- `prefers-reduced-motion` / `?autoplay=0`：不自动推进。

### 5.14 交互模式（modes/）

业主需求：**保留现有软体效果作为预设之一**，另增一个粒子（沙砾）交互模式 ——
图片默认就是原图，按压处沙砾向外扩散，松手拼回原图。

#### 5.14.1 架构

| 组件 | 职责 |
|---|---|
| `modes/types.ts` | `HeroMode` 接口：`id / needsClear / resize / setFieldSize / setMix / draw / reduceQuality / destroy` |
| `modes/bank.ts` | `TextureBank`（双纹理乒乓，§5.3）+ `FieldTexture`（高度场，单元 1）—— **两模式共用** |
| `modes/glutil.ts` | program 编译/链接（失败返回 null，由调用方降级） |
| `modes/soft.ts` | 软胶模式：**现有实现原样搬移，逐像素行为必须与重构前一致** |
| `modes/sand.ts` | 沙砾模式（新增） |
| `renderer.ts` | 降为**调度器**：持有 GL 上下文、纹理银行、高度场、绘制尺寸、当前模式 |

调度器对外 API（`show / setIncoming / commit / setMix / setFieldSize / uploadField / resize / draw / maxTextureSize / lost / onRestore`）**保持不变**，因此 `hero.ts` 只需增加两处：模式选择、把 `degrade()` 改为调用 `reduceQuality()`。

**软体实现完整保留**：`softbody.ts`、软体着色器、`HERO_PARAMS` 全部不动，仅由 `modes/soft.ts` 引用。

#### 5.14.2 模式清单与选择

| 模式 | 说明 | 渲染路径 | 状态 |
|---|---|---|---|
| `soft` | 软胶：按压凹陷、拖动沟槽、松手回弹 | WebGL | 可用 |
| `sand` | 沙砾：按压处像素沙砾向外扩散 | WebGL | **开发中，交互将重构**（见 §5.14.9） |
| `none` | **无特效**：正常轮播，不做任何形变 | WebGL（纯平铺，`uBed=0`） | **默认** |

**选择优先级**：`?mode=` > `VITE_HERO_MODE` > 默认 `none`。
白名单校验，拼错**回退默认而不是报错**（线上不该因多余空格而白屏）。

`none` 是**渲染器内的一等模式**（`modes/none.ts`），不是「走静态降级路径」——
Tuning 面板要在三种模式之间**实时切换对比**，只有同一渲染器内的模式才做得到。
它复用「整屏平铺 + 可选压暗」的 `BED_VERT`/`BED_FRAG` 并把 `uBed` 固定为 0，
刻意不另写一份几乎相同的着色器；`zoom = 1`（无内缩，就是正常照片）。
无 WebGL 时仍回退到 DOM 图层路径（观感一致：都是普通轮播）。

E2E：`?mode=none` 生效、按压无形变（meanDiff **0.000**）、轮播照常前进、
Tuning 面板列出三种模式且可实时切到 `none`、三种模式互切不泄漏纹理。

> **发布约束**：`sand` 未达发布标准前**不作默认**。业主指示：在沙砾交互
> 定稿前，默认取最稳的形态（当前为 `none` 无特效）。

#### 5.14.3 核心不变量：静止态 = 原图

朴素粒子系统做不到这件事（要画面看起来是原图需约 130 万颗粒子，手机必崩）。
本实现用**几何构造**保证，而非调参结果：

- 一张 `GL_POINTS` 网格，一个格子一颗沙砾；
- 静止位置 = 单元格中心 `((i+.5)*cell, (j+.5)*cell)`，`cell` **必须为正整数**（物理像素）；
- `gl_PointSize = cell`。

于是沙砾方形脚印的左右边界恰为 `i*cell` 与 `(i+1)*cell` —— **只要 `cell` 是整数，
这两个边界就是整数**，相邻沙砾严丝合缝地铺满画布，且与画布尺寸是否为 `cell`
整数倍无关（末列/末行沙砾越界部分被裁掉，但落在视口内的像素中心仍被覆盖）。

> **勘误**：本文档早前版本写的是「`cell` 必须为偶数整数」，**这是错的**
> （把「整数边界」误推成「偶数」，并因此把粒径下限误钉在 4px）。
> 实测 60×60 画布下 `cell = 1..8` 的**漏缝像素均为 0，奇偶无关**。
> 这条放宽解开了粒径下限 —— 细沙才做得出来。

片元按 `uv = 格子中心UV + (gl_PointCoord - 0.5) * cellUV * zoom` 取回该格图像
⇒ 位移为 0 时画面逐像素还原原图。

**因此 `cell` 必须是正整数**；网格重建时必须校验这一点（单测守护）。

#### 5.14.4 位移：复用现有 SoftField，不新增物理 —— **斥力模型**

高度场纹理已有 `r,g = 斜率`、`b = 高度`（零点 128/255，§5.4a）。沙砾直接读它，**不新增任何物理场**：

```
hn     = clamp((|h|/MAX_H - DEAD) / (1 - DEAD), 0, 1)   // DEAD = 0.02
outDir = normalize(g)，|g|→0 时退化为随机方向          // 消掉中心奇点
amt    = spread * cell * hn                             // 幅度以「颗粒直径」为单位

disp = outDir * amt                                     // 主项：向外推开
     + randDir(seed) * scatter * amt                    // 打散（占主项比例）
     + randDir(seed) * settle  * amt * sin(9t + seed*41) // 涌动（占主项比例）
```

**这是斥力模型**（对应「像吸铁石铁屑同极互斥」）：梯度 `g` = 最陡上升 =
背离凹陷中心 ⇒ 沙砾向外推；幅度由深度 `hn` 驱动（中心最大、向外衰减）
⇒ 越靠近按压点越推开，中心露出底色。

- **死区（DEAD = 0.02）是必须的**：没有它，`h` 的指数衰减尾巴会让沙砾
  永远在微小抽动，画面回不到逐像素原图 —— 实测松手 3.2s 后仍有 **7.9%** 缝隙。
  加死区后回到静止基线、与静止帧 meanDiff **0.000**。
  阈值仅占总高度 2%（≈亚像素位移），不会造成可见的“硬切”。
- **所有项都乘 `hn`**：位移与深度同收敛，松手后自然归零。
- **幅度必须以颗粒直径为单位**（`spread * cell`）⇒ 与分辨率无关：粒径加倍则
  位移同步加倍，视觉始终是「颗粒推开 N 个自身直径」。**`spread` 必须小**（默认 3）。
  > **勘误**：早期版本用固定像素（`spread=42`）导致位移达粒径 7 倍，
  > 原图彻底解体成噪声 —— 这就是“非常粗糙”的根因之一。
- 无 ∇² 耦合、无波动传播（遵守 §5.4a）。
- 随机项两个作用：打散成自然的云雾而非干净圆环；消掉「中心位移恰为 0」的奇点。
- `gl_PointSize = cell * (1 - shrink * ...)`，**`shrink` 默认 0（关闭）**：
  颗粒是格子内切的、天然不重叠，一缩小反而制造碎片缝隙。
  > **勘误**：早期版本 `shrink=0.5`，位移后方块缩成不规则小块，留下蠕虫状
  > 亮纹 —— 这是“白色沙粒”错觉的第二个根因。
- 片元按 `shadow` 随位移压暗（纵深）。
- 涌动项仅在 `hn > 0` 时活跃；循环休眠时 `h = 0` → **静止态无任何动画**（§5.8）。

**恢复是免费的**：松手后 `h` 按现有弹性+蠕变回落 → `disp → 0` → 沙砾自动拼回原图。
沙砾**无独立状态、无粒子池、不产生 GC**；多指按压与拖动沟槽沿用 §5.4a/§5.5 的
胶囊接触与 smooth union，无需另写实现。

**关键实现约束**：顶点着色器必须用**格子中心**（`floor(uv/cellUv)+0.5`）取字段，
**不能用沙砾自身位置** —— 否则位移会反馈进采样点造成自激。

#### 5.14.5 能力检测与降级

沙砾模式需两项能力，创建前必须检测；任一不满足则回退 `soft` 并 `console.info` 说明原因：

| 能力 | 查询 | 为何需要 |
|---|---|---|
| 顶点纹理取样（VTF） | `MAX_VERTEX_TEXTURE_IMAGE_UNITS >= 1` | WebGL1 **不保证 > 0**；沙砾在顶点着色器读高度场 |
| 点尺寸上限 | `ALIASED_POINT_SIZE_RANGE[1] >= cell` | 规范只保证 ≥ 1，个别驱动上限极小 |

`?mode=sand` 显式指定但能力不足时同样静默回退，不报错、不白屏。
（若日后实测发现大量设备卡在第二项，再补「每颗两个三角形」的备选路径；当前不做。）

#### 5.14.6 性能

| 项 | 值 |
|---|---|
| draw call | **1 次** `drawArrays(POINTS)` |
| 粒子数 | `ceil(W/cell) * ceil(H/cell)`（780×1688、cell=6 → 36,660） |
| 顶点缓冲 | 静态，仅上传一次（`home` 2×f32 + `seed` 1×f32 ≈ 440KB） |
| 顶点开销 | 每颗 1 次字段纹理取样 |
| 片元开销 | ≈ 一次全屏量级覆盖（与软体模式相当，且省掉法线/高光计算） |
| 纹理单元 | 不变（0=当前图 1=高度场 2=淡入目标） |

**清屏**：沙砾模式必须每帧 `clear`（缝隙露出底色）；软体模式全屏覆盖，
`needsClear=false` 跳过清屏，不因新模式而变慢。

`reduceQuality(step)`（§5.9 质量自适应调用）：
- `soft`：`step1` → `dispersion = 0`（省 2 次采样）
- `sand`：`step1` → `grain *= 2`（粒子数降至 1/4）；`step2` → 同时关闭涌动与随机打散

#### 5.14.7 沙砾参数（`SAND_PARAMS`，`hero.config.ts`）

全部**无量纲 / 以 CSS 像素表达**，与分辨率无关。

| 键 | 默认 | 范围 | 含义 |
|---|---|---|---|
| `grain` | **1.5** | 1–6 | 颗粒边长（**CSS 像素**）。粒径必须用 CSS 像素而非物理像素 |
| `spread` | **6** | 0–8 | 主项幅度（**颗粒直径的倍数**） |
| `scatter` | **0.06** | 0–1 | 随机项幅度（占主项的比例）。**必须小** |
| `settle` | **0.03** | 0–0.6 | 涌动幅度（占主项的比例） |
| `shrink` | **0** | 0–0.7 | 位移致颗粒收缩比例。**默认关闭** |
| `shadow` | **0.15** | 0–0.6 | 位移致压暗比例 |
| `bed` | **0.62** | 0–0.9 | 缝隙底图压暗比例（见 §5.14.8） |
| `zoom` | **0.94** | 0.85–1 | 采样内缩（与软体同值） |

#### 5.14.7b 实测数据（不是“应该没问题”）

| 指标 | 实测 | 门槛 | 状态 |
|---|---|---|---|
| 静止态 vs 原图（`refDataURL`） | meanDiff **0.001** | < 3 | ✅ |
| 沙粒均色 vs 原图均色 | 色差 **8.9** | < 12 | ✅ |
| 缝隙占比 | 14.6%（重构前曾达 45%） | < 30% | ✅ |
| 松手 3.2s 后 vs 静止 | meanDiff **0.000** | < 3 | ✅ |
| 四角占比变化 | 0.00% → 0.00% | < 1% | ✅ |
| 喷散期帧间隔 p95（146k 颗粒） | **17.6 ms** | < 25 | ✅ |
| 反复切模式后 `createTexture` 计数 | 3 → **3** | 不增长 | ✅ |
| 粒子数（1.5 CSSpx，DPR1 / DPR2） | 82,290 / 146,380 | — | — |
| 可见变化率 | 12.1% | 阈值待定 | ⏸ 交互重构中 |

最后一行按业主指示暂缓定阈值：沙砾交互将整体换方向（§5.14.9），
「散开该有多明显」是新交互的美学参数。**其余正确性门槛仍为硬断言。**

#### 5.14.8 缝隙底色：**变暗的原图**，不是纯色底

缝隙底下铺一层**随扰动深度压暗的原图**（`bed` pass，一个整屏 quad）。
沙被推开得越多，露出的底越暗 —— 像沙投下的影子。

> **勘误**：早前定的是纯米色 `--bg`。实测在深色照片区（西装）45% 的浅色缝隙
> 连成迷宫状亮纹，**被眼睛读成「白色沙粒」** —— 业主明确否决。
> 改为压暗原图后，缝隙永远是原图色调，白砂错觉从构造上消除。

#### 5.14.9 沙砾模式：待重构（业主 2026-06 指示）

现有「斥力扩散」方向效果不达预期。业主给出新方向：

- **默认就是沙画形式展示**（不是「原图 → 变成沙」）；
- 鼠标 / 触摸像**在沙子上滑动**（划过处被犁开、堆到两侧），
  而不是「同极互斥式向外炸开」；
- 参考交互：<https://sand.scottsun.io/>

**重构前不改沙砾渲染代码**；`soft` 保持默认。重构时须重写本节与 §5.14.3–5.14.7。

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

> **用例 3–7、11–13 为软胶模式专属**：必须以 `?mode=soft&autoplay=0` 运行。
> （模式改了参照物就变了；像素类断言必须固定模式与画面）

#### 12.2b 沙砾模式（`?mode=sand`）

14. **模式选择**：`?mode=sand` 生效沙砾、`?mode=soft` 生效软胶、非法值静默回退默认；
    `window.__hero.debug().mode` 反映**实际生效**模式（能力不足回退时也如实反映）。
15. **静止一致性**：静止截图与 `refDataURL()` 平均色差 **< 3/255**
    （比软体的 2 略宽：分块双线性重采样本身有微小误差；不达标就减小 `grain`）。
16. **按压确实散开**：按压区「米色底像素占比」由 ~0 升至 **>5%** —— 直接量出缝隙，不靠主观。
17. **松手拼回**：`pointerup` 后 2.5s 内该占比回落至 **<1%**。
18. **局部性**：四角米色底像素占比基本不变（与静止时差值 <1%）。
19. **喷散期性能**：帧间隔 **p95 < 25ms**（与轮播淡入同一口径）。
20. **切换不泄漏**：`sand ↔ soft` 连续切换若干次后 `createTexture` 调用数不再增长
    （上下文丢失重建除外）。

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
| P5 | **相册轮播**（§5.13）：资产管线 + 双纹理淡入 + 指示器/播放按钮 | 12.2b 之外的 T13 全绿 |
| P6 | **交互模式**（§5.14）：模式架构抽取 + 沙砾模式 + 面板分段控件 | §12.2b 全绿，且软胶用例 3–7/11–13 不回退 |

## 14. 明确不做（本阶段）

背景音乐、微信 JS-SDK 定制分享、webfont 子集化、多语言、PWA/离线。

**不引入粒子/图形库**：沙砾模式用自写着色器（~150 行）。
理由：PixiJS / three.js 等会引入 **+100~600KB gzip**，而首屏 JS 预算是 30KB（当前 19.7KB）；
且它们（作为通用粒子系统）同样给不了 §5.14.3 要求的「静止态 = 逐像素原图」。
**引入库无法解决核心问题，只会爆预算。**

**沙砾不做真实粒间互斥（n² 碰撞）**：以高度场梯度 + 每颗随机项近似，
视觉上已是「向外散开」，且保持 O(1) 每颗。
真做逐对互斥在万级粒子下必卡（也违背 §5.14.6 的性能约束）。

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
