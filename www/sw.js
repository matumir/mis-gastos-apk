/* =========================================================
   Service worker de la versión web: deja la app funcionando sin
   internet y hace que las actualizaciones lleguen enteras.

   1. El nombre del cache lleva la versión. Al publicar, el armado de la
      web (scripts/preparar-web.mjs) le suma el commit a VERSION, así que
      cada publicación cambia este archivo: el navegador lo nota, baja
      todo de nuevo en un cache aparte y borra el viejo.
      En el APK este archivo no se usa.

   2. Todo se sirve del cache de ESTA versión, también la página. Antes
      la página venía de la red y el resto del cache, y después de
      publicar se mezclaban un index.html nuevo con un app.js viejo. Ahora
      una versión entra entera o no entra.

   3. Quién avisa y recarga es la app (app.js, «Actualizaciones de la
      versión web»): pide revisar cada vez que se vuelve a ella, porque en
      iPhone la app instalada no se recarga sola y puede pasar días sin
      enterarse de que hay una versión nueva.
   ========================================================= */

const VERSION = '2.7';
const CACHE = `misgastos-${VERSION}`;

/* El lector de tickets pesa ~10 MB. No se precachea (quien no es Premium
   no lo necesita nunca) y vive en un cache aparte, sin versión: así no
   se vuelve a bajar entero cada vez que sale una versión nueva de la app.
   Si algún día se cambia la librería, subí este número. */
const CACHE_OCR = 'misgastos-ocr-1';
const esOcr = url => url.includes('/vendor/');

const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './capacitor.js',
  './speech-recognition.js',
  './filesystem.js',
  './share.js',
  './local-notifications.js',
  './licencia.js',
  './detectar.js',
  './ticket.js',
  './sonidos.js',
  './resumen-mes.js',
  './cotizaciones.js',
  './push.js',
  './admin.js',
  './privacidad.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', ev => {
  /* cache: 'reload' saltea el cache HTTP del navegador (GitHub Pages lo
     deja 10 minutos): si no, justo después de publicar se podría guardar
     como versión nueva un archivo viejo.
     Si falla algún archivo, la instalación falla entera y sigue la
     versión anterior; el navegador lo vuelve a intentar más tarde. */
  ev.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARCHIVOS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== CACHE_OCR).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  /* Las cotizaciones (y cualquier otro sitio) van siempre directo a la
     red: guardar la última es cosa de cotizaciones.js, que sabe su fecha. */
  if (new URL(req.url).origin !== self.location.origin) return;

  /* Lector de tickets: cache primero y para siempre (ver CACHE_OCR). */
  if (esOcr(req.url)) {
    ev.respondWith(
      caches.open(CACHE_OCR).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && res.status === 200) c.put(req, res.clone());
        return res;
      })))
    );
    return;
  }

  /* La página y el resto, del cache de esta versión. ignoreSearch: la app
     se abre también como ./?algo. Lo que no está guardado se busca en la
     red (y se guarda, para la próxima sin internet). */
  ev.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.status === 200 && res.type === 'basic') c.put(req, res.clone());
      return res;
    } catch (e) {
      if (req.mode === 'navigate') {
        const pagina = await c.match('./');
        if (pagina) return pagina;
      }
      throw e;
    }
  })());
});

/* ---------- Recordatorios (versión web) ----------
   Los manda el servidor (supabase/functions/misgastos-recordatorio) con
   { title, body, url }. Cada push tiene que mostrar una notificación: si
   no, iPhone deja de mandarlos. */
self.addEventListener('push', ev => {
  let a = {};
  try { a = ev.data ? ev.data.json() : {}; } catch (e) { a = { body: ev.data && ev.data.text() }; }
  ev.waitUntil(self.registration.showNotification(a.title || 'Mis Gastos', {
    body: a.body || 'Acordate de cargar los gastos del día.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'misgastos-recordatorio',     // uno nuevo reemplaza al anterior sin leer
    data: { url: a.url || './' }
  }));
});

/* Al tocarla: si la app ya está abierta, se trae al frente; si no, se abre.
   El del resumen (url './#resumen') abre directamente el resumen del mes. */
self.addEventListener('notificationclick', ev => {
  ev.notification.close();
  const url = new URL((ev.notification.data && ev.notification.data.url) || './', self.registration.scope).href;
  ev.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const propia = abiertas.find(c => c.url.startsWith(self.registration.scope));
    if (propia) {
      await propia.focus();
      if (url.endsWith('#resumen')) propia.postMessage({ abrir: 'resumen' });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
