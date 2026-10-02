/**
 * 纹理单元分配（**绝不可随意改动**）
 *   0 = 当前图   1 = 高度场   2 = 淡入目标图
 * 高度场固定在单元 1，第二张图必须另占单元 2，
 * 否则 uploadField 会把图片覆盖掉。
 */
export const UNIT_IMAGE_CUR = 0;
export const UNIT_FIELD = 1;
export const UNIT_IMAGE_NEXT = 2;

/**
 * 图片纹理银行：**双纹理乒乓**。
 *
 * 无论相册多少张，显存里永远只有 2 张图片纹理；淡入结束后两个槽位互换，
 * 旧图所在槽位直接作为下一次上传的目标。
 * 只负责纹理对象与绑定；`mix` 归各模式持有（每个 program 都有自己的 uMix）。
 */
export class TextureBank {
  /** [当前槽, 备用槽] */
  private slots: (WebGLTexture | null)[] = [null, null];
  /** 记录当前/待显示的画布，供上下文重建后重传 */
  private image: HTMLCanvasElement | null = null;
  private pending: HTMLCanvasElement | null = null;

  constructor(private gl: WebGLRenderingContext) {}

  private makeTex(unit: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  /** 复用已有纹理对象；尺寸变化由 texImage2D 重新分配 */
  private upload(slot: 0 | 1, canvas: HTMLCanvasElement): void {
    const gl = this.gl;
    const unit = slot === 0 ? UNIT_IMAGE_CUR : UNIT_IMAGE_NEXT;
    let t = this.slots[slot];
    if (!t) {
      t = this.makeTex(unit);
      this.slots[slot] = t;
    } else {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, canvas);
  }

  /** 把两个槽位绑回各自单元（乒乓交换 / 上下文重建后调用） */
  bind(): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT_IMAGE_CUR);
    gl.bindTexture(gl.TEXTURE_2D, this.slots[0]);
    gl.activeTexture(gl.TEXTURE0 + UNIT_IMAGE_NEXT);
    // 备用槽尚未有图时退回当前图：采样不完整纹理在 WebGL 中行为未定义
    gl.bindTexture(gl.TEXTURE_2D, this.slots[1] ?? this.slots[0]);
  }

  /** 首张（或 resize 后重传）：直接成为当前图，无过渡 */
  show(canvas: HTMLCanvasElement): void {
    this.image = canvas;
    this.upload(0, canvas);
  }

  /** 上传「即将淡入」的图到备用槽（趁停留期做，见 slideshow.ts） */
  setIncoming(canvas: HTMLCanvasElement): void {
    this.pending = canvas;
    this.upload(1, canvas);
  }

  /** 淡入结束：备用槽提升为当前槽 */
  commit(): void {
    if (this.pending) {
      this.image = this.pending;
      this.pending = null;
    }
    const t = this.slots[0];
    this.slots[0] = this.slots[1];
    this.slots[1] = t;
    this.bind();
  }

  hasCurrent(): boolean {
    return !!this.slots[0];
  }

  /** 上下文丢失：旧纹理对象全部失效（但画布引用保留） */
  invalidate(): void {
    this.slots = [null, null];
  }

  /** 上下文恢复：按记录重传当前图与待显示图 */
  restore(): void {
    const img = this.image;
    const pend = this.pending;
    this.slots = [null, null];
    if (img) this.show(img);
    if (pend) this.setIncoming(pend);
  }
}

/**
 * 高度场纹理（单元 1），软体与沙砾模式共用。
 * RGBA：r,g = 斜率（5-tap 梯度），b = 高度，零点 128/255。
 */
export class FieldTexture {
  tex: WebGLTexture | null = null;
  cols = 0;
  rows = 0;
  private last: Uint8Array | null = null;

  constructor(private gl: WebGLRenderingContext) {}

  setSize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.last = null;
    const gl = this.gl;
    if (this.tex) gl.deleteTexture(this.tex);
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + UNIT_FIELD);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      cols,
      rows,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(cols * rows * 4).fill(128)
    );
    this.tex = t;
  }

  upload(data: Uint8Array): void {
    this.last = data;
    const gl = this.gl;
    if (!this.tex) return;
    gl.activeTexture(gl.TEXTURE0 + UNIT_FIELD);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cols, this.rows, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  invalidate(): void {
    this.tex = null;
  }

  restore(): void {
    const cols = this.cols;
    const rows = this.rows;
    const last = this.last;
    this.tex = null;
    if (cols && rows) {
      this.setSize(cols, rows);
      if (last) this.upload(last);
    }
  }
}
