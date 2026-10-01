import { HERO_RENDER } from './hero.config';
import { VERT, FRAG } from './shaders';
import { MAX_HEIGHT, MAX_SLOPE } from './softbody';

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

/** 默认渲染参数：集中管理于 hero.config.ts（HERO_RENDER） */
export const DEFAULT_TUNING: RenderTuning = { ...HERO_RENDER };

/**
 * 纹理单元分配（**不可随意改动**）：
 *   0 = 当前图 uImg  1 = 高度场 uField  2 = 淡入目标图 uImgB
 * 高度场固定在单元 1，第二张图必须另占单元 2，否则 uploadField 会把图覆盖掉。
 * WebGL1 保证 MAX_TEXTURE_IMAGE_UNITS ≥ 8，用 3 个安全。
 */
const UNIT_CUR = 0;
const UNIT_FIELD = 1;
const UNIT_NEXT = 2;

/**
 * 极简 WebGL1 渲染器：1 张全屏三角形 + 3 张纹理。无三方依赖，覆盖 iOS 8+/Android 4.4+。
 *
 * 轮播用**双纹理乒乓**：永远只有 2 张图片纹理（无论相册多少张），
 * 淡入结束后两者互换角色，旧图所在槽位直接作为下一次上传的目标。
 */
export class Renderer {
  private gl!: WebGLRenderingContext;
  private u!: Record<string, WebGLUniformLocation | null>;
  /** [当前槽, 备用槽] 的纹理对象；仅 2 个，乒乓复用 */
  private slots: (WebGLTexture | null)[] = [null, null];
  private fieldTex: WebGLTexture | null = null;
  private fieldW = 0;
  private fieldH = 0;
  private lastField: Uint8Array | null = null;
  /** 当前显示的图（用于上下文重建后重传） */
  private image: HTMLCanvasElement | null = null;
  /** 备用槽里等待淡入的图 */
  private pending: HTMLCanvasElement | null = null;
  private mix = 0;
  lost = false;
  tuning: RenderTuning = { ...DEFAULT_TUNING };
  maxTextureSize = 2048;
  onRestore: (() => void) | null = null;

  private constructor(private canvas: HTMLCanvasElement) {}

  static create(canvas: HTMLCanvasElement, opts: { allowSoftware?: boolean } = {}): Renderer | null {
    const r = new Renderer(canvas);
    const attrs: WebGLContextAttributes = {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
      failIfMajorPerformanceCaveat: !opts.allowSoftware,
    };
    const gl = (canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs)) as WebGLRenderingContext | null;
    if (!gl) return null;
    r.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); r.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { r.lost = false; r.build(); r.onRestore?.(); });
    if (!r.build()) return null;
    return r;
  }

  private build(): boolean {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'p');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn(gl.getProgramInfoLog(prog)); return false; }
    gl.useProgram(prog);
    this.u = {};
    for (const n of ['uImg', 'uField', 'uImgB', 'uRefract', 'uDisp', 'uLight', 'uZoom', 'uMix', 'uMaxSlope', 'uMaxH']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // 单个大三角形
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.uniform1i(this.u.uImg, UNIT_CUR);
    gl.uniform1i(this.u.uField, UNIT_FIELD);
    gl.uniform1i(this.u.uImgB, UNIT_NEXT);
    gl.uniform1f(this.u.uMaxSlope, MAX_SLOPE);
    gl.uniform1f(this.u.uMaxH, MAX_HEIGHT);

    // 上下文重建：旧纹理对象全部失效，必须丢弃后重传
    this.slots = [null, null];
    this.fieldTex = null;
    const img = this.image, pend = this.pending;
    if (img) this.show(img);
    if (pend) this.setIncoming(pend);
    this.setMix(this.mix);
    if (this.fieldW) { this.setFieldSize(this.fieldW, this.fieldH); if (this.lastField) this.uploadField(this.lastField); }
    return true;
  }

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

  /** 把画布内容传进指定槽位（0=当前，1=备用）。复用已有纹理对象，尺寸变化由 texImage2D 重分配。 */
  private upload(slot: 0 | 1, canvas: HTMLCanvasElement): void {
    const gl = this.gl;
    const unit = slot === 0 ? UNIT_CUR : UNIT_NEXT;
    let t = this.slots[slot];
    if (!t) { t = this.makeTex(unit); this.slots[slot] = t; }
    else { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, canvas);
  }

  /** 把两个槽位重新绑定到各自的纹理单元（乒乓交换后调用） */
  private bindSlots(): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT_CUR);
    gl.bindTexture(gl.TEXTURE_2D, this.slots[0]);
    gl.activeTexture(gl.TEXTURE0 + UNIT_NEXT);
    // 备用槽可能尚未有图：退回绑当前图，避免采样不完整纹理（WebGL 中行为未定义）
    gl.bindTexture(gl.TEXTURE_2D, this.slots[1] ?? this.slots[0]);
  }

  /** 首张：直接成为当前图，无过渡 */
  show(canvas: HTMLCanvasElement): void {
    this.image = canvas;
    if (!this.lost) this.upload(0, canvas);
  }

  /** 上传「即将淡入」的图到备用槽 */
  setIncoming(canvas: HTMLCanvasElement): void {
    this.pending = canvas;
    if (this.lost) return;
    this.upload(1, canvas);
  }

  /** 淡入结束：备用槽提升为当前槽，mix 归零。此后备用槽空闲，供下一次上传复用。 */
  commit(): void {
    if (this.pending) { this.image = this.pending; this.pending = null; }
    if (this.lost) { this.mix = 0; return; }
    const t = this.slots[0];
    this.slots[0] = this.slots[1];
    this.slots[1] = t;
    this.bindSlots();
    this.setMix(0);
  }

  setMix(m: number): void {
    this.mix = m;
    if (!this.lost) this.gl.uniform1f(this.u.uMix, m);
  }

  setFieldSize(cols: number, rows: number): void {
    this.fieldW = cols; this.fieldH = rows; this.lastField = null;
    if (this.lost) return;
    const gl = this.gl;
    if (this.fieldTex) gl.deleteTexture(this.fieldTex);
    this.fieldTex = this.makeTex(UNIT_FIELD);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(cols * rows * 4).fill(128));
    gl.uniform2f(this.u.uRefract, this.tuning.refract / cols, this.tuning.refract / rows);
  }

  uploadField(data: Uint8Array): void {
    this.lastField = data;
    if (this.lost || !this.fieldTex) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + UNIT_FIELD);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.fieldW, this.fieldH, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /** 设置绘制缓冲尺寸（像素） */
  resize(w: number, h: number): void {
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    if (!this.lost) this.gl.viewport(0, 0, w, h);
  }

  draw(): void {
    if (this.lost || !this.slots[0]) return;
    const gl = this.gl, t = this.tuning;
    gl.uniform1f(this.u.uDisp, t.dispersion);
    gl.uniform1f(this.u.uLight, t.light);
    gl.uniform1f(this.u.uZoom, t.zoom);
    gl.uniform2f(this.u.uRefract, t.refract / this.fieldW, t.refract / this.fieldH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
