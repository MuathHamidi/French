#!/usr/bin/env node
// Tests the parts of the app that need no screen: the review schedule, dates (midnight, the nights the
// clocks change), saved progress (saving, loading, backups, damaged data, a second tab), the streak and
// the daily log, and how typed answers are checked. tools/test.html tests the pages themselves.
//
// Run:  node tools/check_logic.mjs      (Node.js 22+; prints OK, or each failure and exits 1)
// Dates are tested in Montreal's time zone, whatever the computer's is.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.TZ = 'America/Toronto';
if (new Date(Date.UTC(2026, 10, 1, 4, 30)).getHours() !== 0) {
  console.error('Could not switch to the America/Toronto time zone.');
  process.exit(2);
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Just enough of a browser for the app's modules: localStorage (which can be made full), listeners.
const saved = new Map();
let storageFull = false;
globalThis.localStorage = {
  getItem: (k) => (saved.has(k) ? saved.get(k) : null),
  setItem: (k, v) => { if (storageFull) throw new Error('QuotaExceededError'); saved.set(k, String(v)); },
  removeItem: (k) => { saved.delete(k); },
};
const listeners = {};
globalThis.window = globalThis;
globalThis.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };
globalThis.matchMedia = () => ({ matches: false });
globalThis.document = { getElementById: () => null };

const load = (file) => import(pathToFileURL(path.join(ROOT, 'js', file)).href);
const util = await load('util.js');
const srs = await load('srs.js');
const store = await load('store.js');
const { check } = await load('quiz.js');
const KEY = 'francais-app-v1';

