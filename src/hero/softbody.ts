/**
 * 软体 / 硅胶 / 果冻高度场（CPU，纯数值，无 DOM 依赖，可单测）
 *
 * ══ 粘弹性松弛谱（SPEC §5.4a，基于粘弹性压痕文献）══
 * 真实软体是**弹簧+阻尼的松弛谱**，不是单弹簧。关键是存在**蠕变档**：
 *   - 弹性模（快）：瞬时下陷/回弹 → 按下即凹、松手即弹（Q 弹）
 *   - 蠕变模（慢）：持续受力缓慢加深；卸载后**残留并缓慢恢复** → 拖动留下
 *     会缓慢合拢的沟槽，真实果冻的关键手感
 * 总形变 h_total = h_elastic + h_creep。蠕变模跟踪 0.22·target 并以极慢弹簧恢复。
 * 场内**无任何动力学耦合**（无 ∇²h），作用域外无可见形变。
 *
 * 拖动接触几何：手指划过 = 圆沿路径扫掠 = **胶囊**（点与线段的 Minkowski 和），
 * 用 pressSegment(线段) 一次成形，与速度无关 → 快速拖动也是连续沟槽，无扇贝/采样痕。
 *
 * 多点按压（非线性、厚软体）：平滑合并 u=1−Π(1−gᵢ)（饱和、无折痕）+ 宽缓低尾。
 */

export interface SoftParams {
  /** 弹性刚度：回弹快慢（越大越快） */
  stiff: number;
  /** 弹性模每步速度保留率（ζ 由 stiff 共同决定） */
  damp: number;
  /** 弹性模驱动强度：凹陷跟随紧度 */
  grip: number;
  /** 蠕变率：持续受力时向 creepFrac·target 指数趋近的速率（越大越快） */
  creepRate: number;
  /** 蠕变松弛时间常数（步）：手指离开后指数回 0，τ 越大沟槽留得越久。纯一阶弛豫，**无惯性→不振荡** */
  creepTau: number;
  /** 蠕变深度占比：持续受力额外下陷的比例（真实蠕变） */
  creepFrac: number;
  /** 凹陷深度（高度单位，单指中心净深） */
  depth: number;
  /** 凹陷高斯半径 σ（相对网格列数） */
  sigma: number;
  /** 软鼓尾增益（低幅、宽缓） */
  rim: number;
  /** 深度硬化：压得越深越硬，抵抗感（0=关） */
  harden: number;
}

/** 默认物理参数：集中管理于 hero.config.ts（HERO_PARAMS） */
import { HERO_PARAMS } from './hero.config';

/**
 * 材料参数：硅胶/软胶（高模量、强耗散）—— **不是**粘液（低模量、低耗散）。
 * 数值实验结论（tests 诊断）：
 *   - damp 0.7 → 欠阻尼，拖动中凹坑深度周期性呼吸（osc=1, amp=0.51）→ 液体感
 *     damp 0.45 → 零振荡（osc=0, amp=0.00），深度饱满 → 实体感
 *   - stiff 0.06 + harden 1.0 → 压得深且有抵抗感（不会一戳到底）
 *   - creep 纯黏性弛豫提供“沟槽缓慢合拢”，不产生晃动、不钟摆
 */
export const DEFAULT_PARAMS: SoftParams = { ...HERO_PARAMS };

/** 斜率编码范围（超出则截断）与高度编码范围 */
export const MAX_SLOPE = 2.2;
export const MAX_HEIGHT = 16;
/** 安全限幅：任何输入下都不会发散/越出编码范围 */
const H_LIMIT = MAX_HEIGHT * 0.9;
const V_LIMIT = 2.5;
/** 凹陷作用半径（σ 倍数，紧致）；软鼓尾的平滑尺度（σ 倍数）与盒式模糊箱宽系数 */
const R_CELLS = 2.8;
const BLUR_SIGMA = 2.2;
const BOX_W = 2; // 单个箱宽 ≈ 2·BLUR_SIGMA·σ，三箱≈高斯
const BLUR_BOXES = 3;

export class SoftField {
  readonly cols: number;
  readonly rows: number;
  readonly h: Float32Array;
  readonly v: Float32Array;
  /** 蠕变模（残留高度，粘塑性流动，无速度/无惯性） */
  readonly hc: Float32Array;
  params: SoftParams;
  /** 最近一次 step 的峰值能量（用于休眠判定） */
  peak = 0;

