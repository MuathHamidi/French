// Progress, settings, review cards and lesson quizzes in progress, saved in this browser (localStorage).
import { todayKey, toast } from './util.js';
import { isDue, newCard } from './srs.js';

// tools/test.html runs the app as index.html?test: its progress never mixes with the learner's.
const KEY = /[?&]test\b/.test(globalThis.location?.search || '') ? 'francais-app-test' : 'francais-app-v1';

const DEFAULT_SETTINGS = {
  newPerDay: 30,     // new words per day (goal, not a hard limit)
  speed: 1,          // how fast all the sound plays, recordings and device voice (0.5–1.5); 🐢 plays at 3/4 of it
  voice: '',         // preferred speechSynthesis voice name ('' = automatic)
  showIpa: true,
  theme: 'auto',     // auto | light | dark
};

function fresh() {
  return { v: 1, settings: { ...DEFAULT_SETTINGS }, lessons: {}, cards: {}, log: {}, flags: [] };
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const BLANK = newCard(0); // what a card's damaged numbers become: those of a new card, due at once

// Saved or imported progress with every part and entry of the right type, so that a damaged or hand-edited file
// can't crash the app: an entry that isn't an object is left out, and a card's numbers that are missing or not
// numbers take a new card's values. Also counts the entries left out or repaired.
function normalize(s) {
  let damaged = 0;
  const part = (x, fix = (v) => v) => {
    const out = {};
    for (const [k, v] of Object.entries(isObj(x) ? x : {})) {
      const kept = isObj(v) ? fix(v) : null;
      if (!kept || kept !== v) damaged++; // left out or repaired
      if (kept) out[k] = kept;
    }
    return out;
  };
  const card = (c) => {
    const bad = Object.keys(BLANK).filter((f) => !isNum(c[f]));
    return bad.length ? { ...c, ...Object.fromEntries(bad.map((f) => [f, BLANK[f]])) } : c;
  };
  const flags = Array.isArray(s.flags) ? s.flags.filter(isObj) : [];
  if (Array.isArray(s.flags)) damaged += s.flags.length - flags.length;
  const progress = {
    ...fresh(), ...s,
    settings: { ...DEFAULT_SETTINGS, ...(isObj(s.settings) ? s.settings : {}) },
    lessons: part(s.lessons),
    cards: part(s.cards, card),
    log: part(s.log),
    flags,
  };
  return { progress, damaged };
}

let state = fresh();
let warned = false;

export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) : {};
    if (!isObj(s)) throw new Error('not progress');
    state = normalize(s).progress;
  } catch {
    state = fresh();
    // Keep the unreadable copy: the next save would otherwise replace it with empty progress.
    try { if (raw) localStorage.setItem(`${KEY}-unreadable`, raw); } catch { /* storage unavailable */ }
  }
  protect();
  return state;
}

// When the device runs short of space, the browser may delete the whole site's data, progress included, and the
// recordings saved for offline use make the site big. Once there is progress to keep, ask the browser to keep
// the data (once a visit): Chrome decides by itself, Firefox asks the learner once.
let asked = false;
function protect() {
  if (asked || !(Object.keys(state.cards).length || Object.keys(state.lessons).length)) return;
  asked = true;
  try { globalThis.navigator?.storage?.persist?.().catch(() => {}); } catch { /* not available here */ }
}

// For Settings: whether the browser agreed to keep the data (null: it can't say), and the bytes the app takes.
export async function storageInfo() {
  const s = globalThis.navigator?.storage;
  const [kept, estimate] = await Promise.all([s?.persisted?.().catch(() => null), s?.estimate?.().catch(() => null)]);
  return { kept: typeof kept === 'boolean' ? kept : null, used: isNum(estimate?.usage) ? estimate.usage : null };
}

// Another tab saved: take up its progress, so that this tab's next save doesn't overwrite it.
globalThis.addEventListener?.('storage', (e) => { if (e.key === KEY) load(); });

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    if (!warned) { warned = true; toast('This browser is not saving progress (private mode?).', 5000); }
  }
  protect();
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
const BACKUP = `${KEY}-backup`; // when progress was last downloaded on this device
export function lastBackup() {
  try { return Number(localStorage.getItem(BACKUP)) || null; } catch { return null; }
}
export function markBackup() {
  try { localStorage.setItem(BACKUP, String(Date.now())); } catch { /* storage full or unavailable */ }
}
export const exportJSON = () => JSON.stringify(state, null, 1);
// Returns the number of damaged entries that were left out or repaired.
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!isObj(s) || !isObj(s.cards) || !isObj(s.lessons)) throw new Error('Not a progress file');
  const { progress, damaged } = normalize(s);
  state = progress;
  save();
  return damaged;
}
export function resetAll() { state = fresh(); save(); keepQuizzes([]); }
