/**
 * 无特效模式（`none`）：只把当前图（含轮播淡入）平铺到画框，**不做任何形变**。
 *
 * 复用 `BED_VERT` / `BED_FRAG` —— 它本就是「整屏平铺当前图 + 可选压暗」，
 * 这里把 `uBed` 固定为 0 即为纯粹平铺。刻意不另写一份几乎相同的着色器。
 *
 * 为什么要它是独立一等模式而不是「走静态降级路径」：Tuning 面板要在
 * 沙砾 / 软胶 / 无特效之间**实时切换对比**，只有同一渲染器内的模式才能做到。
 * 无 WebGL 时仍回退到 hero.ts 的 DOM 图层路径（观感一致：都是普通轮播）。
 */
import { BED_FRAG, BED_VERT } from '../shaders';
import { compileProgram, uniforms } from './glutil';
import { UNIT_IMAGE_CUR, UNIT_IMAGE_NEXT } from './bank';
import type { HeroMode, ModeDeps } from './types';

const ATTR_POS = 0;

export class NoneMode implements HeroMode {
  readonly id = 'none' as const;
  /** 全屏覆盖，无需清屏 */
  readonly needsClear = false;
  /** 无特效不做取样内缩 */
  readonly zoom = 1;

  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null>;
  private quad: WebGLBuffer | null = null;
  private mix = 0;

  constructor(private deps: ModeDeps) {
    const { gl } = deps;
    const prog = compileProgram(gl, BED_VERT, BED_FRAG, { aPos: ATTR_POS });
    if (!prog) throw new Error('none: 着色器编译/链接失败');
    this.prog = prog;
    this.u = uniforms(gl, prog, ['uImg', 'uImgB', 'uZoom', 'uMix', 'uMaxH', 'uBed']);
    gl.useProgram(prog);
    gl.uniform1i(this.u.uImg, UNIT_IMAGE_CUR);
    gl.uniform1i(this.u.uImgB, UNIT_IMAGE_NEXT);
    gl.uniform1f(this.u.uBed, 0); // 不压暗 = 纯平铺
    gl.uniform1f(this.u.uMaxH, 1);
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  }

  resize(_w: number, _h: number): void {
    // 全屏 quad，与缓冲尺寸无关
  }

  setFieldSize(_cols: number, _rows: number): void {
    // 不读高度场
  }

  setMix(mix: number): void {
    this.mix = mix;
  }

  reduceQuality(_step: number): void {
    // 无可降：本来就是纯平铺
  }

  draw(): void {
    const gl = this.deps.gl;
    gl.useProgram(this.prog);
    gl.uniform1f(this.u.uZoom, this.zoom);
    gl.uniform1f(this.u.uMix, this.mix);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(ATTR_POS);
    gl.vertexAttribPointer(ATTR_POS, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy(): void {
    const gl = this.deps.gl;
    gl.deleteProgram(this.prog);
    if (this.quad) gl.deleteBuffer(this.quad);
    this.quad = null;
  }
}
