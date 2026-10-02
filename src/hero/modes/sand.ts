/**
 * 沙砾模式（§5.14）。
 *
 * 核心不变量：**静止态 = 原图**，且是几何构造保证而非调参结果 ——
 *   一张 GL_POINTS 网格，一格一颗沙砾；静止位置 = 格中心 ((i+.5)*cell, (j+.5)*cell)，
 *   cell 为**整数**物理像素，gl_PointSize = cell。
 * 于是沙砾方形脚印的边界恰为 i*cell / (i+1)*cell（整数），相邻沙砾无缝无重叠地
 * 铺满画布（与画布尺寸是否为 cell 整数倍无关：末列/末行越界部分被裁掉，
 * 但落在视口内的像素中心仍被覆盖）。实测 cell=1~8 漏缝像素均为 0。
 *
 * 位移直接读高度场（r,g = 斜率，b = 高度），**不新增物理**：
 *   disp = outDir * spread * cell * hn + rnd * (scatter + settle*sin) * spread * cell * hn
 * 其中 outDir = 梯度方向（= 最陡上升 = 背离凹陷中心），hn = 归一化深度。
 * 这是**斥力模型**：越靠近按压中心越推开，像同极互斥。
 * 松手后 h 按现有弹性+蠕变回落 → disp → 0 → 沙砾自动拼回原图。
 * 沙砾**无独立状态、无粒子池、不产生 GC**。
 */
import { MAX_HEIGHT, MAX_SLOPE } from '../softbody';
import { SAND_BG } from '../hero.config';
import { SAND_FRAG, SAND_VERT, BED_FRAG, BED_VERT } from '../shaders';
import { compileProgram, uniforms } from './glutil';
import { UNIT_FIELD, UNIT_IMAGE_CUR, UNIT_IMAGE_NEXT } from './bank';
import type { HeroMode, ModeDeps } from './types';

export interface SandTuning {
  /** 颗粒边长（**CSS 像素**，与分辨率无关） */
  grain: number;
  /** 主项幅度（**颗粒直径的倍数**） */
  spread: number;
  /** 随机项幅度（占主项的比例） */
  scatter: number;
  /** 涌动幅度（占主项的比例） */
  settle: number;
  /** 位移致颗粒收缩比例（默认 0 = 关闭） */
  shrink: number;
  /** 位移致压暗比例 */
  shadow: number;
  /** 缝隙底图压暗比例（缝隙露**变暗的原图**而非纯色底） */
  bed: number;
  /** 采样内缩 */
  zoom: number;
}

const UNIFORM_NAMES = [
  'uImg', 'uImgB', 'uField', 'uRes', 'uCell', 'uZoom', 'uSpread', 'uScatter',
  'uSettle', 'uShrink', 'uShadow', 'uTime', 'uMix', 'uMaxSlope', 'uMaxH',
] as const;

/** 顶点属性槽位 */
const ATTR_HOME = 0;
const ATTR_SEED = 1;
const ATTR_POS = 2;

export const sandBg = (): readonly [number, number, number] => SAND_BG;

/**
 * 创建前的能力检测（§5.14.5）。任一不满足则回退软胶。
 * WebGL1 **不保证** MAX_VERTEX_TEXTURE_IMAGE_UNITS > 0（沙砾在顶点着色器读高度场），
 * 而 ALIASED_POINT_SIZE_RANGE 规范只保证上限 ≥ 1。
 */
export function sandCapabilities(
  gl: WebGLRenderingContext,
  cellPx: number
): { ok: boolean; reason: string; maxPointSize: number } {
  const vtf = Number(gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)) || 0;
  const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as ArrayLike<number> | null;
  const maxPointSize = range && range.length >= 2 ? Number(range[1]) : 1;
  if (vtf < 1) {
    return { ok: false, reason: `顶点纹理取样不可用（MAX_VERTEX_TEXTURE_IMAGE_UNITS=${vtf}）`, maxPointSize };
  }
  if (!(maxPointSize >= cellPx)) {
    return { ok: false, reason: `点尺寸上限 ${maxPointSize}px < 颗粒 ${cellPx}px`, maxPointSize };
  }
  return { ok: true, reason: '', maxPointSize };
}

/** 确定性的每颗随机值：重建网格时图案稳定，不出现「改窗口沙砾重排」 */
export function seedAt(i: number, j: number): number {
  let s = ((i + 1) * 73856093) ^ ((j + 1) * 19349663);
  s = Math.imul(s ^ (s >>> 13), 1274126177) >>> 0;
  return (s % 100000) / 100000;
}

