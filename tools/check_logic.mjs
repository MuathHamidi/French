#!/usr/bin/env node
// Tests the parts of the app that need no screen: the review schedule, dates (midnight, the nights the
// clocks change), saved progress (saving, loading, backups, damaged data, a second tab), the streak and
// the daily log, how typed answers are checked, and the offline copy (sw.js) against a simulated server.
// tools/test.html tests the pages themselves.
//
// Run:  node tools/check_logic.mjs      (Node.js 22+; prints OK, or each failure and exits 1)
// Dates are tested in Montreal's time zone, whatever the computer's is.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
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

// ---------- the offline copy (sw.js) ----------
// sw.js runs in a sandbox, against a simulated server and storage (the Cache API), with shorter waits.
// Each file's text names its version, so a page's files show whether it mixed two versions. A new
// version changes every file, as a deploy on GitHub Pages does (every file gets a new ETag).
const SITE = 'https://example.test/French/';
const swSource = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const SW_FILES = vm.runInNewContext(/const FILES = (\[[^\]]*\])/.exec(swSource)[1]);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function testAsync(name, fn) {
  try { await fn(); count++; } catch (err) { failures++; console.log(`FAIL ${name}\n     ${err.message}`); }
}

test('sw.js saves every file the app loads', () => {
  const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
  const want = new Set(['index.html']);
  for (const dir of ['js', 'js/views']) {
    for (const name of fs.readdirSync(path.join(ROOT, dir)).filter((n) => n.endsWith('.js'))) {
      want.add(`${dir}/${name}`);
      for (const [, file] of read(`${dir}/${name}`).matchAll(/'(data\/[\w-]+\.json)'/g)) want.add(file);
    }
  }
  for (const [, file] of read('index.html').matchAll(/(?:href|src)="(?![a-z]+:)([^"#][^"]*)"/g)) want.add(file);
  for (const icon of JSON.parse(read('manifest.webmanifest')).icons) want.add(icon.src);
  eq([...want].filter((file) => !SW_FILES.includes(file)), [], 'files the app loads that sw.js does not save');
  eq(SW_FILES.filter((file) => !fs.existsSync(path.join(ROOT, file.replace(/\?.*/, '')))), [], 'files in sw.js that do not exist');
});

// The server: publish(v) puts version v of every file online; delay(file) holds an answer back (ms).
function makeServer() {
  const server = { files: new Map(), delay: () => 0, offline: false, asked: [] };
  server.publish = (v, { without = [] } = {}) => {
    const lessons = ['a', 'b'];
    server.files.clear();
    for (const file of [...SW_FILES, ...lessons.map((id) => `data/lessons/${id}.json`), 'audio/x.mp3']) {
      const body = file === 'data/curriculum.json' ? JSON.stringify({ v, units: [{ lessons }] }) : `${file} v${v}`;
      if (!without.includes(file)) server.files.set(file, { body, etag: `"${v}"` });
    }
  };
  server.fetch = async (input, init = {}) => {
    const file = (typeof input === 'string' ? input : input.url).slice(SITE.length);
    server.asked.push(file);
    if (server.offline) throw new TypeError('Failed to fetch');
    const ms = server.delay(file);
    if (ms) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        init.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('aborted')); });
      });
    }
    const found = server.files.get(file || 'index.html');
    if (!found) return new Response('Not found', { status: 404 });
    if (new Headers(init.headers || input.headers || {}).get('If-None-Match') === found.etag) {
      return new Response(null, { status: 304, headers: { ETag: found.etag } });
    }
    return new Response(found.body, { headers: { ETag: found.etag } });
  };
  return server;
}

// The Cache API, in memory.
function makeStorage() {
  const caches = new Map(); // name -> Map(url -> { body, init })
  const key = (req) => new URL(typeof req === 'string' ? req : req.url, `${SITE}sw.js`).href;
  const answer = (entry) => entry && new Response(entry.body, entry.init);
  const cache = (entries) => ({
    match: async (req) => answer(entries.get(key(req))),
    put: async (req, res) => {
      const init = { status: res.status, statusText: res.statusText, headers: [...res.headers] };
      entries.set(key(req), { body: await res.arrayBuffer(), init }); // fails, like the real one, if the body was read
    },
    keys: async () => [...entries.keys()].map((url) => ({ url })),
    delete: async (req) => entries.delete(key(req)),
  });
  return {
    caches,
    open: async (name) => cache(caches.get(name) || caches.set(name, new Map()).get(name)),
    keys: async () => [...caches.keys()],
    has: async (name) => caches.has(name),
    delete: async (name) => caches.delete(name),
    match: async (req, { cacheName } = {}) => {
      for (const [name, entries] of caches) {
        const hit = (!cacheName || name === cacheName) && answer(entries.get(key(req)));
        if (hit) return hit;
      }
      return undefined;
    },
  };
}
const setsIn = (storage) => [...storage.caches.keys()].filter((name) => name.startsWith('francais-set-'));

