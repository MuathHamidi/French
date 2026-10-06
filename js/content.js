// Loads the course data and turns French text into clickable word segments.
// Keep the tokenizer in sync with tools/validate.py.
import { normKey } from './util.js';

export const lessons = new Map();   // lesson id -> lesson object
export const entries = new Map();   // word id -> entry (lesson words + lexicon helpers)
export const wordLesson = new Map(); // word id -> lesson id that teaches it
export let curriculum = { units: [] };
const index = new Map();            // token key ("s' il vous plaît") -> [word ids]
let maxPhrase = 1;

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export async function loadAll() {
  curriculum = await getJSON('data/curriculum.json');
  const lexicon = await getJSON('data/lexicon.json');
  const ids = curriculum.units.flatMap((u) => u.lessons || []);
  const loaded = await Promise.all(ids.map((id) => getJSON(`data/lessons/${id}.json`)));
  for (const e of lexicon.entries) addEntry(e);
  for (const lesson of loaded) {
    lessons.set(lesson.id, lesson);
    for (const w of lesson.words || []) {
      addEntry(w);
      wordLesson.set(w.id, lesson.id);
    }
  }
}

function addEntry(e) {
  entries.set(e.id, e);
  if (e.manual) return; // only reachable through [word|id] markup (e.g. the object pronoun "la")
  for (const form of [e.fr, ...(e.forms || [])]) {
    const key = keyOf(form);
    if (!key) continue;
    const list = index.get(key) || [];
    if (!list.includes(e.id)) list.push(e.id);
    index.set(key, list);
    maxPhrase = Math.max(maxPhrase, key.split(' ').length);
  }
}

// ---------- display helpers ----------
export function article(e) {
  if (e.art !== undefined) return e.art;
  if (e.pos !== 'noun' || !e.g) return '';
  if (/^[aeiouyàâäéèêëîïôöùûüœæh]/i.test(e.fr) && !e.hAsp) return "l'";
  return e.g === 'f' ? 'la' : 'le';
}
export function displayForm(e) {
  if (e.display) return e.display;
  const art = article(e);
  return art ? (art.endsWith("'") ? art + e.fr : `${art} ${e.fr}`) : e.fr;
}
export const POS = {
  noun: 'noun', verb: 'verb', adj: 'adjective', adv: 'adverb', pron: 'pronoun', prep: 'preposition',
  conj: 'conjunction', interj: 'interjection', expr: 'expression', det: 'determiner', num: 'number', name: 'name',
};

export function lessonList() {
  return curriculum.units.flatMap((u) => (u.lessons || []).map((id) => lessons.get(id)).filter(Boolean));
}

// ---------- tokenizer ----------
const L = 'A-Za-zÀ-ÖØ-öø-ÿŒœÆæ';
const TOKEN_RE = new RegExp(`[${L}]+(?:[-'’][${L}]+)*['’]?|\\s+|[^${L}\\s]`, 'g');
const ELISION_RE = new RegExp(`^((?:l|d|j|m|t|s|n|c|qu|jusqu|lorsqu|puisqu)['’])([${L}].*)$`, 'i');

function splitWord(w) {
  const m = w.match(ELISION_RE);
  if (m) return [m[1], ...splitWord(m[2])];
  if (w.includes('-')) {
    const out = [];
    w.split('-').forEach((part, i) => {
      if (i) out.push('-');
      if (part) out.push(...splitWord(part));
    });
    return out;
  }
  return [w];
}
const isWord = (t) => new RegExp(`^[${L}]`).test(t);

// Raw tokens of plain text (no markup): words, spaces, punctuation, hyphens.
function rawTokens(text) {
  return (text.match(TOKEN_RE) || []).flatMap((t) => (isWord(t) ? splitWord(t) : [t]));
}

function keyOf(text) {
  return rawTokens(text).filter(isWord).map(normKey).join(' ');
}

