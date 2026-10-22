/* =========================================================
   Mis Gastos — licencia.js

   Verifica licencias SIN servidor y sin internet.

   Cómo funciona, en criollo: cada licencia es un texto corto con dos
   partes, los datos (quién es el cliente, qué plan tiene, hasta cuándo)
   y una firma digital hecha con una clave privada que sólo tiene el
   dueño del sistema. La app lleva adentro la clave pública, que sirve
   para comprobar la firma pero no para crearla. Así, nadie puede
   fabricarse una licencia editando el texto: cambiar una sola letra
   invalida la firma.

   Lo que esto NO es: una protección perfecta. Alguien con conocimientos
   puede abrir el APK y saltear la verificación. Para eso haría falta un
   servidor. Para un público de comercios, el riesgo es bajo y el costo
   de un servidor no se justifica todavía.

   La licencia se guarda en su propia clave de almacenamiento, aparte de
   los datos. Es a propósito: así NO viaja dentro de las copias de
   seguridad, y un cliente no puede pasarle su licencia a otro
   mandándole una copia de sus datos.
   ========================================================= */
(function (raiz) {
  'use strict';

  /* La clave pública. La genera `generar-claves.js` y se pega acá.
     No es secreta: sólo permite verificar. */
  const CLAVE_PUBLICA = {"kty":"EC","crv":"P-256","x":"9cyudTRflOjq35y0Ic3qSTlwyTNNthVE-MMXeXyqHxA","y":"fIn_jKyI2-zwWn6DCkkvzKfRk0lkjxmMYAQ8ShGQuZU"};

  const PREFIJO = 'MG1';          // versión del formato de licencia
  const CLAVE_GUARDADO = 'misgastos.lic';
  const DIAS_GRACIA = 7;          // margen después del vencimiento
  const DIAS_AVISO = 7;           // desde cuándo avisar que se vence

  const EDICIONES = ['per', 'neg'];   // personal (pago único) y negocio (suscripción)

  /* ---------------------------------------------------------
     Texto ↔ bytes
     --------------------------------------------------------- */

  function b64urlABytes(s) {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesAB64url(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  const aBytes = s => new TextEncoder().encode(s);
  const deBytes = b => new TextDecoder().decode(b);

  /* ---------------------------------------------------------
     Leer el texto de la licencia

     Llega pegado de un WhatsApp o de un mail, así que puede venir con
     saltos de línea, espacios de más o el prefijo en minúscula. Nada de
     eso debería hacer fallar la licencia de un cliente que pagó.
     --------------------------------------------------------- */

  function partir(texto) {
    const limpio = String(texto == null ? '' : texto).replace(/\s+/g, '');
    if (!limpio) throw new Error('Pegá el código de la licencia.');

    const partes = limpio.split('.');
    const pref = partes[0];

    /* Primero el prefijo: si lo que pegaron no es ni siquiera una licencia,
       conviene decirlo así en lugar de hablarle de partes que faltan. */
    if (!/^MG\d+$/i.test(pref)) throw new Error('Ese código no es una licencia de Mis Gastos.');
    if (pref.toUpperCase() !== PREFIJO) {
      throw new Error('Esa licencia es de una versión más nueva de la app. Actualizá la app.');
    }
    if (partes.length !== 3) throw new Error('Ese código está incompleto o le sobra algo.');

    const [, payload, firma] = partes;
    if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(firma)) {
      throw new Error('Ese código tiene caracteres que no corresponden.');
    }
    return { payload, firma };
  }

  /** Valida la forma de los datos. Una licencia con campos raros se
      rechaza aunque la firma esté bien: puede ser de un formato futuro. */
  function leerDatos(payloadB64) {
    let d;
    try { d = JSON.parse(deBytes(b64urlABytes(payloadB64))); }
    catch (e) { throw new Error('No pude leer los datos de la licencia.'); }
    if (!d || typeof d !== 'object') throw new Error('No pude leer los datos de la licencia.');

    const ed = d.ed;
    if (!EDICIONES.includes(ed)) throw new Error('Esa licencia es de un plan que esta versión no conoce.');

    const exp = d.exp == null ? null : String(d.exp);
    if (exp !== null && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) {
      throw new Error('Esa licencia tiene una fecha de vencimiento ilegible.');
    }

    return {
      id: d.id ? String(d.id).slice(0, 40) : '',
      ed,
      nombre: d.nom ? String(d.nom).slice(0, 60) : '',
      exp,
      emitida: d.emi ? String(d.emi) : '',
      plan: d.pl ? String(d.pl).slice(0, 20) : ''
    };
  }

  /* ---------------------------------------------------------
     Verificar la firma
     --------------------------------------------------------- */

  const sub = () => (raiz.crypto && raiz.crypto.subtle) || null;
  let clavePromesa = null;

  function clave() {
    if (!clavePromesa) {
      const s = sub();
      if (!s) return Promise.reject(new Error('Este dispositivo no puede verificar licencias.'));
      clavePromesa = s.importKey('jwk', CLAVE_PUBLICA,
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    }
    return clavePromesa;
  }

  /** Devuelve los datos de la licencia, o tira un Error con un mensaje
      que se le puede mostrar al cliente tal cual. */
  async function verificar(texto) {
    const { payload, firma } = partir(texto);
    const datos = leerDatos(payload);        // antes de la firma: mejor mensaje de error

    let ok = false;
    try {
      ok = await sub().verify({ name: 'ECDSA', hash: 'SHA-256' },
        await clave(), b64urlABytes(firma), aBytes(payload));
    } catch (e) {
      throw new Error('No pude verificar la licencia en este dispositivo.');
    }
    if (!ok) throw new Error('Esa licencia no es válida. Revisá que esté completa y sin cambios.');
    return datos;
  }

  /* ---------------------------------------------------------
     Estado

     Función pura: con los mismos datos y la misma fecha da siempre lo
     mismo. Eso la hace fácil de probar.
     --------------------------------------------------------- */

  const diasEntre = (desde, hasta) =>
    Math.round((new Date(`${hasta}T00:00:00`) - new Date(`${desde}T00:00:00`)) / 86400000);

  /**
   * modo:
   *   libre    → sin licencia. La app sirve igual, con lo básico.
   *   activa   → licencia vigente (o perpetua, del pago único).
   *   gracia   → se venció hace poco; sigue funcionando entera.
   *   vencida  → se terminó el margen.
   */
  function estado(lic, hoy) {
    if (!lic) return { modo: 'libre', edicion: 'per', nombre: '', plan: '', exp: null, dias: null, soloLectura: false, avisar: false };

    const base = { edicion: lic.ed, nombre: lic.nombre, plan: lic.plan, exp: lic.exp, id: lic.id };

    if (lic.exp === null) {
      return { ...base, modo: 'activa', perpetua: true, dias: null, soloLectura: false, avisar: false };
    }

    const dias = diasEntre(hoy, lic.exp);   // >= 0 mientras no se venza

    if (dias >= 0) {
      return { ...base, modo: 'activa', perpetua: false, dias, soloLectura: false, avisar: dias <= DIAS_AVISO };
    }
    if (dias >= -DIAS_GRACIA) {
      return { ...base, modo: 'gracia', perpetua: false, dias, graciaRestante: DIAS_GRACIA + dias, soloLectura: false, avisar: true };
    }

    /* Vencida. Sólo la edición de negocio pasa a lectura: lo que el cliente
       cargó siempre se puede ver y exportar, nunca queda secuestrado. */
    return { ...base, modo: 'vencida', perpetua: false, dias, soloLectura: lic.ed === 'neg', avisar: true };
  }

  /* ---------------------------------------------------------
     Qué habilita cada plan

     Por ahora casi todo es libre: la app que ya está en la calle no se
     vuelve paga de un día para el otro. Las funciones nuevas que sean
     pagas se agregan a esta tabla y se consultan con `permite()`.
     --------------------------------------------------------- */

  const FUNCIONES = {
    // nombre          : planes que la habilitan
    fijos              : ['per', 'neg'],   // movimientos fijos mensuales
    presupuestos       : ['per', 'neg'],   // tope por categoría y aviso
    metas              : ['per', 'neg'],   // objetivos en las cajas de ahorro
    comparar           : ['per', 'neg'],   // comparar contra meses anteriores
    filtros            : ['per', 'neg'],   // buscar y filtrar en todo el historial
    escaner            : ['per', 'neg'],   // leer tickets con la cámara (QR + OCR local)
    divisas            : ['per', 'neg'],   // billetera en dólares, separada de la de pesos
    exportarPlanilla   : ['neg'],          // Excel/PDF: queda para el sistema de negocios
    cuentaCorriente    : ['neg'],
    multiusuario       : ['neg']
  };

  /* ---------------------------------------------------------
     Cupos del plan gratis

     Cuántas categorías y cajas puede tener alguien que no pagó. Premium
     las deja ilimitadas. Estos tres números son la bisagra entre lo
     gratis y lo pago: cambiarlos acá los cambia en toda la app.

     Están pensados junto con las categorías que trae la app: arranca con
     exactamente 6 y 3, así se usa desde el primer día y el tope recién
     aparece cuando alguien quiere armar las suyas.
     --------------------------------------------------------- */

  const LIMITES = {
    catEgreso:  6,
    catIngreso: 3,
    cajas:      3
  };

  /**
   * Estado de un cupo. `usados` es cuántos hay hoy.
   *
   * Ojo con `restantes` cuando es negativo: pasa con quien ya tenía más
   * de la cuenta antes de que existiera el tope. A esa persona no se le
   * saca nada —sería robarle lo que ya armó—, simplemente no puede crear
   * más hasta que borre algunas.
   */
  function cupo(cual, usados, est) {
    const tope = LIMITES[cual];
    if (tope == null) return { ilimitado: true, usados, tope: null, lleno: false, restantes: null };

    // Cualquier licencia vigente libera los cupos.
    const libre = !!est && (est.modo === 'activa' || est.modo === 'gracia');
    if (libre) return { ilimitado: true, usados, tope: null, lleno: false, restantes: null };

    return {
      ilimitado: false,
      usados,
      tope,
      lleno: usados >= tope,
      restantes: tope - usados
    };
  }

  function permite(func, est) {
    const planes = FUNCIONES[func];
    if (!planes) return true;                       // lo que no está en la tabla es libre
    if (!est || est.modo === 'libre') return false;
    if (est.modo === 'vencida') return false;
    return planes.includes(est.edicion);
  }

  /* ---------------------------------------------------------
     Guardado (aparte de los datos, a propósito)
     --------------------------------------------------------- */

  function leerGuardada() {
    try {
      const raw = raiz.localStorage && raiz.localStorage.getItem(CLAVE_GUARDADO);
      if (!raw) return null;
      const g = JSON.parse(raw);
      return g && g.texto ? g : null;
    } catch (e) { return null; }
  }

  function guardarLicencia(texto, datos) {
    try {
      raiz.localStorage.setItem(CLAVE_GUARDADO, JSON.stringify({
        texto: String(texto).replace(/\s+/g, ''), datos, activada: new Date().toISOString()
      }));
      return true;
    } catch (e) { return false; }
  }

  function borrarLicencia() {
    try { raiz.localStorage.removeItem(CLAVE_GUARDADO); } catch (e) {}
  }

  raiz.Lic = {
    PREFIJO, DIAS_GRACIA, DIAS_AVISO, FUNCIONES, LIMITES,
    cupo,
    verificar, estado, permite, partir, leerDatos, diasEntre,
    leerGuardada, guardarLicencia, borrarLicencia,
    bytesAB64url, b64urlABytes
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = raiz.Lic;

})(typeof window !== 'undefined' ? window : globalThis);
