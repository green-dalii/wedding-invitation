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

/** 极简 WebGL1 渲染器：1 张全屏三角形 + 2 张纹理。无三方依赖，覆盖 iOS 8+/Android 4.4+。 */
export class Renderer {
  private gl!: WebGLRenderingContext;
  private u!: Record<string, WebGLUniformLocation | null>;
  private imgTex: WebGLTexture | null = null;
  private fieldTex: WebGLTexture | null = null;
  private fieldW = 0;
  private fieldH = 0;
  private lastField: Uint8Array | null = null;
  private image: HTMLCanvasElement | null = null;
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
    for (const n of ['uImg', 'uField', 'uRefract', 'uDisp', 'uLight', 'uZoom', 'uMaxSlope', 'uMaxH']) this.u[n] = gl.getUniformLocation(prog, n);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // 单个大三角形
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.uniform1i(this.u.uImg, 0);
    gl.uniform1i(this.u.uField, 1);
    gl.uniform1f(this.u.uMaxSlope, MAX_SLOPE);
    gl.uniform1f(this.u.uMaxH, MAX_HEIGHT);

    this.imgTex = this.fieldTex = null;
    if (this.image) this.setImage(this.image);
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

  setImage(canvas: HTMLCanvasElement): void {
    this.image = canvas;
    if (this.lost) return;
    const gl = this.gl;
    if (this.imgTex) gl.deleteTexture(this.imgTex);
    this.imgTex = this.makeTex(0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, canvas);
  }

  setFieldSize(cols: number, rows: number): void {
    this.fieldW = cols; this.fieldH = rows; this.lastField = null;
    if (this.lost) return;
    const gl = this.gl;
    if (this.fieldTex) gl.deleteTexture(this.fieldTex);
    this.fieldTex = this.makeTex(1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(cols * rows * 4).fill(128));
    gl.uniform2f(this.u.uRefract, this.tuning.refract / cols, this.tuning.refract / rows);
  }

  uploadField(data: Uint8Array): void {
    this.lastField = data;
    if (this.lost || !this.fieldTex) return;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.fieldTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.fieldW, this.fieldH, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /** 设置绘制缓冲尺寸（像素） */
  resize(w: number, h: number): void {
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    if (!this.lost) this.gl.viewport(0, 0, w, h);
  }

  draw(): void {
    if (this.lost || !this.imgTex) return;
    const gl = this.gl, t = this.tuning;
    gl.uniform1f(this.u.uDisp, t.dispersion);
    gl.uniform1f(this.u.uLight, t.light);
    gl.uniform1f(this.u.uZoom, t.zoom);
    gl.uniform2f(this.u.uRefract, t.refract / this.fieldW, t.refract / this.fieldH);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
