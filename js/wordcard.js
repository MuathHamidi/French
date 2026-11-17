// The word card: hover a word (mouse) or tap it (touch) to see it; clicking also reads it aloud.
import { h, inline, normKey, toast } from './util.js';
import { entries, displayForm, POS, wordLesson, lessons } from './content.js';
import { speak } from './audio.js';
import { settings, addFlag } from './store.js';

const pop = () => document.getElementById('popover');
const canHover = matchMedia('(hover: hover) and (pointer: fine)');
// Narrower than 760 px, the card is a sheet over the bottom of the screen, just above the menu (css/app.css).
const sheet = matchMedia('(max-width: 759px)');
const unlink = (s) => s.replace(/\[([^|\]]+)\|[^\]]+\]/g, '$1'); // the card shows [surface|id] as plain text
let caseInfo = new Map(); // grammar case id -> {label, rule}
let current = null, pinned = false, showTimer, hideTimer;
let anchor = null, room = 0; // on a phone: what the card was opened from, and the space added at the end of the page

export function setCaseInfo(map) { caseInfo = map; }

export function attachWords(root) {
  root.addEventListener('click', (ev) => {
    const w = ev.target.closest('.w');
    if (!w || !root.contains(w)) return;
    speak(w.dataset.text);
    show(w, true);
  });
  root.addEventListener('mouseover', (ev) => {
    if (!canHover.matches || pinned) return;
    const w = ev.target.closest('.w');
    if (!w || w === current) return;
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = setTimeout(() => show(w, false), 140);
  });
  root.addEventListener('mouseout', (ev) => {
    if (!canHover.matches || pinned || !ev.target.closest('.w')) return;
    clearTimeout(showTimer);
    hideTimer = setTimeout(hide, 260);
  });
}

export function hide() {
  const p = pop();
  if (p) p.hidden = true;
  current?.classList.remove('on');
  current = null;
  pinned = false;
  anchor = null;
}

let globalsBound = false;
export function bindGlobalCardEvents() {
  if (globalsBound) return;
  globalsBound = true;
  const p = pop();
  document.addEventListener('click', (ev) => {
    if (p.hidden) return;
    // a row of the word list opens its card (showEntry) with this same click
    if (ev.target.closest('#popover') || ev.target.closest('.w') || ev.target.closest('.word-row')) return;
    hide();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hide(); });
  p.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  p.addEventListener('mouseleave', () => { if (!pinned) hideTimer = setTimeout(hide, 260); });
  window.addEventListener('hashchange', () => { hide(); setRoom(0); });
}

// Shows the card for an entry id without a word of a text: from a row of the word list (from), which a phone keeps
// in view.
export function showEntry(id, from = null) {
  const p = pop();
  p.classList.remove('more');
  p.replaceChildren(buildCard(id, null, null));
  p.hidden = false;
  pinned = true;
  current = null;
  p.style.left = `${Math.max(8, (innerWidth - p.offsetWidth) / 2)}px`;
  p.style.top = `${Math.max(70, (innerHeight - p.offsetHeight) / 2)}px`;
  anchor = from;
  keepInView();
}

function show(w, pin) {
  clearTimeout(hideTimer);
  current?.classList.remove('on');
  current = w;
  pinned = pin;
  w.classList.add('on');
  const p = pop();
  p.classList.remove('more');
  p.replaceChildren(buildCard(w.dataset.id, w.dataset.text, w.dataset.case));
  p.hidden = false;
  const r = w.getBoundingClientRect();
  const pw = p.offsetWidth, ph = p.offsetHeight;
  const left = Math.min(Math.max(8, r.left + r.width / 2 - pw / 2), innerWidth - pw - 8);
  let top = r.bottom + 8;
  if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 8);
  p.style.left = `${left}px`;
  p.style.top = `${top}px`;
  anchor = pin ? w : null; // not for a card opened by the pointer: a scroll would move the word away from it
  keepInView();
}

