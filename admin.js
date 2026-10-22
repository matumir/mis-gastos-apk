/* =========================================================
   Mis Gastos — modo administrador

   Para el dueño de la app: herramientas de prueba que no dependen de
   esperar a que pase algo (que llegue la noche, que empiece el mes,
   que salga una versión…).

   Se activa escribiendo el código de administrador en el mismo lugar
   donde se pega el código de Premium. El código NO está en este
   archivo: sólo su huella (PBKDF2-SHA256, 150.000 vueltas). Quien lea
   el código fuente no lo puede sacar de acá.

   El modo administrador da Premium completo (sin licencia) y suma un
   panel de pruebas. No toca los datos. Desde el panel se puede «ver
   como Gratis» para revisar la versión gratis.

   Para que no alcance con escribir una marca en el almacenamiento del
   navegador, se guarda el código mismo y se vuelve a verificar contra
   la huella en cada arranque, igual que una licencia: si no cierra, el
   modo se apaga solo.

   Este archivo se carga antes de app.js; las acciones del panel usan
   funciones de app.js recién cuando se tocan.
   ========================================================= */
'use strict';

const Admin = (() => {
  const HUELLA = {
    sal: '6YYlZUyTJ1jYHX/6iVi8mw==',
    vueltas: 150000,
    hash: '8ypwABjqY1YGgK6TiSOxELuy9AEqSxcpiTOKgSW2P1Y='
  };
  const CLAVE = 'misgastos.admin';
  const CLAVE_GRATIS = 'misgastos.admin.gratis';

  const leer = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const escribir = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* nada */ } };
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  /** Normaliza lo que se pegó: sin espacios y en mayúsculas. */
  const normalizar = t => String(t || '').replace(/\s+/g, '').toUpperCase();

  /** ¿Parece un intento de código de admin? (para no gastar 150.000
      vueltas de PBKDF2 en cada licencia que se pega). */
  const pareceCodigo = t => /^ADMIN-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizar(t));

  async function esCodigo(texto) {
    if (!pareceCodigo(texto) || !(window.crypto && crypto.subtle)) return false;
    try {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalizar(texto)), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: b64(HUELLA.sal), iterations: HUELLA.vueltas }, base, 256);
      const h = btoa(String.fromCharCode(...new Uint8Array(bits)));
      return h === HUELLA.hash;
    } catch (e) { return false; }
  }

  let verificado = false;

  /** Al arrancar: el código guardado tiene que seguir verificando. */
  async function iniciar() {
    const guardado = leer(CLAVE);
    verificado = !!guardado && await esCodigo(guardado);
    if (guardado && !verificado) { escribir(CLAVE, null); escribir(CLAVE_GRATIS, null); }
    return verificado;
  }

  return {
    pareceCodigo, esCodigo, iniciar,
    activo: () => verificado,
    /** Sólo después de que esCodigo(texto) dio true. */
    activar: texto => { escribir(CLAVE, normalizar(texto)); verificado = true; },
    desactivar: () => { escribir(CLAVE, null); escribir(CLAVE_GRATIS, null); verificado = false; },
    forzarGratis: () => verificado && leer(CLAVE_GRATIS) === '1',
    setForzarGratis: si => escribir(CLAVE_GRATIS, si ? '1' : null)
  };
})();

/* ---------------------------------------------------------
   Notificaciones de prueba
   --------------------------------------------------------- */
let idPrueba = 900;

/** Manda una notificación dentro de `seg` segundos. En el APK usa el
    mismo plugin y el mismo canal que los recordatorios de verdad, así
    que si esta llega, aquellos también. */