  /** 合并凹陷场 dent（每子步由 press 累积、step 消费后清零） */
  private dent: Float32Array;
  /** 模糊暂存：tmpH（横向结果）/ tmpV（纵向结果）。**必须分开**，
   *  否则纵向 pass 边读边覆盖 tmpH 产生定向涂抹污染（竖纹/鬼影伪影） */
  private tmpH: Float32Array;
  private tmpV: Float32Array;
  /** 本步活动包围盒（含模糊 padding），-1 表示空 */
  private bx0 = 0; private bx1 = -1; private by0 = 0; private by1 = -1;

  constructor(cols: number, rows: number, params: SoftParams = DEFAULT_PARAMS) {
    this.cols = cols;
    this.rows = rows;
    this.h = new Float32Array(cols * rows);
    this.v = new Float32Array(cols * rows);
    this.hc = new Float32Array(cols * rows);
    this.dent = new Float32Array(cols * rows);
    this.tmpH = new Float32Array(cols * rows);
    this.tmpV = new Float32Array(cols * rows);
    this.params = { ...params };
  }

  /** σ（格） */
  get sigmaCells(): number {
    return Math.max(2, this.params.sigma * this.cols);
  }

  /** 盒式模糊的半宽（格） */
  private blurHalf(): number {
    return Math.max(1, Math.round((BOX_W * BLUR_SIGMA * this.sigmaCells) / 2));
  }

  /** 形变可影响的最大半径（格）：凹陷圆 + 隆起模糊支撑 + 余量；此外严格为 0 */
  get supportRadius(): number {
    return Math.ceil(this.sigmaCells * R_CELLS) + BLUR_BOXES * this.blurHalf() + 2;
  }

  /**
   * 在 (gx, gy)（网格坐标）累积一个指压（平滑并集，§5.4a）。pressure∈[0,1]。
   * 应在 step() 之前、同一物理子步内可多次调用（路径插值）。
   */
  /**
   * 按压一个点（平滑并集）。拖动请用 pressSegment（胶囊接触）。
   */
  press(gx: number, gy: number, pressure: number): void {
    this.pressSegment(gx, gy, gx, gy, pressure);
  }

  /**
   * 胶囊接触：圆沿线段 [x0,y0]→[x1,y1] 扫掠（Minkowski 和）。
   * 手指拖动 = 一次胶囊成形，**与速度/采样率无关** → 连续沟槽、无扇贝边缘。
   * 同一物理子步内可对多指/多点多次调用（平滑并集合并）。
   */
  pressSegment(x0: number, y0: number, x1: number, y1: number, pressure: number): void {
    if (pressure <= 0.001) return;
    const { cols, rows, dent } = this;
    const sigma = this.sigmaCells;
    const R = Math.ceil(sigma * R_CELLS);
    const bx0 = Math.max(1, Math.floor(Math.min(x0, x1) - R));
    const bx1 = Math.min(cols - 2, Math.ceil(Math.max(x0, x1) + R));
    const by0 = Math.max(1, Math.floor(Math.min(y0, y1) - R));
    const by1 = Math.min(rows - 2, Math.ceil(Math.max(y0, y1) + R));
    if (bx1 < bx0 || by1 < by0) return;
    const inv2s2 = 1 / (2 * sigma * sigma);
    const RR = R * R;
    const depth = this.params.depth * pressure;
    if (depth <= 0) return;
    const ex = x1 - x0, ey = y1 - y0;
    const elen2 = ex * ex + ey * ey;

    if (this.bx1 < this.bx0) {
      this.bx0 = bx0; this.bx1 = bx1; this.by0 = by0; this.by1 = by1;
    } else {
      if (bx0 < this.bx0) this.bx0 = bx0;
      if (bx1 > this.bx1) this.bx1 = bx1;
      if (by0 < this.by0) this.by0 = by0;
      if (by1 > this.by1) this.by1 = by1;
    }

    for (let y = by0; y <= by1; y++) {
      for (let x = bx0; x <= bx1; x++) {
        // 点到线段的距离（胶囊几何）
        let t = 0;
        if (elen2 > 1e-9) {
          t = ((x - x0) * ex + (y - y0) * ey) / elen2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
        }
        const dx = x - (x0 + ex * t);
        const dy = y - (y0 + ey * t);
        const r2 = dx * dx + dy * dy;
        if (r2 >= RR) continue; // 严格圆形作用域（无方形截断）
        const i = y * cols + x;
        const t2 = r2 * inv2s2;
        // 超高斯 exp(−(r/σ)³)：平底陡壁 = 实体压痕
        const g = depth * Math.exp(-t2 * Math.sqrt(t2));
        // 平滑并集：d ← d + g − d·g/depth（C∞，饱和，无折痕）
        const dn = dent[i];
        dent[i] = dn + g - (dn * g) / depth;
      }
    }
  }