/**
 * 颗粒边长归一化（**核心不变量，单测守护**）：必须是 **≥ 1 的整数**（物理像素）。
 *
 * 为何整数即可（不要求偶数）：静止位置为 (i+.5)*cell、点尺寸为 cell，
 * 于是沙砾方形脚印的左右边界恰为 i*cell 与 (i+1)*cell —— 只要 cell 是整数，
 * 这两个边界就是整数，相邻沙砾严格无缝无重叠。
 * （曾误写为「必须偶数」；实测 60×60 画布下 cell=1~8 漏缝像素均为 0，
 *   奇偶无关 —— 这条约束放开了粒径下限，细沙才做得出来。）
 *
 * grain 以 **CSS 像素**表达，经 scale 换算到物理像素 —— 粒径在任何 DPR 下
 * 视觉一致，粒子数也不会随 DPR 平方爆炸。
 */
export function normalizeCell(grain: number, scale = 1, maxPointSize = 1024, qualityStep = 0): number {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const g = Number.isFinite(grain) ? grain : 2;
  let c = Math.max(1, Math.round(g * s));
  // 点尺寸上限（个别驱动很小）
  const limit = Math.max(1, Math.floor(Number.isFinite(maxPointSize) ? maxPointSize : 1024));
  c = Math.min(c, limit);
  // 质量降级：颗粒加倍 → 粒子数降至 1/4
  if (qualityStep >= 1) c *= 2;
  return Math.max(1, Math.round(c));
}

/** 粒子网格：覆盖整块画布的 home 坐标与每颗随机值 */
export function grainGrid(
  w: number,
  h: number,
  cell: number
): { cols: number; rows: number; count: number; home: Float32Array; seeds: Float32Array } {
  const cols = Math.max(1, Math.ceil(w / cell));
  const rows = Math.max(1, Math.ceil(h / cell));
  const count = cols * rows;
  const home = new Float32Array(count * 2);
  const seeds = new Float32Array(count);
  let k = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++, k++) {
      home[k * 2] = (i + 0.5) * cell;
      home[k * 2 + 1] = (j + 0.5) * cell;
      seeds[k] = seedAt(i, j);
    }
  }
  return { cols, rows, count, home, seeds };
}

export class SandMode implements HeroMode {
  readonly id = 'sand' as const;
  /** 缝隙露出底色 → 必须每帧清屏 */
  readonly needsClear = true;

  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null>;
  /** 纸面 pass：缝隙底下是**变暗的原图**，不是纯色底 */
  private bedProg: WebGLProgram;
  private bu: Record<string, WebGLUniformLocation | null>;
  private quad: WebGLBuffer | null = null;
  private home: WebGLBuffer | null = null;
  private seeds: WebGLBuffer | null = null;
  private count = 0;
  private cell = 0;
  private w = 0;
  private h = 0;
  private mix = 0;
  private qualityStep = 0;
  private readonly maxPointSize: number;

