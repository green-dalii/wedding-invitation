export const VERT = `
attribute vec2 p;
varying vec2 vUv;
void main(){ vUv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;

// vUv：屏幕坐标，y 向下(0=顶)；图片与高度场纹理均"不翻转"上传，行 0 = 顶部
export const FRAG = `
precision highp float;
uniform sampler2D uImg;
uniform sampler2D uField;
uniform vec2  uRefract;   // 每单位斜率对应的 UV 位移
uniform float uDisp;      // 色散强度（0=关闭，省 2 次采样）
uniform float uLight;     // 高光强度
uniform float uZoom;      // 采样内缩，给边缘变形留余量
uniform float uMaxSlope;
uniform float uMaxH;
varying vec2 vUv;

vec3 tex(vec2 uv){ return texture2D(uImg, (uv-.5)*uZoom+.5).rgb; }

void main(){
  vec4 f = texture2D(uField, vUv);
  // 零点取 128/255（encode 的中性值）：静止态斜率/高度精确为 0，逐像素还原原图
  vec2 g = (f.rg - 128.0/255.0) * (2.*uMaxSlope);
  float h = (f.b - 128.0/255.0) * (2.*uMaxH);
  vec2 off = g * uRefract;                 // 从外侧取样 => 内容向凹陷中心收拢（"陷入"感）

  vec3 col;
  if (uDisp > 0.001) {
    col.r = tex(vUv + off*(1.+uDisp)).r;
    col.g = tex(vUv + off).g;
    col.b = tex(vUv + off*(1.-uDisp)).b;
  } else {
    col = tex(vUv + off);
  }

  // 软胶质感：柔和光影（系数刻意压低，避免阴影/高光过重）
  vec3 n = normalize(vec3(-g*2.4, 1.));
  vec3 L = normalize(vec3(-.42, -.55, .72));
  vec3 Hv = normalize(L + vec3(0.,0.,1.));
  float diff = dot(n, L) - L.z;
  float spec = pow(max(dot(n, Hv), 0.), 36.) - pow(Hv.z, 36.);
  col *= 1. + diff*.28 + h*.006;
  col += max(spec, 0.) * uLight;
  gl_FragColor = vec4(col, 1.);
}`;
