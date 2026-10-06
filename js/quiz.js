// Quiz runner (used by lesson quizzes and daily reviews) and the end-of-lesson quiz page.
import { h, inline, normAnswer, stripAccents, plural } from './util.js';
import { renderText } from './text.js';
import { attachWords, hide as hideCard } from './wordcard.js';
import { speak } from './audio.js';
import * as store from './store.js';
import { newCard, schedule, GOOD, HARD } from './srs.js';
import { vocabQuiz, grammarQuiz } from './quizgen.js';
import { nextLesson, lessonHref } from './views/home.js';

const ACCENTS = ['é', 'è', 'ê', 'à', 'â', 'ç', 'ù', 'û', 'ô', 'î', 'ï', 'ë', 'œ'];
export const PASS = 80;

// 'ok' | 'accent' (right apart from accents) | 'no'
export function check(q, given) {
  if (q.options) return q.answers.includes(given) ? 'ok' : 'no';
  const a = normAnswer(given);
  if (!a) return 'no';
  const acc = q.answers.map(normAnswer);
  if (acc.includes(a)) return 'ok';
  return acc.some((x) => stripAccents(x) === stripAccents(a)) ? 'accent' : 'no';
}

let keyHandler = null;
function onKey(fn) {
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = fn;
  if (fn) document.addEventListener('keydown', fn);
}
window.addEventListener('hashchange', () => onKey(null));

export function runQuestions(root, questions, { onAnswer, onDone, requeue = true } = {}) {
  const queue = questions.slice();
  const first = new Map();
  const retried = new Set();
  let i = 0;

  const render = () => {
    hideCard();
    const q = queue[i];
    const retry = first.has(q);
    const prompt = q.promptFr
      ? h('div', { class: 'q-prompt fr fr-text' }, q.rich ? renderText(q.prompt) : q.prompt)
      : h('div', { class: 'q-prompt' }, q.prompt);
    const feedback = h('div', {});
    let answered = false;

    const submit = (given, btn) => {
      if (answered) return;
      answered = true;
      const res = check(q, given);
      if (!first.has(q)) { first.set(q, res); onAnswer?.(q, res); }
      if (res === 'no' && requeue && !retried.has(q)) { retried.add(q); queue.push(q); }
      card.querySelectorAll('.option').forEach((b) => {
        b.disabled = true;
        if (q.answers.includes(b.dataset.v)) b.classList.add('correct');
      });
      if (btn && res === 'no') btn.classList.add('wrong');
      card.querySelectorAll('input, .accents button, .check').forEach((el) => { el.disabled = true; });
      const msg = res === 'ok' ? 'Correct!' : res === 'accent' ? 'Correct — but check the accents:' : 'Not quite. The answer is:';
      feedback.replaceChildren(h('div', { class: `feedback ${res === 'ok' ? 'ok' : res === 'accent' ? 'almost' : 'no'}` },
        h('b', {}, msg),
        res !== 'ok' || !q.options ? h('div', { class: 'expected' }, q.answers[0]) : null,
        q.explain ? h('div', { class: 'small', style: 'color:var(--text);margin-top:4px' }, inline(q.explain)) : null),
      h('button', { class: 'btn primary block', style: 'margin-top:12px', onclick: next }, i + 1 < queue.length ? 'Continue →' : 'Finish'));
      speak(q.say);
      feedback.querySelector('.btn').focus();
    };

    let body;
    if (q.options) {
      body = h('div', { class: 'options' }, q.options.map((o, n) => h('button', {
        class: 'option', 'data-v': o, onclick: (e) => submit(o, e.currentTarget),
      }, h('span', { class: 'muted small' }, `${n + 1}  `), o)));
    } else {
      const input = h('input', {
        class: 'answer-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
        lang: 'fr', placeholder: 'Type in French…', 'aria-label': 'Your answer',
      });
      body = h('div', {}, input,
        h('div', { class: 'accents' }, ACCENTS.map((c) => h('button', {
          type: 'button', onclick: () => {
            const s = input.selectionStart ?? input.value.length;
            input.value = input.value.slice(0, s) + c + input.value.slice(input.selectionEnd ?? s);
            input.focus();
            input.setSelectionRange(s + 1, s + 1);
          },
        }, c))),
        h('button', { class: 'btn primary block check', onclick: () => submit(input.value) }, 'Check'),
        h('button', { class: 'reveal', style: 'margin-top:8px', onclick: () => submit('') }, "I don't know"));
      setTimeout(() => input.focus(), 30);
    }

    const card = h('div', { class: 'card' },
      h('div', { class: 'q-kind' }, retry ? `Try again · ${q.label}` : q.label),
      h('div', { class: 'row' }, prompt, q.audio ? h('button', { class: 'icon-btn', 'aria-label': 'Listen', onclick: () => speak(q.say) }, '🔊') : null),
      q.hint ? h('div', { class: 'q-hint' }, q.hint) : null,
      body, feedback);

    const pct = Math.round((i / queue.length) * 100);
    root.replaceChildren(
      h('div', { class: 'quiz-top' }, h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })), h('span', { class: 'small muted' }, `${i + 1} / ${queue.length}`)),
      card);
    attachWords(prompt);
    if (q.autoplay) setTimeout(() => speak(q.say), 250);

    onKey((ev) => {
      if (answered && ev.key === 'Enter') { ev.preventDefault(); next(); return; }
      if (!answered && ev.key === 'Enter' && !q.options) { ev.preventDefault(); submit(card.querySelector('input').value); return; }
      if (!answered && q.options && /^[1-9]$/.test(ev.key) && !ev.target.closest?.('input')) {
        const b = card.querySelectorAll('.option')[Number(ev.key) - 1];
        if (b) submit(b.dataset.v, b);
      }
    });
  };

  const next = () => {
    i += 1;
    if (i < queue.length) render();
    else { onKey(null); onDone?.(first); }
  };
  render();
}

