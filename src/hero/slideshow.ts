/**
 * Hero 相册轮播（SPEC §5.13）。
 *
 * 设计要点：
 * 1. **省电**：停留 5 秒期间主循环处于休眠（setTimeout 计时），只有淡入的
 *    ~900ms 才唤醒 RAF；不常驻渲染。
 * 2. **不出现空白帧**：每张图展示期间就预载下一张；若到点仍未载好，
 *    跳过本轮并稍后重试，绝不切到未加载的图。
 * 3. **硬件永远只有 2 张图纹理**：淡入结束后渲染器内部乒乓交换，旧图槽位
 *    直接被下一次上传复用（渲染器持有，本模块只管提交新图）。
 * 4. **按压期间不切图**：由注入的 canAdvance() 判定（可见/前台/未按压）。
 * 5. **淡入与物理共用同一个 RAF 循环**，因此形变与过渡天然同步。
 */

export interface GalleryImage {
  id: string;
  /** 移动端 URL */
  m: string;
  /** 桌面端 URL */
  l: string;
  /** WebP 不支持时的兜底 URL */
  mJpg: string;
}

export interface SlideshowHost {
  /**
   * 把一张已解码的图就位（宿主做 cover 裁切 + 上传到「备用槽」）。
   *
   * **刻意在停留期内调用，而不是在淡入开始帧**：cover 裁切要 drawImage 一张
   * ~1.3MP 的图，加上 texImage2D 上传，放在切换瞬间会掉帧。
   * 放在停留期则完全脱离关键路径，淡入开始时只需改一个 uniform。
   */
  prepare(img: HTMLImageElement): void;
  /** 写入淡入进度 [0,1] 并请求重绘 */
  setMix(mix: number): void;
  /** 淡入结束：备用槽提升为当前槽 */
  commit(): void;
  /** 唤醒渲染循环 */
  wake(): void;
}

export interface SlideshowOpts {
  advanceMs: number;
  fadeMs: number;
  autoplay: boolean;
  /** 环境是否允许推进（页面前台 / Hero 可见 / 用户未按压） */
  canAdvance: () => boolean;
  /** 按视口选择 m 或 l */
  pickUrl: (img: GalleryImage) => string;
  /** 指示器与播放按钮的挂载点（.hero-photo 内） */
  mount: HTMLElement;
}

/** 缓入缓出：线性 crossfade 中段会显得「发灰」，S 曲线观感更自然 */
const ease = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const RETRY_MS = 600;
const PAUSE_RETRY_MS = 900;

const ICON_PAUSE =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><rect x="3.5" y="2.5" width="3.2" height="11" rx="1" fill="currentColor"/><rect x="9.3" y="2.5" width="3.2" height="11" rx="1" fill="currentColor"/></svg>';
const ICON_PLAY =
  '<svg viewBox="0 0 16 16" width="11" height="11" aria-hidden="true"><path d="M4.5 2.8v10.4c0 .7.8 1.1 1.4.7l8-5.2c.6-.4.6-1.2 0-1.5l-8-5.2c-.6-.4-1.4 0-1.4.8Z" fill="currentColor"/></svg>';

export class Slideshow {
  index = 0;
  /** 淡入进度 0~1 */
  mix = 0;

  private fading = false;
  private timer = 0;
  private autoplay: boolean;
  private next: HTMLImageElement | null = null;
  private nextIndex = -1;
  private failed = new Set<number>();
  private destroyed = false;
  /**
   * 预载代数：每次落定/指定切换都递增。
   * 用于丢弃**过期的在途加载**——否则用户快速点圆点时，先前发出的预载回调
   * 会在新目标就位后回来把 next/nextIndex 改回旧图，造成「切错图」。
   */
  private gen = 0;
  private bar: HTMLElement | null = null;
  private dots: HTMLButtonElement[] = [];
  private playBtn: HTMLButtonElement | null = null;

  constructor(
    private images: GalleryImage[],
    private host: SlideshowHost,
    private opts: SlideshowOpts
  ) {
    this.autoplay = opts.autoplay;
  }

  get total(): number {
    return this.images.length;
  }

  isFading(): boolean {
    return this.fading;
  }

  isAutoplay(): boolean {
    return this.autoplay;
  }

  /** 首张已由宿主上传；这里只负责建指示器、预载第二张、开始计时 */
  start(): void {
    this.buildBar();
    this.syncBar();
    this.preload(this.index);
    this.scheduleDwell();
  }

  // ── 指示器 / 播放按钮 ──────────────────────────────────────────

