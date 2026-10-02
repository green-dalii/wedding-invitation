/**
 * 渲染调度器（§5.14.1）。
 *
 * 持有：GL 上下文、纹理银行（双纹理乒乓）、高度场纹理、绘制尺寸、当前交互模式。
 * 对外 API 与重构前保持一致，因此 hero.ts 只多了「选模式」与 reduceQuality 两处。
 *
 * 模式实现见 modes/soft.ts（软胶，原实现原样搬移）与 modes/sand.ts（沙砾）。
 */
import { HERO_RENDER, SAND_PARAMS, SAND_BG } from './hero.config';
import { FieldTexture, TextureBank } from './modes/bank';
import { SoftMode, type RenderTuning } from './modes/soft';
import { SandMode, sandCapabilities, type SandTuning } from './modes/sand';
import { NoneMode } from './modes/none';
import type { HeroMode, ModeDeps, ModeId } from './modes/types';

export type { RenderTuning } from './modes/soft';
export type { SandTuning } from './modes/sand';
export type { ModeId } from './modes/types';

/** 默认渲染参数集中管理于 hero.config.ts */
export const DEFAULT_TUNING: RenderTuning = { ...HERO_RENDER };

export interface RendererOptions {
  allowSoftware?: boolean;
  /** 期望的交互模式；能力不足时静默回退 soft（§5.14.5） */
  mode?: ModeId;
}

export class Renderer {
  private gl!: WebGLRenderingContext;
  private bank!: TextureBank;
  private field!: FieldTexture;
  private softMode: SoftMode | null = null;
  private sandMode: SandMode | null = null;
  private noneMode: NoneMode | null = null;
  private active!: HeroMode;
  private width = 1;
  private height = 1;

  /** tuning 由调度器持有 → 模式实例因上下文丢失而重建时，业主调好的数值不丢 */
  readonly softTuning: RenderTuning = { ...HERO_RENDER };
  readonly sandTuning: SandTuning = { ...SAND_PARAMS };

  /** 实际生效的交互模式（沙砾能力不足时会是 'soft'） */
  mode: ModeId = 'soft';
  /** 沙砾不可用的原因（诊断用；可用时为空串） */
  sandUnavailable = '';
  lost = false;
  maxTextureSize = 2048;
  onRestore: (() => void) | null = null;

  private constructor(private canvas: HTMLCanvasElement) {}

