/* =========================================================
   Mis Gastos — push.js

   Recordatorios en la versión web (iPhone y computadora).

   En el APK los programa el propio teléfono (app.js, «Recordatorios»).
   Una página web no puede programar un aviso para más tarde, así que en
   la web los manda un servidor con Web Push: el mismo proyecto de
   Supabase que ARAC Partidos (supabase/recordatorio.sql y
   supabase/functions/misgastos-recordatorio).

   Lo único que viaja al servidor es la «suscripción» de este teléfono
   (una dirección anónima para mandarle avisos, que da el navegador) y
   su zona horaria, para que el aviso llegue a las 21 de acá. Ningún dato
   de gastos. Al apagar los recordatorios se borra.

   En iPhone sólo funciona con la app instalada en la pantalla de inicio
   (iOS 16.4 o más nuevo).
   ========================================================= */
(function (raiz) {
  'use strict';

  /* El proyecto de Supabase de ARAC. Son datos públicos por diseño: la
     tabla sólo se toca con las funciones de supabase/recordatorio.sql. */
  const SUPABASE_URL = 'https://jvclrktwezisvuljemgi.supabase.co';
  const SUPABASE_CLAVE = 'sb_publishable_LV1XIiUzH0GGPu8q0uHj1w_2qnqXcty';
  /* Clave pública de Web Push, la misma de ARAC. La privada está sólo en
     los secretos de las Edge Functions (VAPID_PRIVADA). */
  const VAPID_PUBLICA = 'BCoRm7tqXD1JGjAqpUXzyqYY6yMDkkiz1FEg_y5oUs4W73vSzde23B0WdbUJdpwROeAzQJMTAu7dN7CD2tc_wbg';

  const Cap = raiz.Capacitor;
  const nativo = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const ua = navigator.userAgent;
  const esIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const instalada = () => (raiz.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;

  /** El navegador sabe recibir avisos (en iPhone, sólo con la app instalada). */
  const posible = () => !nativo && 'serviceWorker' in navigator && 'PushManager' in raiz && 'Notification' in raiz;
  /** iPhone desde Safari: primero hay que instalarla. */
  const pideInstalar = () => !nativo && esIOS && !instalada();

  function bytesDe(b64) {
    const s = atob((b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  }

  async function llamar(ruta, cuerpo) {
    const r = await fetch(SUPABASE_URL + ruta, {
      method: 'POST',
      headers: { apikey: SUPABASE_CLAVE, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
    if (!r.ok) throw new Error('servidor ' + r.status);
    return r.status === 204 ? null : r.json().catch(() => null);
  }

  const zona = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };

  async function subir(sub) {
    const j = sub.toJSON();
    await llamar('/rest/v1/rpc/misgastos_guardar_push', {
      p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_zona: zona()
    });
  }

  const registro = () => navigator.serviceWorker.ready;

  /**
   * Activa los avisos. `permiso` es la promesa de Notification.requestPermission():
   * en iPhone hay que pedirla apenas se toca el interruptor, antes de cualquier espera,
   * así que la pide quien llama. Lanza Error('permiso') si no lo dieron.
   */
  async function activar(permiso) {
    if (await permiso !== 'granted') throw new Error('permiso');
    const reg = await registro();
    const sub = (await reg.pushManager.getSubscription())
      || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesDe(VAPID_PUBLICA) });
    await subir(sub);
  }

  async function desactivar() {
    const reg = await registro();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    try { await llamar('/rest/v1/rpc/misgastos_borrar_push', { p_endpoint: sub.endpoint }); } catch (e) { /* se borra sola cuando falle el envío */ }
    await sub.unsubscribe();
  }

  /**
   * Al abrir la app con los avisos prendidos: vuelve a mandar la suscripción
   * (por si cambió la zona horaria o el servidor la borró). Devuelve false si
   * ya no se puede (sacaron el permiso o se perdió la suscripción).
   */
  async function refrescar() {
    if (!posible() || Notification.permission !== 'granted') return false;
    const reg = await registro();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    try { await subir(sub); } catch (e) { /* sin internet: queda para la próxima */ }
    return true;
  }

  /** Para el panel de administrador: manda ya mismo un aviso a este teléfono. */
  async function probar(title, body) {
    const reg = await registro();
    const sub = await reg.pushManager.getSubscription();
    if (!sub) throw new Error('sin suscripción');
    await subir(sub);
    const r = await llamar('/functions/v1/misgastos-recordatorio', { prueba: true, endpoint: sub.endpoint, title, body });
    return !!(r && r.enviados);
  }

  raiz.Push = { posible, pideInstalar, activar, desactivar, refrescar, probar };
})(window);
