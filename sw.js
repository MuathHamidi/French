// Offline support: always try the network first (so updates show up), fall back to the cache.
const CACHE = 'francais-v3';
const SHELL = [
  './', 'index.html', 'css/app.css?v=2', 'manifest.webmanifest', 'icons/icon.svg',
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
      .catch(() => caches.match(req.url).then((hit) => hit || caches.match('index.html'))),
  );
});
