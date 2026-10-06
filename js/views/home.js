// "Today" dashboard and the "Learn" course map.
import { h, plural } from '../util.js';
import { curriculum, lessons, lessonList } from '../content.js';
import * as store from '../store.js';

const KIND = { vocab: 'Words', grammar: 'Grammar', sounds: 'Sounds' };

export function nextLesson() {
  return lessonList().find((l) => !store.lessonState(l.id)?.done) || null;
}

export function lessonHref(l) {
  return `#/lesson/${l.id}/${l.type === 'vocab' ? 'words' : 'lesson'}`;
}

export function renderToday(view) {
  const due = store.dueCardIds().length;
  const words = Object.keys(store.allCards()).filter((k) => k.startsWith('w:')).length;
  const log = store.todayLog();
  const goal = store.settings().newPerDay;
  const next = nextLesson();
  const pct = Math.min(100, Math.round((log.new / goal) * 100));
  const date = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  view.append(
    h('h1', {}, 'Bonjour !'),
    h('p', { class: 'muted' }, date),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', {}, store.streak()), h('span', {}, 'day streak')),
      h('div', { class: 'stat' }, h('b', {}, words), h('span', {}, 'words learned')),
      h('div', { class: 'stat' }, h('b', {}, due), h('span', {}, 'reviews due'))),
    h('div', { class: 'card', style: 'margin-top:12px' },
      h('div', { class: 'row' }, h('b', {}, "Today's new words"), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, `${log.new} / ${goal}`)),
      h('div', { class: 'bar', style: 'margin:8px 0 4px' }, h('i', { style: `width:${pct}%` })),
      log.new >= goal ? h('p', { class: 'small muted', style: 'margin:6px 0 0' }, "Goal reached. Keep going only if your reviews feel easy.") : null),
    h('div', { class: 'stack', style: 'margin-top:12px' },
      due ? h('a', { class: 'btn primary block', href: '#/review' }, `↻ Review ${plural(due, 'card', 'cards')} first`) : null,
      next ? h('a', { class: `btn block ${due ? '' : 'primary'}`, href: lessonHref(next) }, `▶ ${due ? 'Then: ' : 'Next: '}${next.title} — ${KIND[next.type]}`)
        : h('p', { class: 'card' }, 'You have finished every lesson available so far. New units are coming!')),
    h('div', { class: 'card', style: 'margin-top:16px' },
      h('h3', {}, 'How each day works'),
      h('ol', { style: 'margin:0;padding-left:1.2rem' },
        h('li', {}, 'Do your reviews first. They keep old words from fading.'),
        h('li', {}, 'Learn new words. Listen to each one and read the examples.'),
        h('li', {}, 'Read the story. Point at or tap any word to see it; click to hear it.'),
        h('li', {}, 'Take the quiz. Anything you miss comes back in reviews.'))),
  );
}

export function renderLearn(view) {
  view.append(h('h1', {}, 'Course'), h('p', { class: 'muted' }, 'Each unit pairs a vocabulary topic with the grammar that fits it.'));
  for (const u of curriculum.units) {
    const ls = (u.lessons || []).map((id) => lessons.get(id)).filter(Boolean);
    const box = h('section', { class: `unit ${ls.length ? '' : 'planned'}` },
      h('div', { class: 'unit-head' }, h('span', { class: 'unit-num' }, u.n), h('div', {}, h('h2', { style: 'margin:0' }, u.title), h('div', { class: 'muted small' }, u.en))));
    for (const l of ls) {
      const st = store.lessonState(l.id);
      box.append(h('a', { class: 'lesson-link', href: lessonHref(l) },
        h('span', { class: 'kind' }, KIND[l.type]),
        h('span', {}, h('div', {}, l.title), h('div', { class: 'small muted' }, l.en)),
        h('span', { class: 'spacer' }),
        st?.done ? h('span', { class: 'pill done' }, `✓ ${st.best}%`) : h('span', { class: 'pill' }, l.words ? `${l.words.length} words` : 'new')));
    }
    if (!ls.length && u.planned) {
      box.append(h('details', { class: 'small muted', style: 'margin-top:8px' }, h('summary', {}, 'Coming soon'),
        h('ul', { style: 'margin:6px 0 0;padding-left:1.2rem' }, u.planned.map((p) => h('li', {}, p)))));
    }
    view.append(box);
  }
}