  /** 推进一个固定物理步（1/60s）：消费本步目标场 → 双模粘弹积分 */
  step(): void {
    const { cols, rows, h, v, hc, dent, tmpH, tmpV } = this;
    const { stiff, damp, grip, depth, rim, harden, creepRate, creepFrac, creepTau } = this.params;
    const creepDecay = Math.exp(-1 / Math.max(1, creepTau));

    if (this.bx1 >= this.bx0) {
      const x0 = Math.max(1, this.bx0), x1 = Math.min(cols - 2, this.bx1);
      const y0 = Math.max(1, this.by0), y1 = Math.min(rows - 2, this.by1);
      // 宽缓低幅软鼓尾：tail = rim·max(0, blur(dent) − dent)（随距衰减，非锐棱）
      const half = this.blurHalf();
      const rad = BLUR_BOXES * half; // 模糊总支撑半径
      const px0 = Math.max(0, x0 - rad), px1 = Math.min(cols - 1, x1 + rad);
      const py0 = Math.max(0, y0 - rad), py1 = Math.min(rows - 1, y1 + rad);
      this.boxBlur(dent, tmpH, tmpV, px0, py0, px1, py1, half);
      // 驱动覆盖 padding 区，padding 边缘用 smoothstep 窗收敛到 0（无截断硬边）
      const win = half + 1;
      for (let y = py0; y <= py1; y++) {
        const ty = Math.min(1, Math.min(y - py0, py1 - y) / win);
        let i = y * cols + px0;
        for (let x = px0; x <= px1; x++, i++) {
          const tx = Math.min(1, Math.min(x - px0, px1 - x) / win);
          const t = ty < tx ? ty : tx;
          const wgt = t * t * (3 - 2 * t);
          // 软鼓尾：blur 超过凹陷处为正（中心不反向加料）
          const rv = tmpV[i] > dent[i] ? rim * (tmpV[i] - dent[i]) : 0;
          const target = rv * wgt - dent[i];
          // 弹性模：快速跟随目标（按下即凹）
          v[i] += (target - h[i]) * grip;
          // 蠕变模：纯黏性弛豫（无速度项 → 无惯性 → 绝不振荡），向 creepFrac·target 指数趋近
          hc[i] += (target * creepFrac - hc[i]) * creepRate;
          dent[i] = 0;
        }
      }
      this.bx0 = 0; this.bx1 = -1; this.by0 = 0; this.by1 = -1;
    }

    let peak = 0;
    for (let y = 1; y < rows - 1; y++) {
      let i = y * cols + 1;
      for (let x = 1; x < cols - 1; x++, i++) {
        const c = h[i];
        const a = -stiff * c * (1 + (harden * (c < 0 ? -c : c)) / depth);
        let nv = (v[i] + a) * damp;
        if (nv > V_LIMIT) nv = V_LIMIT; else if (nv < -V_LIMIT) nv = -V_LIMIT;
        v[i] = nv;
        // 蠕变模的**无接触弛豫**（手指离开后继续指数回 0，指数时间 creepTau 步）
        hc[i] *= creepDecay;
        const av = nv < 0 ? -nv : nv;
        if (av > peak) peak = av;
      }
    }
    for (let y = 1; y < rows - 1; y++) {
      let i = y * cols + 1;
      for (let x = 1; x < cols - 1; x++, i++) {
        let nh = h[i] + v[i];
        if (nh > H_LIMIT) nh = H_LIMIT; else if (nh < -H_LIMIT) nh = -H_LIMIT;
        h[i] = nh;
        // 蠕变模：黏性积分（无速度项 → 无惯性 → 绝不振荡）
        let nc = hc[i];
        if (nc > H_LIMIT) nc = H_LIMIT; else if (nc < -H_LIMIT) nc = -H_LIMIT;
        hc[i] = nc;
        const tot = nh + nc;
        const a = tot < 0 ? -tot : tot;
        if (a > peak) peak = a;
      }
    }
    this.peak = peak;
  }