// ---------- lesson quiz page ----------
export function renderQuiz(body, lesson) {
  const start = () => {
    const qs = lesson.type === 'vocab' ? vocabQuiz(lesson) : grammarQuiz(lesson);
    runQuestions(body, qs, { onDone: (first) => finish(body, lesson, first, start) });
  };
  const n = lesson.type === 'vocab' ? null : lesson.quiz.length;
  body.append(h('div', { class: 'card' },
    h('h2', {}, 'Quiz'),
    h('p', {}, lesson.type !== 'vocab'
      ? `${plural(n, 'question', 'questions')} covering every case in this lesson.`
      : `Every word in this lesson comes up twice: once to recognise it, once to write it.`),
    h('p', { class: 'small muted' }, `Score ${PASS}% or more to complete the lesson. Questions you miss come back at the end, and later in your reviews.`),
    h('button', { class: 'btn primary block', onclick: start }, 'Start the quiz')));
}

function finish(body, lesson, first, restart) {
  const results = [...first.entries()];
  const good = results.filter(([, r]) => r !== 'no').length;
  const score = Math.round((good / results.length) * 100);
  const passed = score >= PASS;
  if (passed) {
    const wasDone = store.lessonState(lesson.id)?.done;
    if (!wasDone) seedCards(results);
    store.finishLesson(lesson.id, score);
  }
  const missed = results.filter(([, r]) => r === 'no').map(([q]) => q);
  const next = nextLesson();
  body.replaceChildren(h('div', { class: 'card', style: 'text-align:center' },
    h('div', { class: 'big-icon' }, passed ? '🎉' : '💪'),
    h('h2', { style: 'margin-top:8px' }, `${score}%`),
    h('p', {}, passed ? `Lesson complete! These ${lesson.type === 'vocab' ? 'words' : 'rules'} are now in your daily reviews.` : `Almost — you need ${PASS}% to complete this lesson. Look back at the lesson, then try again.`),
    missed.length ? h('div', { style: 'text-align:left' }, h('h3', {}, 'To practise'),
      h('ul', {}, [...new Set(missed.map((q) => (q.wordId ? q.explain : q.say)))].map((a) => h('li', {}, a)))) : null,
    h('div', { class: 'stack', style: 'margin-top:12px' },
      passed && next ? h('a', { class: 'btn primary block', href: lessonHref(next) }, `Next lesson: ${next.title} →`) : null,
      h('button', { class: `btn block ${passed ? '' : 'primary'}`, onclick: () => { body.replaceChildren(); restart(); } }, 'Retake the quiz'),
      h('a', { class: 'btn block', href: '#/today' }, 'Back to Today'))));
}

function seedCards(results) {
  const missedCard = new Map(); // card id -> missed at least once
  for (const [q, r] of results) missedCard.set(q.cardId, missedCard.get(q.cardId) || r === 'no');
  let newWords = 0;
  for (const [id, missed] of missedCard) {
    if (store.getCard(id)) continue;
    store.putCard(id, schedule(newCard(), missed ? HARD : GOOD));
    if (id.startsWith('w:')) newWords++;
  }
  if (newWords) store.bumpLog({ new: newWords });
}
