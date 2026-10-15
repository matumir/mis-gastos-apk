/* =========================================================
   Mis Gastos — escáner de tickets
   Todo pasa en el teléfono: la foto no se sube a ningún lado y
   no se guarda. Se lee y se descarta.

   El orden importa:
   1. QR de la factura electrónica (AFIP/ARCA). Si el ticket lo tiene,
      trae el total, la fecha y el CUIT exactos. Es la lectura buena.
   2. Si no hay QR, OCR del texto (Tesseract, en español) y se busca
      el TOTAL, la fecha y el nombre del comercio.
   En los dos casos el resultado va a la hoja de movimiento para que
   la persona lo confirme o lo corrija antes de guardar. Nunca se
   guarda solo.

   Las partes de interpretación (leerQrAfip, interpretarTexto,
   montoDeTexto) son funciones puras: se prueban sin cámara.
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------------------------------------------------------
     Montos con formato de ticket
     "12.345,67"  "12,345.67"  "$ 1234.5"  "1 234,00"  "12345"
     --------------------------------------------------------- */
  function montoDeTexto(s) {
    if (s == null) return null;
    let t = String(s)
      .replace(/[Oo](?=[\d.,]*\d)/g, '0')     // el OCR confunde O con 0 dentro de números
      .replace(/[^\d.,\s]/g, '')
      .trim();
    // "1 234,56" → espacios como separador de miles
    t = t.replace(/(\d)\s+(?=\d{3}(?:\D|$))/g, '$1').replace(/\s+/g, '');
    if (!/\d/.test(t)) return null;

    const ultSep = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
    let entero = t, dec = '';
    if (ultSep >= 0) {
      const tras = t.slice(ultSep + 1);
      // dos dígitos (o uno) después del último separador → decimales
      if (/^\d{1,2}$/.test(tras)) { entero = t.slice(0, ultSep); dec = tras; }
    }
    entero = entero.replace(/[.,]/g, '');
    if (!entero) entero = '0';
    const n = Number(entero + (dec ? '.' + dec : ''));
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  // Un monto "de ticket": con decimales o con separador de miles. Evita
  // tomar códigos de producto, números de comprobante o cantidades.
  const RE_MONTO = /\$?\s?(\d{1,3}(?:[.,\s]\d{3})+(?:[.,]\d{1,2})?|\d+[.,]\d{2})(?!\d)/g;

  function montosEn(linea) {
    const out = [];
    let m;
    RE_MONTO.lastIndex = 0;
    while ((m = RE_MONTO.exec(linea))) {
      const v = montoDeTexto(m[1]);
      if (v != null && v > 0) out.push(v);
    }
    return out;
  }

  /* ---------------------------------------------------------
     Fechas
     --------------------------------------------------------- */
  const p2 = n => String(n).padStart(2, '0');

  function fechaValida(a, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const f = new Date(a, m - 1, d);
    if (f.getFullYear() !== a || f.getMonth() !== m - 1 || f.getDate() !== d) return null;
    return `${a}-${p2(m)}-${p2(d)}`;
  }

  function fechaDeTexto(texto, hoy) {
    const cands = [];
    const re = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})\b/g;
    let m;
    while ((m = re.exec(texto))) {
      let a = Number(m[3]);
      if (a < 100) a += 2000;
      const f = fechaValida(a, Number(m[2]), Number(m[1]));
      if (f) cands.push(f);
    }
    const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
    while ((m = iso.exec(texto))) {
      const f = fechaValida(Number(m[1]), Number(m[2]), Number(m[3]));
      if (f) cands.push(f);
    }
    // La primera fecha creíble: no futura y de los últimos dos años.
    const limite = new Date(hoy); limite.setFullYear(limite.getFullYear() - 2);
    const min = `${limite.getFullYear()}-${p2(limite.getMonth() + 1)}-${p2(limite.getDate())}`;
    const hoyStr = `${hoy.getFullYear()}-${p2(hoy.getMonth() + 1)}-${p2(hoy.getDate())}`;
    return cands.find(f => f <= hoyStr && f >= min) || null;
  }

  /* ---------------------------------------------------------
     QR de factura electrónica (AFIP / ARCA)
     https://www.afip.gob.ar/fe/qr/?p=<JSON en base64>
     --------------------------------------------------------- */
  // Tipos de comprobante que son notas de crédito (devuelven plata).
  const NOTAS_CREDITO = new Set([3, 8, 13, 53, 110, 112, 113, 114, 203, 208, 213]);

  function base64ATexto(b64) {
    let s = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
    while (s.length % 4) s += '=';
    if (typeof atob === 'function') {
      const bin = atob(s);
      const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(s, 'base64').toString('utf8');
  }

  function leerQrAfip(contenido, hoy = new Date()) {
    if (!contenido || typeof contenido !== 'string') return null;
    if (!/(afip|arca)\.gob\.ar/i.test(contenido)) return null;
    const m = contenido.match(/[?&]p=([^&#\s]+)/);
    if (!m) return null;
    let datos;
    try {
      datos = JSON.parse(base64ATexto(decodeURIComponent(m[1])));
    } catch (e) { return null; }
    if (!datos || typeof datos !== 'object') return null;

    let importe = Number(datos.importe);
    if (!Number.isFinite(importe) || importe <= 0) return null;
    const moneda = String(datos.moneda || 'PES').toUpperCase();
    const ctz = Number(datos.ctz);
    let enOtraMoneda = null;
    if (moneda !== 'PES' && Number.isFinite(ctz) && ctz > 0) {
      enOtraMoneda = { moneda, importe };
      importe = importe * ctz;
    }

    let fecha = null;
    const f = String(datos.fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (f) fecha = fechaValida(Number(f[1]), Number(f[2]), Number(f[3]));
    const hoyStr = `${hoy.getFullYear()}-${p2(hoy.getMonth() + 1)}-${p2(hoy.getDate())}`;
    if (fecha && fecha > hoyStr) fecha = null;

    const cuit = datos.cuit != null ? String(datos.cuit).replace(/\D/g, '') : '';
    return {
      origen: 'qr',
      monto: Math.round(importe * 100) / 100,
      fecha,
      cuit: cuit.length === 11 ? cuit : '',
      notaCredito: NOTAS_CREDITO.has(Number(datos.tipoCmp)),
      enOtraMoneda,
      comercio: ''
    };
  }

  function cuitLegible(c) {
    return c && c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : '';
  }

  /* ---------------------------------------------------------
     Texto de OCR → total, fecha, comercio
     --------------------------------------------------------- */
  const NO_ES_TOTAL = /sub\s*-?\s*tot|total\s*(de\s*)?(items?|art|unid|bultos|cant|desc|ahorr)|iva|impuesto|percep|descuento|ahorro|cant\.?\s*total|regimen|transparencia/i;
  const ES_TOTAL = /\bt[o0]ta[l1]\b|a\s+pagar|importe\s+total|total\s+a\s+pagar/i;
  const PAGOS = /\b(efectivo|tarjeta|debito|d[eé]bito|credito|cr[eé]dito|su\s+pago|pago|mercado\s*pago|qr)\b/i;
  const CABECERA_NO = /^(tique|ticket|factura|fact\.|comprobante|original|duplicado|c\.?u\.?i\.?t|cuit|iva|ing\.?\s*br|inicio|i\.?v\.?a|responsable|consumidor|cod\.|nro|n[°º]|p\.?v\.?|punto de venta|fecha|hora|caja|cajero|domicilio|tel)/i;

  function comercioDeLineas(lineas) {
    for (const l of lineas.slice(0, 8)) {
      const limpia = l.replace(/[^\p{L}\p{N}\s&.'-]/gu, ' ').replace(/\s+/g, ' ').trim();
      if (limpia.length < 3 || CABECERA_NO.test(limpia)) continue;
      const letras = (limpia.match(/\p{L}/gu) || []).length;
      if (letras < 3 || letras / limpia.replace(/\s/g, '').length < 0.6) continue;
      // Formato título: "SUPERMERCADO EL SOL S.A." → "Supermercado El Sol S.A."
      return limpia.toLowerCase().replace(/(^|[\s.])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).slice(0, 60);
    }
    return '';
  }

  function interpretarTexto(texto, hoy = new Date()) {
    const lineas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let monto = null, confianza = 'baja';

    // 1) Renglones que dicen TOTAL (y no subtotal, total de ítems, IVA…).
    //    El monto puede estar en el mismo renglón o en el siguiente.
    const totales = [];
    lineas.forEach((l, i) => {
      if (!ES_TOTAL.test(l) || NO_ES_TOTAL.test(l)) return;
      let vals = montosEn(l);
      if (!vals.length && lineas[i + 1] && !ES_TOTAL.test(lineas[i + 1])) vals = montosEn(lineas[i + 1]);
      if (vals.length) totales.push(vals[vals.length - 1]);
    });
    if (totales.length) { monto = Math.max(...totales); confianza = 'alta'; }

    // Control cruzado: el total casi siempre se repite en otro renglón
    // (subtotal, efectivo, tarjeta). Si lo pagado no cierra con el total,
    // lo más probable es que el OCR haya leído mal un dígito: se deja el
    // número pero marcado para revisar.
    if (monto != null && confianza === 'alta') {
      const pagos = [], subtot = [], vueltos = [];
      lineas.forEach(l => {
        if (ES_TOTAL.test(l) && !NO_ES_TOTAL.test(l)) return;
        if (/vuelto|cambio/i.test(l)) vueltos.push(...montosEn(l));
        else if (PAGOS.test(l)) pagos.push(...montosEn(l));
        else if (/sub\s*-?\s*tot/i.test(l)) subtot.push(...montosEn(l));
      });
      const igual = v => Math.abs(v - monto) < 0.011;
      const cierra = pagos.some(igual) || subtot.some(igual) ||
        pagos.some(p => vueltos.some(v => igual(p - v)));
      // Con pagos a la vista que no cierran, desconfiar. Si sólo hay un
      // subtotal mayor, es un descuento: normal, no se puede verificar más.
      if (!cierra && (pagos.length || subtot.some(v => v < monto))) confianza = 'dudosa';
    }

    // 2) Sin TOTAL legible: lo que se pagó (efectivo, tarjeta…).
    if (monto == null) {
      const pagos = [];
      lineas.forEach(l => { if (PAGOS.test(l) && !/vuelto|cambio/i.test(l)) pagos.push(...montosEn(l)); });
      if (pagos.length) { monto = Math.max(...pagos); confianza = 'media'; }
    }

    // 3) Último recurso: el monto más grande del ticket. Suele ser el total,
    //    pero puede no serlo: queda marcado para que se revise.
    if (monto == null) {
      const todos = lineas.flatMap(montosEn);
      if (todos.length) { monto = Math.max(...todos); confianza = 'baja'; }
    }

    const cuitM = String(texto || '').match(/\b(20|23|24|27|30|33|34)[-\s.]?(\d{8})[-\s.]?(\d)\b/);

    return {
      origen: 'ocr',
      monto,
      confianza,
      fecha: fechaDeTexto(texto || '', hoy),
      comercio: comercioDeLineas(lineas),
      cuit: cuitM ? cuitM[1] + cuitM[2] + cuitM[3] : ''
    };
  }

  /* ---------------------------------------------------------
     Motor: carga perezosa de las librerías (≈10 MB). En el APK están
     dentro de la app; en la web se bajan la primera vez y quedan
     guardadas.
     --------------------------------------------------------- */
  const BASE = (() => {
    try { return new URL('vendor/', document.baseURI).href; } catch (e) { return 'vendor/'; }
  })();

  const cargados = {};
  function cargarScript(src) {
    if (cargados[src]) return cargados[src];
    cargados[src] = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => ok();
      s.onerror = () => { delete cargados[src]; mal(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
    return cargados[src];
  }

  // Foto → canvas reducido. Las fotos del celular pueden tener 12+ MP;
  // procesarlas enteras es lento y no mejora la lectura.
  async function imagenACanvas(archivo, ladoMax) {
    let bmp;
    if (typeof createImageBitmap === 'function') {
      try { bmp = await createImageBitmap(archivo, { imageOrientation: 'from-image' }); } catch (e) { bmp = null; }
    }
    if (!bmp) {
      bmp = await new Promise((ok, mal) => {
        const img = new Image();
        const url = URL.createObjectURL(archivo);
        img.onload = () => { URL.revokeObjectURL(url); ok(img); };
        img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo abrir la imagen')); };
        img.src = url;
      });
    }
    const w = bmp.width, h = bmp.height;
    const esc = Math.min(1, ladoMax / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * esc); c.height = Math.round(h * esc);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return c;
  }

  async function buscarQr(archivo) {
    await cargarScript(BASE + 'jsQR.js');
    // El QR de un ticket es chico en la foto: se prueba a dos tamaños.
    for (const lado of [1400, 2200]) {
      const c = await imagenACanvas(archivo, lado);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height);
      const r = global.jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
      if (r && r.data) return r.data;
    }
    return null;
  }

  // Escala de grises con contraste estirado: el papel térmico sale gris
  // sobre gris y Tesseract lee mucho mejor en negro sobre blanco.
  function realzar(c) {
    const ctx = c.getContext('2d');
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const px = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
      const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
      px[i] = g; hist[g]++;
    }
    const total = px.length / 4;
    let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > total * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > total * 0.02) { hi = v; break; } }
    const rango = Math.max(1, hi - lo);
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((px[i] - lo) * 255 / rango) | 0));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /* Segundo intento, para papel gastado o fotos con sombra: blanco y negro
     por zonas (umbral adaptativo de Bradley). Cada píxel se compara con el
     promedio de su vecindario, no con un valor fijo para toda la foto, así
     una sombra en una esquina no borra el texto de esa parte. */
  function binarizar(c) {
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    const img = ctx.getImageData(0, 0, w, h);
    const px = img.data;
    const gris = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; j < gris.length; i += 4, j++) {
      gris[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    }
    const integ = new Float64Array((w + 1) * (h + 1));
    for (let y = 1; y <= h; y++) {
      let fila = 0;
      for (let x = 1; x <= w; x++) {
        fila += gris[(y - 1) * w + (x - 1)];
        integ[y * (w + 1) + x] = integ[(y - 1) * (w + 1) + x] + fila;
      }
    }
    const r = Math.max(8, Math.round(Math.max(w, h) / 40));
    const t = 0.10;
    for (let y = 0; y < h; y++) {
      const y1 = Math.max(0, y - r), y2 = Math.min(h - 1, y + r);
      for (let x = 0; x < w; x++) {
        const x1 = Math.max(0, x - r), x2 = Math.min(w - 1, x + r);
        const n = (x2 - x1 + 1) * (y2 - y1 + 1);
        const suma = integ[(y2 + 1) * (w + 1) + (x2 + 1)] - integ[y1 * (w + 1) + (x2 + 1)]
                   - integ[(y2 + 1) * (w + 1) + x1] + integ[y1 * (w + 1) + x1];
        const v = gris[y * w + x] * n <= suma * (1 - t) ? 0 : 255;
        const k = (y * w + x) * 4;
        px[k] = px[k + 1] = px[k + 2] = v;
      }
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  let worker = null;
  async function obtenerWorker(progreso) {
    if (worker) return worker;
    await cargarScript(BASE + 'ocr/tesseract.min.js');
    worker = await global.Tesseract.createWorker('spa', 1, {
      workerPath: BASE + 'ocr/worker.min.js',
      corePath: BASE + 'ocr/core/',
      langPath: BASE + 'ocr/lang',
      workerBlobURL: false,
      gzip: false,          // sin .gz: Android puede alterar los .gz dentro del APK
      logger: m => {
        if (!progreso) return;
        if (m.status === 'recognizing text') progreso('leyendo', m.progress);
        else progreso('preparando', m.progress);
      }
    });
    return worker;
  }

  async function leerTexto(archivo, progreso, filtro) {
    const w = await obtenerWorker(progreso);
    const c = filtro(await imagenACanvas(archivo, 2000));
    const { data } = await w.recognize(c);
    return data && data.text ? data.text : '';
  }

  /**
   * Escanea una foto de ticket. Devuelve { origen:'qr'|'ocr', monto, fecha,
   * comercio, cuit, ... } o lanza si la imagen no se pudo procesar.
   * `progreso(etapa, fraccion)` informa: 'qr' | 'preparando' | 'leyendo'.
   */
  async function escanear(archivo, progreso = () => {}, hoy = new Date()) {
    progreso('qr', 0);
    let qr = null;
    try { qr = await buscarQr(archivo); } catch (e) { qr = null; }
    const afip = leerQrAfip(qr, hoy);
    if (afip) return afip;

    // Primer intento: contraste estirado. Si no aparece un total confiable,
    // segundo intento en blanco y negro por zonas, y queda el mejor.
    const puntaje = x => (x.monto != null ? (x.confianza === 'alta' ? 4 : x.confianza === 'media' ? 3 : 1) : 0)
      + (x.fecha ? 1 : 0) + (x.comercio ? 0.5 : 0);
    let texto = await leerTexto(archivo, progreso, realzar);
    let r = interpretarTexto(texto, hoy);
    r.texto = texto;
    if (r.confianza !== 'alta') {   // incluye 'dudosa'
      progreso('otra', 0);
      const texto2 = await leerTexto(archivo, (e, f) => progreso(e === 'leyendo' ? 'otra' : e, f), binarizar);
      const r2 = interpretarTexto(texto2, hoy);
      r2.texto = texto2;
      if (puntaje(r2) > puntaje(r)) r = r2;
    }
    return r;
  }

  global.Ticket = { montoDeTexto, leerQrAfip, interpretarTexto, cuitLegible, escanear };
})(typeof window !== 'undefined' ? window : globalThis);