let failures = 0, count = 0;
function test(name, fn) {
  try { fn(); count++; } catch (err) { failures++; console.log(`FAIL ${name}\n     ${err.message}`); }
}
function eq(actual, expected, what) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: got ${a}, expected ${e}`);
}
function ok(cond, what) { if (!cond) throw new Error(what); }
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime(); // local (Montreal) time
const show = (ms) => new Date(ms).toString().slice(4, 21);
const MIN = 60000;

// ---------- dates ----------
test('todayKey is the local date', () => {
  eq(util.todayKey(new Date(at(2026, 1, 5, 23, 59))), '2026-01-05', 'Jan 5, 23:59');
  eq(util.todayKey(new Date(at(2026, 12, 31, 0, 0))), '2026-12-31', 'Dec 31, 00:00');
});
test('startOfDay counts calendar days, also on the nights the clocks change', () => {
  eq(show(util.startOfDay(at(2026, 11, 7, 15, 20))), show(at(2026, 11, 7)), 'same day');
  // 1 November 2026: the clocks go back at 2 a.m., so the day has 25 hours
  eq(show(util.startOfDay(at(2026, 11, 1, 0, 30), 1)), show(at(2026, 11, 2)), 'fall back, 00:30 + 1 day');
  eq(show(util.startOfDay(at(2026, 10, 31, 23, 30), 1)), show(at(2026, 11, 1)), 'eve of fall back, 23:30 + 1 day');
  // 14 March 2027: the clocks go forward at 2 a.m., so the day has 23 hours
  eq(show(util.startOfDay(at(2027, 3, 13, 23, 30), 1)), show(at(2027, 3, 14)), 'eve of spring forward, 23:30 + 1 day');
  eq(show(util.startOfDay(at(2027, 3, 14, 12, 0), 1)), show(at(2027, 3, 15)), 'spring forward, noon + 1 day');
  eq(show(util.startOfDay(at(2026, 12, 31, 18, 0), 1)), show(at(2027, 1, 1)), 'new year');
  eq(show(util.startOfDay(at(2026, 1, 31, 9, 0), 30)), show(at(2026, 3, 2)), 'across February');
});

// ---------- review schedule ----------
const NOW = at(2026, 11, 7, 14, 0);
const grade = (card, ...grades) => grades.reduce((c, g) => srs.schedule(c, g, NOW), card);
test('a new card: due now, nothing learned yet', () => {
  const c = srs.newCard(NOW);
  eq([c.due, c.ivl, c.ease, c.reps, c.lapses], [NOW, 0, 2.5, 0, 0], 'new card');
  ok(srs.isDue(c, NOW), 'a new card is due');
});
test('first answers: good and hard come back tomorrow, easy in 3 days', () => {
  const good = srs.schedule(srs.newCard(NOW), srs.GOOD, NOW);
  eq([good.ivl, good.reps, show(good.due)], [1, 1, show(at(2026, 11, 8))], 'good');
  const hard = srs.schedule(srs.newCard(NOW), srs.HARD, NOW);
  eq([hard.ivl, Math.round(hard.ease * 100)], [1, 235], 'hard');
  const easy = srs.schedule(srs.newCard(NOW), srs.EASY, NOW);
  eq([easy.ivl, Math.round(easy.ease * 100), show(easy.due)], [3, 265, show(at(2026, 11, 10))], 'easy');
});
test('good answers space out: 1 day, 3 days, then interval × ease (± 5%)', () => {
  const c2 = grade(srs.newCard(NOW), srs.GOOD, srs.GOOD);
  eq(c2.ivl, 3, 'second good');
  const c3 = srs.schedule(c2, srs.GOOD, NOW);
  ok(c3.ivl >= 7 && c3.ivl <= 8, `third good: ${c3.ivl} days, expected 7–8 (3 × 2.5, ± 5%)`);
});
test('a wrong answer: back in 10 minutes, relearned from the start, ease lowered', () => {
  const learned = grade(srs.newCard(NOW), srs.GOOD, srs.GOOD, srs.GOOD);
  const c = srs.schedule(learned, srs.AGAIN, NOW);
  eq([c.ivl, c.reps, c.lapses, c.due - NOW, Math.round(c.ease * 100)], [0, 0, 1, 10 * MIN, 230], 'again');
  eq(srs.schedule(c, srs.GOOD, NOW).ivl, 1, 'good after a miss: tomorrow');
  eq(srs.schedule(srs.newCard(NOW), srs.AGAIN, NOW).lapses, 0, 'a miss on a new card is not a lapse');
});
test('ease never drops below 1.3, intervals never exceed 730 days', () => {
  let c = srs.newCard(NOW);
  for (let i = 0; i < 20; i++) c = srs.schedule(c, srs.AGAIN, NOW);
  eq(c.ease, 1.3, 'ease after 20 misses');
  for (let i = 0; i < 30; i++) c = srs.schedule(c, srs.EASY, NOW);
  eq(c.ivl, 730, 'interval after 30 easy answers');
});
test('every interval of 3 days or more varies by at most 5%', () => {
  for (let ivl = 3; ivl <= 400; ivl += 7) {
    for (let k = 0; k < 20; k++) {
      const c = srs.schedule({ ...srs.newCard(NOW), ivl, reps: 2, ease: 1.3 }, srs.HARD, NOW);
      const base = Math.max(1, Math.round(ivl * 1.2));
      ok(Math.abs(c.ivl - base) <= Math.ceil(base * 0.05) + 1, `hard from ${ivl} days gave ${c.ivl}, expected about ${base}`);
    }
  }
});
test('cards always fall due at midnight, whatever time and night they were answered', () => {
  const times = [at(2026, 11, 7, 0, 5), at(2026, 11, 7, 23, 55), at(2026, 11, 1, 0, 30), at(2026, 11, 1, 1, 30),
    at(2026, 10, 31, 23, 30), at(2027, 3, 13, 23, 30), at(2027, 3, 14, 3, 30)];
  for (const t of times) {
    for (const g of [srs.HARD, srs.GOOD, srs.EASY]) {
      const c = srs.schedule(srs.newCard(t), g, t);
      const d = new Date(c.due);
      ok(d.getHours() === 0 && d.getMinutes() === 0, `answered ${show(t)}: due ${d}`);
      const days = Math.round((util.startOfDay(c.due) - util.startOfDay(t)) / 86400000);
      eq(days, c.ivl, `answered ${show(t)}: days until due`);
    }
  }
});
test('due and mature', () => {
  ok(srs.isDue({ due: NOW }, NOW) && !srs.isDue({ due: NOW + 1 }, NOW), 'due at its time, not before');
  ok(srs.isMature({ ivl: 3 }) && !srs.isMature({ ivl: 2 }), 'mature from a 3-day interval');
});

// ---------- saved progress ----------
const reset = () => { saved.clear(); storageFull = false; store.load(); };
test('nothing saved yet: default settings and empty progress', () => {
  reset();
  eq(store.settings(), { newPerDay: 30, rate: 0.9, voice: '', showIpa: true, theme: 'auto' }, 'settings');
  eq([store.dueCardIds(), store.flags(), store.todayLog()], [[], [], { new: 0, reviews: 0, lessons: 0 }], 'progress');
});
test('progress is saved and read back', () => {
  reset();
  store.putCard('w:maison', srs.newCard(NOW));
  store.finishLesson('u01-vocab', 92);
  store.setSetting('theme', 'dark');
  store.load();
  ok(store.getCard('w:maison'), 'card read back');
  eq([store.lessonState('u01-vocab').done, store.lessonState('u01-vocab').best, store.settings().theme], [true, 92, 'dark'], 'lesson and setting');
  store.finishLesson('u01-vocab', 85);
  eq(store.lessonState('u01-vocab').best, 92, 'a lower retake keeps the best score');
});
test('unreadable saved progress is kept aside, not overwritten', () => {
  for (const bad of ['{"cards": {', '42', 'null', '[1, 2]']) {
    reset();
    saved.set(KEY, bad);
    store.load();
    eq(store.dueCardIds(), [], `${bad}: starts empty`);
    store.putCard('w:chat', srs.newCard(NOW));
    eq(saved.get(`${KEY}-unreadable`), bad, `${bad}: the unreadable copy`);
  }
});
test('parts of the wrong type are replaced, so nothing crashes', () => {
  reset();
  saved.set(KEY, JSON.stringify({ v: 1, settings: 'x', lessons: [], cards: null, log: [], flags: {} }));
  store.load();
  eq([store.dueCardIds(), store.flags(), store.todayLog(), store.streak(), store.settings().newPerDay], [[], [], { new: 0, reviews: 0, lessons: 0 }, 0, 30], 'repaired');
  store.addFlag({ word: 'chat' });
  store.bumpLog({ reviews: 1 });
  eq([store.flags().length, store.todayLog().reviews], [1, 1], 'usable afterwards');
});
test('a backup loads back exactly; anything else is refused and changes nothing', () => {
  reset();
  store.putCard('w:pain', srs.newCard(NOW));
  store.addFlag({ word: 'pain', note: 'test' });
  const backup = store.exportJSON();
  store.resetAll();
  eq(store.getCard('w:pain'), null, 'after reset');
  store.importJSON(backup);
  eq(store.exportJSON(), backup, 'round trip');
  for (const bad of ['not json', '[]', '{}', '{"cards": null, "lessons": {}}', '{"cards": {}, "lessons": []}']) {
    let threw = false;
    try { store.importJSON(bad); } catch { threw = true; }
    ok(threw, `${bad} was accepted as a backup`);
    eq(store.exportJSON(), backup, `${bad}: progress unchanged`);
  }
});
test('when storage is full or blocked, saving fails quietly', () => {
  reset();
  storageFull = true;
  store.putCard('w:eau', srs.newCard(NOW)); // must not throw
  store.bumpLog({ reviews: 1 });
  eq(store.getCard('w:eau')?.ivl, 0, 'the card is still there for this session');
});
test("another tab's progress is taken up, not overwritten", () => {
  reset();
  store.putCard('w:un', srs.newCard(NOW));
  // the other tab, which had also loaded w:un, learns w:deux and saves
  const other = JSON.parse(saved.get(KEY));
  other.cards['w:deux'] = srs.newCard(NOW);
  saved.set(KEY, JSON.stringify(other));
  for (const fn of listeners.storage || []) fn({ key: KEY });
  store.putCard('w:trois', srs.newCard(NOW)); // this tab saves again
  const keys = Object.keys(JSON.parse(saved.get(KEY)).cards).sort();
  eq(keys, ['w:deux', 'w:trois', 'w:un'], 'cards saved');
});
test('due cards', () => {
  reset();
  store.putCard('w:a', { ...srs.newCard(NOW), due: NOW - 1 });
  store.putCard('w:b', { ...srs.newCard(NOW), due: NOW + 10 * MIN });
  eq(store.dueCardIds(NOW), ['w:a'], 'now');
  eq(store.dueCardIds(NOW + 10 * MIN).sort(), ['w:a', 'w:b'], 'in 10 minutes');
});
test('the streak counts days in a row with any study', () => {
  reset();
  const s = JSON.parse(saved.get(KEY) || store.exportJSON());
  const day = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return util.todayKey(d); };
  s.log = { [day(1)]: { reviews: 3 }, [day(2)]: { new: 5 }, [day(4)]: { reviews: 1 } };
  store.importJSON(JSON.stringify(s));
  eq(store.streak(), 2, 'yesterday and the day before, today not started yet');
  store.bumpLog({ reviews: 1 });
  eq(store.streak(), 3, 'once today is started');
  eq(store.todayLog(), { new: 0, reviews: 1, lessons: 0 }, "today's log");
});

// ---------- typed answers ----------
const typed = (answers) => ({ answers });
test('typed answers: capitals, spaces, punctuation and apostrophes do not matter', () => {
  eq(check(typed(["l'école"]), '  L’École ! '), 'ok', 'capitals, curly apostrophe, punctuation');
  eq(check(typed(['grand-mère']), 'grand - mère'), 'ok', 'spaces around a hyphen');
  eq(check(typed(["aujourd'hui"]), "aujourd ' hui"), 'ok', 'spaces around an apostrophe');
  eq(check(typed(['ça va']), 'Ça va ?'), 'ok', 'no-break space and question mark');
  eq(check(typed(['le chat', 'chat']), 'chat'), 'ok', 'any accepted answer');
});
test('typed answers: a missing accent is "nearly", a wrong word is wrong', () => {
  eq(check(typed(['élève']), 'eleve'), 'accent', 'no accents');
  eq(check(typed(['cœur']), 'coeur'), 'accent', 'oe for œ');
  eq(check(typed(['élève']), 'élevé'), 'accent', 'accents in the wrong places');
  eq(check(typed(['élève']), 'élèves'), 'no', 'a plural');
  eq(check(typed(['élève']), '   '), 'no', 'nothing typed');
});
test('multiple choice: only the right option', () => {
  const q = { options: ['un', 'une'], answers: ['une'] };
  eq([check(q, 'une'), check(q, 'un'), check(q, 'Une')], ['ok', 'no', 'no'], 'options');
});

console.log(`${count} of ${count + failures} tests passed`);
console.log(failures ? `${failures} FAILED` : 'OK');
process.exit(failures ? 1 : 0);
