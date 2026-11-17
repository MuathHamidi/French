// Progress, settings, review cards and lesson quizzes in progress, saved in this browser (localStorage).
import { todayKey, toast } from './util.js';
import { isDue } from './srs.js';

// tools/test.html runs the app as index.html?test: its progress never mixes with the learner's.
const KEY = /[?&]test\b/.test(globalThis.location?.search || '') ? 'francais-app-test' : 'francais-app-v1';

const DEFAULT_SETTINGS = {
  newPerDay: 30,     // new words per day (goal, not a hard limit)
  rate: 0.9,         // speech speed
  voice: '',         // preferred speechSynthesis voice name ('' = automatic)
  showIpa: true,
  theme: 'auto',     // auto | light | dark
};

function fresh() {
  return { v: 1, settings: { ...DEFAULT_SETTINGS }, lessons: {}, cards: {}, log: {}, flags: [] };
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// Saved or imported progress with every part of the right type, so a damaged or hand-edited file can't crash the app.
function normalize(s) {
  return {
    ...fresh(), ...s,
    settings: { ...DEFAULT_SETTINGS, ...(isObj(s.settings) ? s.settings : {}) },
    lessons: isObj(s.lessons) ? s.lessons : {},
    cards: isObj(s.cards) ? s.cards : {},
    log: isObj(s.log) ? s.log : {},
    flags: Array.isArray(s.flags) ? s.flags : [],
  };
}

let state = fresh();
let warned = false;

export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) : {};
    if (!isObj(s)) throw new Error('not progress');
    state = normalize(s);
  } catch {
    state = fresh();
    // Keep the unreadable copy: the next save would otherwise replace it with empty progress.
    try { if (raw) localStorage.setItem(`${KEY}-unreadable`, raw); } catch { /* storage unavailable */ }
  }
  return state;
}

// Another tab saved: take up its progress, so that this tab's next save doesn't overwrite it.
globalThis.addEventListener?.('storage', (e) => { if (e.key === KEY) load(); });

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    if (!warned) { warned = true; toast('This browser is not saving progress (private mode?).', 5000); }
  }
}

export const settings = () => state.settings;
export function setSetting(k, v) { state.settings[k] = v; save(); }

// ---- lessons ----
export const lessonState = (id) => state.lessons[id] || null;
export function finishLesson(id, score) {
  const prev = state.lessons[id];
  state.lessons[id] = {
    done: true,
    best: Math.max(score, prev?.best || 0),
    first: prev?.first || Date.now(),
    last: Date.now(),
  };
  bumpLog({ lessons: 1 });
  save();
}

// ---- review cards ----
export const getCard = (id) => state.cards[id] || null;
export const allCards = () => state.cards;
export function putCard(id, card) { state.cards[id] = card; save(); }
export function dueCardIds(now = Date.now()) {
  return Object.keys(state.cards).filter((id) => isDue(state.cards[id], now));
}

// ---- daily log & streak ----
export function bumpLog(delta) {
  const k = todayKey();
  const day = state.log[k] || { new: 0, reviews: 0, lessons: 0 };
  for (const [f, n] of Object.entries(delta)) day[f] = (day[f] || 0) + n;
  state.log[k] = day;
  save();
}
export const todayLog = () => state.log[todayKey()] || { new: 0, reviews: 0, lessons: 0 };

export function streak() {
  let n = 0;
  const d = new Date();
  if (!state.log[todayKey(d)]) d.setDate(d.getDate() - 1); // today not started yet: count up to yesterday
  while (state.log[todayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

// ---- flags (content problems the learner reports) ----
export function addFlag(flag) { state.flags.push({ ...flag, at: new Date().toISOString() }); save(); }
export const flags = () => state.flags;
export function clearFlags() { state.flags = []; save(); }

// ---- lesson quizzes in progress ----
// A lesson quiz is saved after each answer, so leaving the page, a reload or the phone closing the app loses
// nothing: the quiz tab offers to resume it. Kept apart from the progress (and its backups), for the 3 lessons
// whose quizzes were used last. If storage fails, the quiz just isn't saved.
const QUIZZES = `${KEY}-quizzes`;
function quizzes() {
  try {
    const list = JSON.parse(localStorage.getItem(QUIZZES));
    return Array.isArray(list) ? list.filter((x) => isObj(x) && typeof x.lesson === 'string' && isObj(x.quiz)) : [];
  } catch {
    return [];
  }
}
function keepQuizzes(list) {
  try {
    if (list.length) localStorage.setItem(QUIZZES, JSON.stringify(list.slice(0, 3)));
    else localStorage.removeItem(QUIZZES);
  } catch { /* storage full or unavailable */ }
}
export const savedQuiz = (lessonId) => quizzes().find((x) => x.lesson === lessonId)?.quiz || null;
export function saveQuiz(lessonId, quiz) { keepQuizzes([{ lesson: lessonId, quiz }, ...quizzes().filter((x) => x.lesson !== lessonId)]); }
export function dropQuiz(lessonId) { keepQuizzes(quizzes().filter((x) => x.lesson !== lessonId)); }

// ---- backup ----
export const exportJSON = () => JSON.stringify(state, null, 1);
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!isObj(s) || !isObj(s.cards) || !isObj(s.lessons)) throw new Error('Not a progress file');
  state = normalize(s);
  save();
}
export function resetAll() { state = fresh(); save(); keepQuizzes([]); }
