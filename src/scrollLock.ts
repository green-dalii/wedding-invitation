/** 滚动锁（SPEC §7）：Hero 内锁定下滑，仅按钮进入下方；回到顶部自动重新锁定 */
let locked = true;
let openedAt = 0;

export function isLocked(): boolean {
  return locked;
}

export function lock(): void {
  locked = true;
  document.documentElement.classList.add('locked');
  window.scrollTo(0, 0);
}

export function initScrollLock(): void {
  const hero = document.getElementById('hero');
  const go = document.querySelector<HTMLButtonElement>('.go');
  const details = document.getElementById('details');
  const html = document.documentElement;
  html.classList.add('locked');

  const block = (e: Event) => {
    if (locked) e.preventDefault();
  };
  hero?.addEventListener('touchmove', block, { passive: false });
  hero?.addEventListener('wheel', block, { passive: false });

  go?.addEventListener('click', () => {
    if (!locked) return;
    locked = false;
    html.classList.remove('locked');
    openedAt = performance.now();
    requestAnimationFrame(() => {
      details?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  window.addEventListener('scroll', () => {
    if (!locked && window.scrollY <= 1 && performance.now() - openedAt > 800) lock();
  }, { passive: true });

  document.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement | null)?.closest?.('.back-top');
    if (btn) window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}