  static create(canvas: HTMLCanvasElement, opts: RendererOptions = {}): Renderer | null {
    const r = new Renderer(canvas);
    const attrs: WebGLContextAttributes = {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: !opts.allowSoftware,
    };
    const gl = (canvas.getContext('webgl', attrs) ||
      canvas.getContext('experimental-webgl', attrs)) as WebGLRenderingContext | null;
    if (!gl) return null;
    r.gl = gl;
    r.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
    // 这两者是纯 JS 对象（持画布引用），必须跨上下文重建复用
    r.bank = new TextureBank(gl);
    r.field = new FieldTexture(gl);

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      r.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      r.lost = false;
      r.bank.invalidate();
      r.field.invalidate();
      if (!r.build()) return;
      r.bank.restore();
      r.field.restore();
      r.onRestore?.();
    });

    if (!r.build()) return null;
    r.setMode(opts.mode ?? 'soft');
    return r;
  }

  /** 建立（或重建）两个 program；软胶失败即整体失败，沙砾失败仅降级 */
  /** 传给两个模式的共享依赖（scale 随 resize / refresh 更新） */
  private deps: ModeDeps | null = null;

  /**
   * 设备像素 ÷ CSS 像素。沙砾粒径以 **CSS 像素**表达（任何 DPR 下视觉一致、
   * 粒子数不随 DPR 平方爆炸），需换算到物理像素；取整由 normalizeCell 负责。
   */
  private scaleOf(): number {
    const css = this.canvas.clientWidth;
    return css > 0 ? this.canvas.width / css : 1;
  }

  private build(): boolean {
    const gl = this.gl;
    this.softMode?.destroy();
    this.sandMode?.destroy();
    this.noneMode?.destroy();
    this.softMode = null;
    this.sandMode = null;
    this.noneMode = null;

    const deps: ModeDeps = { gl, bank: this.bank, field: this.field, scale: this.scaleOf() };
    this.deps = deps;
    try {
      this.softMode = new SoftMode(deps, this.softTuning);
    } catch (err) {
      console.warn('[hero] 软胶模式初始化失败', err);
      return false;
    }

    const cap = sandCapabilities(gl, this.sandTuning.grain);
    this.sandUnavailable = cap.ok ? '' : cap.reason;
    if (cap.ok) {
      try {
        this.sandMode = new SandMode(deps, this.sandTuning);
      } catch (err) {
        this.sandUnavailable = `初始化失败：${String(err)}`;
        this.sandMode = null;
      }
    }
    if (this.sandUnavailable) console.info(`[hero] 沙砾模式不可用，回退软胶：${this.sandUnavailable}`);

    // 无特效模式：纯平铺，构造不会失败（着色器极简）
    this.noneMode = new NoneMode(deps);

    this.active = this.softMode;
    this.mode = 'soft';
    return true;
  }

  /** 切换交互模式；沙砾不可用时静默回退软胶 */
  setMode(id: ModeId): void {
    const target = id === 'sand' ? this.sandMode : id === 'none' ? this.noneMode : this.softMode;
    if (!target) {
      if (id === 'sand' && this.sandUnavailable) {
        console.info(`[hero] 无法切到沙砾：${this.sandUnavailable}`);
      }
      this.active = this.softMode!;
      this.mode = 'soft';
    } else {
      this.active = target;
      this.mode = id;
    }
    this.active.setFieldSize(this.field.cols, this.field.rows);
    this.active.resize(this.width, this.height);
  }

  get zoom(): number {
    return this.active.zoom;
  }

  /** 当前模式下颗粒统计（诊断/E2E 用；软胶模式返回 null） */
  get grainStats(): { grains: number; cell: number } | null {
    return this.sandMode && this.mode === 'sand' ? this.sandMode.stats : null;
  }

  // ── 图片纹理（双纹理乒乓，跨模式共用） ──────────────────────

  show(canvas: HTMLCanvasElement): void {
    this.bank.show(canvas);
  }

  setIncoming(canvas: HTMLCanvasElement): void {
    this.bank.setIncoming(canvas);
  }

  /**
   * 落定：把「待显示槽」提升为「当前槽」。
   *
   * **必须紧接着把 mix 复位为 0** —— 否则 uniform 会停在 1，而此时
   * 单元0=新图、单元2=旧图，着色器算的是 mix(新, 旧, 1) = **旧图**。
   * 结果：切换后整段停留期显示的是上一张，直到下次 beginFade 的 setMix(0)
   * 才弹回新图 —— 业主反馈的「双切换的跳变」正是这个。
   */
  commit(): void {
    this.bank.commit();
    this.setMix(0);
  }

  setMix(mix: number): void {
    this.softMode?.setMix(mix);
    this.sandMode?.setMix(mix);
    // **无特效模式也要收到 mix**：漏掉它会让该模式完全没有淡入淡出，
    // 只剩 commit() 换槽那一刻的硬切。
    this.noneMode?.setMix(mix);
  }

  // ── 高度场 ────────────────────────────────────────────────

  setFieldSize(cols: number, rows: number): void {
    this.field.setSize(cols, rows);
    this.softMode?.setFieldSize(cols, rows);
    this.sandMode?.setFieldSize(cols, rows);
  }

  uploadField(data: Uint8Array): void {
    this.field.upload(data);
  }

  // ── 绘制 ──────────────────────────────────────────────────

  resize(w: number, h: number): void {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (this.deps) this.deps.scale = this.scaleOf();
    this.width = w;
    this.height = h;
    if (!this.lost) this.gl.viewport(0, 0, w, h);
    this.softMode?.resize(w, h);
    this.sandMode?.resize(w, h);
  }

  /** 质量自适应（§5.9）：交给当前模式决定降什么 */
  reduceQuality(step: number): void {
    this.active.reduceQuality(step);
  }

  /** 需要重建资源的参数（如沙砾颗粒边长）变化后调用 */
  refresh(): void {
    if (this.deps) this.deps.scale = this.scaleOf();
    this.softMode?.resize(this.width, this.height);
    this.sandMode?.resize(this.width, this.height);
  }

  draw(): void {
    if (this.lost || !this.bank.hasCurrent()) return;
    const gl = this.gl;
    // 沙砾会露出底色 → 必须清屏；软胶全屏覆盖，跳过以省一次全屏填充
    if (this.active.needsClear) {
      gl.clearColor(SAND_BG[0], SAND_BG[1], SAND_BG[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    this.active.draw();
  }
}
