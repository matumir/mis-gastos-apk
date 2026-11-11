/* =========================================================
   Mis Gastos — detectar movimientos

   Dos lecturas, las dos en el teléfono:

   1. El aviso de una billetera o de un banco ("Transferiste $ 3.000 a
      Juan Pérez") → un egreso o un ingreso para confirmar.
   2. El texto de un comprobante de transferencia (leído de la imagen
      por el escáner de tickets) → lo mismo.

   Acá sólo hay funciones puras: reciben texto y devuelven datos. Se
   prueban sin teléfono. Quién les trae el texto (el servicio que lee
   las notificaciones en Android, el escáner) está en app.js.

   Los formatos de los avisos los decide cada billetera y los cambia
   cuando quiere. Por eso no se busca una frase exacta de cada app sino
   el verbo ("transferiste", "te enviaron", "compra aprobada"…), un
   monto con signo de moneda y, si está, el nombre de la otra parte.
   Lo que no cierra se descarta: mejor perder un aviso que inventar un
   gasto.
   ========================================================= */
(function (global) {
  'use strict';

  /* Las apps que se leen. La clave es el identificador del paquete en
     Android (verificados contra Google Play); el valor, cómo se la nombra
     en pantalla. Mercado Libre queda afuera a propósito: sus pagos ya los
     avisa Mercado Pago y saldrían dos veces. */
  const APPS = {
    'com.mercadopago.wallet': 'Mercado Pago',
    'ar.com.bancar.uala': 'Ualá',
    'com.tarjetanaranja.ncuenta': 'Naranja X',
    'com.brubank': 'Brubank',
    'ar.com.personalpay': 'Personal Pay',
    'com.applemoncash': 'Lemon',
    'com.playdigital.modo': 'MODO',
    'ar.com.bancoprovincia.CuentaDNI': 'Cuenta DNI',
    'air.PrexArgentina': 'Prex',
    'com.belo.android': 'belo',
    'com.astropaycard.android': 'AstroPay',
    'com.fiwind.app': 'Fiwind',
    'com.ar.claropay.app': 'Claro Pay',
    'com.rebanking': 'Reba',
    'com.mosync.app_Banco_Galicia': 'Galicia',
    'ar.com.santander.rio.mbanking': 'Santander',
    'com.bbva.nxt_argentina': 'BBVA',
    'com.macro.banco.ar': 'Macro',
    'ar.com.bna.digital': 'BNA+',
    'ar.bapro': 'Banco Provincia',
    'com.icbc.mobile.abroadARG': 'ICBC',
    'com.supervielle': 'Supervielle',
    'coop.bancocredicoop.credicoop': 'Credicoop',
    'ar.com.bcopatagonia.android': 'Banco Patagonia',
    'ar.com.redlink.custom': 'Banco Ciudad',
    'ar.com.bdsol.bds': 'Banco del Sol',
    'com.hipotecario.mobile': 'Banco Hipotecario',
    'ar.com.comafi.app.hbi.prod': 'Comafi'
  };

  /* ---------------------------------------------------------
     Texto
     --------------------------------------------------------- */
  const sinAcentos = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => sinAcentos(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const p2 = n => String(n).padStart(2, '0');
  const isoDe = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

  /* ---------------------------------------------------------
     Montos: "$ 5.000"  "$1.500,50"  "US$ 20"  "ARS 12.345,67"
     --------------------------------------------------------- */
  function numeroAr(s) {
    let t = String(s).replace(/\s/g, '');
    // "15.00000": los centavos en chiquito de algunos comprobantes quedan
    // pegados al número cuando los lee el OCR.
    const pegado = t.match(/^(\d{1,3}(?:\.\d{3})+)(\d{2})$/);
    if (pegado) t = pegado[1] + ',' + pegado[2];
    const ult = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
    let entero = t, dec = '';
    if (ult >= 0) {
      const tras = t.slice(ult + 1);
      if (/^\d{1,2}$/.test(tras)) { entero = t.slice(0, ult); dec = tras; }
    }
    entero = entero.replace(/[.,]/g, '');
    if (!/^\d+$/.test(entero)) return null;
    const n = Number(entero + (dec ? '.' + dec : ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  const RE_PLATA = /(US\$|U\$S|U\$D|USD|ARS|\$)\s{0,2}(\d[\d.,]*\d|\d)/gi;

  /** Todos los montos con signo de moneda, en el orden en que aparecen. */
  function montosCon(texto) {
    const out = [];
    let m;
    RE_PLATA.lastIndex = 0;
    while ((m = RE_PLATA.exec(texto))) {
      const valor = numeroAr(m[2]);
      if (valor == null || valor <= 0) continue;
      // "CA $ 4001234-5": un número de cuenta, no un importe
      if (/^\s?[-/]\d/.test(texto.slice(RE_PLATA.lastIndex, RE_PLATA.lastIndex + 3))) continue;
      const signo = m[1].toUpperCase();
      out.push({ valor, moneda: signo === '$' || signo === 'ARS' ? 'ARS' : 'USD', indice: m.index });
    }
    return out;
  }

  /* ---------------------------------------------------------
     Qué pasó: la frase que aparece primero manda
     --------------------------------------------------------- */
  const FRASES = [
    // plata que salió: transferencias
    ['transferiste', 'egreso', 'transferencia'], ['le transferiste', 'egreso', 'transferencia'],
    ['enviaste', 'egreso', 'transferencia'], ['le enviaste', 'egreso', 'transferencia'],
    ['transferencia enviada', 'egreso', 'transferencia'], ['transferencia realizada', 'egreso', 'transferencia'],
    ['transferencia exitosa', 'egreso', 'transferencia'], ['tu transferencia', 'egreso', 'transferencia'],
    ['hiciste una transferencia', 'egreso', 'transferencia'], ['realizaste una transferencia', 'egreso', 'transferencia'],
    ['envio de dinero', 'egreso', 'transferencia'], ['dinero enviado', 'egreso', 'transferencia'],
    // plata que salió: pagos y compras
    ['pagaste', 'egreso', 'pago'], ['compraste', 'egreso', 'pago'], ['abonaste', 'egreso', 'pago'],
    ['pago aprobado', 'egreso', 'pago'], ['pago realizado', 'egreso', 'pago'], ['pago exitoso', 'egreso', 'pago'],
    ['tu pago', 'egreso', 'pago'], ['hiciste un pago', 'egreso', 'pago'], ['realizaste un pago', 'egreso', 'pago'],
    ['tu compra', 'egreso', 'pago'], ['compra aprobada', 'egreso', 'pago'], ['compra realizada', 'egreso', 'pago'],
    ['compra exitosa', 'egreso', 'pago'], ['compra por', 'egreso', 'pago'], ['compra con', 'egreso', 'pago'],
    ['compra en', 'egreso', 'pago'], ['hiciste una compra', 'egreso', 'pago'], ['realizaste una compra', 'egreso', 'pago'],
    ['consumo', 'egreso', 'pago'], ['recargaste', 'egreso', 'pago'], ['recarga exitosa', 'egreso', 'pago'],
    // plata que salió: débitos y extracciones
    ['se debito', 'egreso', 'debito'], ['se debitaron', 'egreso', 'debito'], ['debitamos', 'egreso', 'debito'],
    ['debito automatico', 'egreso', 'debito'], ['debito de', 'egreso', 'debito'], ['te cobramos', 'egreso', 'debito'],
    ['se desconto', 'egreso', 'debito'], ['descontamos', 'egreso', 'debito'],
    ['extrajiste', 'egreso', 'retiro'], ['retiraste', 'egreso', 'retiro'], ['extraccion', 'egreso', 'retiro'],
    // plata que entró
    ['recibiste', 'ingreso', 'transferencia'], ['te transfirio', 'ingreso', 'transferencia'],
    ['te transfirieron', 'ingreso', 'transferencia'], ['te envio', 'ingreso', 'transferencia'],
    ['te enviaron', 'ingreso', 'transferencia'], ['transferencia recibida', 'ingreso', 'transferencia'],
    ['dinero recibido', 'ingreso', 'transferencia'], ['ingresaron', 'ingreso', 'transferencia'],
    ['ingreso de dinero', 'ingreso', 'transferencia'], ['te depositaron', 'ingreso', 'transferencia'],
    ['te deposito', 'ingreso', 'transferencia'], ['deposito recibido', 'ingreso', 'transferencia'],
    ['te llegaron', 'ingreso', 'transferencia'], ['te llego', 'ingreso', 'transferencia'],
    ['te pago', 'ingreso', 'cobro'], ['te pagaron', 'ingreso', 'cobro'], ['cobraste', 'ingreso', 'cobro'],
    ['pago recibido', 'ingreso', 'cobro'], ['cobro recibido', 'ingreso', 'cobro'], ['recibiste un pago', 'ingreso', 'cobro'],
    ['se acredito', 'ingreso', 'acreditacion'], ['se acreditaron', 'ingreso', 'acreditacion'],
    ['acreditamos', 'ingreso', 'acreditacion'], ['te acreditamos', 'ingreso', 'acreditacion'],
    ['acreditacion', 'ingreso', 'acreditacion'],
    ['te devolvimos', 'ingreso', 'devolucion'], ['te reintegramos', 'ingreso', 'devolucion'],
    ['devolucion', 'ingreso', 'devolucion'], ['reintegro', 'ingreso', 'devolucion'],
    ['ganaste', 'ingreso', 'rendimiento'], ['rendimientos', 'ingreso', 'rendimiento']
  ].map(([frase, tipo, clase]) => ({
    tipo, clase, largo: frase.length,
    re: new RegExp('\\b' + frase.replace(/ /g, '\\s+') + '\\b')
  }));

  /* Lo que suena a movimiento pero no lo es: un pago que no salió, un
     vencimiento, un pedido de plata, una promoción. Con cualquiera de
     estas el aviso se descarta. */
  const NO_ES = new RegExp('\\b(' + [
    'rechaz\\w*', 'no pudimos', 'no se pudo', 'no pudo', 'fall[oó]', 'fallid\\w*', 'pendiente\\w*',
    'cancelad\\w*', 'anulad\\w*', 'revers\\w*', 'venc\\w*', 'recorda\\w*',
    'te pidio', 'te pide', 'te solicito', 'solicitud\\w*', 'pedido de dinero',
    'autoriza', 'autorizar', 'confirma', 'confirmar', 'intent\\w*',
    'descuento\\w*', 'ahorra', 'aprovecha', 'sorteo\\w*', 'promo\\w*', 'oferta\\w*', 'beneficio\\w*',
    'prestamo\\w*', 'prestamos', 'credito disponible', 'limite\\w*', 'tope\\w*', 'cuotas sin interes',
    'podes', 'podras', 'queres', 'invita\\w*', 'gana', 'pedi', 'conoce', 'descubri'
  ].join('|') + ')\\b');
  const HASTA_MONTO = /\bhasta\s+(?:us\$|u\$s|usd|ars|\$)/;

  function queEs(texto) {
    const n = norm(texto);
    if (NO_ES.test(n) || HASTA_MONTO.test(n)) return null;
    let mejor = null;
    for (const f of FRASES) {
      const m = f.re.exec(n);
      if (!m) continue;
      // gana la que aparece antes; a igual lugar, la frase más larga
      if (!mejor || m.index < mejor.indice || (m.index === mejor.indice && f.largo > mejor.largo)) {
        mejor = { tipo: f.tipo, clase: f.clase, indice: m.index, largo: f.largo };
      }
    }
    return mejor;
  }

  /* ---------------------------------------------------------
     La otra parte: a quién o de quién

     Los nombres llegan con mayúscula inicial o todo en mayúsculas. Se
     toman palabras que empiezan con mayúscula (con "de", "del", "la" en
     el medio) hasta que aparece una palabra común, un número o un punto.
     --------------------------------------------------------- */
  const CONECTOR = /^(de|del|la|las|los|y|e|da|do|dos|di|van|von)$/i;
  const NO_NOMBRE = /^(tu|tus|su|sus|mi|un|una|el|la|los|las|mercado pago|cuenta|cvu|cbu|alias|dinero|pesos|hoy|ayer|efectivo|qr|visa|mastercard|debito|credito|tarjeta|terminada|cuotas?)$/i;

  function nombreDesde(resto) {
    // corta en la primera puntuación fuerte
    const tramo = resto.split(/[.,;:!¡?¿|()\n\r•·—–]/)[0];
    const palabras = tramo.trim().split(/\s+/).filter(Boolean);
    const out = [];
    for (const w of palabras) {
      if (out.length >= 6) break;
      if (/\d/.test(w) || /[$#@*/\\]/.test(w)) break;
      if (CONECTOR.test(w) && out.length) { out.push(w.toLowerCase()); continue; }
      if (!/^\p{Lu}/u.test(w)) break;
      out.push(w);
    }
    while (out.length && CONECTOR.test(out[out.length - 1])) out.pop();
    if (!out.length) return '';
    let nombre = out.join(' ').replace(/['"«»]/g, '').trim();
    if (nombre.replace(/[^\p{L}]/gu, '').length < 2 || NO_NOMBRE.test(sinAcentos(nombre))) return '';
    // "JUAN PEREZ" → "Juan Perez". Las siglas cortas (YPF, OSDE) quedan.
    const propias = out.filter(w => !CONECTOR.test(w)).join(' ');
    if (propias === propias.toUpperCase() && nombre.length > 4) {
      nombre = nombre.toLowerCase().replace(/(^|[\s.&'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
        .replace(/\b(De|Del|La|Las|Los|Y)\b/g, x => x.toLowerCase());
    }
    return nombre.slice(0, 50);
  }

  /** Busca un nombre después de alguna de las preposiciones dadas. */
  function nombreTras(texto, preposiciones) {
    const re = new RegExp('(?:^|[\\s(«"])(?:' + preposiciones.join('|') + ')\\s+(?=\\p{Lu})', 'giu');
    let m;
    while ((m = re.exec(texto))) {
      const nombre = nombreDesde(texto.slice(m.index + m[0].length));
      if (nombre) return nombre;
    }
    return '';
  }

  /** "Juan Pérez te envió…": el nombre va antes del verbo. */
  function nombreAntesDe(texto) {
    const m = /((?:\p{Lu}[\p{L}.'-]*)(?:\s+(?:\p{Lu}[\p{L}.'-]*|de|del|la|los|las|y)){0,5})\s+te\s+(?:transfiri[oó]|envi[oó]|pag[oó]|deposit[oó]|mand[oó])/u.exec(texto);
    return m ? nombreDesde(m[1]) : '';
  }

  function otraParte(texto, tipo, clase) {
    if (tipo === 'ingreso') {
      return nombreAntesDe(texto) || nombreTras(texto, ['de parte de', 'de', 'desde']);
    }
    if (clase === 'transferencia') return nombreTras(texto, ['a', 'para']) || nombreTras(texto, ['en']);
    return nombreTras(texto, ['en', 'a', 'de']);
  }

  function describir(tipo, clase, contraparte, app) {
    const con = app ? ` con ${app}` : '';
    if (tipo === 'egreso') {
      if (clase === 'transferencia') return contraparte ? `Transferencia a ${contraparte}` : 'Transferencia enviada';
      if (clase === 'retiro') return 'Extracción de efectivo';
      if (clase === 'debito') return contraparte || 'Débito automático';
      return contraparte || `Pago${con}`;
    }
    if (clase === 'devolucion') return contraparte ? `Devolución de ${contraparte}` : 'Devolución';
    if (clase === 'rendimiento') return app ? `Rendimientos de ${app}` : 'Rendimientos';
    if (clase === 'cobro') return contraparte ? `Cobro de ${contraparte}` : 'Cobro recibido';
    if (clase === 'acreditacion') return contraparte ? `Acreditación de ${contraparte}` : 'Acreditación';
    return contraparte ? `Transferencia de ${contraparte}` : 'Transferencia recibida';
  }

  /**
   * Un aviso → movimiento, o null si no es un movimiento de plata.
   * `aviso`: { paquete?, titulo?, texto? }
   */
  function deAviso(aviso) {
    if (!aviso) return null;
    const app = APPS[aviso.paquete] || aviso.app || '';
    const titulo = String(aviso.titulo || '').trim();
    const cuerpo = String(aviso.texto || '').trim();
    // El título suele repetirse dentro del texto: una sola vez alcanza.
    const completo = !titulo ? cuerpo : !cuerpo || norm(cuerpo).includes(norm(titulo)) ? (cuerpo || titulo)
      : `${titulo}. ${cuerpo}`;
    if (!completo) return null;

    const que = queEs(completo);
    if (!que) return null;
    const montos = montosCon(completo);
    if (!montos.length) return null;
    const m = montos[0];
    const contraparte = otraParte(completo, que.tipo, que.clase);

    return {
      tipo: que.tipo,
      clase: que.clase,
      monto: m.valor,
      moneda: m.moneda,
      contraparte,
      descripcion: describir(que.tipo, que.clase, contraparte, app),
      app,
      texto: completo.replace(/\s+/g, ' ').slice(0, 240)
    };
  }

  /* ---------------------------------------------------------
     Fechas de comprobante: "04/11/2026", "4 de noviembre de 2026",
     "04 nov 2026", "4/nov/2026"
     --------------------------------------------------------- */
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function fechaValida(a, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const f = new Date(a, m - 1, d);
    if (f.getFullYear() !== a || f.getMonth() !== m - 1 || f.getDate() !== d) return null;
    return `${a}-${p2(m)}-${p2(d)}`;
  }

  function fechaDeTexto(texto, hoy = new Date()) {
    const n = norm(texto);
    const cands = [];
    let m;
    const numerica = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})\b/g;
    while ((m = numerica.exec(n))) {
      let a = Number(m[3]);
      if (a < 100) a += 2000;
      cands.push([m.index, fechaValida(a, Number(m[2]), Number(m[1]))]);
    }
    const escrita = /\b(\d{1,2})\s*(?:de\s+|[\/\-.\s])\s*(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]*\.?\s*(?:de\s+|del\s+|[\/\-.\s])\s*(\d{4}|\d{2})\b/g;
    while ((m = escrita.exec(n))) {
      let a = Number(m[3]);
      if (a < 100) a += 2000;
      const mes = m[2] === 'set' ? 9 : MESES.indexOf(m[2]) + 1;
      cands.push([m.index, fechaValida(a, mes, Number(m[1]))]);
    }
    const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
    while ((m = iso.exec(n))) cands.push([m.index, fechaValida(Number(m[1]), Number(m[2]), Number(m[3]))]);

    const limite = new Date(hoy); limite.setFullYear(limite.getFullYear() - 2);
    const min = isoDe(limite), max = isoDe(hoy);
    const buena = cands.filter(c => c[1] && c[1] <= max && c[1] >= min).sort((a, b) => a[0] - b[0])[0];
    return buena ? buena[1] : null;
  }

  /* ---------------------------------------------------------
     Comprobante de transferencia (texto leído de la imagen)
     --------------------------------------------------------- */
  const SENIAL_FUERTE = /\b(cvu|cbu|coelsa|transferencia|transferiste|le transferiste|enviaste|te transfirio|te transfirieron|dinero enviado|dinero recibido|numero de operacion|nro\.? de operacion|n° de operacion|id de operacion|codigo de identificacion|comprobante de pago|pago realizado|pagaste)\b/;
  // Un ticket de compra: tiene TOTAL y renglones de productos o impuestos.
  const ES_TICKET = /\b(sub\s*-?\s*total|iva|cant\.?|unidades|articulos|vuelto|cajero|ticket|tique)\b/;

  const ETIQUETA_DESTINO = /^(para|a|destinatario|destino|beneficiario|cuenta destino|titular destino|receptor|quien recibe)\s*:?\s*/i;
  const ETIQUETA_ORIGEN = /^(de|desde|origen|remitente|ordenante|cuenta origen|titular origen|emisor|quien envia|quien envía)\s*:?\s*/i;
  const NO_ES_PERSONA = /\b(cvu|cbu|cuit|cuil|dni|alias|banco|cuenta|caja de ahorro|mercado pago|operacion|comprobante|codigo|numero|fecha|hora|motivo|concepto|referencia|importe|monto|total)\b/;

  function nombreDeRenglon(s) {
    const limpio = String(s || '').replace(/[^\p{L}\s.'&-]/gu, ' ').replace(/\s+/g, ' ').trim();
    if (limpio.replace(/[^\p{L}]/gu, '').length < 3) return '';
    if (NO_ES_PERSONA.test(norm(limpio))) return '';
    if (limpio.split(' ').length > 7) return '';
    const titulo = limpio.toLowerCase().replace(/(^|[\s.&'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
      .replace(/\b(De|Del|La|Las|Los|Y)\b/g, x => x.toLowerCase());
    return titulo.slice(0, 50);
  }

  /** El nombre que acompaña a una etiqueta: en el mismo renglón o abajo. */
  function nombreDeEtiqueta(lineas, etiqueta) {
    for (let i = 0; i < lineas.length; i++) {
      const m = etiqueta.exec(lineas[i]);
      if (!m) continue;
      const resto = lineas[i].slice(m[0].length);
      // "De" a secas puede ser el comienzo de una frase: se pide que el
      // renglón sea la etiqueta sola, o la etiqueta con dos puntos.
      const sola = !resto.trim();
      const conPuntos = /:\s*$/.test(m[0]);
      if (!sola && !conPuntos && !/^(destinatario|beneficiario|remitente|ordenante|para)\b/i.test(lineas[i])) continue;
      const cand = sola ? nombreDeRenglon(lineas[i + 1]) : nombreDeRenglon(resto);
      if (cand) return cand;
    }
    return '';
  }

  /** ¿El texto tiene pinta de comprobante de transferencia (y no de ticket)? */
  function pareceComprobante(texto) {
    const n = norm(texto);
    return SENIAL_FUERTE.test(n) && !(/\bt[o0]tal\b/.test(n) && ES_TICKET.test(n));
  }

  /**
   * Texto de un comprobante → movimiento, o null si no parece un
   * comprobante de transferencia o de pago.
   */
  function deComprobante(texto, hoy = new Date()) {
    const crudo = String(texto || '');
    const n = norm(crudo);
    if (!pareceComprobante(crudo)) return null;

    let montos = montosCon(crudo);
    if (!montos.length) {
      // sin signo de moneda legible: un número con forma de importe
      const re = /(?:^|[^\d.,])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2})(?![\d.,])/g;
      let m;
      while ((m = re.exec(crudo))) {
        const valor = numeroAr(m[1]);
        if (valor != null && valor > 0) montos.push({ valor, moneda: 'ARS', indice: m.index });
      }
    }
    if (!montos.length) return null;
    // Si hay varios (importe, comisión, impuestos), el más grande es el total.
    const m = montos.reduce((a, b) => (b.valor > a.valor ? b : a));

    const ingreso = /\b(recibiste|te transfirio|te transfirieron|te envio|te enviaron|dinero recibido|transferencia recibida|te pagaron|te pago|cobraste)\b/.test(n);
    const tipo = ingreso ? 'ingreso' : 'egreso';
    const esPago = /\b(pagaste|pago realizado|comprobante de pago|pago de servicio|pago exitoso)\b/.test(n) &&
      !/\btransfer/.test(n);

    const lineas = crudo.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let contraparte = nombreDeEtiqueta(lineas, tipo === 'egreso' ? ETIQUETA_DESTINO : ETIQUETA_ORIGEN);
    if (!contraparte) contraparte = otraParte(crudo.replace(/\n/g, '. '), tipo, esPago ? 'pago' : 'transferencia');

    const descripcion = tipo === 'egreso'
      ? (esPago ? (contraparte ? `Pago a ${contraparte}` : 'Pago') : (contraparte ? `Transferencia a ${contraparte}` : 'Transferencia enviada'))
      : (contraparte ? `Transferencia de ${contraparte}` : 'Transferencia recibida');

    return {
      origen: 'comprobante',
      tipo,
      clase: esPago ? 'pago' : 'transferencia',
      monto: m.valor,
      moneda: m.moneda,
      contraparte,
      descripcion,
      fecha: fechaDeTexto(crudo, hoy),
      texto: crudo
    };
  }

  /** Texto suelto (lo que se comparte como texto): aviso o comprobante. */
  function deTexto(texto, hoy = new Date()) {
    const a = deAviso({ texto });
    if (a) return { origen: 'texto', fecha: fechaDeTexto(texto, hoy), ...a };
    return deComprobante(texto, hoy);
  }

  global.Detectar = { APPS, deAviso, deComprobante, pareceComprobante, deTexto, fechaDeTexto, montosCon, numeroAr };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Detectar;
})(typeof window !== 'undefined' ? window : globalThis);
