export const VERT = `
attribute vec2 p;
varying vec2 vUv;
void main(){ vUv = vec2(p.x*.5+.5, .5-p.y*.5); gl_Position = vec4(p,0.,1.); }`;

// vUv：屏幕坐标，y 向下(0=顶)；图片与高度场纹理均"不翻转"上传，行 0 = 顶部
export const FRAG = `
precision highp float;
uniform sampler2D uImg;    // 当前图（纹理单元 0）
uniform sampler2D uField;  // 高度场（单元 1）
uniform sampler2D uImgB;   // 淡入目标图（单元 2）
uniform vec2  uRefract;   // 每单位斜率对应的 UV 位移
uniform float uDisp;      // 色散强度（0=关闭，省 2 次采样）
uniform float uLight;     // 高光强度
uniform float uZoom;      // 采样内缩，给边缘变形留余量
uniform float uMix;       // 淡入进度 0=仅 A，1=仅 B
uniform float uMaxSlope;
uniform float uMaxH;
varying vec2 vUv;

// 采样一张图。**两张图共用同一个 off**，所以淡入淡出期间形变完全一致，
// 不会出现「一张在动、另一张不动」的错位。
vec3 samp(sampler2D t, vec2 uv, vec2 off){
  vec2 buv = (uv + off - .5) * uZoom + .5;
  if (uDisp > 0.001) {
    vec3 c;
    c.r = texture2D(t, (uv + off*(1.+uDisp) - .5) * uZoom + .5).r;
    c.g = texture2D(t, buv).g;
    c.b = texture2D(t, (uv + off*(1.-uDisp) - .5) * uZoom + .5).b;
    return c;
  }
  return texture2D(t, buv).rgb;
}

void main(){
  vec4 f = texture2D(uField, vUv);
  // 零点取 128/255（encode 的中性值）：静止态斜率/高度精确为 0，逐像素还原原图
  vec2 g = (f.rg - 128.0/255.0) * (2.*uMaxSlope);
  float h = (f.b - 128.0/255.0) * (2.*uMaxH);
  vec2 off = g * uRefract;                 // 从外侧取样 => 内容向凹陷中心收拢（"陷入"感）

  vec3 col = samp(uImg, vUv, off);
  // 淡入淡出：uniform 分支，静止态零额外采样；
  // 且光影在 mix 之后统一施加（只算一次），过渡期间不重复计算。
  if (uMix > 0.001) col = mix(col, samp(uImgB, vUv, off), uMix);

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

// ═══════════════════════════════════════════════════════════════
// 沙砾模式（modes/sand.ts）：一张 GL_POINTS 网格，一个格子一颗沙砾。
//
// 静止时「就是原图」是**构造保证**而非调参结果：
//   沙砾静止位置取单元格中心 (i+.5)*cell，cell 为偶数整数
//   → 点位落在整数设备坐标上，光栅化恰好覆盖 cell×cell 个像素
//   → 无缝无重叠地铺满画布；片元再按 gl_PointCoord 取回该格图像
// 因此位移为 0 时画面逐像素还原原图，而不需要上百万颗粒子。
//
// 顶点着色器要读高度场（顶点纹理取样 VTF），需 MAX_VERTEX_TEXTURE_IMAGE_UNITS ≥ 1，
// 由 sand.ts 在创建前检查，不满足则回退软体模式。
// ═══════════════════════════════════════════════════════════════
export const SAND_VERT = `
attribute vec2 aHome;     // 静止位置（设备像素，原点左上）
attribute float aSeed;    // 每颗一个 0~1 随机值（相位/方向）
uniform vec2  uRes;       // 绘制缓冲尺寸（像素）
uniform sampler2D uField; // 高度场（纹理单元 1）
uniform float uCell;      // 颗粒边长（物理像素，**整数**）
uniform float uZoom;      // 采样内缩（与软体模式一致）
uniform float uSpread;    // 主项幅度（**颗粒直径的倍数**）
uniform float uScatter;   // 随机项幅度（占主项的比例）
uniform float uSettle;    // 涌动幅度（占主项的比例）
uniform float uShrink;    // 位移越大颗粒越小（默认 0 = 关闭）
uniform float uTime;
uniform float uMaxSlope;
uniform float uMaxH;
/** 位移死区（占总高度比例）：低于它彻底归零。
 *  没有死区时，h 的指数衰减尾巴会让沙砾永远在微小抖动 —— 画面回不到
 *  逐像素原图（实测松手 3.2s 后仍有 7.9% 缝隙）。**/
