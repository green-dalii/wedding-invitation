/** 编译/链接一个 program；失败返回 null 并打印日志（不抛异常，交由调用方降级） */
export function compileProgram(
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string,
  attribs: Record<string, number>
): WebGLProgram | null {
  const sh = (type: number, src: string): WebGLShader | null => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };
  const vs = sh(gl.VERTEX_SHADER, vertSrc);
  const fs = sh(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return null;

  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  for (const [name, loc] of Object.entries(attribs)) gl.bindAttribLocation(prog, loc, name);
  gl.linkProgram(prog);
  // program 已持有编译产物，shader 对象可以立刻释放
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn(gl.getProgramInfoLog(prog));
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

/** 取出若干 uniform 位置，返回 { 名字: 位置 } */
export function uniforms(
  gl: WebGLRenderingContext,
  prog: WebGLProgram,
  names: readonly string[]
): Record<string, WebGLUniformLocation | null> {
  const out: Record<string, WebGLUniformLocation | null> = {};
  for (const n of names) out[n] = gl.getUniformLocation(prog, n);
  return out;
}
