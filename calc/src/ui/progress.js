import { STATUS_KIND } from '../core/constants.js';
import { dom } from './dom.js';

let timerId = null;
let startTime = 0;

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds % 60);
  return `${minutes}m ${rem}s`;
}

export function resetTimer() {
  if (dom.elapsedTime) dom.elapsedTime.textContent = '0s';
  startTime = 0;
}

export function startTimer() {
  startTime = Date.now();
  if (timerId) clearInterval(timerId);
  timerId = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    if (dom.elapsedTime) dom.elapsedTime.textContent = formatSeconds(elapsed);
  }, 500);
}

export function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

export function setStatus(text, kind = STATUS_KIND.idle) {
  if (!dom.statusText) return;
  dom.statusText.textContent = text;
  dom.statusText.classList.remove('status-text--idle', 'status-text--ok', 'status-text--warn', 'status-text--err');
  dom.statusText.classList.add(`status-text--${kind}`);
}

export function setProgress({ text = '', current = 0, total = 0 } = {}) {
  if (dom.progressText && text) {
    dom.progressText.textContent = text;
  }
  if (!dom.progressFill) return;
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeCurrent = Math.min(safeTotal, Math.max(0, Number(current) || 0));
  const pct = Math.round((safeCurrent / safeTotal) * 100);
  dom.progressFill.style.width = `${pct}%`;
}

export function resetProgress(text = '—') {
  if (dom.progressText) dom.progressText.textContent = text;
  if (dom.progressFill) dom.progressFill.style.width = '0%';
}

