#!/usr/bin/env node
// Checks the app's own code against the course data (tools/validate.py checks the data itself):
// - tokenizer: js/content.js links every word of every text the app shows to the same dictionary
//   entry as tools/validate.py, whose rules it mirrors (compared text by text);
// - quizzes: every question the app can generate is answerable (the right answer is accepted,
//   options are distinct and include it) and every word in its prompt has a card;
// - audio: every text the app can read aloud has a generated file, so the device voice is never needed;
// - display: text shown without the tokenizer (word cards, rules, tips, translations) has no raw markup.
// Warnings don't fail the run: they point at quiz questions where a learner could be right but marked wrong.
//
// Run:  node tools/check_app.mjs                 every lesson
//       node tools/check_app.mjs u21-a u21-b     quiz, audio and display checks for these lessons only
//       node tools/check_app.mjs --homographs u21-a u21-b
//           also lists every word in these lessons with several dictionary entries, the entry each
//           text gets and an example, to review before publishing (fix wrong ones with [word|id])
//       node tools/check_app.mjs --save-links links-before.json      (before adding or promoting entries)
//       node tools/check_app.mjs --compare-links links-before.json   (after: lists texts whose words now
//           link to other entries, so a new entry can't silently change older lessons)
// Needs Node.js 22+ and Python 3 (set PYTHON to choose the interpreter).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('Node.js 22 or newer is needed (it loads js/*.js as ES modules).');
  process.exit(2);
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Just enough of a browser for the app's modules to load.
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false });
globalThis.fetch = async (url) => {
  const file = path.join(ROOT, url);
  if (!existsSync(file)) return { ok: false, status: 404 };
  const text = readFileSync(file, 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(text) };
};
const load = (file) => import(pathToFileURL(path.join(ROOT, 'js', file)).href);
const { loadAll, lessons, entries, lessonList, tokenize, plain, displayForm } = await load('content.js');
const { kindsFor, wordQuestion, poolFor, vocabQuiz, grammarQuestion, grammarQuiz } = await load('quizgen.js');
const { check } = await load('quiz.js');
const { initAudio, audioFile } = await load('audio.js');
await loadAll();
await initAudio();

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const saveLinks = option('--save-links'), compareLinks = option('--compare-links');
const only = args.filter((a) => !a.startsWith('--'));
const unknownIds = only.filter((id) => !lessons.has(id));
if (unknownIds.length) {
  console.error(`Not in data/curriculum.json: ${unknownIds.join(', ')}`);
  process.exit(2);
}
const all = lessonList();
const selected = only.length ? all.filter((l) => only.includes(l.id)) : all;
const NONE = new Set();
const problems = { tokenizer: [], quiz: [], audio: [], display: [] };
const warnings = new Map(); // kind -> Map(dedupe key -> message)
const fail = (kind, where, msg) => problems[kind].push(`${where}: ${msg}`);
const warn = (kind, key, msg) => {
  if (!warnings.has(kind)) warnings.set(kind, new Map());
  warnings.get(kind).set(key, msg);
};

// Every question the app can ask about a lesson: each kind for each word, each grammar item.
function questionsFor(lesson) {
  if (lesson.type === 'vocab') {
    const pool = poolFor(lesson);
    return lesson.words.flatMap((e) => kindsFor(e).map((kind) => ({
      q: wordQuestion(e, kind, pool), where: `${lesson.id}/${e.id} (${kind})`, size: kind === 'gender' ? 2 : 4,
    })));
  }
  return lesson.quiz.map((item, n) => ({ q: grammarQuestion(lesson, item), where: `${lesson.id} quiz ${n + 1}`, size: 2 }));
}

