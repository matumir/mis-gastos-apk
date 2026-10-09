/* =========================================================
   Service worker: deja la app funcionando sin internet.

   Dos decisiones que importan para que las actualizaciones lleguen:

   1. El nombre del cache lleva la versión. Al publicar una versión nueva
      cambia el nombre, se precachea todo de cero y se borra lo viejo.
      **Si cambiás algo de la app, subí VERSION.**

   2. Los archivos se sirven con «cache primero, pero se revalida». La
      persona ve la app al instante desde el cache y, mientras tanto, en
      segundo plano se baja la versión nueva para la próxima vez. Es la
      red de contención por si alguna vez me olvido de subir VERSION:
      la actualización igual llega, con un arranque de demora, en lugar
      de que el usuario quede clavado en una versión vieja para siempre.
   ========================================================= */

const VERSION = '1.9';
const CACHE = `misgastos-${VERSION}`;

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './capacitor.js',
  './speech-recognition.js',
  './filesystem.js',
  './share.js',
  './licencia.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', ev => {
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
      .catch(e => console.warn('No se pudo precachear todo:', e))
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  /* Navegación: red primero, cache de respaldo. Así, con internet, el
     index.html siempre es el último. */
  if (req.mode === 'navigate') {
    ev.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copia));
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  /* Resto: se responde con lo que haya en el cache —instantáneo y sin
     internet— y en paralelo se busca la versión nueva para guardarla.
     La próxima vez que abra, ya está actualizado. */
  ev.respondWith(
    caches.match(req).then(hit => {
      const red = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia));
        }
        return res;
      }).catch(() => hit);     // sin internet, vale lo cacheado
      return hit || red;
    })
  );
});
