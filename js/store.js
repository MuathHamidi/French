// Progress, settings and review cards, saved in this browser (localStorage).
import { todayKey, toast } from './util.js';
import { isDue } from './srs.js';

const KEY = 'francais-app-v1';

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

let state = fresh();
let warned = false;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      state = { ...fresh(), ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) } };
    }
  } catch {
    state = fresh();
  }
  return state;
}

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

// ---- backup ----
export const exportJSON = () => JSON.stringify(state, null, 1);
export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || typeof s !== 'object' || !s.cards || !s.lessons) throw new Error('Not a progress file');
  state = { ...fresh(), ...s, settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) } };
  save();
}
export function resetAll() { state = fresh(); save(); }
