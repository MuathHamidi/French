// Offline support and updates. The app is saved on the phone as a whole: the page, its code, every lesson,
// the dictionary and the list of recordings, all from one version of the course (a "set"). Each visit runs
// on one set from start to end, so it never mixes old and new files. When a visit opens, the newest set is
// checked against the server (an unchanged file isn't downloaded again) and, if anything changed, a new set
// is saved beside it. The visit waits a few seconds for that; on a weak signal it opens on the saved set
// instead, and the page offers a reload once the new set is saved. Offline, it opens on the saved set at
// once. Recordings are saved apart, one by one as they are heard: they never change, since a changed
// recording gets a new file name (tools/make_audio.py). tools/check_logic.mjs tests this file.
const SET = 'francais-set-'; // + the time the set was saved
const AUDIO = 'francais-audio';
const COMPLETE = 'set-complete'; // saved in a set after all its files: a set without it was cut short
const NETWORK_WAIT = 3000; // ms a visit waits for a new set
const CHECK_EVERY = 10000; // ms: visits closer together share one check (reloads, tools/test.html)
const CHECK_LIMIT = 120000; // ms after which a check gives up (a connection that hangs)
const KEEP_FOR = 60000; // ms a set is kept for a page that opened on it (a page loads its files at the start)

// Everything the app loads, besides data/lessons/<id>.json for each lesson of data/curriculum.json.
// tools/check_logic.mjs checks that nothing is missing.
const FILES = [
  'index.html', 'css/app.css?v=6', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/util.js', 'js/store.js', 'js/srs.js', 'js/audio.js', 'js/content.js', 'js/text.js',
  'js/wordcard.js', 'js/quiz.js', 'js/quizgen.js',
  'js/views/home.js', 'js/views/lesson.js', 'js/views/review.js', 'js/views/words.js', 'js/views/settings.js',
  'data/curriculum.json', 'data/lexicon.json', 'data/audio.json',
];

let newest = null; // the newest complete set
let checking = null; // the check under way: { result: the new set, or null (no change, or it failed), done }
let checkedAt = 0;
let lastOpened = null; // the set of the page that opened last
const pages = new Map(); // page (client id) -> { set, at }: the set each page runs on

const SCOPE = new URL('./', location).pathname;
const isAppPage = (url) => url.pathname === SCOPE || url.pathname === `${SCOPE}index.html`;
const isRecording = (url) => /\/audio\/[^/]+\.mp3$/.test(url.pathname);
const savedAt = (set) => Number(set.slice(SET.length));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const offline = () => new Response('', { status: 504, statusText: 'Offline' });

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    newest = await newestSet();
    if (!newest) { // the first set: if the network fails, so does the install, which is tried again next visit
      await makeSet();
      checkedAt = Date.now();
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const name of await caches.keys()) {
      // Older versions of this file saved everything in one cache: keep its recordings. Caches of other
      // sites on the same domain (name.github.io) are left alone.
      if (!name.startsWith('francais-') || name === AUDIO || name.startsWith(SET)) continue;
      await keepRecordings(name).catch(() => {}); // storage full: they download again when played
      await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (isRecording(url)) {
    const [response, saving] = savedFirst(req);
    e.respondWith(response.then((res) => partial(req, res)));
    e.waitUntil(saving);
  } else if (req.mode === 'navigate') {
    if (!isAppPage(url)) return; // other pages (tools/test.html) load from the network as usual
    const opening = openPage(req, e.resultingClientId);
    e.respondWith(opening.then(([page]) => page, () => fetch(req).catch(offline))); // storage failing: the network
    e.waitUntil(opening.then(([, later]) => later, () => {}));
  } else {
    e.respondWith(fromSet(req, e.clientId).catch(() => fetch(req).catch(offline)));
  }
});

// A page opens: it gets the newest set, or the new one if the check saves it in time. Resolves to
// [the page, the work that goes on after it].
async function openPage(req, pageId) {
  newest ||= await newestSet();
  if (!checking && (!newest || Date.now() - checkedAt >= CHECK_EVERY)) check();
  const pending = checking;
  let set = newest;
  if (pending) {
    const fresh = await (set ? Promise.race([pending.result, sleep(NETWORK_WAIT)]) : pending.result); // nothing saved: wait
    if (fresh) set = fresh;
  }
  lastOpened = set;
  if (pageId) pages.set(pageId, { set, at: Date.now() });
  const page = set && await caches.match('index.html', { cacheName: set });
  return [page || await fetch(req).catch(offline), Promise.all([pending?.done, cleanUp().catch(() => {})])];
}

// Any other file: from the set the page runs on, so that it matches the page's other files.
async function fromSet(req, pageId) {
  const set = pages.get(pageId)?.set || lastOpened || (newest ||= await newestSet());
  return (set && await caches.match(req.url, { cacheName: set })) || fetch(req).catch(offline);
}

// Compares the newest set with the server and saves a new set if anything changed.
function check() {
  const result = makeSet().then((set) => { checkedAt = Date.now(); return set; }, () => null);
  const done = result.then(async (set) => {
    checking = null;
    if (!set) return;
    await sleep(0); // the pages that waited for this set take it first
    for (const page of await self.clients.matchAll({ type: 'window' })) {
      if (pages.get(page.id)?.set !== set) page.postMessage({ type: 'new-version' }); // they offer a reload
    }
  });
  checking = { result, done };
}