// Markup: [surface|wordId]  {text|caseId}  **target**
export function parseMarkup(s) {
  const nodes = [];
  let i = 0, buf = '';
  const flush = () => { if (buf) nodes.push({ kind: 'text', text: buf }); buf = ''; };
  while (i < s.length) {
    if (s.startsWith('**', i)) {
      const end = s.indexOf('**', i + 2);
      if (end > 0) { flush(); nodes.push({ kind: 'target', children: parseMarkup(s.slice(i + 2, end)) }); i = end + 2; continue; }
    }
    const open = s[i];
    if (open === '[' || open === '{') {
      const close = open === '[' ? ']' : '}';
      let depth = 0, j = i;
      for (; j < s.length; j++) {
        if (s[j] === open) depth++;
        else if (s[j] === close && --depth === 0) break;
      }
      const inner = s.slice(i + 1, j);
      const bar = inner.lastIndexOf('|');
      if (j < s.length && bar > 0) {
        flush();
        const text = inner.slice(0, bar), ref = inner.slice(bar + 1).trim();
        if (open === '[') nodes.push({ kind: 'word', text, id: ref });
        else nodes.push({ kind: 'gram', caseId: ref, children: parseMarkup(text) });
        i = j + 1;
        continue;
      }
    }
    buf += s[i++];
  }
  flush();
  return nodes;
}

export function plain(s) {
  return parseMarkup(s).map((n) => (n.kind === 'text' || n.kind === 'word' ? n.text : plain(nodeText(n)))).join('');
}
function nodeText(n) {
  return n.children.map((c) => (c.kind === 'text' || c.kind === 'word' ? c.text : nodeText(c))).join('');
}

// Returns segments: {w:true, text, id, ids, caseId, target} or {w:false, text}.
export function tokenize(markup, prefer = new Set()) {
  const flat = [];
  const walk = (nodes, ctx) => {
    for (const n of nodes) {
      if (n.kind === 'text') {
        for (const t of rawTokens(n.text)) flat.push(isWord(t) ? { w: true, text: t, key: normKey(t), ...ctx } : { w: false, text: t, ...ctx });
      } else if (n.kind === 'word') {
        flat.push({ w: true, text: n.text, key: keyOf(n.text), id: n.id, fixed: true, ...ctx });
      } else if (n.kind === 'gram') walk(n.children, { ...ctx, caseId: n.caseId });
      else if (n.kind === 'target') walk(n.children, { ...ctx, target: true });
    }
  };
  walk(parseMarkup(markup), {});

  const out = [];
  for (let i = 0; i < flat.length; i++) {
    const t = flat[i];
    if (!t.w || t.fixed) { out.push(t); continue; }
    let done = false;
    for (let len = maxPhrase; len >= 2 && !done; len--) {
      const span = phraseAt(flat, i, len);
      if (!span) continue;
      const key = span.words.map((x) => x.key).join(' ');
      const ids = index.get(key);
      if (ids) {
        const text = flat.slice(i, span.end + 1).map((x) => x.text).join('');
        const last = span.words[span.words.length - 1].key;
        out.push({ w: true, text, key, last, ids, id: pick(ids, prefer, text, out), caseId: t.caseId, target: t.target });
        i = span.end;
        done = true;
      }
    }
    if (!done) {
      const ids = index.get(t.key);
      out.push({ ...t, ids, id: ids ? objectPronounBefore(t, out) || pick(ids, prefer, t.text, out) : null });
    }
  }
  objectPronounAfter(out);
  return out;
}

// `len` consecutive words from i, joined only by spaces/hyphens/elision, same grammar span.
function phraseAt(flat, i, len) {
  const words = [];
  let j = i;
  for (; j < flat.length; j++) {
    const t = flat[j];
    if (t.caseId !== flat[i].caseId || t.target !== flat[i].target || t.fixed) return null;
    if (t.w) { words.push(t); if (words.length === len) return { words, end: j }; }
    else if (!/^(\s+|-)$/.test(t.text)) return null;
  }
  return null;
}

// Same spelling, different words (la porte / elle porte, Claire / claire): decide from context.
// Keep in sync with resolve() in tools/validate.py.
const BEFORE_NOUN = new Set(['le', 'la', "l'", 'les', 'un', 'une', 'des', 'du', 'de', "d'", 'au', 'aux', 'à', 'ma', 'ta', 'sa',
  'mon', 'ton', 'son', 'mes', 'tes', 'ses', 'notre', 'votre', 'nos', 'vos', 'leur', 'leurs', 'ce', 'cet', 'cette', 'ces',
  'quel', 'quelle', 'quels', 'quelles',
  'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'quinze', 'vingt', 'trente',
  'quarante', 'cinquante', 'soixante', 'cent', 'mille', 'plusieurs', 'quelques', 'chaque']); // deux parties (not partir)