// sw.js in a sandbox (a new one is a worker the browser stopped and started again). request() asks for a
// file as a page does; settle() waits for the work the worker goes on with after answering.
function startWorker(storage, server, { networkWait = 100, every = 0, limit = 120000, keep = 60000 } = {}) {
  const source = swSource
    .replace(/const NETWORK_WAIT = \d+/, `const NETWORK_WAIT = ${networkWait}`)
    .replace(/const CHECK_EVERY = \d+/, `const CHECK_EVERY = ${every}`)
    .replace(/const CHECK_LIMIT = \d+/, `const CHECK_LIMIT = ${limit}`)
    .replace(/const KEEP_FOR = \d+/, `const KEEP_FOR = ${keep}`);
  const on = {}, later = [], pages = [];
  const sandbox = {
    location: new URL(`${SITE}sw.js`), caches: storage, fetch: server.fetch,
    Response, Headers, URL, AbortController, setTimeout, clearTimeout, console,
    addEventListener: (type, fn) => { on[type] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => pages.slice() },
  };
  sandbox.self = sandbox;
  vm.runInNewContext(source, sandbox);
  const lifecycle = async (type) => {
    const waits = [];
    on[type]({ waitUntil: (p) => waits.push(p) });
    await Promise.all(waits);
  };
  return {
    pages,
    async install() { await lifecycle('install'); await lifecycle('activate'); },
    request(file, { page = '', navigate = false, headers = {} } = {}) {
      let answer = null;
      on.fetch({
        request: { url: SITE + file, method: 'GET', mode: navigate ? 'navigate' : 'cors', headers: new Headers(headers) },
        clientId: navigate ? '' : page, resultingClientId: navigate ? page : '',
        respondWith: (p) => { answer = p; }, waitUntil: (p) => { later.push(p); },
      });
      return answer ? Promise.resolve(answer) : server.fetch(SITE + file);
    },
    async settle() { while (later.length) await Promise.all(later.splice(0)); },
  };
}

async function installed(v, options) {
  const server = makeServer();
  server.publish(v);
  const storage = makeStorage();
  const worker = startWorker(storage, server, options);
  await worker.install();
  return { server, storage, worker };
}

// Opens the app as a page does: the page, its files, then the lessons of the curriculum (`between` runs
// after the page came). Resolves to the versions of the files it got, how long the page took to come, and
// the page (with its messages).
async function openApp(worker, id, { between } = {}) {
  const page = { id, messages: [], postMessage(m) { this.messages.push(m.type); } };
  worker.pages.push(page); // already listed while it opens, the strictest case
  const start = Date.now();
  const html = await (await worker.request('', { page: id, navigate: true })).text();
  const took = Date.now() - start;
  await between?.();
  const read = (file) => worker.request(file, { page: id }).then((res) => res.text());
  const files = await Promise.all(SW_FILES.filter((file) => file !== 'index.html').map(read));
  const { units } = JSON.parse(files.find((text) => text.startsWith('{')));
  const lessons = await Promise.all(units[0].lessons.map((l) => read(`data/lessons/${l}.json`)));
  const versionOf = (text) => (text.startsWith('{') ? `v${JSON.parse(text).v}` : text.split(' ').pop());
  return { versions: [...new Set([html, ...files, ...lessons].map(versionOf))], took, page };
}

