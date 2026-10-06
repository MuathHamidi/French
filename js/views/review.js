// Daily spaced-repetition review of learned words and grammar cases.
import { h, plural, shuffle } from '../util.js';
import { entries, lessons } from '../content.js';
import * as store from '../store.js';
import { schedule, AGAIN, HARD, GOOD } from '../srs.js';
import { runQuestions } from '../quiz.js';
import { wordQuestion, kindsFor, poolFor, grammarQuestion } from '../quizgen.js';
import { wordLesson } from '../content.js';

const SESSION_MAX = 60;
const RECOGNISE = ['fr2en', 'listen', 'def2fr'];
const PRODUCE = ['en2fr', 'cloze', 'gender'];

function questionFor(cardId) {
  const card = store.getCard(cardId);
  if (cardId.startsWith('w:')) {
    const e = entries.get(cardId.slice(2));
    if (!e) return null;
    const kinds = kindsFor(e);
    // Young cards: mostly recognition. Older cards: mostly writing the word yourself.
    const pref = card.reps < 2 && Math.random() < 0.6 ? RECOGNISE : PRODUCE;
    const options = kinds.filter((k) => pref.includes(k));
    const kind = shuffle(options.length ? options : kinds)[0];
    return wordQuestion(e, kind, poolFor(lessons.get(wordLesson.get(e.id))));
  }
  const [, lessonId, caseId] = cardId.split(':');
  const lesson = lessons.get(lessonId);
  const items = lesson?.quiz.filter((q) => q.case === caseId) || [];
  return items.length ? grammarQuestion(lesson, shuffle(items)[0]) : null;
}

export function renderReview(view) {
  const due = shuffle(store.dueCardIds());
  view.append(h('h1', {}, 'Review'));
  if (!due.length) {
    const cards = Object.values(store.allCards());
    const soonest = cards.length ? Math.min(...cards.map((c) => c.due)) : null;
    view.append(h('div', { class: 'card', style: 'text-align:center' },
      h('div', { class: 'big-icon' }, '✅'),
      h('p', { style: 'margin-top:8px' }, cards.length ? 'Nothing to review right now.' : 'Finish a lesson quiz and its words will show up here for review.'),
      soonest ? h('p', { class: 'muted small' }, `Next review: ${new Date(soonest).toLocaleString('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}`) : null,
      h('a', { class: 'btn primary', href: '#/learn' }, 'Go to the course')));
    return;
  }
  const batch = due.slice(0, SESSION_MAX);
  const body = h('div', {});
  view.append(body);
  body.append(h('div', { class: 'card' },
    h('p', {}, `${plural(due.length, 'card is', 'cards are')} due.${due.length > SESSION_MAX ? ` This session covers ${SESSION_MAX}.` : ''}`),
    h('p', { class: 'small muted' }, 'Wrong answers come back a few minutes later; right answers come back after a longer gap each time.'),
    h('button', { class: 'btn primary block', onclick: start }, 'Start reviewing')));

  function start() {
    const qs = batch.map(questionFor).filter(Boolean);
    let right = 0;
    runQuestions(body, qs, {
      onAnswer: (q, res) => {
        const grade = res === 'ok' ? GOOD : res === 'accent' ? HARD : AGAIN;
        store.putCard(q.cardId, schedule(store.getCard(q.cardId), grade));
        store.bumpLog({ reviews: 1 });
        if (res !== 'no') right++;
      },
      onDone: () => {
        const left = store.dueCardIds().length;
        const soon = store.dueCardIds(Date.now() + 15 * 60 * 1000).length - left; // missed cards return in ~10 min
        body.replaceChildren(h('div', { class: 'card', style: 'text-align:center' },
          h('div', { class: 'big-icon' }, '🌟'),
          h('h2', { style: 'margin-top:8px' }, `${right} / ${qs.length} right first time`),
          h('p', { class: 'muted' }, left ? `${plural(left, 'card is', 'cards are')} still due.`
            : soon ? `The ${plural(soon, 'card', 'cards')} you missed will come back in about 10 minutes.` : 'All caught up for now.'),
          h('div', { class: 'stack' },
            left ? h('a', { class: 'btn primary block', href: '#/review', onclick: () => setTimeout(() => dispatchEvent(new HashChangeEvent('hashchange')), 0) }, 'Keep reviewing') : null,
            h('a', { class: 'btn block', href: '#/today' }, 'Back to Today'))));
      },
    });
  }
}
