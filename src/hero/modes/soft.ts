/**
 * 软胶模式（**原实现原样搬移**，§5.14.1）。
 *
 * 行为必须与重构前逐像素一致 —— 由 e2e 的 T3/T4/T5/T6/T11 逐像素断言守护：
 *   1 张全屏三角形 + uImg/uField/uImgB，折射偏移取自高度场斜率。
 * 这里不做任何「顺手优化」：一旦画面变了，那几条断言就失去意义。
 */
import { FRAG, VERT } from '../shaders';
import { MAX_HEIGHT, MAX_SLOPE } from '../softbody';
import { compileProgram, uniforms } from './glutil';
import { UNIT_FIELD, UNIT_IMAGE_CUR, UNIT_IMAGE_NEXT } from './bank';
import type { HeroMode, ModeDeps } from './types';

export interface RenderTuning {
  /** 折射强度（越大变形越夸张） */
  refract: number;
  /** 色散 0~0.1 */
  dispersion: number;
  /** 高光强度 */
  light: number;
  /** 采样内缩 */
  zoom: number;
}

const UNIFORM_NAMES = [
  'uImg', 'uField', 'uImgB', 'uRefract', 'uDisp', 'uLight', 'uZoom', 'uMix', 'uMaxSlope', 'uMaxH',
] as const;

export class SoftMode implements HeroMode {
  readonly id = 'soft' as const;
  /** 全屏覆盖，无需清屏 */
  readonly needsClear = false;

  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null>;
  private tri: WebGLBuffer;
  private fieldW = 0;
  private fieldH = 0;
  private mix = 0;

  constructor(
    private deps: ModeDeps,
    /** tuning 由调度器持有，模式重建（上下文丢失）后数值不丢 */
    readonly tuning: RenderTuning
  ) {
    const { gl } = deps;
    const prog = compileProgram(gl, VERT, FRAG, { p: 0 });
    if (!prog) throw new Error('soft: 着色器编译/链接失败');
    this.prog = prog;
    this.u = uniforms(gl, prog, UNIFORM_NAMES);
    gl.useProgram(prog);
    gl.uniform1i(this.u.uImg, UNIT_IMAGE_CUR);
    gl.uniform1i(this.u.uField, UNIT_FIELD);
    gl.uniform1i(this.u.uImgB, UNIT_IMAGE_NEXT);
    gl.uniform1f(this.u.uMaxSlope, MAX_SLOPE);
    gl.uniform1f(this.u.uMaxH, MAX_HEIGHT);

    // 单个大三角形（覆盖整个裁剪空间）
    this.tri = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }

  get zoom(): number {
    return this.tuning.zoom;
  }

  resize(_w: number, _h: number): void {
    // 全屏三角形与绘制尺寸无关
  }

  setFieldSize(cols: number, rows: number): void {
    this.fieldW = cols;
    this.fieldH = rows;
  }

  setMix(mix: number): void {
    this.mix = mix;
  }

  reduceQuality(step: number): void {
    if (step === 1) this.tuning.dispersion = 0; // 省 2 次纹理采样
  }

  draw(): void {
    const gl = this.deps.gl;
    gl.useProgram(this.prog);
    gl.uniform1f(this.u.uDisp, this.tuning.dispersion);
    gl.uniform1f(this.u.uLight, this.tuning.light);
    gl.uniform1f(this.u.uZoom, this.tuning.zoom);
    gl.uniform1f(this.u.uMix, this.mix);
    if (this.fieldW > 0 && this.fieldH > 0) {
      gl.uniform2f(this.u.uRefract, this.tuning.refract / this.fieldW, this.tuning.refract / this.fieldH);
    }
    // 顶点状态是全局的（WebGL1 无 VAO），每次绘制都要自铺自己的属性
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tri);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disableVertexAttribArray(1); // 沙砾模式的 seed 属性
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy(): void {
    const gl = this.deps.gl;
    gl.deleteProgram(this.prog);
    gl.deleteBuffer(this.tri);
  }
}