// What a lesson page runs through the tokenizer (preferring the lesson's own words, as
// js/views/lesson.js does) and what its 🔊 buttons read aloud.
function pageTexts(lesson) {
  const own = new Set((lesson.words || []).map((w) => w.id));
  const shown = [], spoken = [];
  const sentence = (fr, where) => {
    shown.push({ text: fr, prefer: own, where });
    spoken.push({ text: plain(fr), where });
  };
  for (const e of lesson.words || []) {
    spoken.push({ text: e.say || e.fr, where: `${lesson.id}/${e.id}` });
    if (e.def) shown.push({ text: e.def, prefer: own, where: `${lesson.id}/${e.id} definition` });
    (e.examples || []).forEach((x, n) => sentence(x.fr, `${lesson.id}/${e.id} example ${n + 1}`));
  }
  for (const s of lesson.sections || []) {
    for (const row of s.table?.rows || []) for (const c of s.table.frCols || [0]) sentence(row[c], `${lesson.id} "${s.title}" table`);
    for (const x of s.examples || []) sentence(x.fr, `${lesson.id} "${s.title}"`);
  }
  lesson.story.lines.forEach((line, n) => sentence(line.fr, `${lesson.id} story line ${n + 1}`));
  return { shown, spoken };
}

const questions = new Map(all.map((l) => [l.id, questionsFor(l)]));
const pages = new Map(all.map((l) => [l.id, pageTexts(l)]));
// Quiz prompts are rendered without a preferred lesson (js/quiz.js).
const prompts = (lesson) => questions.get(lesson.id).filter(({ q }) => q.rich)
  .map(({ q, where }) => ({ text: q.prompt, prefer: NONE, where: `${where} prompt` }));

// ---------- 1. the app's tokenizer against tools/validate.py ----------
const unique = new Map();
for (const lesson of all) {
  for (const t of [...pages.get(lesson.id).shown, ...prompts(lesson)]) {
    const key = `${[...t.prefer].sort().join(' ')}\n${t.text}`;
    if (!unique.has(key)) unique.set(key, t);
  }
}
const texts = [...unique.values()];
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const py = spawnSync(python, [path.join(ROOT, 'tools', 'validate.py'), '--tokenize'], {
  input: JSON.stringify(texts.map((t) => ({ text: t.text, prefer: [...t.prefer] }))), encoding: 'utf8', maxBuffer: 1 << 30,
});
if (py.status !== 0) {
  console.error(`Could not run ${python} tools/validate.py --tokenize (set PYTHON to your Python 3):\n${py.error?.message || py.stderr}`);
  process.exit(2);
}
const expected = JSON.parse(py.stdout);
texts.forEach((t, i) => {
  const got = tokenize(t.text, t.prefer).filter((s) => s.w).map((s) => [s.text, s.id ?? null]);
  for (let k = 0; k < Math.max(got.length, expected[i].length); k++) {
    const [gt, gi] = got[k] || [], [wt, wi] = expected[i][k] || [];
    if (gt !== wt || gi !== wi) {
      fail('tokenizer', t.where, `“${gt ?? '—'}” → ${gi ?? 'no card'} in the app, “${wt ?? '—'}” → ${wi ?? 'no card'} in validate.py`);
      break;
    }
  }
});

// ---------- 2. quizzes ----------
let questionCount = 0;
for (const lesson of selected) {
  for (const { q, where, size } of questions.get(lesson.id)) {
    questionCount++;
    if (!q.answers.length || q.answers.some((a) => !String(a).trim())) fail('quiz', where, 'empty answer');
    if (q.options) {
      if (new Set(q.options).size !== q.options.length) fail('quiz', where, `an option appears twice: ${q.options.join(' / ')}`);
      if (!q.options.includes(q.answers[0])) fail('quiz', where, `the answer “${q.answers[0]}” is not among the options`);
      if (q.options.length < size) fail('quiz', where, `only ${q.options.length} option(s): ${q.options.join(' / ')}`);
    }
    for (const a of q.answers) {
      const res = check(q, a);
      if (res !== 'ok') fail('quiz', where, `the right answer “${a}” is marked ${res === 'accent' ? 'as an accent mistake' : 'wrong'}`);
    }
    if (q.rich) {
      const missing = tokenize(q.prompt).filter((s) => s.w && !s.id).map((s) => s.text);
      if (missing.length) fail('quiz', where, `prompt words without a card: ${missing.join(', ')}`);
    }
  }
  // The lesson's quiz page: every word twice (plus un/une for nouns), every grammar item once.
  const page = lesson.type === 'vocab' ? vocabQuiz(lesson) : grammarQuiz(lesson);
  const want = lesson.type === 'vocab'
    ? lesson.words.reduce((n, e) => n + (kindsFor(e).includes('gender') ? 3 : 2), 0) : lesson.quiz.length;
  if (page.length !== want) fail('quiz', lesson.id, `the quiz page has ${page.length} questions instead of ${want}`);
}