await testAsync('sw.js: installing saves the whole app, every lesson included', async () => {
  const { storage } = await installed(1);
  eq(setsIn(storage).length, 1, 'versions saved');
  const saved = [...storage.caches.get(setsIn(storage)[0]).keys()].map((url) => url.slice(SITE.length));
  eq(saved.sort(), [...SW_FILES, 'data/lessons/a.json', 'data/lessons/b.json', 'set-complete'].sort(), 'files saved');
});
await testAsync('sw.js: on a weak signal, a visit runs on the saved version, then offers the new one', async () => {
  const { server, worker } = await installed(1);
  server.publish(2);
  server.delay = (file) => (file.startsWith('data/lessons/') ? 400 : 0); // the code comes at once, the lessons late
  const first = await openApp(worker, 'p1');
  eq(first.versions, ['v1'], 'files of the first page');
  ok(first.took < 300, `the first page took ${first.took} ms`);
  await worker.settle();
  eq(first.page.messages, ['new-version'], 'messages to the first page');
  const next = await openApp(worker, 'p2');
  eq(next.versions, ['v2'], 'files of the next page');
  await worker.settle();
  eq([first.page.messages, next.page.messages], [['new-version'], []], 'messages');
});
await testAsync('sw.js: a page still loading when the new version is saved keeps to its own version', async () => {
  const { server, worker } = await installed(1);
  server.publish(2);
  server.delay = (file) => (file.startsWith('data/lessons/') ? 300 : 0);
  const visit = await openApp(worker, 'p1', { between: () => worker.settle() });
  eq([visit.versions, visit.page.messages], [['v1'], ['new-version']], 'files and messages');
});
await testAsync('sw.js: on a good connection, a visit runs on the new version at once', async () => {
  const { server, worker } = await installed(1);
  const before = await openApp(worker, 'p1');
  server.publish(2);
  const visit = await openApp(worker, 'p2');
  await worker.settle();
  eq([before.versions, visit.versions], [['v1'], ['v2']], 'files');
  eq([before.page.messages, visit.page.messages], [['new-version'], []], 'messages (only the older page offers a reload)');
});
await testAsync('sw.js: offline, a visit opens on the saved version without waiting', async () => {
  const { server, worker } = await installed(1);
  server.publish(2);
  server.offline = true;
  const visit = await openApp(worker, 'p1');
  eq(visit.versions, ['v1'], 'files');
  ok(visit.took < 90, `the page took ${visit.took} ms`);
});
await testAsync('sw.js: when nothing changed, nothing new is saved', async () => {
  const { storage, worker } = await installed(1);
  for (const id of ['p1', 'p2']) eq((await openApp(worker, id)).versions, ['v1'], `files of ${id}`);
  await worker.settle();
  eq(setsIn(storage).length, 1, 'versions saved');
});
await testAsync('sw.js: a new version with a file missing is not used', async () => {
  const { server, storage, worker } = await installed(1);
  server.publish(2, { without: ['data/lessons/b.json'] });
  const visit = await openApp(worker, 'p1');
  await worker.settle();
  eq([visit.versions, setsIn(storage).length, visit.page.messages], [['v1'], 1, []], 'files, versions saved, messages');
});
await testAsync('sw.js: a check that hangs gives up, and the next visit checks again', async () => {
  const { server, worker } = await installed(1, { limit: 150 });
  server.publish(2);
  server.delay = (file) => (file === 'data/lessons/b.json' ? 5000 : 0);
  eq((await openApp(worker, 'p1')).versions, ['v1'], 'files of the first page');
  const start = Date.now();
  await worker.settle();
  ok(Date.now() - start < 1000, `the check went on for ${Date.now() - start} ms`);
  server.delay = () => 0;
  eq((await openApp(worker, 'p2')).versions, ['v2'], 'files of the next page');
});
await testAsync('sw.js: visits close together share one check', async () => {
  const { server, worker } = await installed(1, { every: 5000 });
  server.asked.length = 0;
  await openApp(worker, 'p1');
  await openApp(worker, 'p2');
  await worker.settle();
  eq(server.asked, [], 'files asked from the server');
});
await testAsync('sw.js: an older version is deleted once no page opened on it lately', async () => {
  const { server, storage, worker } = await installed(1, { keep: 200 });
  await openApp(worker, 'p1');
  server.publish(2);
  eq((await openApp(worker, 'p2')).versions, ['v2'], 'files of the second page');
  await worker.settle();
  eq(setsIn(storage).length, 2, 'versions saved while the first page may still be loading');
  await wait(250);
  await openApp(worker, 'p3');
  await worker.settle();
  eq(setsIn(storage).length, 1, 'versions saved a moment later');
});
await testAsync('sw.js: after a restart, the newest complete version is used, not one cut short', async () => {
  const { server, storage } = await installed(1);
  await (await storage.open(`francais-set-${Date.now() + 60000}`)).put(`${SITE}index.html`, new Response('index.html v9'));
  server.offline = true;
  eq((await openApp(startWorker(storage, server), 'p1')).versions, ['v1'], 'files');
});
await testAsync('sw.js: with nothing saved, a visit waits for the network', async () => {
  const { server, storage } = await installed(1);
  storage.caches.clear(); // the browser cleared the site's storage
  server.delay = (file) => (file.startsWith('data/lessons/') ? 200 : 0);
  const visit = await openApp(startWorker(storage, server), 'p1');
  eq(visit.versions, ['v1'], 'files');
  ok(visit.took >= 190, `the page came after ${visit.took} ms, before its lessons`);
});
await testAsync('sw.js: a recording is saved when first played, and a byte range gets a partial answer', async () => {
  const { server, worker } = await installed(1);
  const play = async () => {
    const res = await worker.request('audio/x.mp3', { page: 'p1', headers: { Range: 'bytes=0-4' } });
    return [res.status, res.headers.get('Content-Range'), await res.text()];
  };
  eq(await play(), [206, 'bytes 0-4/14', 'audio'], 'online');
  await worker.settle();
  server.offline = true;
  eq(await play(), [206, 'bytes 0-4/14', 'audio'], 'offline');
});
await testAsync("sw.js: recordings saved by the previous version are kept; other sites' caches are left alone", async () => {
  const server = makeServer();
  server.publish(1);
  const storage = makeStorage();
  const old = await storage.open('francais-v3');
  await old.put(`${SITE}audio/x.mp3`, new Response('audio/x.mp3 v0'));
  await old.put(`${SITE}index.html`, new Response('index.html v0'));
  await (await storage.open('other-site')).put('https://example.test/other/', new Response('other'));
  const worker = startWorker(storage, server);
  await worker.install();
  eq([...storage.caches.keys()].filter((name) => !name.startsWith('francais-set-')).sort(), ['francais-audio', 'other-site'], 'caches');
  server.offline = true;
  eq(await (await worker.request('audio/x.mp3', { page: 'p1' })).text(), 'audio/x.mp3 v0', 'the recording saved before');
});

console.log(`${count} of ${count + failures} tests passed`);
console.log(failures ? `${failures} FAILED` : 'OK');
process.exit(failures ? 1 : 0);
