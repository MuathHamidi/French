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
  let anchor = null;
  if (page === 'learn') anchor = renderLearn(view, a);
  else if (page === 'lesson') renderLesson(view, a, b);
  else if (page === 'review') renderReview(view);
  else if (page === 'words') renderWords(view);
  else if (page === 'settings') renderSettings(view);
  else renderToday(view);
  const top = anchor ? anchor.getBoundingClientRect().top + window.scrollY - document.querySelector('.topbar').offsetHeight - 10 : 0;
  window.scrollTo(0, Math.max(0, top));
}

// Messages from sw.js about a newer version of the course. It opened the app on the version saved on the
// phone while a newer one was downloading (a weak signal), and says so once the newer one is saved: offer to
// switch to it. Or the newer one didn't fit, the device being short of space: offer to make room for it, by
// deleting the recordings saved for offline use (sw.js does it, then the page reloads and saves the new version).
function onWorkerMessage(e) {
  const { type, recordings } = e.data || {};
  const reload = () => location.reload();
  if (type === 'new-version') showBar(type, 'A new version of the course is ready.', '', 'Reload', reload);
  else if (type === 'room-made') reload();
  else if (type === 'no-room') {
    const text = "The new version of the course couldn't be saved: this device is short of space.";
    if (!recordings) showBar('no-room-left', text, 'Free some space on the device, then try again.', 'Try again', reload);
    else {
      const n = `${recordings.toLocaleString('en-GB')} ${recordings === 1 ? 'recording' : 'recordings'}`;
      showBar(type, text, `Make room deletes the ${n} saved for offline use. They download again when you play them.`, 'Make room', () => {
        e.source?.postMessage({ type: 'make-room' });
        showBar('making-room', 'Making room…');
      });
    }
  }
}

// The bar under the top bar, one at a time: a message replaces another, but not itself.
function showBar(kind, text, note = '', label = '', action = null) {
  const old = document.querySelector('.update-bar');
  if (old?.dataset.kind === kind) return;
  const bar = h('div', { class: 'update-bar', role: 'status', 'data-kind': kind },
    h('span', {}, text, note ? h('span', { class: 'small muted', style: 'display:block' }, note) : null),
    label ? h('button', { class: 'btn primary', type: 'button', onclick: action }, label) : null);
  if (old) old.replaceWith(bar);
  else document.querySelector('.topbar').after(bar);
}

async function main() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', onWorkerMessage);
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
    // Was a new version left unsaved, for lack of space? This page may have opened before it could be told.
    navigator.serviceWorker.controller?.postMessage({ type: 'status' });
  }
}

main();