async function notifPrueba(titulo, cuerpo, seg = 5) {
  const P = plugNotif();
  if (P) {
    try {
      let { display } = await P.checkPermissions();
      if (display !== 'granted') ({ display } = await P.requestPermissions());
      if (display !== 'granted') { await soloAviso('Sin permiso', 'Android tiene bloqueadas las notificaciones de Mis Gastos. Habilitalas desde los ajustes del teléfono.'); return false; }
      await asegurarCanal();
      await P.schedule({ notifications: [{
        id: idPrueba++, title: titulo, body: cuerpo,
        schedule: { at: new Date(Date.now() + seg * 1000), allowWhileIdle: true },
        smallIcon: ICONO_NOTIF, channelId: CANAL_AVISOS
      }] });
      return true;
    } catch (e) {
      await soloAviso('No se pudo programar', String(e && e.message || e));
      return false;
    }
  }
  // En el navegador: sólo para ver los textos. Los recordatorios
  // programados de verdad existen sólo en el APK.
  if (!('Notification' in window)) { avisar('Este navegador no muestra notificaciones.'); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { avisar('El navegador no dio permiso para notificaciones.'); return false; }
  setTimeout(async () => {
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) reg.showNotification(titulo, { body: cuerpo, icon: 'icons/icon-192.png' });
      else new Notification(titulo, { body: cuerpo, icon: 'icons/icon-192.png' });
    } catch (e) { avisar(`${titulo}: ${cuerpo}`); }
  }, seg * 1000);
  return true;
}

let variantePrueba = 0;