const float DEAD = 0.02;
varying vec2  vUv;        // 格中心对应的图像 UV
varying vec2  vCellUv;    // 一格对应的 UV 尺寸
varying float vDisp;      // 归一化位移（0~1），供片元做纵深压暗
void main(){
  vec2 cellUv = vec2(uCell) / uRes;
  vec2 uv = aHome / uRes;                          // 屏幕 UV（y 向下）
  // 用「格子中心」而不是颗粒自身位置取字段：位移不应反馈进采样点（否则自激）
  vec2 fuv = (floor(uv / cellUv) + 0.5) * cellUv;  // 该格中心的屏幕 UV
  vec2 suv = (fuv - 0.5) * uZoom + 0.5;            // 与软体模式一致的取样内缩
  vec4 f = texture2D(uField, suv);
  vec2 g = (f.rg - 128.0/255.0) * (2.0 * uMaxSlope);
  float h = (f.b - 128.0/255.0) * (2.0 * uMaxH);
  // 死区：低于阈值直接归零 → 静止态严格等于原图
  float hn = clamp((abs(h) / uMaxH - DEAD) / (1.0 - DEAD), 0.0, 1.0);

  float ang = aSeed * 6.2831853;
  vec2 rnd = vec2(cos(ang), sin(ang));
  // **斥力模型**（§5.14.4）：梯度 = 最陡上升 = 背离凹陷中心 → 沙砾向外推。
  // 幅度由深度 hn 驱动（中心最大、向外衰减），像同极互斥：越靠近越推开。
  // 中心奇点（|g|→0）用随机方向兜底，避免正中央留下一颗未位移的“核”。
  float gm = length(g);
  vec2 outDir = gm > 1e-4 ? g / gm : rnd;
  // 幅度以「颗粒直径」为单位：spread = 1 → 颗粒移动一个自身直径。
  // 与分辨率无关：cell 加倍则位移同步加倍。
  float amt = uSpread * uCell * hn;
  vec2 disp = outDir * amt
            + rnd * (uScatter * amt)                                // 打散（占主项比例）
            + rnd * (uSettle * amt) * sin(uTime * 9.0 + aSeed * 41.0);   // 涌动

  vec2 p = aHome + disp;
  gl_Position = vec4(p.x / uRes.x * 2.0 - 1.0, 1.0 - p.y / uRes.y * 2.0, 0.0, 1.0);

  vDisp = clamp(length(disp) / max(uSpread * uCell, 1.0), 0.0, 1.0);
  gl_PointSize = uCell * (1.0 - uShrink * vDisp);
  vUv = (fuv - 0.5) * uZoom + 0.5;
  vCellUv = cellUv * uZoom;
}`;

/**
 * 沙砾模式的「纸面」：缝隙底下是**变暗的原图**，而不是纯色底。
 *
 * 没有它时缝隙是一整块浅色 —— 在深色照片区会被读成「白色沙粒」。
 * 压暗量随扰动深度加深：沙被推开得越多，露出的纸面越暗，像沙投下的影子。
 */
export const BED_VERT = `
attribute vec2 aPos;
uniform float uZoom;
varying vec2 vUv;
void main(){
  gl_Position = vec4(aPos, 0.0, 1.0);
  // aPos.y=+1 是屏幕顶部；转成「y 向下」的屏幕 UV，与沙砾端一致
  vec2 d = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  vUv = (d - 0.5) * uZoom + 0.5;
}`;

export const BED_FRAG = `
precision highp float;
uniform sampler2D uImg;
uniform sampler2D uImgB;
uniform sampler2D uField;
uniform float uMix;
uniform float uMaxH;
uniform float uBed;       // 扰动最深处的压暗比例
varying vec2 vUv;
void main(){
  vec3 col = texture2D(uImg, vUv).rgb;
  if (uMix > 0.001) col = mix(col, texture2D(uImgB, vUv).rgb, uMix);
  vec4 f = texture2D(uField, vUv);
  float h = (f.b - 128.0/255.0) * (2.0 * uMaxH);
  float hn = clamp(abs(h) / uMaxH, 0.0, 1.0);
  gl_FragColor = vec4(col * (1.0 - uBed * hn), 1.0);
}`;

export const SAND_FRAG = `
precision highp float;
uniform sampler2D uImg;
uniform sampler2D uImgB;
uniform float uMix;
uniform float uShadow;    // 位移越大越暗（纵深）
varying vec2  vUv;
varying vec2  vCellUv;
varying float vDisp;
void main(){
  vec2 uv = vUv + (gl_PointCoord - 0.5) * vCellUv;
  vec3 col = texture2D(uImg, uv).rgb;
  if (uMix > 0.001) col = mix(col, texture2D(uImgB, uv).rgb, uMix);
  col *= 1.0 - uShadow * vDisp;
  gl_FragColor = vec4(col, 1.);
}`;
