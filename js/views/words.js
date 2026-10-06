// Searchable list of every word in the course.
import { h, normKey, stripAccents } from '../util.js';
import { lessonList, displayForm } from '../content.js';
import { getCard } from '../store.js';
import { showEntry } from '../wordcard.js';
import { speak } from '../audio.js';

export function renderWords(view) {
  const all = lessonList().flatMap((l) => (l.words || []).map((w) => ({ w, lesson: l })));
  let onlyLearned = false;
  const list = h('div', {});
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Search French or English…', 'aria-label': 'Search words' });
  const count = h('span', { class: 'small muted' });
  const toggle = h('button', { class: 'btn' }, 'Show: all words');

  const fold = (s) => stripAccents(normKey(s));
  const draw = () => {
    const q = fold(search.value);
    const rows = all.filter(({ w }) => (!onlyLearned || getCard(`w:${w.id}`))
      && (!q || fold(displayForm(w)).includes(q) || fold(w.en).includes(q)));
    count.textContent = `${rows.length} word${rows.length === 1 ? '' : 's'}`;
    list.replaceChildren(...rows.map(({ w }) => h('div', { class: 'word-row', role: 'button', tabindex: '0', onclick: () => showEntry(w.id) },
      h('button', { class: 'icon-btn sm', 'aria-label': 'Listen', onclick: (e) => { e.stopPropagation(); speak(w.say || w.fr); } }, '🔊'),
      h('span', { class: `fr ${w.g ? 'g-' + w.g : ''}` }, displayForm(w)),
      getCard(`w:${w.id}`) ? h('span', { class: 'pill done' }, '✓') : null,
      h('span', { class: 'en' }, w.en))));
  };
  search.addEventListener('input', draw);
  toggle.onclick = () => { onlyLearned = !onlyLearned; toggle.textContent = onlyLearned ? 'Show: learned only' : 'Show: all words'; draw(); };

  view.append(h('h1', {}, 'Words'), h('div', { class: 'stack' }, search, h('div', { class: 'row' }, toggle, h('span', { class: 'spacer' }), count), list));
  draw();
}