async function adminAccion(que) {
  switch (que) {
    case 'notif-una': {
      const a = AVISOS_DIA[variantePrueba % AVISOS_DIA.length];
      const n = (variantePrueba % AVISOS_DIA.length) + 1;
      variantePrueba++;
      if (await notifPrueba(a.t, a.c, 5)) avisar(`Variación ${n} de ${AVISOS_DIA.length}: llega en 5 s. Podés salir de la app.`);
      break;
    }
    case 'notif-todas': {
      let ok = true;
      for (let k = 0; k < AVISOS_DIA.length && ok; k++) ok = await notifPrueba(AVISOS_DIA[k].t, AVISOS_DIA[k].c, 5 + k * 4);
      if (ok) avisar(`Van a llegar las ${AVISOS_DIA.length} variaciones, una cada 4 s.`);
      break;
    }
    case 'notif-resumen': {
      if (await notifPrueba(AVISO_RESUMEN.t, AVISO_RESUMEN.c, 5)) avisar('El aviso del resumen mensual llega en 5 s.');
      break;
    }
    case 'notif-ver': {
      const P = plugNotif();
      if (!P) { await soloAviso('Programadas', 'En el navegador no hay recordatorios programados: sólo existen en el APK.'); break; }
      try {
        const { notifications = [] } = await P.getPending();
        const fmt = n => {
          const s = n.schedule || {};
          if (s.on) {
            const dias = ['', 'dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
            const hora = `${String(s.on.hour ?? 0).padStart(2, '0')}:${String(s.on.minute ?? 0).padStart(2, '0')}`;
            return s.on.weekday ? `cada ${dias[s.on.weekday]} ${hora}` : s.on.day ? `cada día ${s.on.day} ${hora}` : `todos los días ${hora}`;
          }
          return s.at ? new Date(s.at).toLocaleString('es-AR') : '—';
        };
        await soloAviso(`Programadas: ${notifications.length}`,
          notifications.length ? notifications.map(n => `${fmt(n)} — ${n.title}`) : ['No hay ninguna. ¿Están activados los recordatorios en Ajustes?']);
      } catch (e) { await soloAviso('No pude leerlas', String(e && e.message || e)); }
      break;
    }
    case 'notif-reprogramar':
      await programarRecordatorios();
      avisar(db.ajustes.avisos ? 'Recordatorios reprogramados' : 'Los recordatorios están apagados en Ajustes');
      break;
    case 'notif-permiso':
      db.ajustes.avisosPedidos = false;
      guardar();
      await iniciarAvisos();
      break;
    case 'resumen-mes': {
      const ym = mesSumar(mesDeISO(hoyISO()), -1);
      cerrarHoja('sheetAdmin'); cerrarHoja('sheetSet');
      setTimeout(() => {
        if (!abrirResumenMes(ym)) {
          // sin datos el mes pasado: el del mes que se está mirando
          abrirResumenMes(mesSel);
        }
      }, 260);
      break;
    }
    case 'primer-dia':
      delete db.ajustes.resumenVisto;
      guardar();
      cerrarHoja('sheetAdmin'); cerrarHoja('sheetSet');
      iniciarResumenMensual({ forzar: true });
      break;
    case 'version':
      db.ajustes.versionNueva = { version: '9.9', apk: 'https://github.com/matumir/mis-gastos-apk/releases/latest', nota: 'versión de prueba del modo administrador' };
      delete db.ajustes.versionPospuesta;
      guardar();
      cerrarHoja('sheetAdmin'); cerrarHoja('sheetSet');
      irA('resumen');
      pintarAvisoVersion();
      avisar('Aviso de versión simulado en el Resumen');
      break;
    case 'version-limpiar':
      delete db.ajustes.versionNueva; delete db.ajustes.versionPospuesta;
      guardar(); pintarAvisoVersion();
      avisar('Aviso de versión quitado');
      break;
    case 'copia':
      window.__adminForzarAvisoCopia = true;
      cerrarHoja('sheetAdmin'); cerrarHoja('sheetSet');
      irA('resumen');
      pintarAvisoCopia();
      avisar('Aviso de copia de seguridad mostrado');
      break;
    case 'fijos': {
      const n = correrFijos();
      renderTodo();
      avisar(n ? `Se cargaron ${n} movimiento${n === 1 ? '' : 's'} fijo${n === 1 ? '' : 's'}` : 'No había fijos pendientes');
      break;
    }
    case 'sonidos': {
      const lista = Sonido.nombres;
      lista.forEach((nombre, k) => setTimeout(() => { Sonido.tocar(nombre); avisar(`Sonido: ${nombre}`); }, k * 700));
      break;
    }
    case 'salir': {
      const si = await confirmar('Salir del modo administrador',
        licencia ? 'Se oculta el panel de pruebas. Tu licencia Premium sigue activa. Para volver, escribí el código otra vez.'
                 : 'Se oculta el panel de pruebas y se quita el Premium del modo administrador (no tenés una licencia cargada). Para volver, escribí el código otra vez.', 'Salir');
      if (!si) break;
      Admin.desactivar();
      cerrarHoja('sheetAdmin');
      aplicarPlan();
      pintarAdmin();
      avisar('Modo administrador desactivado');
      break;
    }
  }
}

function pintarAdmin() {
  const fila = $('#filaAdmin');
  if (fila) fila.hidden = !Admin.activo();
  const sw = $('#adminGratis');
  if (sw) sw.checked = Admin.forzarGratis();
  const info = $('#adminInfo');
  if (info && Admin.activo()) {
    let bytes = 0;
    try { bytes = (localStorage.getItem(CLAVE) || '').length; } catch (e) { /* nada */ }
    info.innerHTML = [
      `BETA ${APP_VER} · ${esNativo ? 'APK' : 'navegador'}`,
      `Plan: ${esPremium() ? 'Premium' : 'Gratis'}${Admin.forzarGratis() ? ' (forzado para probar)' : licencia ? '' : ' (por modo administrador)'}${licencia && licencia.id ? ` · licencia ${esc(licencia.id)}` : ''}`,
      `${db.movimientos.length} movimientos · ${(db.fijos || []).length} fijos · ${db.categorias.length} categorías · ${db.cajas.length} cajas`,
      `Datos guardados: ${(bytes / 1024).toFixed(1)} KB`,
      `Recordatorios: ${puedeRecordar() ? (db.ajustes.avisos ? 'activados' : 'apagados') : 'no disponibles en el navegador'}`
    ].map(l => `<span>${l}</span>`).join('');
  }
}

function abrirAdmin() {
  if (!Admin.activo()) return;
  pintarAdmin();
  abrirHoja('sheetAdmin');
}

function conectarAdmin() {
  $('#btnAdmin').addEventListener('click', abrirAdmin);
  $('#sheetAdminClose').addEventListener('click', () => cerrarHoja('sheetAdmin'));
  $('#sheetAdminBack').addEventListener('click', () => cerrarHoja('sheetAdmin'));
  $$('[data-admin]').forEach(b => b.addEventListener('click', () => adminAccion(b.dataset.admin)));
  $('#adminGratis').addEventListener('change', e => {
    Admin.setForzarGratis(e.target.checked);
    aplicarPlan();
    pintarAdmin();
    avisar(e.target.checked ? 'Viendo la app como plan Gratis' : 'Plan real restaurado');
  });
  pintarAdmin();
}
