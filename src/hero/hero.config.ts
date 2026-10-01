/**
 * ═══ Hero 交互参数/常量集中管理（业主调参改这里）═══
 * 物理：粘弹软体双模（弹性+蠕变）。材料取向：**硅胶/软胶**（高刚度、强耗散），
 * 绝非粘液（低模量低耗散会晃动）。
 * 所有数值均可经左下角 Tune 面板实时调整（?tune 自动打开）。
 */
import type { SoftParams } from './softbody';

/** 软体物理参数（见 softbody.ts 实现） */
export const HERO_PARAMS: SoftParams = {
  stiff: 0.06,       // 弹性刚度：越大越"实"
  damp: 0.45,        // 弹性阻尼（<0.5 消除拖动"呼吸"振荡）
  grip: 0.6,         // 凹陷跟随紧度
  creepRate: 0.06,   // 蠕变率
  creepTau: 90,      // 蠕变时间常数（步，≈1.5s）：沟槽留多久
  creepFrac: 0.12,   // 蠕变深度占比
  depth: 11,         // 凹陷深度
  sigma: 0.1224,     // 凹陷半径（0.085 基准，两次 ×1.2；业主要求继续加大）
  rim: 0.4,          // 软鼓尾增益
  harden: 1.0,       // 深度硬化（抵抗感）
};

/** 渲染参数（着色器折射/光影） */
export const HERO_RENDER = {
  refract: 5,        // 折射强度
  dispersion: 0.018, // 色散
  light: 0.18,       // 高光
  zoom: 0.94,        // 采样内缩（给边缘变形留余量）
};

/** 交互/网格常量 */
export const HERO_CONST = {
  COLS: 96,              // 高度场列数（行数按宽高比推算）
  MAX_CELLS: 30000,      // 网格上限
  FOLLOW: 0.7,           // 指针跟随系数（紧跟随）
  PRESSURE_RAMP: 0.28,   // 压力上升系数（瞬时成形）
  HOVER_PRESSURE: 0.16,  // 桌面 hover 弱凹陷
  JIT_LIMIT: 5,          // 文字微抖最大位移（px）
  JIT_K: 180,            // 文字弹簧刚度
  JIT_C: 9,              // 文字弹簧阻尼
  JF: 1.8,               // 文字抖动力增益
  QUALITY_SLOW_FRAMES: 45, // 连续慢帧阈值→降质量
  QUALIFY_EMA: 0.021,    // 帧间隔 EMA 阈值（秒）
  HINT_DELAY: 700,       // 提示文案延迟（ms）
  HINT_FADE: 4700,       // 提示文案自动消失（ms）
  ADVANCE_MS: 3000,      // 轮播：每张停留时长（ms）
  FADE_MS: 900,          // 轮播：淡入淡出时长（ms）
  HOVER_TAIL_MS: 2600,   // 鼠标悬停静止多久后允许休眠（要盖住蠕变回弹 ≈1.5s）
};