  private buildBar(): void {
    if (this.total <= 1) return; // 只有一张时不显示任何控件
    const bar = document.createElement('div');
    bar.className = 'hero-bar';
    // 只阻断「会产生按压」的事件，防止点圆点时在软体上按出凹坑。
    //
    // **pointerup / pointercancel / pointerleave 必须放行**：
    // 鼠标移向指示器的途中会划过照片并留下一个 hover 指针（目标压力仅 0.16）；
    // 若把 pointerup 也拦掉，endPointer 永远不会执行，该指针就永久残留 ——
    // 既会让轮播误判「用户正按着」而停住，也会让渲染循环再也无法休眠。
    const stop = (e: Event) => e.stopPropagation();
    for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'click']) {
      bar.addEventListener(ev, stop);
    }

    const tablist = document.createElement('div');
    tablist.className = 'hero-dots';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', '照片切换');

    this.dots = this.images.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'hero-dot';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-label', `第 ${i + 1} 张照片`);
      b.addEventListener('click', () => this.goTo(i));
      tablist.appendChild(b);
      return b;
    });

    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'hero-play';
    play.addEventListener('click', () => this.setAutoplay(!this.autoplay));
    this.playBtn = play;

    bar.appendChild(tablist);
    bar.appendChild(play);
    this.opts.mount.appendChild(bar);
    this.bar = bar;
  }

  private syncBar(): void {
    if (!this.bar) return;
    this.dots.forEach((d, i) => {
      const on = i === this.index;
      d.classList.toggle('on', on);
      d.setAttribute('aria-selected', String(on));
    });
    const play = this.playBtn;
    if (play) {
      play.innerHTML = this.autoplay ? ICON_PAUSE : ICON_PLAY;
      const label = this.autoplay ? '暂停自动播放' : '开始自动播放';
      play.setAttribute('aria-label', label);
      play.setAttribute('title', label);
      play.setAttribute('aria-pressed', String(!this.autoplay));
      play.classList.toggle('paused', !this.autoplay);
    }
  }

  // ── 自动播放开关 ──────────────────────────────────────────────

  setAutoplay(on: boolean): void {
    this.autoplay = on;
    this.note(on ? '播放' : '暂停');
    this.syncBar();
    this.scheduleDwell();
  }

  /** 环境变化（回到前台 / 离开 / 按压结束）后调用：重置为完整停留时长，不做补涨 */
  refresh(): void {
    this.scheduleDwell();
  }

  // ── 停留计时（主循环休眠期的唯一活动） ────────────────────────

  /** 清掉待触发的停留计时。
   * **必须用这个而不是 `this.timer = 0`**：直接置 0 会孤立仍在排队的定时器，
   * 它仍会触发——表现为「已经暂停了却又自己切了下一张」。
   * 点圆点时就会遇到：停留定时器还在排队，而 beginFade 把引用抹掉了。 */
  private clearDwell(): void {
    window.clearTimeout(this.timer);
    this.timer = 0;
  }

  private scheduleDwell(): void {
    this.clearDwell();
    if (this.destroyed) return;
    if (this.total <= 1) return;
    if (!this.autoplay) return;
    if (this.fading) return;
    if (!this.opts.canAdvance()) {
      this.timer = window.setTimeout(() => this.scheduleDwell(), PAUSE_RETRY_MS);
      return;
    }
    this.timer = window.setTimeout(() => this.beginFade('dwell'), this.opts.advanceMs);
  }

  // ── 切换 ─────────────────────────────────────────────────────

  /** 从 from 之后找到第一张「可用且未失败」的图；找不到返回 -1 */
  private findNextLoadable(from: number): number {
    for (let step = 1; step <= this.total; step++) {
      const i = (from + step) % this.total;
      if (i === this.index) break; // 绕回自己就停
      if (!this.failed.has(i)) return i;
    }
    return -1;
  }

  /** 预载 from 之后的下一张（跳过加载失败的图，一次只载一张） */
  private preload(from: number): void {
    if (this.total <= 1 || this.destroyed) return;
    const target = this.findNextLoadable(from);
    if (target < 0) return;
    if (this.nextIndex === target && this.next) return; // 已就绪
    const el = new Image();
    el.decoding = 'async';
    const g = this.gen;
    el.onload = () => {
      if (this.destroyed || g !== this.gen) return; // 过期预载
      // 过渡进行中绝不动备用槽：否则会把正在淡入的内容串成另一张图
      if (this.fading) return;
      this.stage(el, target);
    };
    el.onerror = () => {
      if (this.destroyed || g !== this.gen) return;
      this.failed.add(target);
      this.preload(target); // 这张坏了：继续往后找
    };
    el.src = this.opts.pickUrl(this.images[target]);
  }

  /**
   * 就位：记录为下一个切换目标，并完成裁切 + 纹理上传。
   * 这里承担全部重活（见 SlideshowHost.prepare 注释）。
   */
  private stage(img: HTMLImageElement, index: number): void {
    this.next = img;
    this.nextIndex = index;
    this.host.prepare(img);
  }

  goTo(target: number): void {
    const i = ((target % this.total) + this.total) % this.total;
    if (i === this.index) {
      this.refresh();
      return;
    }
    // 用户的主动选择优先于排队的停留计时（否则旧定时器会在稍后把画面拨走）
    this.clearDwell();
    // 上一次淡入还没结束就点了新的：立即落定，避免叠加两次过渡
    if (this.fading) this.finishFade();

    if (this.nextIndex === i && this.next) {
      this.beginFade('dot');
      return;
    }
    // 目标还没就位：现载，载好再切（保持「绝不空白」）
    // 递增代数 → 丢弃先前发出的预载回调，避免它们把目标改回旧图
    this.gen++;
    const g = this.gen;
    const url = this.opts.pickUrl(this.images[i]);
    const el = new Image();
    el.decoding = 'async';
    el.onload = () => {
      if (this.destroyed || g !== this.gen) return;
      this.stage(el, i);
      this.beginFade('dot');
    };
    el.onerror = () => {
      if (g !== this.gen) return;
      this.failed.add(i);
      this.refresh();
    };
    el.src = url;
  }

  /** 诊断：最近的切换触发原因（供 E2E / 排查用，最多保留 20 条） */
  readonly log: string[] = [];

  private note(msg: string): void {
    this.log.push(msg);
    if (this.log.length > 20) this.log.shift();
  }

  private beginFade(reason: string): void {
    this.clearDwell(); // 不要用 this.timer = 0：会孤立排队中的定时器
    if (this.destroyed || this.fading) return;
    if (!this.opts.canAdvance()) {
      this.note(`${reason}: 环境不允许，延后`);
      this.scheduleDwell();
      return;
    }
    // 目标尚未就位：绝不切到空图 —— 继续等，就位后再试
    if (!this.next || this.nextIndex < 0) {
      this.note(`${reason}: 目标未就位，重试`);
      this.preload(this.index);
      this.timer = window.setTimeout(() => this.beginFade('retry'), RETRY_MS);
      return;
    }
    const target = this.nextIndex;
    this.note(`${reason}: ${this.index}→${target}`);

    if (this.opts.fadeMs <= 0) {
      // prefers-reduced-motion：直接落定，不做透明度动画
      this.mix = 1;
      this.commit(target);
      return;
    }
    // 至此不必再做任何重活（裁切/上传已在停留期完成），只改 uniform + 唤醒
    this.mix = 0;
    this.host.setMix(0);
    this.fading = true;
    this.host.wake();
  }

  /** 淡入结束后落定：切索引、提交纹理、预载再下一张、重排计时 */
  private commit(target: number): void {
    this.host.setMix(1);
    this.host.commit();
    this.index = target;
    this.next = null;
    this.nextIndex = -1;
    this.mix = 0;
    this.fading = false;
    this.gen++; // 落定：此前的在途预载全部作废
    this.syncBar();
    this.preload(this.index);
    this.scheduleDwell();
  }

  /** 把正在进行的淡入立刻推到终点（用户抢点下一张时用） */
  private finishFade(): void {
    if (!this.fading) return;
    const target = this.nextIndex >= 0 ? this.nextIndex : this.index;
    this.mix = 1;
    this.commit(target);
  }

  /**
   * 由宿主的主循环每帧调用。返回 true 表示本帧需要重绘。
   * 用实际帧间隔推进（而非固定步长），掉帧时总时长仍然一致。
   */
  tickFade(dt: number): boolean {
    if (!this.fading) return false;
    this.mix = Math.min(1, this.mix + dt / (this.opts.fadeMs / 1000));
    this.host.setMix(ease(this.mix));
    if (this.mix >= 1) {
      const target = this.nextIndex >= 0 ? this.nextIndex : this.index;
      this.commit(target);
      return true; // 落定帧也要画
    }
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    this.clearDwell();
    this.fading = false;
    this.bar?.remove();
    this.bar = null;
    this.dots = [];
    this.playBtn = null;
  }
}