const BEFORE_VERB = new Set(['je', "j'", 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'qui', 'ça', 'ne', "n'",
  'me', "m'", 'te', "t'", 'se', "s'", 'lui', 'y', // je lui parle, j'y vais
  'ai', 'as', 'a', 'avons', 'avez', 'ont']); // avoir + past participle: j'ai été (been, not summer)
// être + participle or adjective, never a noun: elle est arrivée, elle est prête
const AFTER_ETRE = new Set(['suis', 'es', 'est', 'sommes', 'êtes', 'sont']);
// Object pronouns spelled like articles (je la vois, pour le faire, regarde-le): not "the".
const OBJ_PRON = { le: 'le-pron', la: 'la-pron', les: 'les-pron', "l'": 'l-pron', leur: 'leur-pron', en: 'en-pron' };
const BEFORE_OBJ = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'ne', 'me', 'te', 'se', 'qui', 'ça']);
const BEFORE_EN = new Set([...BEFORE_OBJ, "j'", "n'", "m'", "t'", "s'", 'y', 'lui', 'leur']); // j'en veux, il n'y en a pas
export function choose(ids, prefer, text, prevKey, prevPos, prevLast = prevKey) {
  if (ids.length === 1) return ids[0];
  let c = ids;
  const isName = (id) => entries.get(id)?.pos === 'name';
  if (c.some(isName)) {
    const cap = /^[A-ZÀ-ÖØ-Þ]/.test(text);
    const k = c.filter((id) => isName(id) === cap);
    if (k.length) c = k;
  }
  const want = prevPos === 'pron' && OBJ_PRON[prevKey] ? 'verb' // je la porte
    : BEFORE_NOUN.has(prevLast) ? 'noun' // after a phrase, its last word counts: à côté du lit
    : BEFORE_VERB.has(prevKey) || prevPos === 'noun' || prevPos === 'name' ? 'verb' : null;
  if (want && c.length > 1) {
    const k = c.filter((id) => entries.get(id)?.pos === want);
    if (k.length) c = k;
  } else if (AFTER_ETRE.has(prevKey) && c.length > 1) { // an adjective first, then a participle, never a noun
    const adj = c.filter((id) => entries.get(id)?.pos === 'adj');
    const k = adj.length ? adj : c.filter((id) => entries.get(id)?.pos !== 'noun');
    if (k.length) c = k;
  }
  // Last resort: a word taught in a lesson beats a helper word (lit = bed, not "he reads").
  return c.find((id) => prefer.has(id)) || c.find((id) => wordLesson.has(id)) || c[0];
}
function prevWord(out) {
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].w) return out[i];
    if (!/^\s+$/.test(out[i].text)) return null; // punctuation in between: no context
  }
  return null;
}
function pick(ids, prefer, text, out) {
  const prev = prevWord(out);
  return choose(ids, prefer, text, prev?.key ?? null, prev?.id ? entries.get(prev.id)?.pos : null, prev?.last ?? prev?.key ?? null);
}
// le/la/les/l'/leur/en as an object pronoun. Keep in sync with Index.object_pronoun() in tools/validate.py.
function objectPronounBefore(t, out) { // after a subject (je la vois) or a hyphen (regarde-le)
  if (!OBJ_PRON[t.key]) return null;
  if ((t.key === 'en' ? BEFORE_EN : BEFORE_OBJ).has(prevWord(out)?.key)) return OBJ_PRON[t.key];
  return out.length && out[out.length - 1].text === '-' ? OBJ_PRON[t.key] : null;
}
function objectPronounAfter(out) { // before a word that can only be a verb (pour le faire)
  for (let i = 0; i < out.length; i++) {
    const s = out[i];
    if (!s.w || s.fixed || !s.ids || !OBJ_PRON[s.key] || s.id === OBJ_PRON[s.key]) continue;
    let j = i + 1;
    while (j < out.length && !out[j].w && /^\s+$/.test(out[j].text)) j++;
    const n = out[j];
    if (!n?.w) continue;
    if (s.key !== 'en' && ['lui', 'y', 'en'].includes(n.key)) { s.id = OBJ_PRON[s.key]; continue; } // je vais le lui dire
    if (s.key === 'en' && n.key.endsWith('ant')) continue; // en partant: a preposition
    const ids = n.fixed ? [n.id] : n.ids || [];
    if (ids.length && ids.every((id) => entries.get(id)?.pos === 'verb')) s.id = OBJ_PRON[s.key];
  }
}
