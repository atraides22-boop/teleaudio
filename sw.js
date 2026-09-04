const CACHE_NAME = 'teleaudio-v77';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './hls.min.js',
  './manifest.json', './canciones.json',
  './icon.svg',
  './logos/la1.png', './logos/la2.png', './logos/24h.png', './logos/tdp.png',
  './logos/clan.png', './logos/canalsur.png', './logos/canalsur2.png',
  './logos/canalsurmas.png', './logos/eltoro.png', './logos/trece.png',
  './logos/euronews.png', './logos/rne.png', './logos/r5.png',
  './logos/los40.png', './logos/dial.png', './logos/radiole.png', './logos/melodia.png',
  './logos/tv3.png', './logos/esport3.png', './logos/sx3.png', './logos/tdt324.png', './logos/7tvgranada.png', './logos/radiocable.png',
  './logos/rmtv.png', './logos/esradio.png', './logos/rmarca.png', './logos/rac1.png', './logos/catradio.png',
  './logos/euskadi.png', './logos/galega.png', './logos/ondavalencia.png', './logos/musictv.png'
  './logos/ser.png', './logos/cope.png', './logos/onda0.png',
  './logos/c100.png', './logos/rockfm.png', './logos/kissfm.png', './logos/europafm.png', './logos/radiocable.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Nunca cachear los streams de audio/vídeo
  if (e.request.url.includes('.m3u8') || e.request.url.includes('.ts') ||
      e.request.url.includes('.m4s') || e.request.url.includes('.aac') ||
      e.request.url.includes('.mp3')) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((resp) => {
        if (resp.ok && e.request.url.startsWith(self.location.origin)) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return resp;
      });
    })
  );
});
