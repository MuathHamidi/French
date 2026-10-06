// Entry point: loads data, then routes #/... URLs to views.
import { h } from './util.js';
import { loadAll } from './content.js';
import { load as loadStore } from './store.js';
import { initAudio, stop } from './audio.js';
import { bindGlobalCardEvents, hide as hideCard } from './wordcard.js';
import { renderToday, renderLearn } from './views/home.js';
import { renderLesson } from './views/lesson.js';
import { renderReview } from './views/review.js';
import { renderWords } from './views/words.js';
import { renderSettings, applyTheme } from './views/settings.js';

const view = document.getElementById('view');

function route() {
  stop();
  hideCard();
  const parts = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  const [page, a, b] = parts;
  view.replaceChildren();
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === page || (page === 'lesson' && el.dataset.nav === 'learn'));
  });
  if (page === 'learn') renderLearn(view);
  else if (page === 'lesson') renderLesson(view, a, b);
  else if (page === 'review') renderReview(view);
  else if (page === 'words') renderWords(view);
  else if (page === 'settings') renderSettings(view);
  else renderToday(view);
  window.scrollTo(0, 0);
}

async function main() {
  loadStore();
  applyTheme();
  try {
    await Promise.all([loadAll(), initAudio()]);
  } catch (err) {
    view.replaceChildren(h('div', { class: 'card' },
      h('h2', {}, 'Could not load the course'),
      h('p', {}, String(err.message || err)),
      h('p', { class: 'small muted' }, 'If you opened index.html directly, start a local server instead (see README).')));
    return;
  }
  bindGlobalCardEvents();
  window.addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

main();
