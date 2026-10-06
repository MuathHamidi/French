// Spaced repetition (a simplified SM-2).
// Grades: 0 = again (wrong), 1 = hard (right, but shaky), 2 = good, 3 = easy.
import { startOfDay } from './util.js';

const DAY = 86400000;
const RELEARN_MS = 10 * 60 * 1000;
const MAX_IVL = 730;

export const AGAIN = 0, HARD = 1, GOOD = 2, EASY = 3;

export function newCard(now = Date.now()) {
  return { due: now, ivl: 0, ease: 2.5, reps: 0, lapses: 0, last: 0 };
}

export function schedule(card, grade, now = Date.now()) {
  const c = { ...card, last: now };
  if (grade === AGAIN) {
    if (c.reps > 0) c.lapses += 1;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.reps = 0;
    c.ivl = 0;
    c.due = now + RELEARN_MS; // comes back later in the same session/day
    return c;
  }
  let ivl;
  if (grade === HARD) {
    c.ease = Math.max(1.3, c.ease - 0.15);
    ivl = c.reps === 0 ? 1 : Math.max(1, Math.round(c.ivl * 1.2));
  } else if (grade === GOOD) {
    ivl = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.round(c.ivl * c.ease);
  } else {
    c.ease += 0.15;
    ivl = c.reps === 0 ? 3 : Math.round(Math.max(c.ivl * c.ease * 1.3, c.ivl + 1));
  }
  if (ivl >= 3) ivl = Math.round(ivl * (0.95 + Math.random() * 0.1)); // spread reviews out
  c.ivl = Math.min(MAX_IVL, Math.max(1, ivl));
  c.reps += 1;
  c.due = startOfDay(now + c.ivl * DAY); // due from the start of that day
  return c;
}

export function isDue(card, now = Date.now()) {
  return card.due <= now;
}

// A card counts as "known" once it has survived at least a 3-day interval.
export function isMature(card) {
  return card.ivl >= 3;
}