  constructor(private deps: ModeDeps, readonly tuning: SandTuning) {
    const { gl } = deps;
    const cap = sandCapabilities(gl, normalizeCell(tuning.grain, deps.scale, 1024, 0));
    if (!cap.ok) throw new Error(`sand: ${cap.reason}`);
    this.maxPointSize = cap.maxPointSize;

    const prog = compileProgram(gl, SAND_VERT, SAND_FRAG, { aHome: ATTR_HOME, aSeed: ATTR_SEED });
    if (!prog) throw new Error('sand: 着色器编译/链接失败');
    this.prog = prog;
    this.u = uniforms(gl, prog, UNIFORM_NAMES);
    gl.useProgram(prog);
    gl.uniform1i(this.u.uImg, UNIT_IMAGE_CUR);
    gl.uniform1i(this.u.uField, UNIT_FIELD);
    gl.uniform1i(this.u.uImgB, UNIT_IMAGE_NEXT);
    gl.uniform1f(this.u.uMaxSlope, MAX_SLOPE);
    gl.uniform1f(this.u.uMaxH, MAX_HEIGHT);

    const bedProg = compileProgram(gl, BED_VERT, BED_FRAG, { aPos: ATTR_POS });
    if (!bedProg) throw new Error('sand: 纸面着色器编译/链接失败');
    this.bedProg = bedProg;
    this.bu = uniforms(gl, bedProg, ['uImg', 'uImgB', 'uField', 'uZoom', 'uMix', 'uMaxH', 'uBed']);
    gl.useProgram(bedProg);
    gl.uniform1i(this.bu.uImg, UNIT_IMAGE_CUR);
    gl.uniform1i(this.bu.uField, UNIT_FIELD);
    gl.uniform1i(this.bu.uImgB, UNIT_IMAGE_NEXT);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  get zoom(): number {
    return this.tuning.zoom;
  }

  /**
   * 颗粒边长：CSS 像素 → 物理像素（整数，见 normalizeCell）。
   */
  private cellSize(): number {
    return normalizeCell(this.tuning.grain, this.deps.scale, this.maxPointSize, this.qualityStep);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.rebuild();
  }

  setFieldSize(_cols: number, _rows: number): void {
    // 沙砾按 UV 采样高度场，与网格分辨率无关
  }

  setMix(mix: number): void {
    this.mix = mix;
  }

  reduceQuality(step: number): void {
    // step1：颗粒加倍 → 粒子数降至 1/4（需重建网格）；
    // step2：不再重建，只关掉涌动与随机打散（在 draw() 中生效）
    const next = Math.max(this.qualityStep, step);
    if (next === this.qualityStep) return;
    const needsRebuild = this.qualityStep < 1 && next >= 1;
    this.qualityStep = next;
    if (needsRebuild) this.rebuild();
  }

  /** 重建粒子网格（尺寸变化 / grain 变化 / 质量降级时调用） */
  rebuild(): void {
    const gl = this.deps.gl;
    const cell = this.cellSize();
    this.cell = cell;
    const { count, home, seeds } = grainGrid(this.w, this.h, cell);
    if (this.home) gl.deleteBuffer(this.home);
    if (this.seeds) gl.deleteBuffer(this.seeds);
    this.home = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.home);
    gl.bufferData(gl.ARRAY_BUFFER, home, gl.STATIC_DRAW);
    this.seeds = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seeds);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    this.count = count;
  }

  draw(): void {
    const gl = this.deps.gl;
    if (!this.count || !this.home || !this.seeds) return;
    const t = this.tuning;

    // 1) 纸面：整屏铺一层**随扰动深度压暗的原图**。
    //    沙砾散开后露出的就是它 —— 不再是一整块浅色（深色照片区会读成「白砂」）。
    gl.useProgram(this.bedProg);
    gl.uniform1f(this.bu.uZoom, t.zoom);
    gl.uniform1f(this.bu.uMix, this.mix);
    gl.uniform1f(this.bu.uMaxH, MAX_HEIGHT);
    gl.uniform1f(this.bu.uBed, this.qualityStep >= 2 ? t.bed * 0.5 : t.bed);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(ATTR_POS);
    gl.vertexAttribPointer(ATTR_POS, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2) 沙砾
    gl.useProgram(this.prog);
    gl.uniform2f(this.u.uRes, this.w, this.h);
    gl.uniform1f(this.u.uCell, this.cell);
    gl.uniform1f(this.u.uZoom, t.zoom);
    gl.uniform1f(this.u.uSpread, t.spread);
    gl.uniform1f(this.u.uScatter, this.qualityStep >= 2 ? 0 : t.scatter);
    gl.uniform1f(this.u.uSettle, this.qualityStep >= 2 ? 0 : t.settle);
    gl.uniform1f(this.u.uShrink, t.shrink);
    gl.uniform1f(this.u.uShadow, t.shadow);
    // 涌动相位：静止态 h=0 → 该项恒为 0，画面不会自走（§5.8）
    gl.uniform1f(this.u.uTime, performance.now() / 1000);
    gl.uniform1f(this.u.uMix, this.mix);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.home);
    gl.enableVertexAttribArray(ATTR_HOME);
    gl.vertexAttribPointer(ATTR_HOME, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.seeds);
    gl.enableVertexAttribArray(ATTR_SEED);
    gl.vertexAttribPointer(ATTR_SEED, 1, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.POINTS, 0, this.count);
  }

  destroy(): void {
    const gl = this.deps.gl;
    gl.deleteProgram(this.prog);
    gl.deleteProgram(this.bedProg);
    if (this.quad) gl.deleteBuffer(this.quad);
    if (this.home) gl.deleteBuffer(this.home);
    if (this.seeds) gl.deleteBuffer(this.seeds);
    this.quad = null;
    this.home = this.seeds = null;
    this.count = 0;
  }

  /** 诊断：粒子数与颗粒边长（E2E 断言「纹理/显存不随相册张数增长」时用） */
  get stats(): { grains: number; cell: number } {
    return { grains: this.count, cell: this.cell };
  }
}
