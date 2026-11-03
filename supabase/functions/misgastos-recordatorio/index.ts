// Mis Gastos — Edge Function "misgastos-recordatorio": manda los recordatorios a los
// teléfonos con la versión web que los activaron (Web Push). Vive en el mismo proyecto de
// Supabase que ARAC Partidos y reutiliza sus secretos.
//
// Dos formas de llamarla:
// - El cron "misgastos-recordatorio" (supabase/recordatorio.sql), cada hora, con la clave
//   ARAC_CLAVE_PUSH: manda a cada teléfono el aviso que le toque a esa hora en su zona
//   (el recordatorio de las 21 y, el día 1, el del resumen del mes).
// - El panel de administrador de la app: { prueba: true, endpoint, title, body } manda ese
//   aviso ya mismo, sólo a ese teléfono (tiene que estar suscripto).
//
// Secretos (Supabase › Edge Functions › Secrets), los mismos de ARAC:
// VAPID_PUBLICA, VAPID_PRIVADA y ARAC_CLAVE_PUSH.
// Se despliega con "Verify JWT" desactivado: la protege la clave.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

type Aviso = { title: string; body: string; url: string };

/* Los mismos textos que el APK (www/app.js: AVISOS_DIA y AVISO_RESUMEN). Si se cambian
   allá, cambiarlos acá. */
const AVISOS_DIA = [
  { t: '¿Cómo venís hoy?',        c: 'Cargá lo que gastaste antes de que se te mezcle con mañana.' },
  { t: 'Dos minutos y listo',     c: 'Anotá los gastos del día mientras los tenés frescos.' },
  { t: 'Un repaso rápido',        c: '¿Hubo algún gasto hoy que todavía no cargaste?' },
  { t: 'Antes de que se olvide',  c: 'Lo que no se anota hoy, mañana ya no se acuerda nadie.' },
  { t: 'Cerrá el día',            c: 'Un minuto ahora te ahorra media hora a fin de mes.' },
];
const AVISO_RESUMEN = { t: 'Tu resumen del mes está listo', c: 'Mirá cuánto entró, cuánto salió y en qué se te fue la plata el mes pasado.' };

/* Qué variación le toca a un día: como el APK, el día de la semana corrido por la semana
   del año, así no le toca siempre el mismo texto al mismo día. */
function avisoDelDia(fecha: string): Aviso {
  const d = new Date(fecha + 'T12:00:00Z');
  const ini = Date.UTC(d.getUTCFullYear(), 0, 1);
  const semana = Math.floor((d.getTime() - ini) / (7 * 86400000));
  const a = AVISOS_DIA[(d.getUTCDay() + semana) % AVISOS_DIA.length];
  return { title: a.t, body: a.c, url: './' };
}
const avisoResumen = (): Aviso => ({ title: AVISO_RESUMEN.t, body: AVISO_RESUMEN.c, url: './#resumen' });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const responder = (cuerpo: unknown, status = 200) => Response.json(cuerpo, { status, headers: CORS });
const recortar = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

type Envio = { endpoint: string; p256dh: string; auth: string; aviso: Aviso };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const pedido = await req.json().catch(() => ({}));

  let envios: Envio[] = [];
  if (pedido.prueba) {
    // Prueba desde el panel de administrador: sólo a ese teléfono, si está suscripto
    const { data, error } = await sb.from('misgastos_push')
      .select('endpoint, p256dh, auth').eq('endpoint', recortar(pedido.endpoint, 1000)).maybeSingle();
    if (error) return responder({ error: error.message }, 500);
    if (!data) return responder({ enviados: 0, error: 'Este teléfono no está suscripto' }, 404);
    envios = [{ ...data, aviso: {
      title: recortar(pedido.title, 80) || 'Mis Gastos',
      body: recortar(pedido.body, 200) || 'Notificación de prueba',
      url: './',
    } }];
  } else {
    const clave = Deno.env.get('ARAC_CLAVE_PUSH');
    if (!clave || req.headers.get('x-arac-clave') !== clave) return responder({ error: 'No autorizado' }, 401);
    const { data, error } = await sb.rpc('misgastos_push_tomar');
    if (error) return responder({ error: error.message }, 500);
    envios = (data ?? []).map((f: { o_endpoint: string; o_p256dh: string; o_auth: string; o_tipo: string; o_fecha: string }) => ({
      endpoint: f.o_endpoint, p256dh: f.o_p256dh, auth: f.o_auth,
      aviso: f.o_tipo === 'resumen' ? avisoResumen() : avisoDelDia(f.o_fecha),
    }));
  }

  webpush.setVapidDetails(
    'https://matumir.github.io/mis-gastos-apk/',
    Deno.env.get('VAPID_PUBLICA')!,
    Deno.env.get('VAPID_PRIVADA')!,
  );
  let enviados = 0;
  const vencidas: string[] = [];
  await Promise.all(envios.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(s.aviso),
        { TTL: 6 * 3600, urgency: 'normal' },
      );
      enviados++;
    } catch (e) {
      // 404 / 410: el teléfono desinstaló la app o quitó el permiso
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) vencidas.push(s.endpoint);
    }
  }));
  if (vencidas.length) await sb.from('misgastos_push').delete().in('endpoint', vencidas);
  return responder({ enviados, borradas: vencidas.length });
});