  /** 三次盒式模糊（可分离，O(N)），近似 σ≈BOX_W·BLUR_SIGMA·σ_cells 的高斯。
   *  mid = 横向结果缓冲，dst = 纵向结果缓冲；**两者必须与 src 及彼此分离**，
   *  否则纵向 pass 会边读边覆盖横向结果，造成定向涂抹伪影（竖纹/鬼影）。 */
  private boxBlur(src: Float32Array, mid: Float32Array, dst: Float32Array, x0: number, y0: number, x1: number, y1: number, half: number): void {
    const { cols, rows } = this;
    const w = half * 2 + 1;
    // 横向 src → mid
    for (let y = y0; y <= y1; y++) {
      let sum = 0;
      const row = y * cols;
      for (let x = x0 - half; x <= x0 + half; x++) {
        const xx = x < 0 ? 0 : x >= cols ? cols - 1 : x;
        sum += src[row + xx];
      }
      for (let x = x0; x <= x1; x++) {
        mid[row + x] = sum / w;
        const outX = x - half < 0 ? 0 : x - half;
        const inX = x + half + 1 >= cols ? cols - 1 : x + half + 1;
        sum -= src[row + outX];
        sum += src[row + inX];
      }
    }
    // 纵向 mid → dst
    for (let x = x0; x <= x1; x++) {
      let sum = 0;
      for (let y = y0 - half; y <= y0 + half; y++) {
        const yy = y < 0 ? 0 : y >= rows ? rows - 1 : y;
        sum += mid[yy * cols + x];
      }
      for (let y = y0; y <= y1; y++) {
        dst[y * cols + x] = sum / w;
        const outY = y - half < 0 ? 0 : y - half;
        const inY = y + half + 1 >= rows ? rows - 1 : y + half + 1;
        sum -= mid[outY * cols + x];
        sum += mid[inY * cols + x];
      }
    }
  }

  /** 完全静止（用于休眠时清零，杜绝浮点残留） */
  reset(): void {
    this.h.fill(0);
    this.v.fill(0);
    this.hc.fill(0);
    this.dent.fill(0);
    this.tmpH.fill(0);
    this.tmpV.fill(0);
    this.bx0 = 0; this.bx1 = -1; this.by0 = 0; this.by1 = -1;
    this.peak = 0;
  }

  /**
   * 编码为 RGBA8：R=∂h/∂x, G=∂h/∂y（0.5 为 0），B=高度，A=255。
   * 梯度用 5 点宽差分（而非 2 点中心差分）——等效轻微低通，抑制 8-bit 量化
   * 在平滑渐变区产生的色带（真实照片的柔焦背景上尤其明显），同时保留陡壁。
   * out 长度须为 cols*rows*4。
   */
  encode(out: Uint8Array): void {
    const { cols, rows, h, hc } = this;
    const ks = 127.5 / MAX_SLOPE;
    const kh = 127.5 / MAX_HEIGHT;
    // 总形变 = 弹性模 + 蠕变模
    const at = (x: number, y: number) => {
      const xx = x < 0 ? 0 : x >= cols ? cols - 1 : x;
      const yy = y < 0 ? 0 : y >= rows ? rows - 1 : y;
      const i = yy * cols + xx;
      return h[i] + hc[i];
    };
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const gx = (at(x + 2, y) - at(x - 2, y)) * 0.25;
        const gy = (at(x, y + 2) - at(x, y - 2)) * 0.25;
        const o = (y * cols + x) * 4;
        out[o] = clamp8(127.5 + gx * ks);
        out[o + 1] = clamp8(127.5 + gy * ks);
        out[o + 2] = clamp8(127.5 + (at(x, y)) * kh);
        out[o + 3] = 255;
      }
    }
  }
}

function clamp8(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : (n + 0.5) | 0;
}
