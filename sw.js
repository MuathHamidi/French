// Offline support. Pages, code and lessons come from the network first, so updates show up; the saved
// copy is used offline, or when the network takes more than a few seconds (a weak signal), and the
// late answer still updates it for next time. After such a slow answer, the next files come from the
// saved copies at once for a while (the app loads in several rounds, which would each wait), until the
// network answers fast again. Recordings come from the saved copy first: they never change, since a
// changed recording gets a new file name (tools/make_audio.py).
const CACHE = 'francais-v3';
const NETWORK_WAIT = 3000; // ms
const SLOW_FOR = 30000; // ms
let slowUntil = 0;
const SHELL = [
  './', 'index.html', 'css/app.css?v=3', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/util.js', 'js/store.js', 'js/srs.js', 'js/audio.js', 'js/content.js', 'js/text.js',
  'js/wordcard.js', 'js/quiz.js', 'js/quizgen.js',
  'js/views/home.js', 'js/views/lesson.js', 'js/views/review.js', 'js/views/words.js', 'js/views/settings.js',
  'data/curriculum.json', 'data/lexicon.json', 'data/audio.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const [response, saving] = /\/audio\/[^/]+\.mp3$/.test(url.pathname) ? savedFirst(req) : networkFirst(req);
  e.respondWith(response.then((res) => partial(req, res)));
  e.waitUntil(saving);
});

const offline = () => new Response('', { status: 504, statusText: 'Offline' });
const save = (url, res) => caches.open(CACHE).then((c) => c.put(url, res)).catch(() => {}); // storage full: just don't save

// [response, saving]: the network's answer, or the saved copy when the network fails or is slow.
function networkFirst(req) {
  const asked = Date.now();
  const network = fetch(req.url, { cache: 'no-cache' }); // re-check with the server so updates show up
  const saving = network.then((res) => (res.status === 200 ? save(req.url, res.clone()) : null), () => null);
  network.then(() => { if (Date.now() - asked < NETWORK_WAIT) slowUntil = 0; }, () => {}); // fast again
  const saved = () => caches.match(req.url).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : null));
  const response = new Promise((resolve) => {
    let sent = false;
    const send = (res) => { if (res && !sent) { sent = true; resolve(res); } };
    network.then(send, () => saved().then((hit) => send(hit || offline())));
    const wait = asked < slowUntil ? 0 : NETWORK_WAIT;
    setTimeout(() => {
      if (!sent && wait) slowUntil = Date.now() + SLOW_FOR;
      saved().then(send); // nothing saved yet: keep waiting for the network
    }, wait);
  });
  return [response, saving];
}

// [response, saving]: the saved copy, or the network's answer (then saved).
function savedFirst(req) {
  let saving = null;
  const response = caches.match(req.url).then((hit) => hit || fetch(req.url).then((res) => {
    if (res.status === 200) saving = save(req.url, res.clone());
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
