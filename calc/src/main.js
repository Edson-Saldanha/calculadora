import { initEvents } from './ui/events.js';

function init() {
  initEvents();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

