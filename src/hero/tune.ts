/**
 * 调参面板（业主 tuning 用）：默认隐藏，仅由 /tune 或 ?tune 唤醒。
 *
 * §5.14：顶部为「交互模式」分段控件（沙砾 / 软胶 / 无特效），参数按当前模式显隐 ——
 * 避免在一堆与当前模式无关的旋钮里调错组。
 * 物理参数两模式共用（沙砾复用同一套粘弹高度场）。
 */
import { runtime } from './hero';
import type { SoftParams } from './softbody';
import type { ModeId, RenderTuning, SandTuning } from './renderer';

interface SliderDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  get: () => number;
  set: (v: number) => void;
  /** 改动后需要重建资源（如沙砾颗粒网格） */
  rebuilds?: boolean;
  /** 仅在该模式下显示 */
  mode?: ModeId;
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
  const soft: RenderTuning = renderer.softTuning;
  const sand: SandTuning = renderer.sandTuning;

  panel = document.createElement('div');
  panel.id = 'tune-panel';
  panel.innerHTML = `
    <div class="tune-head">
      <span>Tuning</span>
      <button class="tune-close" type="button" aria-label="关闭">×</button>
    </div>
    <div class="tune-modes" role="group" aria-label="交互模式"></div>
    <div class="tune-note" hidden></div>
    <div class="tune-body"></div>
    <div class="tune-foot">
      <button class="tune-copy" type="button">复制参数 JSON</button>
    </div>`;
  document.body.appendChild(panel);

  const body = panel.querySelector('.tune-body')!;
  const modeBar = panel.querySelector('.tune-modes') as HTMLElement;
  const note = panel.querySelector('.tune-note') as HTMLElement;

  const groups: [string, SliderDef[]][] = [
    ['物理 · 形变（两模式共用）', [
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
    ['渲染 · 沙砾', [
      { key: 'grain', label: '颗粒 grain（CSS px）', min: 1, max: 6, step: 0.5, get: () => sand.grain, set: (v) => (sand.grain = v), rebuilds: true, mode: 'sand' },
      { key: 'spread', label: '分离 spread（直径倍数）', min: 0, max: 8, step: 0.1, get: () => sand.spread, set: (v) => (sand.spread = v), mode: 'sand' },
      { key: 'scatter', label: '打散 scatter（比例）', min: 0, max: 1, step: 0.05, get: () => sand.scatter, set: (v) => (sand.scatter = v), mode: 'sand' },
      { key: 'settle', label: '涌动 settle（比例）', min: 0, max: 0.6, step: 0.02, get: () => sand.settle, set: (v) => (sand.settle = v), mode: 'sand' },
      { key: 'shrink', label: '收缩 shrink', min: 0, max: 0.7, step: 0.02, get: () => sand.shrink, set: (v) => (sand.shrink = v), mode: 'sand' },
      { key: 'bed', label: '底图压暗 bed', min: 0, max: 0.9, step: 0.02, get: () => sand.bed, set: (v) => (sand.bed = v), mode: 'sand' },
      { key: 'shadow', label: '压暗 shadow', min: 0, max: 0.6, step: 0.02, get: () => sand.shadow, set: (v) => (sand.shadow = v), mode: 'sand' },
      { key: 'sandZoom', label: '内缩 zoom', min: 0.85, max: 1, step: 0.005, get: () => sand.zoom, set: (v) => (sand.zoom = v), mode: 'sand' },
    ]],
    ['渲染 · 软胶（折射/光影）', [
      { key: 'refract', label: '折射 refract', min: 0, max: 20, step: 0.5, get: () => soft.refract, set: (v) => (soft.refract = v), mode: 'soft' },
      { key: 'dispersion', label: '色散 disp', min: 0, max: 0.1, step: 0.002, get: () => soft.dispersion, set: (v) => (soft.dispersion = v), mode: 'soft' },
      { key: 'light', label: '高光 light', min: 0, max: 1, step: 0.02, get: () => soft.light, set: (v) => (soft.light = v), mode: 'soft' },
      { key: 'softZoom', label: '内缩 zoom', min: 0.85, max: 1, step: 0.005, get: () => soft.zoom, set: (v) => (soft.zoom = v), mode: 'soft' },
    ]],
  ];

  // ── 模式分段控件 ──────────────────────────────────────────
  const modeRows = new Map<ModeId, HTMLButtonElement>();
  for (const def of [
    { id: 'sand' as const, label: '沙砾', disabled: !!renderer.sandUnavailable, title: renderer.sandUnavailable },
    { id: 'soft' as const, label: '软胶', disabled: false, title: '粘弹凹陷（当前默认）' },
    { id: 'none' as const, label: '无特效', disabled: false, title: '正常轮播，不做任何形变' },
  ]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tune-mode';
    b.textContent = def.label;
    if (def.disabled) {
      b.disabled = true;
      b.title = `本设备不可用：${def.title}`;
    } else {
      b.title = def.title;
    }
    b.addEventListener('click', () => {
      renderer.setMode(def.id);
      syncModeUI();
      runtime.wake();
    });
    modeBar.appendChild(b);
    modeRows.set(def.id, b);
  }

  /** 按当前模式显隐参数组、刷新分段选中态 */
  function syncModeUI(): void {
    // 具名函数声明会被提升，TS 不再保留外层对 renderer 的非空收窄 → 此处断言
    const r = renderer!;
    const cur = r.mode;
    for (const [id, b] of modeRows) b.classList.toggle('on', id === cur && !b.disabled);
    for (const el of Array.from(body.querySelectorAll<HTMLElement>('[data-mode]'))) {
      el.hidden = el.dataset.mode !== cur;
    }
    if (r.sandUnavailable) {
      note.hidden = false;
      note.textContent = `本设备沙砾模式不可用（已回退软胶）：${r.sandUnavailable}`;
    } else if (cur === 'none') {
      note.hidden = false;
      note.textContent = '无特效模式：正常轮播、不做形变 —— 没有可调参数。';
    } else {
      note.hidden = true;
    }
  }

  // ── 参数组 ────────────────────────────────────────────────
  for (const [title, defs] of groups) {
    const h = document.createElement('div');
    h.className = 'tune-group';
    h.textContent = title;
    const rows: HTMLElement[] = [];
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
        // 颗粒边长决定了网格与缓冲区，必须重建；其余参数在 draw() 里即时生效
        if (s.rebuilds) renderer.refresh();
        runtime.wake();
      });
      row.append(head, input);
      rows.push(row);
    }
    // 模式专属组：整组按模式显隐（组标题也一起）
    const only = defs[0]?.mode;
    if (only) {
      h.dataset.mode = only;
      for (const r of rows) r.dataset.mode = only;
    }
    body.appendChild(h);
    for (const r of rows) body.appendChild(r);
  }

  syncModeUI();

  panel.querySelector('.tune-close')!.addEventListener('click', () => {
    panel?.remove();
    panel = null;
  });

  const copyBtn = panel.querySelector('.tune-copy') as HTMLButtonElement;
  copyBtn.addEventListener('click', () => {
    // 物理参数 + 两个模式的渲染参数 + 当前模式：一次复制即可完整回写
    const json = JSON.stringify(
      {
        mode: renderer.mode,
        params: field.params as SoftParams,
        render: soft,
        sand,
      },
      null,
      2
    );
    void navigator.clipboard.writeText(json).then(() => {
      copyBtn.textContent = '已复制 ✓';
      setTimeout(() => (copyBtn.textContent = '复制参数 JSON'), 1500);
    });
  });
}
