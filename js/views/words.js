// Searchable list of every word in the course.
import { h, normKey, stripAccents } from '../util.js';
import { lessonList, displayForm } from '../content.js';
import { getCard } from '../store.js';
import { showEntry } from '../wordcard.js';
import { speak } from '../audio.js';

// Drawing all ~5,000 rows takes about half a second on a computer (longer on a phone),
// so the list shows the first matches and a button for the rest.
const FIRST = 200;

export function renderWords(view) {
  const fold = (s) => stripAccents(normKey(s));
  const all = lessonList().flatMap((l) => (l.words || []).map((w) => ({ w, fr: fold(displayForm(w)), en: fold(w.en) })));
  let onlyLearned = false;
  const list = h('div', {});
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Search French or English…', 'aria-label': 'Search words' });
  const count = h('span', { class: 'small muted' });
  const toggle = h('button', { class: 'btn' }, 'Show: all words');

  const row = (w) => h('div', {
    class: 'word-row', role: 'button', tabindex: '0', onclick: () => showEntry(w.id),
    onkeydown: (e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showEntry(w.id); } },
  },
  h('button', { class: 'icon-btn sm', 'aria-label': 'Listen', onclick: (e) => { e.stopPropagation(); speak(w.say || w.fr); } }, '🔊'),
  h('span', { class: `fr ${w.g && !w.both ? 'g-' + w.g : ''}` }, displayForm(w)), // either gender: no colour, as on the card
  getCard(`w:${w.id}`) ? h('span', { class: 'pill done' }, '✓') : null,
  h('span', { class: 'en' }, w.en));

  const draw = () => {
    const q = fold(search.value);
    const rows = all.filter((r) => (!onlyLearned || getCard(`w:${r.w.id}`)) && (!q || r.fr.includes(q) || r.en.includes(q)));
    count.textContent = `${rows.length} word${rows.length === 1 ? '' : 's'}`;
    list.replaceChildren(...rows.slice(0, FIRST).map((r) => row(r.w)));
    if (rows.length > FIRST) {
      const rest = h('button', { class: 'btn block', style: 'margin-top:8px' }, `Show all ${rows.length} words`);
      rest.onclick = () => { rest.remove(); list.append(...rows.slice(FIRST).map((r) => row(r.w))); };
      list.append(rest);
    }
  };
  search.addEventListener('input', draw);
  toggle.onclick = () => { onlyLearned = !onlyLearned; toggle.textContent = onlyLearned ? 'Show: learned only' : 'Show: all words'; draw(); };

  view.append(h('h1', {}, 'Words'), h('div', { class: 'stack' }, search, h('div', { class: 'row' }, toggle, h('span', { class: 'spacer' }), count), list));
  draw();
}