// ---------- 3. audio ----------
const spoken = new Map(); // text -> where it is read aloud
const say = (text, where) => { if (/[A-Za-zÀ-ÿŒœÆæ]/.test(text || '') && !spoken.has(text)) spoken.set(text, where); };
for (const lesson of selected) {
  const { shown, spoken: sentences } = pages.get(lesson.id);
  for (const s of sentences) say(s.text, s.where);
  for (const t of [...shown, ...prompts(lesson)]) {
    for (const s of tokenize(t.text, t.prefer)) if (s.w) say(s.text, `${t.where} (clicked word)`);
  }
  for (const { q, where } of questions.get(lesson.id)) say(q.say, where);
}
if (!only.length) for (const e of entries.values()) say(e.say || e.fr, `word card of ${e.id}`);
for (const [text, where] of spoken) if (!audioFile(text)) fail('audio', where, `no audio for “${text}”`);
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'data', 'audio.json'), 'utf8')).files;
const used = new Set(Object.values(manifest).map((f) => path.basename(f)));
for (const f of used) if (!existsSync(path.join(ROOT, 'audio', f))) fail('audio', 'data/audio.json', `audio/${f} is missing`);
const unused = readdirSync(path.join(ROOT, 'audio')).filter((f) => f.endsWith('.mp3') && !used.has(f)).length;

// ---------- 4. text shown without the tokenizer ----------
const MARKUP = /\[[^\]|]*\|[^\]]*\]|\{[^}|]*\|[^}]*\}/;
const unlink = (s) => s.replace(/\[([^|\]]+)\|[^\]]+\]/g, '$1'); // as js/wordcard.js shows a definition or example
function plainTexts(lesson) {
  const out = [];
  const add = (v, where) => { if (typeof v === 'string') out.push([v, where]); };
  add(lesson.intro, `${lesson.id} intro`);
  for (const e of lesson.words || []) {
    const w = `${lesson.id}/${e.id}`;
    for (const f of ['en', 'def_en', 'extra', 'note']) add(e[f], `${w} ${f}`);
    if (e.def) add(unlink(e.def), `${w} definition on the word card`);
    if (e.examples?.[0]) add(unlink(e.examples[0].fr), `${w} example on the word card`);
    for (const x of e.examples || []) add(x.en, `${w} example translation`);
  }
  for (const s of lesson.sections || []) {
    const w = `${lesson.id} "${s.title}"`;
    for (const p of s.text || []) add(p, w);
    add(s.tip, `${w} tip`);
    const fr = new Set(s.table?.frCols || [0]);
    for (const c of s.table?.head || []) add(c, `${w} table`);
    for (const row of s.table?.rows || []) row.forEach((c, i) => { if (!fr.has(i)) add(c, `${w} table`); });
    for (const x of s.examples || []) add(x.en, `${w} example translation`);
  }
  for (const m of lesson.mistakes || []) for (const f of ['wrong', 'right', 'why']) add(m[f], `${lesson.id} mistakes`);
  for (const c of lesson.cases || []) for (const f of ['label', 'rule']) add(c[f], `${lesson.id} case ${c.id}`);
  (lesson.quiz || []).forEach((item, n) => {
    for (const f of ['why', 'en', 'label']) add(item[f], `${lesson.id} quiz ${n + 1}`);
    if (item.lang === 'en') add(item.q, `${lesson.id} quiz ${n + 1}`);
  });
  add(lesson.story.title, `${lesson.id} story title`);
  add(lesson.story.en, `${lesson.id} story`);
  lesson.story.lines.forEach((l, n) => add(l.en, `${lesson.id} story line ${n + 1} translation`));
  return out;
}
for (const lesson of selected) {
  for (const [text, where] of plainTexts(lesson)) {
    const m = text.match(MARKUP);
    if (m) fail('display', where, `shows raw markup ${m[0]}`);
  }
}

