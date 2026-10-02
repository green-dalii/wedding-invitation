/**
 * 交互模式接口（§5.14.1）。
 *
 * 调度器（renderer.ts）持有 GL 上下文、纹理银行、高度场与绘制尺寸；
 * 模式只负责「用自己的 program 把当前状态画出来」，不碰纹理上传与乒乓交换。
 */
import type { FieldTexture, TextureBank } from './bank';

export type ModeId = 'sand' | 'soft' | 'none';

export interface ModeDeps {
  gl: WebGLRenderingContext;
  /** 双纹理乒乓（图片） */
  bank: TextureBank;
  /** 高度场纹理（单元 1），两模式共用 */
  field: FieldTexture;
  /** 设备像素 ÷ CSS 像素（沙砾粒径以 CSS 像素表达，需此换算到物理像素） */
  scale: number;
}

export interface HeroMode {
  readonly id: ModeId;
  /**
   * 是否必须每帧清屏。
   * 沙砾会露出底色 → true；软胶全屏覆盖 → false（省掉一次全屏填充）。
   */
  readonly needsClear: boolean;
  /** 采样内缩（供 debug 的 refDataURL 与静止态比对使用） */
  readonly zoom: number;
  /** 绘制缓冲尺寸变化（像素） */
  resize(w: number, h: number): void;
  /** 高度场网格尺寸变化 */
  setFieldSize(cols: number, rows: number): void;
  /** 淡入进度 0~1 */
  setMix(mix: number): void;
  /** 用当前 program 画一帧（调用方已 useProgram 之外的准备工作由模式自理） */
  draw(): void;
  /** 质量自适应（step 越大降得越狠），由 hero.ts 的 degrade() 调用 */
  reduceQuality(step: number): void;
  destroy(): void;
}