// On a phone the card covers the bottom of the screen: scroll just enough for the word it was opened from to show
// above it, below the top bar. A word near the end of the page needs room below it to move up; that room stays
// until the next page, so that closing the card moves nothing.
function keepInView() {
  const p = pop();
  if (!anchor?.isConnected || p.hidden || !sheet.matches) return;
  const r = anchor.getBoundingClientRect();
  const bar = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
  const by = Math.ceil(Math.min(r.bottom + 12 - p.getBoundingClientRect().top, r.top - bar - 4));
  if (by <= 0) return;
  const page = document.scrollingElement;
  const missing = page.scrollTop + by - (page.scrollHeight - page.clientHeight);
  if (missing > 0) setRoom(room + Math.ceil(missing));
  // to a place, not by an amount: a second call before the scroll ends (a quiz question's words) goes to the same place
  window.scrollTo({ top: page.scrollTop + by, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function setRoom(px) {
  room = px;
  if (px) document.body.style.setProperty('--card-room', `${px}px`);
  else document.body.style.removeProperty('--card-room');
}

function buildCard(id, surface, caseId) {
  const e = id ? entries.get(id) : null;
  const close = h('button', { class: 'icon-btn sm close', 'aria-label': 'Close', onclick: hide }, '✕');
  const flag = h('button', {
    class: 'reveal', onclick: () => {
      const note = prompt('What looks wrong? (optional)') ?? null;
      if (note === null) return;
      addFlag({ word: id, text: surface, note, page: location.hash });
      toast('Thanks — saved in Settings › Reported problems.');
    },
  }, '⚑ Report a problem');

  if (!e) {
    return h('div', {}, close,
      h('div', { class: 'entry-head' }, h('span', { class: 'entry-word' }, surface || '?'),
        h('button', { class: 'icon-btn sm', 'aria-label': 'Listen', onclick: () => speak(surface) }, '🔊')),
      h('p', { class: 'muted small' }, 'This word is not in the dictionary yet.'), flag);
  }

  const word = displayForm(e);
  const formOf = surface && normKey(surface) !== normKey(e.fr) && normKey(surface) !== normKey(word)
    ? h('div', { class: 'form-of' }, `“${surface}” is a form of `, h('b', {}, word)) : null;
  // "both": one noun for a man or a woman (le / la journaliste)
  const gender = e.g ? h('span', { class: `pill ${e.both ? '' : e.g}` }, e.both ? 'masc. / fem.' : e.g === 'm' ? 'masc.' : 'fem.') : null;
  const ex = e.examples?.[0];
  const gram = caseId && caseInfo.get(caseId);
  const lessonId = wordLesson.get(e.id);
  const lessonTitle = lessonId && lessons.get(lessonId)?.title;
  const defEn = e.def_en ? h('div', { class: 'small muted', hidden: true }, e.def_en) : null;
  // On a phone the card opens short (css/app.css): the word, its sound and meaning, and the rule of a grammar text.
  // The parts marked more-part wait behind « More », which shows nowhere else.
  const more = h('button', {
    class: 'btn more-btn', 'aria-expanded': 'false', onclick: () => {
      const open = pop().classList.toggle('more');
      more.textContent = open ? 'Less' : 'More';
      more.setAttribute('aria-expanded', String(open));
      keepInView();
    },
  }, 'More');

  return h('div', {}, close,
    h('div', { class: 'entry-head' },
      h('span', { class: `entry-word ${e.g && !e.both ? 'g-' + e.g : ''}` }, word),
      gender, h('span', { class: 'pill' }, POS[e.pos] || e.pos)),
    formOf,
    e.ipa && settings().showIpa ? h('div', { class: 'ipa' }, `/${e.ipa}/`) : null,
    h('div', { class: 'row', style: 'margin:8px 0' },
      h('button', { class: 'btn', onclick: () => speak(e.say || e.fr) }, '🔊 Listen'),
      h('button', { class: 'btn', onclick: () => speak(e.say || e.fr, { slow: true }) }, '🐢 Slow'),
      more),
    h('div', { class: 'entry-en' }, e.en),
    e.def ? h('div', { class: 'def more-part' }, h('div', { class: 'lbl' }, 'Définition'), inline(unlink(e.def)),
      defEn ? h('button', { class: 'reveal', onclick: () => { defEn.hidden = !defEn.hidden; } }, 'EN') : null, defEn) : null,
    ex ? h('div', { class: 'small more-part' }, h('i', {}, inline(unlink(ex.fr))), ' — ', h('span', { class: 'muted' }, ex.en)) : null,
    gram ? h('div', { class: 'gram-box' }, h('b', {}, gram.label), h('div', {}, inline(gram.rule))) : null,
    e.note ? h('div', { class: 'note more-part' }, inline(e.note)) : null,
    h('div', { class: 'row small more-part', style: 'margin-top:10px' },
      lessonTitle ? h('a', { href: `#/lesson/${lessonId}/words`, onclick: hide }, `From: ${lessonTitle}`) : h('span', { class: 'muted' }, 'Helper word'),
      h('span', { class: 'spacer' }), flag),
  );
}
