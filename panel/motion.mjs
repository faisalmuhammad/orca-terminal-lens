export function createListMotion(viewport) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Map();
  const distance = () => getComputedStyle(document.documentElement).getPropertyValue('--space-2').trim() || '8px';
  const visible = node => {
    const rect = node.getBoundingClientRect(), bounds = viewport.getBoundingClientRect();
    return rect.height > 0 && rect.bottom > bounds.top && rect.top < bounds.bottom;
  };
  function finish(animation) {
    const record = active.get(animation);
    if (!record) return;
    active.delete(animation);
    delete record.node.dataset.listMotion;
    animation.cancel();
  }
  function animate(node, index) {
    const offset = distance();
    node.dataset.listMotion = 'enter';
    const frames = [{ opacity: 0, transform: 'translateY(' + offset + ')' }, { opacity: 1, transform: 'translateY(0)' }];
    const animation = node.animate(frames, {
      duration: 220, delay: Math.min(index, 6) * 28,
      easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both'
    });
    active.set(animation, { node });
    animation.finished.then(() => finish(animation), () => {});
    return animation;
  }
  function stop() {
    for (const animation of [...active.keys()]) finish(animation);
  }
  function entries(root) {
    return [...root.querySelectorAll('[data-motion-key]')].filter(visible);
  }
  function capture(root) {
    stop();
    return new Set([...root.querySelectorAll('[data-motion-key]')].map(node => node.dataset.motionKey));
  }
  function play(root, previous) {
    if (reducedMotion.matches) return;
    let enterIndex = 0;
    for (const node of entries(root)) if (!previous.has(node.dataset.motionKey)) animate(node, enterIndex++);
  }
  function setHidden(container, hidden) {
    for (const [animation, record] of active) if (container.contains(record.node)) finish(animation);
    container.hidden = hidden;
    if (!hidden && !reducedMotion.matches) [...container.children].filter(visible).forEach(animate);
  }
  reducedMotion.addEventListener('change', stop);
  return { capture, play, setHidden, dispose() { stop(); reducedMotion.removeEventListener('change', stop); } };
}