// ---------- warnings: right answers a quiz could mark wrong ----------
// What a listening question plays: a word whose `say` is its form with the article (la Suisse) is heard with it.
const sound = (e) => {
  const ipa = (e.ipa || '').normalize('NFC').replace(/[ˈˌ.‿\-\s]/g, '');
  return ipa && e.say && e.say === displayForm(e) && e.art ? `${e.art}${ipa}` : ipa;
};
const byPrompt = new Map(); // "Write it in French" prompt + hint -> taught words (reviews mix every lesson)
for (const lesson of all) {
  for (const e of lesson.words || []) {
    const q = wordQuestion(e, 'en2fr', []);
    const key = `${q.prompt.trim().toLowerCase()}\n${q.hint}`;
    byPrompt.set(key, [...(byPrompt.get(key) || []), e]);
  }
}
for (const lesson of selected.filter((l) => l.type === 'vocab')) {
  const own = new Set(lesson.words.map((w) => w.id));
  const pool = poolFor(lesson);
  for (const e of lesson.words) {
    // Listening: the options are words from the same pool, so two that sound alike can't be told apart.
    for (const x of pool) {
      if (x.id !== e.id && sound(e) && sound(x) === sound(e) && displayForm(x) !== displayForm(e)) {
        warn('Listening questions could offer two words that sound the same', [e.id, x.id].sort().join(),
          `${displayForm(e)} / ${displayForm(x)} (/${e.ipa}/) in ${lesson.id}`);
      }
    }
    // Writing: another word with the same English and hint is a right answer marked wrong.
    const q = wordQuestion(e, 'en2fr', []);
    const others = byPrompt.get(`${q.prompt.trim().toLowerCase()}\n${q.hint}`).filter((x) => x.id !== e.id && check(q, displayForm(x)) !== 'ok');
    if (others.length) {
      const group = [e, ...others].sort((a, b) => a.id.localeCompare(b.id));
      warn('“Write it in French” accepts only one of several right answers', group.map((x) => x.id).join(),
        `“${e.en}”${q.hint ? ` (${q.hint})` : ''}: ${group.map((x) => `${displayForm(x)} (${lessonOf(x)})`).join(', ')}`);
    }
  }
  // Quiz prompts have no preferred lesson, so a homograph can link to another card than on the lesson page.
  for (const { q, where } of questions.get(lesson.id)) {
    if (!q.rich) continue;
    const onPage = tokenize(q.prompt, own).filter((s) => s.w);
    tokenize(q.prompt).filter((s) => s.w).forEach((s, i) => {
      if (onPage[i] && s.id !== onPage[i].id) {
        warn('Quiz prompts link a word to a different card than the lesson page', `${lesson.id}|${s.text}|${s.id}`,
          `${where}: “${s.text}” → ${s.id} in the quiz, ${onPage[i].id} on the lesson page`);
      }
    });
  }
}
function lessonOf(e) {
  return all.find((l) => (l.words || []).includes(e))?.id;
}