// Downloads what changed since the newest set and saves a new, complete set. Resolves to its name, or to
// null when nothing changed; fails when a file can't be downloaded, and the newest set stays in use.
async function makeSet() {
  const base = newest;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CHECK_LIMIT);
  const got = new Map(); // url -> { res, changed: new content, whole: the server sent the whole file }
  const get = async (file) => {
    const url = new URL(file, location).href;
    const saved = base && await caches.match(url, { cacheName: base });
    const res = await fetch(url, saved
      ? { cache: 'no-store', headers: validators(saved), signal: abort.signal }
      : { cache: 'no-cache', signal: abort.signal });
    if (saved && res.status === 304) got.set(url, { res: saved, changed: false, whole: false });
    else if (res.status !== 200) throw new Error(`${file}: HTTP ${res.status}`);
    // The content decides, not the ETag: GitHub Pages' servers can give an unchanged file a new one.
    else got.set(url, { res, changed: !saved || !(await sameContent(res.clone(), saved)), whole: true });
    return got.get(url).res;
  };
  try {
    const loading = FILES.map(get);
    for (const file of loading) file.catch(() => {}); // a failure is reported once, below
    const curriculum = await loading[FILES.indexOf('data/curriculum.json')];
    const { units } = await curriculum.clone().json();
    await Promise.all([...loading, ...units.flatMap((u) => u.lessons || []).map((id) => get(`data/lessons/${id}.json`))]);
  } catch (err) {
    abort.abort(); // stop the other downloads
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (base && [...got.values()].every((a) => !a.changed)) {
    // Nothing changed. A file sent whole keeps its new ETag (same content), so the next check gets
    // "not modified" for it instead of downloading it again.
    if (await caches.has(base)) {
      const set = await caches.open(base);
      await Promise.all([...got].filter(([, a]) => a.whole).map(([url, a]) => set.put(url, a.res).catch(() => {})));
    }
    return null;
  }
  let time = Date.now();
  while (await caches.has(SET + time)) time++;
  const name = SET + time;
  const set = await caches.open(name);
  try {
    await Promise.all([...got].map(([url, a]) => set.put(url, a.res)));
    await set.put(COMPLETE, new Response(''));
  } catch (err) { // storage full
    await caches.delete(name);
    throw err;
  }
  return (newest = name);
}

async function sameContent(a, b) {
  const [x, y] = (await Promise.all([a.arrayBuffer(), b.arrayBuffer()])).map((body) => new Uint8Array(body));
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

function validators(saved) {
  if (saved.headers.get('ETag')) return { 'If-None-Match': saved.headers.get('ETag') };
  if (saved.headers.get('Last-Modified')) return { 'If-Modified-Since': saved.headers.get('Last-Modified') };
  return {};
}

// The newest set saved in full (the worker forgets everything when the browser stops it).
async function newestSet() {
  const sets = (await caches.keys()).filter((name) => name.startsWith(SET)).sort((a, b) => savedAt(b) - savedAt(a));
  for (const set of sets) if (await caches.match(COMPLETE, { cacheName: set })) return set;
  return null;
}

// Deletes the sets no page uses any more: older than the newest one, and no page opened on them lately.
// (A set newer than the newest one is still being saved.)
async function cleanUp() {
  const now = Date.now();
  for (const [id, page] of pages) if (now - page.at > KEEP_FOR) pages.delete(id);
  const used = new Set([newest, lastOpened, ...[...pages.values()].map((page) => page.set)]);
  for (const name of await caches.keys()) {
    if (name.startsWith(SET) && !used.has(name) && newest && savedAt(name) < savedAt(newest)) await caches.delete(name);
  }
}

async function keepRecordings(name) {
  const from = await caches.open(name);
  const to = await caches.open(AUDIO);
  const recordings = (await from.keys()).filter((req) => isRecording(new URL(req.url)));
  await Promise.all(recordings.map(async (req) => to.put(req, await from.match(req))));
}

// [response, saving]: the saved recording, or the network's answer (then saved).
function savedFirst(req) {
  let saving = null;
  const response = caches.match(req.url, { cacheName: AUDIO }).then((hit) => hit || fetch(req.url).then((res) => {
    if (res.status === 200) saving = caches.open(AUDIO).then((c) => c.put(req.url, res.clone())).catch(() => {});
    return res;
  }, offline));
  return [response, response.then(() => saving)];
}

// Audio elements ask for byte ranges ("Range: bytes=0-1"), but the whole file came back (fetched by URL,
// without the header, or from the cache). Answer with the part asked for: Safari won't play audio that
// comes back whole from a range request.
async function partial(req, res) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get('range') || '');
  if (!m || res.status !== 200) return res;
  const body = await res.arrayBuffer();
  const start = Number(m[1]);
  const end = Math.min(m[2] ? Number(m[2]) : Infinity, body.byteLength - 1);
  if (start > end) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${body.byteLength}` } });
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${body.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
