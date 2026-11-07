// Offline support: always try the network first (so updates show up), fall back to the cache.
const CACHE = 'francais-v3';
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
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req.url, { cache: 'no-cache' }) // re-check with the server so updates show up right away
      .then((res) => {
        if (res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.url, copy)); }
        return res;
      })
      .catch(() => caches.match(req.url).then((hit) => hit
        || (req.mode === 'navigate' ? caches.match('index.html') : new Response('', { status: 504, statusText: 'Offline' }))))
      .then((res) => partial(req, res)),
  );
});

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