// ---------- --homographs: which entry each text gets, for words with several ----------
if (args.includes('--homographs')) {
  const words = new Map(); // word -> {ids: its entries, uses: Map(chosen id -> {n, example})}
  for (const lesson of selected) {
    for (const t of [...pages.get(lesson.id).shown, ...prompts(lesson)]) {
      for (const s of tokenize(t.text, t.prefer)) {
        if (!s.w || s.fixed || !(s.ids?.length > 1)) continue; // [word|id] markup was already decided
        const w = words.get(s.key) || { ids: s.ids, uses: new Map() };
        const u = w.uses.get(s.id) || { n: 0, example: `${plain(t.text).replace(/\s+/g, ' ').slice(0, 90)}  (${t.where})` };
        u.n++;
        w.uses.set(s.id, u);
        words.set(s.key, w);
      }
    }
  }
  console.log(`Words with several entries in ${only.length ? only.join(', ') : 'every lesson'} (${words.size}):`);
  for (const [word, { ids, uses }] of [...words].sort(([a], [b]) => a.localeCompare(b, 'fr'))) {
    console.log(`  ${word}  [${ids.join(', ')}]`);
    for (const [id, u] of uses) console.log(`    → ${id} ×${u.n}: ${u.example}`);
  }
  console.log('');
}

// ---------- links snapshot: which entry every word of every text links to ----------
const links = {};
for (const lesson of all) {
  const seen = new Map();
  for (const t of [...pages.get(lesson.id).shown, ...prompts(lesson)]) {
    const n = (seen.get(t.where) || 0) + 1;
    seen.set(t.where, n);
    links[`${t.where} #${n}`] = { text: t.text, links: tokenize(t.text, t.prefer).filter((s) => s.w).map((s) => `${s.text}=${s.id ?? '?'}`) };
  }
}
if (saveLinks) writeFileSync(saveLinks, JSON.stringify(links));
let linksCompared = 0;
if (compareLinks) {
  for (const [where, before] of Object.entries(JSON.parse(readFileSync(compareLinks, 'utf8')))) {
    const now = links[where];
    if (!now || now.text !== before.text) continue; // edited or removed texts are reviewed with --homographs
    linksCompared++;
    if (now.links.join(' ') === before.links.join(' ')) continue;
    const pairs = now.links.length === before.links.length
      ? now.links.map((l, i) => (l !== before.links[i] ? `${before.links[i]} → ${l.split('=')[1]}` : null)).filter(Boolean)
      : [`${before.links.join(' ')} → ${now.links.join(' ')}`];
    warn('Words that now link to another entry than before (check they are right)', where, `${where}: ${pairs.join('; ')}`);
  }
}

// ---------- report ----------
const count = (kind) => problems[kind].length;
console.log(`Tokenizer: ${texts.length} texts compared with tools/validate.py, ${count('tokenizer')} mismatch(es)`);
console.log(`Quizzes:   ${questionCount} possible questions in ${selected.length} lesson(s), ${count('quiz')} problem(s)`);
console.log(`Audio:     ${spoken.size} texts read aloud, ${count('audio')} problem(s)` +
  (unused ? `; ${unused} unused file(s) in audio/ (make_audio.py --prune deletes them)` : ''));
console.log(`Display:   ${count('display')} problem(s)`);
if (saveLinks) console.log(`Links:     saved ${Object.keys(links).length} texts to ${saveLinks}`);
if (compareLinks) console.log(`Links:     ${linksCompared} unchanged texts compared with ${compareLinks}, ${warnings.get('Words that now link to another entry than before (check they are right)')?.size || 0} link differently`);
for (const [kind, list] of Object.entries(problems)) {
  if (!list.length) continue;
  console.log(`\n${kind} problems:`);
  for (const p of list) console.log(`  ${p}`);
}
for (const [title, list] of warnings) {
  console.log(`\nwarning: ${title} (${list.size}):`);
  for (const msg of list.values()) console.log(`  ${msg}`);
}
const total = Object.values(problems).reduce((n, l) => n + l.length, 0);
console.log(total ? `\n${total} problem(s)` : '\nOK');
process.exitCode = total ? 1 : 0;
