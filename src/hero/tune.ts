/**
 * 调参面板（业主 tuning 用）：默认隐藏，点击浮动按钮懒加载打开。
 * 物理与渲染全部参数集中于此；调好后点"复制 JSON"发给实现方回写默认值。
 */
import { runtime } from './hero';
import type { SoftParams } from './softbody';
import type { RenderTuning } from './renderer';

interface SliderDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (v: number) => void;
}

let panel: HTMLElement | null = null;

export function openTunePanel(): void {
  if (panel) return;
  const field = runtime.field;
  const renderer = runtime.renderer;
  if (!field || !renderer) {
    alert('Hero 未就绪（静态降级模式无物理参数）');
    return;
  }
  panel = document.createElement('div');
  panel.id = 'tune-panel';
  panel.innerHTML = `
    <div class="tune-head">
      <span>Tuning</span>
      <button class="tune-close" type="button" aria-label="关闭">×</button>
    </div>
    <div class="tune-body"></div>
    <div class="tune-foot">
      <button class="tune-copy" type="button">复制参数 JSON</button>
    </div>`;
  document.body.appendChild(panel);

  const body = panel.querySelector('.tune-body')!;
  const groups: [string, SliderDef[]][] = [
    ['物理 · 形变', [
      { key: 'depth', label: '深度 depth', min: 2, max: 18, step: 0.5, get: () => field.params.depth, set: (v) => (field.params.depth = v) },
      { key: 'sigma', label: '半径 sigma', min: 0.03, max: 0.2, step: 0.005, get: () => field.params.sigma, set: (v) => (field.params.sigma = v) },
      { key: 'grip', label: '驱动 grip', min: 0.05, max: 0.9, step: 0.01, get: () => field.params.grip, set: (v) => (field.params.grip = v) },
    ]],
    ['物理 · 弹性（快）', [
      { key: 'stiff', label: '刚度 stiff', min: 0.005, max: 0.15, step: 0.001, get: () => field.params.stiff, set: (v) => (field.params.stiff = v) },
      { key: 'damp', label: '阻尼 damp', min: 0.2, max: 0.9, step: 0.005, get: () => field.params.damp, set: (v) => (field.params.damp = v) },
      { key: 'harden', label: '深度硬化 harden', min: 0, max: 3, step: 0.05, get: () => field.params.harden, set: (v) => (field.params.harden = v) },
    ]],
    ['物理 · 蠕变（慢·沟槽残留）', [
      { key: 'creepFrac', label: '蠕变占比 creepFrac', min: 0, max: 0.6, step: 0.02, get: () => field.params.creepFrac, set: (v) => (field.params.creepFrac = v) },
      { key: 'creepRate', label: '蠕变率 creepRate', min: 0.01, max: 0.3, step: 0.005, get: () => field.params.creepRate, set: (v) => (field.params.creepRate = v) },
      { key: 'creepTau', label: '蠕变时间常数 creepTau', min: 20, max: 400, step: 5, get: () => field.params.creepTau, set: (v) => (field.params.creepTau = v) },
    ]],
    ['物理 · 软鼓尾', [
      { key: 'rim', label: '尾增益 rim', min: 0, max: 1.2, step: 0.02, get: () => field.params.rim, set: (v) => (field.params.rim = v) },
    ]],
    ['渲染 · 折射/光影', [
      { key: 'refract', label: '折射 refract', min: 0, max: 20, step: 0.5, get: () => renderer.tuning.refract, set: (v) => (renderer.tuning.refract = v) },
      { key: 'dispersion', label: '色散 disp', min: 0, max: 0.1, step: 0.002, get: () => renderer.tuning.dispersion, set: (v) => (renderer.tuning.dispersion = v) },
      { key: 'light', label: '高光 light', min: 0, max: 1, step: 0.02, get: () => renderer.tuning.light, set: (v) => (renderer.tuning.light = v) },
      { key: 'zoom', label: '内缩 zoom', min: 0.85, max: 1, step: 0.005, get: () => renderer.tuning.zoom, set: (v) => (renderer.tuning.zoom = v) },
    ]],
  ];

  for (const [title, defs] of groups) {
    const h = document.createElement('div');
    h.className = 'tune-group';
    h.textContent = title;
    body.appendChild(h);
    for (const s of defs) {
      const row = document.createElement('label');
      row.className = 'tune-row';
      const head = document.createElement('div');
      head.className = 'tune-label';
      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(s.min);
      input.max = String(s.max);
      input.step = String(s.step);
      input.value = String(s.get());
      const update = () => (head.textContent = `${s.label}: ${s.get().toFixed(3)}`);
      update();
      input.addEventListener('input', () => {
        s.set(parseFloat(input.value));
        update();
        runtime.wake();
      });
      row.append(head, input);
      body.appendChild(row);
    }
  }

  panel.querySelector('.tune-close')!.addEventListener('click', () => {
    panel?.remove();
    panel = null;
  });
  const copyBtn = panel.querySelector('.tune-copy') as HTMLButtonElement;
  copyBtn.addEventListener('click', () => {
    const json = JSON.stringify({ params: field.params as SoftParams, tuning: renderer.tuning as RenderTuning }, null, 2);
    void navigator.clipboard.writeText(json).then(() => {
      copyBtn.textContent = '已复制 ✓';
      setTimeout(() => (copyBtn.textContent = '复制参数 JSON'), 1500);
    });
  });
}
