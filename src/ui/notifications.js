import { dom } from './dom.js';

export function toast(message, type = 'info') {
  if (!dom.toasts || !message) return;
  const item = document.createElement('div');
  const safeType = ['info', 'ok', 'warn', 'err'].includes(type) ? type : 'info';
  item.className = `toast toast--${safeType}`;
  item.textContent = message;

  dom.toasts.appendChild(item);
  requestAnimationFrame(() => item.classList.add('toast--show'));

  const ttl = safeType === 'err' ? 4200 : 2800;
  window.setTimeout(() => {
    item.classList.remove('toast--show');
    item.addEventListener('transitionend', () => item.remove(), { once: true });
  }, ttl);
}

