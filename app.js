/* =========================================================
   Mis Gastos — app.js
   Todo local: los datos nunca salen del dispositivo.
   ========================================================= */
'use strict';

const CLAVE = 'misgastos.v1';
const APP_VER = '2.4';
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

/* ---------------------------------------------------------
   Utilidades
   --------------------------------------------------------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function normalizar(s) {
  return (s || '').toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s$.,]/gu, ' ')
    .replace(/\s+/g, ' ').trim();
}

function hoyISO(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const mesDeISO = iso => iso.slice(0, 7);

function mesLegible(ym) {
  const [a, m] = ym.split('-').map(Number);
  const ahora = new Date();
  const esteAnio = a === ahora.getFullYear();
  return esteAnio ? MESES[m - 1] : `${MESES[m - 1]} ${a}`;
}
function mesCorto(ym) {
  const [a, m] = ym.split('-').map(Number);
  return MESES[m - 1].slice(0, 3);
}
function mesSumar(ym, delta) {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fechaLegible(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const diff = Math.round((f - hoy) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === -1) return 'Ayer';
  if (diff === 1) return 'Mañana';
  const base = `${DIAS[f.getDay()]} ${d} de ${MESES[m - 1]}`;
  return base.charAt(0).toUpperCase() + base.slice(1) + (a !== hoy.getFullYear() ? ` de ${a}` : '');
}

/* Los montos salen en la moneda de la billetera que se está viendo:
   «$ 1.250» en pesos, «US$ 1.250» en dólares. */
const FMT = {};
for (const cod of ['ARS', 'USD']) {
  FMT[cod] = {
    ent: new Intl.NumberFormat('es-AR', { style: 'currency', currency: cod, minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    dec: new Intl.NumberFormat('es-AR', { style: 'currency', currency: cod, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  };
}

function plata(n) {
  const v = Number(n) || 0;
  const f = FMT[moneda()];
  return Number.isInteger(v) ? f.ent.format(v) : f.dec.format(v);
}
/** `conSimbolo` en false es para los ejes de los gráficos. */
function plataCorta(n, conSimbolo = true) {
  const v = Math.abs(Number(n) || 0);
  const signo = n < 0 ? '-' : '';
  const s = signo + (conSimbolo ? MONEDAS[moneda()].simbolo : '');
  if (v >= 1e6) return `${s}${(v / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  if (v >= 1e3) return `${s}${(v / 1e3).toLocaleString('es-AR', { maximumFractionDigits: v >= 1e5 ? 0 : 1 })} mil`;
  return `${s}${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}
const esc = s => (s || '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------------------------------------------------------
   Números escritos en español (y modismos argentinos)
   --------------------------------------------------------- */
const NUM_PALABRA = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400,
  quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900
};
const MULTIPLICADOR = {
  mil: 1000, miles: 1000, luca: 1000, lucas: 1000, k: 1000,
  millon: 1e6, millones: 1e6, palo: 1e6, palos: 1e6
};
const esNumPalabra = t => Object.prototype.hasOwnProperty.call(NUM_PALABRA, t) || t === 'y' || Object.prototype.hasOwnProperty.call(MULTIPLICADOR, t);

/** Evalúa una secuencia de palabras numéricas: ["dos","mil","quinientos"] -> 2500 */
function evaluarPalabras(tokens) {
  let total = 0, actual = 0, vio = false;
  for (const t of tokens) {
    if (t === 'y') continue;
    if (Object.prototype.hasOwnProperty.call(MULTIPLICADOR, t)) {
      const m = MULTIPLICADOR[t];
      if (m >= 1e6) { total = (total + (actual || 1)) * m; actual = 0; }
      else { total += (actual || 1) * m; actual = 0; }
      vio = true;
    } else if (Object.prototype.hasOwnProperty.call(NUM_PALABRA, t)) {
      actual += NUM_PALABRA[t]; vio = true;
    }
  }
  return vio ? total + actual : null;
}

/** Interpreta "5.000", "5000,50", "$12.345", "15,5" con formato argentino */
/**
 * Lee un monto escrito a mano o dictado.
 *
 * Dos cosas que antes salían mal:
 *
 * 1. «30mil» daba 30. El campo descartaba todas las letras, así que los
 *    multiplicadores que la voz sí entiende acá se perdían. Ahora los
 *    entiende igual que el dictado: mil, luca, k, palo, millón.
 *
 * 2. «30,000» daba 30. La coma se tomaba siempre como decimal, que es lo
 *    correcto en Argentina, pero el reconocedor de voz devuelve el
 *    separador de miles a la inglesa y ahí el monto quedaba dividido por
 *    mil. La regla que desempata: **la plata no tiene tres decimales**.
 *    Si después del separador hay exactamente tres dígitos, es separador
 *    de miles; con uno o dos, son centavos.
 */
function numeroDeTexto(raw) {
  const texto = (raw || '').toString();

  /* El multiplicador puede venir pegado ("30mil"), separado ("30 mil") y
     con palabras alrededor ("30 mil pesos", "gasté 2 palos en el auto").
     Antes se exigía que la frase fuera exactamente número + multiplicador,
     así que "30 mil pesos" terminaba valiendo 30: el multiplicador se
     perdía y quedaba sólo el número suelto. */
  const limpio = normalizar(texto);
  let mult = 1;
  const m = limpio.match(/(\d[\d.,]*)\s*(mil|miles|lucas?|k|palos?|millones?|millon)(?![\p{L}\p{N}])/u);
  let cuerpo;
  if (m) {
    cuerpo = m[1];
    mult = MULTIPLICADOR[m[2]] || 1;
  } else {
    /* Sin multiplicador: se toma el primer número de la frase. Si no hay
       ninguno, se prueba con los números escritos en palabras, para que
       "treinta mil" también sirva al tipearlo o dictarlo en el campo. */
    const num = limpio.match(/\d[\d.,]*/);
    if (num) {
      cuerpo = num[0];
    } else {
      const porPalabras = evaluarPalabras(
        limpio.split(/\s+/).filter(t => esNumPalabra(t)));
      return porPalabras == null ? null : Math.round(porPalabras * 100) / 100;
    }
  }

  let s = cuerpo.replace(/[^\d.,]/g, '');
  if (!s || !/\d/.test(s)) return null;

  /* Qué separador es cuál:

     · Si vienen los dos —«12.350,50»— el ÚLTIMO es el decimal y el otro
       es de miles. Sirve igual para el formato de acá y para el inglés.
     · Si viene uno solo repetido —«1.234.567»— es de miles.
     · Si viene uno solo una vez, decide la cantidad de dígitos que le
       siguen: tres son miles, uno o dos son centavos. */
  const iPunto = s.lastIndexOf('.'), iComa = s.lastIndexOf(',');

  if (iPunto >= 0 && iComa >= 0) {
    const dec = iPunto > iComa ? '.' : ',';
    const miles = dec === '.' ? ',' : '.';
    s = s.split(miles).join('').replace(dec, '.');
  } else {
    const sep = iPunto >= 0 ? '.' : (iComa >= 0 ? ',' : null);
    if (sep) {
      const partes = s.split(sep);
      const ultima = partes[partes.length - 1];
      s = (partes.length > 2 || ultima.length === 3)
        ? partes.join('')
        : partes.slice(0, -1).join('') + '.' + ultima;
    }
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;

  /* Redondeo a centavos: 30 × 1000 en coma flotante puede dar 30000.000000001
     y ese resto después aparece en los totales. */
  return Math.round(n * mult * 100) / 100;
}

/* ---------------------------------------------------------
   Datos
   --------------------------------------------------------- */
/* Las categorías con las que arranca una instalación nueva.

   Son 6 de egreso y 3 de ingreso, que es justo el tope del plan gratis: así
   el que instala la app ya la tiene lista para usar, sin tener que armar nada,
   y a la vez ve enseguida dónde está el límite.

   Las `claves` son lo que usa la carga por voz para adivinar la categoría. Al
   recortar el set original de 12 se fusionaron las listas: las palabras de
   Ocio pasaron a «Comida y salidas», y las de Educación, Mascotas, Negocio,
   Indumentaria y Banco a «Otros», que de todos modos es donde habrían caído.
   Quien quiera esas categorías separadas, las crea —y ahí aparece el tope. */
const CATS_BASE = [
  { nombre: 'Supermercado',      emoji: '🛒', tipo: 'egreso', claves: ['super','supermercado','mercado','almacen','mandados','changuito','mayorista','carrefour','coto','jumbo','vea','dia','chango','libertad'] },
  { nombre: 'Comida y salidas',  emoji: '🍽️', tipo: 'egreso', claves: ['comida','almuerzo','almorce','cena','cene','desayuno','merienda','restaurante','resto','bar','cerveza','pizza','empanadas','hamburguesa','helado','cafe','cafeteria','delivery','pedidosya','rappi','kiosco','kiosko','panaderia','carniceria','verduleria','fiambreria','asado','facturas','cine','teatro','recital','salida','boliche','netflix','spotify','disney','hbo','max','prime','juego','steam','playstation','regalo','cumpleanos','gym','gimnasio','club','futbol','padel','pileta'] },
  { nombre: 'Transporte',        emoji: '⛽', tipo: 'egreso', claves: ['nafta','combustible','gasoil','gnc','ypf','shell','axion','puma','sube','colectivo','bondi','taxi','remis','uber','cabify','didi','peaje','estacionamiento','cochera','pasaje','micro','tren','subte','vtv','patente','mecanico','gomeria','cubiertas','service','lavadero','auto','camioneta','moto'] },
  { nombre: 'Hogar y servicios', emoji: '🏠', tipo: 'egreso', claves: ['alquiler','expensas','luz','epec','edesur','edenor','gas','ecogas','agua','internet','wifi','fibertel','telecentro','cable','telefono','celular','claro','personal','movistar','flow','municipal','impuestos','abl','rentas','ferreteria','pintura','muebles','limpieza','articulos de limpieza','gasista','plomero','electricista','obra'] },
  { nombre: 'Salud',             emoji: '💊', tipo: 'egreso', claves: ['farmacia','remedios','medicamentos','medico','doctor','dentista','odontologo','obra social','osde','swiss medical','prepaga','analisis','estudios','kinesiologo','oculista','anteojos','psicologo','terapia','vacuna','guardia'] },
  { nombre: 'Otros',             emoji: '📦', tipo: 'egreso', claves: ['otro','otros','varios','imprevisto','ropa','zapatillas','zapatos','campera','pantalon','remera','camisa','buzo','indumentaria','calzado','jean','vestido','colegio','universidad','facultad','curso','capacitacion','utiles','matricula','ingles','jardin','veterinaria','veterinario','balanceado','perro','gato','mascota','proveedor','mercaderia','stock','flete','envio','correo','monotributo','afip','contador','insumos','banco','comision','tarjeta','cuota','interes','prestamo','credito','mercado pago','libro','libreria','viaje','hotel'] },
  { nombre: 'Sueldo',            emoji: '💰', tipo: 'ingreso', claves: ['sueldo','salario','aguinaldo','jornal','quincena','bono'] },
  { nombre: 'Ventas',            emoji: '🧾', tipo: 'ingreso', claves: ['venta','ventas','cobranza','facture','factura','cliente','mostrador','local'] },
  { nombre: 'Otros ingresos',    emoji: '🎁', tipo: 'ingreso', claves: ['reintegro','devolucion','premio','propina','regalo','alquiler cobrado','interes','otro ingreso','honorarios','freelance','trabajo','laburo','changa','servicio'] }
];

const CAJAS_BASE = [
  { nombre: 'Fondo de emergencia', emoji: '🛟' },
  { nombre: 'Vacaciones',          emoji: '🏖️' }
];
const cajasNuevas = () => CAJAS_BASE.map(c => ({ id: uid(), ...c, meta: null, metaMensual: null, creada: new Date().toISOString() }));

function datosIniciales() {
  return {
    version: 2,
    categorias: CATS_BASE.map(c => ({ id: uid(), ...c })),
    cajas: cajasNuevas(),
    movimientos: [],
    fijos: [],
    ajustes: { tema: 'auto' }
  };
}

/* ---------------------------------------------------------
   Billeteras (la de dólares es Premium)

   Cada moneda tiene su billetera con todo separado: categorías, cajas,
   movimientos y fijos. `db.categorias`, `db.cajas`, `db.movimientos` y
   `db.fijos` apuntan siempre a la billetera que se está viendo, así el
   resto de la app no necesita saber que hay más de una.

   Se guarda con la forma de siempre —la billetera en pesos arriba de
   todo— y la de dólares aparte, en `billeteras.USD`. Así lo que ya estaba
   guardado no se toca y una versión anterior de la app lee los pesos sin
   enterarse de que hay otra billetera.
   --------------------------------------------------------- */
const MONEDAS = {
  ARS: { nombre: 'pesos',   simbolo: '$' },
  USD: { nombre: 'dólares', simbolo: 'US$' }
};
const CAMPOS_BILLETERA = ['categorias', 'cajas', 'movimientos', 'fijos'];

const monedaDe = d => (d.billeteras[d.ajustes.moneda] ? d.ajustes.moneda : 'ARS');
const moneda = () => monedaDe(db);

/** De la forma guardada a la de trabajo. */
function enMemoria(g) {
  const d = { version: 2, ajustes: g.ajustes || { tema: 'auto' }, billeteras: {} };
  const billetera = b => ({
    categorias: b.categorias,
    cajas: Array.isArray(b.cajas) ? b.cajas : cajasNuevas(),   // datos de la v1
    movimientos: b.movimientos,
    fijos: Array.isArray(b.fijos) ? b.fijos : []              // datos previos a los fijos
  });
  d.billeteras.ARS = billetera(g);
  const usd = g.billeteras && g.billeteras.USD;
  if (usd && Array.isArray(usd.categorias) && Array.isArray(usd.movimientos)) d.billeteras.USD = billetera(usd);
  for (const k of CAMPOS_BILLETERA) {
    Object.defineProperty(d, k, {
      get() { return this.billeteras[monedaDe(this)][k]; },
      set(v) { this.billeteras[monedaDe(this)][k] = v; }
    });
  }
  return d;
}

/** De la forma de trabajo a la guardada (también es la de las copias). */
function paraGuardar(d) {
  const g = { version: 2, ...d.billeteras.ARS, ajustes: d.ajustes };
  if (d.billeteras.USD) g.billeteras = { USD: d.billeteras.USD };
  return g;
}

let db;
function cargar() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return enMemoria(datosIniciales());
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.categorias) || !Array.isArray(d.movimientos)) return enMemoria(datosIniciales());
    return enMemoria(d);
  } catch (e) {
    console.warn('No se pudo leer el almacenamiento:', e);
    return enMemoria(datosIniciales());
  }
}
function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(paraGuardar(db))); }
  catch (e) { avisar('No se pudo guardar. ¿Queda espacio en el teléfono?'); console.warn(e); }
}

/** La billetera en dólares arranca con las mismas categorías que la de
    pesos, pero sin los presupuestos: un tope en pesos no dice nada en
    dólares. Las cajas arrancan como en una instalación nueva. */
function crearBilleteraUSD() {
  db.billeteras.USD = {
    categorias: db.billeteras.ARS.categorias.map(c => ({
      ...c, id: uid(), claves: [...(c.claves || [])], presupuesto: null
    })),
    cajas: cajasNuevas(),
    movimientos: [],
    fijos: []
  };
}

/** Cambia la billetera que se ve. Crear la de dólares es Premium; si ya
    existe se puede seguir usando sin Premium, como las categorías que
    quedan por encima del tope: lo que alguien ya armó no se le saca. */
function usarBilletera(m) {
  if (m === moneda()) return true;
  if (m === 'USD' && !db.billeteras.USD) {
    if (!puede('divisas')) { abrirPremium('divisas'); return false; }
    crearBilleteraUSD();
  }
  db.ajustes.moneda = m;
  guardar();
  // los filtros y el grupo abierto apuntan a categorías de la otra billetera
  filtros = { periodo: 0, cats: [], montoMin: null, montoMax: null };
  grupoActivo = null;
  pintarMoneda();
  pintarPlan();
  renderTodo();
  return true;
}

/** Símbolo en los campos de monto y botón de la cabecera. */
function pintarMoneda() {
  const m = moneda();
  $$('.amount-cur').forEach(el => { el.textContent = MONEDAS[m].simbolo; });
  const b = $('#btnMoneda');
  if (b) {
    b.hidden = !(db.billeteras.USD || puede('divisas'));
    b.textContent = m;
    b.classList.toggle('es-usd', m === 'USD');
    b.setAttribute('aria-label', `Billetera en ${MONEDAS[m].nombre}. Tocá para cambiar.`);
  }
  $$('[data-moneda]').forEach(x => x.classList.toggle('is-on', x.dataset.moneda === m));
  const sello = $('#monedaSello');
  if (sello) sello.hidden = !!(db.billeteras.USD || puede('divisas'));
}

const catPorId   = id => db.categorias.find(c => c.id === id);
const catsDe     = tipo => db.categorias.filter(c => c.tipo === tipo);
const cajaPorId  = id => db.cajas.find(c => c.id === id);
const movsDelMes = ym => db.movimientos.filter(m => mesDeISO(m.fecha) === ym);

/* Un aporte suma al ahorro; un retiro le resta. */
const signoAhorro = m => (m.sentido === 'retiro' ? -1 : 1);

/* Efecto sobre la plata disponible: el aporte al ahorro sale de la mano
   igual que un gasto, aunque la plata siga siendo tuya. */
function efectoDisponible(m) {
  if (m.tipo === 'ingreso') return m.monto;
  if (m.tipo === 'ahorro')  return m.sentido === 'retiro' ? m.monto : -m.monto;
  return -m.monto;
}

/* Plata en mano según todo lo registrado. Es acumulada, no mensual: lo que te
   sobró en octubre sigue estando en noviembre, así que el tope para guardar no
   puede ser el balance del mes. */
function disponible(excluirMovId = null) {
  return db.movimientos.reduce((s, m) =>
    m.id === excluirMovId ? s : s + efectoDisponible(m), 0);
}

/* El saldo nunca se guarda: siempre se recalcula desde los movimientos. */
function saldoCaja(id, excluirMovId = null) {
  return db.movimientos.reduce((s, m) =>
    (m.tipo === 'ahorro' && m.cajaId === id && m.id !== excluirMovId)
      ? s + m.monto * signoAhorro(m) : s, 0);
}
const totalAhorrado = () => db.movimientos.reduce((s, m) =>
  (m.tipo === 'ahorro' && cajaPorId(m.cajaId)) ? s + m.monto * signoAhorro(m) : s, 0);

/* Saldo acumulado hasta el último día del mes `ym` */
function saldoAlCierre(ym) {
  const limite = ym + '-32';
  return db.movimientos.reduce((s, m) =>
    (m.tipo === 'ahorro' && cajaPorId(m.cajaId) && m.fecha < limite)
      ? s + m.monto * signoAhorro(m) : s, 0);
}

/* ---------------------------------------------------------
   Escáner de tickets (Premium)

   El trabajo pesado está en ticket.js. Acá sólo se arma el flujo:
   foto → lectura → hoja de movimiento prellenada para confirmar.
   Nunca se guarda nada sin que la persona toque «Guardar».
   --------------------------------------------------------- */
const CLAVE_COMERCIOS = 'misgastos.comercios';
let ticketOcupado = false;

/* La segunda vez que escaneás un ticket del mismo comercio ya sabe en qué
   categoría lo pusiste y cómo lo llamaste. Se guarda aparte de los datos
   principales: es una ayuda, no información tuya que haya que respaldar. */
function comerciosRecordados() {
  try { return JSON.parse(localStorage.getItem(CLAVE_COMERCIOS)) || {}; } catch (e) { return {}; }
}
function recordarComercio(clave, categoriaId, descripcion) {
  try {
    const m = comerciosRecordados();
    m[clave] = { categoriaId, descripcion: (descripcion || '').slice(0, 80) };
    const claves = Object.keys(m);
    if (claves.length > 300) delete m[claves[0]];
    localStorage.setItem(CLAVE_COMERCIOS, JSON.stringify(m));
  } catch (e) { /* sin almacenamiento: no pasa nada */ }
}

/** Categoría de egreso más probable mirando el comercio y el texto. */
function sugerirCategoriaTicket(comercio, texto) {
  const cats = catsDe('egreso');
  const buscar = (str, minLargo) => {
    const t = ' ' + normalizar(str) + ' ';
    let mejor = null, largo = 0;
    for (const c of cats) {
      for (const cand of [normalizar(c.nombre), ...(c.claves || []).map(normalizar)]) {
        if (!cand || cand.length < minLargo) continue;
        if (t.includes(' ' + cand + ' ') && cand.length > largo) { largo = cand.length; mejor = c.id; }
      }
    }
    return mejor;
  };
  // Primero el encabezado (nombre del comercio); el cuerpo del ticket tiene
  // productos que confunden ("agua", "gas"…), así que ahí sólo cuentan
  // las palabras largas.
  const cabecera = [comercio, ...(texto || '').split('\n').slice(0, 6)].join(' ');
  return buscar(cabecera, 3) || buscar(texto || '', 5) ||
    (cats.find(c => normalizar(c.nombre) === 'otros') || {}).id || null;
}

function abrirTicket() {
  if (!puede('escaner')) { abrirPremium('escaner'); return; }
  if (ticketOcupado) { abrirHoja('sheetTicket'); return; }
  $('#ticketElegir').hidden = false;
  $('#ticketLeyendo').hidden = true;
  abrirHoja('sheetTicket');
}

function cerrarTicket() {
  // Si está leyendo, la lectura sigue y al terminar abre la confirmación;
  // cerrar la hoja no la cancela (Tesseract no se puede cortar a mitad).
  cerrarHoja('sheetTicket');
}

function estadoTicket(etapa, frac) {
  const txt = {
    qr: 'Buscando el código QR de la factura…',
    preparando: 'Preparando el lector… (la primera vez tarda un poco más)',
    leyendo: 'Leyendo el texto del ticket…',
    otra: 'No se ve del todo claro. Probando de otra forma…'
  }[etapa] || 'Leyendo el ticket…';
  $('#ticketEstado').textContent = txt;
  const base = etapa === 'qr' ? 0.05 : etapa === 'preparando' ? 0.1 + 0.2 * (frac || 0)
    : etapa === 'otra' ? 0.65 + 0.35 * (frac || 0) : 0.3 + 0.35 * (frac || 0);
  $('#ticketBarra').style.width = Math.round(base * 100) + '%';
}

async function procesarTicket(archivo) {
  if (ticketOcupado) return;
  ticketOcupado = true;
  $('#ticketElegir').hidden = true;
  $('#ticketLeyendo').hidden = false;
  estadoTicket('qr', 0);

  let r;
  try {
    r = await Ticket.escanear(archivo, estadoTicket);
  } catch (e) {
    console.warn('ticket', e);
    ticketOcupado = false;
    $('#ticketElegir').hidden = false;
    $('#ticketLeyendo').hidden = true;
    avisar(navigator.onLine === false
      ? 'Para la primera lectura hace falta internet: se baja el lector una sola vez.'
      : 'No pude leer esa imagen. Probá con otra foto.');
    return;
  }
  ticketOcupado = false;
  cerrarHoja('sheetTicket');
  Sonido.tocar('escaneo');
  abrirMov(null, prefillDeTicket(r));
}

function prefillDeTicket(r) {
  const recordados = comerciosRecordados();
  const clave = r.cuit ? 'cuit:' + r.cuit : r.comercio ? 'nom:' + normalizar(r.comercio) : '';
  const previo = clave ? recordados[clave] : null;
  const catOk = previo && db.categorias.some(c => c.id === previo.categoriaId && c.tipo === 'egreso');

  const descripcion = previo && previo.descripcion ? previo.descripcion
    : r.comercio ? r.comercio
    : r.cuit ? `Compra (CUIT ${Ticket.cuitLegible(r.cuit)})`
    : 'Compra con ticket';

  const partes = [];
  let revisar = false;
  let monto = r.monto;
  /* En la billetera en dólares: una factura en dólares queda con su
     importe original; un ticket en pesos se carga igual, pero avisando. */
  const enDolares = moneda() === 'USD';
  const facturaEnDolares = r.enOtraMoneda && r.enOtraMoneda.moneda === 'DOL';
  if (r.origen === 'qr') {
    partes.push('Leído del QR de la factura.');
    if (enDolares && facturaEnDolares) {
      monto = Math.round(r.enOtraMoneda.importe * 100) / 100;
      partes.push('La factura es en dólares: quedó el importe en dólares.');
    } else if (r.enOtraMoneda) partes.push(`Era en ${r.enOtraMoneda.moneda}: está pasado a pesos con la cotización de la factura.`);
    if (r.notaCredito) { partes.push('Ojo: es una nota de crédito (una devolución).'); revisar = true; }
  } else if (r.monto == null) {
    partes.push('No encontré el total: completalo a mano.'); revisar = true;
  } else if (r.confianza === 'alta') {
    partes.push('Leído del texto del ticket. Revisá que el total sea el correcto.');
  } else if (r.confianza === 'dudosa') {
    partes.push('El total leído no coincide con lo pagado en el ticket: revisalo antes de guardar.'); revisar = true;
  } else {
    partes.push('No vi la palabra TOTAL: puse el monto más probable, revisalo.'); revisar = true;
  }
  if (!r.fecha) partes.push('No encontré la fecha: quedó la de hoy.');
  if (enDolares && !facturaEnDolares && monto != null) {
    partes.push('Ojo: el ticket parece estar en pesos y estás en la billetera en dólares.');
    revisar = true;
  }

  return {
    tipo: 'egreso',
    monto,
    categoriaId: catOk ? previo.categoriaId : sugerirCategoriaTicket(r.comercio, r.texto),
    descripcion,
    fecha: r.fecha || hoyISO(),
    ticket: { echo: partes.join(' '), revisar, clave }
  };
}

/* ---------------------------------------------------------
   Parser de voz
   --------------------------------------------------------- */
const VERBOS_EGRESO  = ['gaste','gastar','pague','pagar','compre','comprar','abone','abonar','inverti','salio','salieron','cargue','cuesta','costo','puse','saque','retire','gasto','egreso','pagamos','compramos'];
const VERBOS_INGRESO = ['cobre','cobrar','gane','ganar','ingrese','ingresar','recibi','recibir','vendi','vender','entro','entraron','me pagaron','deposite','depositaron','cobramos','vendimos','facture'];
const VERBOS_AHORRO  = ['guarde','guardar','aparte','apartar','ahorre','ahorrar','separe','separar','destine','destinar','guardamos','ahorramos'];
/* Las palabras que mandan el movimiento a una billetera. "Lucas" o "palos"
   no cuentan: se usan igual para pesos y para dólares. */
const PALABRAS_MONEDA = {
  dolar: 'USD', dolares: 'USD', dolarcitos: 'USD', usd: 'USD', 'u$s': 'USD', 'us$': 'USD',
  peso: 'ARS', pesos: 'ARS', pesitos: 'ARS', ars: 'ARS'
};
const RELLENO = new Set([
  'en','de','del','la','el','los','las','un','una','unos','unas','por','para','a','al','con',
  'me','se','mi','mis','y','que','lo','pesos','peso','plata','mango','mangos','sobre',
  ...Object.keys(PALABRAS_MONEDA),
  'hoy','ayer','anteayer','antes','total','fue','fueron','son','es','mas','tambien','ahora',
  ...VERBOS_EGRESO.flatMap(v => v.split(' ')),
  ...VERBOS_INGRESO.flatMap(v => v.split(' ')),
  ...VERBOS_AHORRO.flatMap(v => v.split(' '))
]);

function parsearVoz(texto) {
  // `orig` conserva los acentos para la descripción; `tokens` va sin acentos para comparar
  const crudo = (texto || '').toString().toLowerCase()
    .replace(/[^\p{L}\p{N}\s$.,]/gu, ' ').replace(/\s+/g, ' ').trim();
  const orig = crudo.split(' ').filter(Boolean);
  const tokens = orig.map(t => t.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  const limpio = tokens.join(' ');
  const usado = new Array(tokens.length).fill(false);

  /* --- tipo --- */
  // gana el verbo que aparece primero en la frase
  const frase = ' ' + limpio + ' ';
  const dondeAparece = lista => lista.reduce((mejor, v) => {
    const i = frase.indexOf(' ' + v + ' ');
    return (i >= 0 && i < mejor) ? i : mejor;
  }, Infinity);
  const pE = dondeAparece(VERBOS_EGRESO);
  const pI = dondeAparece(VERBOS_INGRESO);
  const pA = dondeAparece(VERBOS_AHORRO);

  let tipo = 'egreso';
  if (pA < pE && pA < pI) tipo = 'ahorro';
  else if (pI < pE) tipo = 'ingreso';
  if (tipo === 'ahorro' && !db.cajas.length) tipo = 'egreso';   // sin cajas no hay dónde guardar

  /* --- fecha --- */
  let fecha = hoyISO();
  const d = new Date();
  if (/\banteayer\b|\bantes de ayer\b/.test(limpio)) { d.setDate(d.getDate() - 2); fecha = hoyISO(d); }
  else if (/\bayer\b/.test(limpio)) { d.setDate(d.getDate() - 1); fecha = hoyISO(d); }

  /* --- monto --- */
  let monto = null;
  // 1) dígitos, con multiplicador opcional después ("25 mil", "5k", "2 palos")
  for (let i = 0; i < tokens.length; i++) {
    if (!/\d/.test(tokens[i])) continue;
    // "5k" pegado
    const pegado = tokens[i].match(/^([\d.,]+)\s*(k|mil|lucas?|palos?|millones?|millon)$/);
    let base, mult = 1, consumidos = [i];
    if (pegado) { base = numeroDeTexto(pegado[1]); mult = MULTIPLICADOR[pegado[2]] || 1; }
    else {
      base = numeroDeTexto(tokens[i]);
      const sig = tokens[i + 1];
      if (sig && Object.prototype.hasOwnProperty.call(MULTIPLICADOR, sig)) { mult = MULTIPLICADOR[sig]; consumidos.push(i + 1); }
    }
    if (base != null) {
      monto = base * mult;
      consumidos.forEach(k => { usado[k] = true; });
      break;
    }
  }
  // 2) números escritos ("mil quinientos", "veinticinco mil")
  if (monto == null) {
    let mejor = null;
    for (let i = 0; i < tokens.length; i++) {
      if (!esNumPalabra(tokens[i]) || tokens[i] === 'y') continue;
      let j = i;
      while (j < tokens.length && esNumPalabra(tokens[j])) j++;
      const trozo = tokens.slice(i, j);
      const val = evaluarPalabras(trozo);
      // "una cuota" no es un monto: pido multiplicador, varias palabras, o un valor creíble
      const creible = val != null && val > 0 &&
        (trozo.some(t => Object.prototype.hasOwnProperty.call(MULTIPLICADOR, t)) || trozo.length > 1 || val >= 10);
      if (creible && (!mejor || (j - i) > (mejor.j - mejor.i))) mejor = { i, j, val };
      i = j - 1;
    }
    if (mejor) { monto = mejor.val; for (let k = mejor.i; k < mejor.j; k++) usado[k] = true; }
  }

  /* --- resto de la frase --- */
  const resto = tokens.filter((t, i) => !usado[i]);
  const restoStr = ' ' + resto.join(' ') + ' ';

  /* --- destino: gana el nombre o la clave más larga que aparezca --- */
  const aparece = cand => {
    if (!cand) return false;
    const re = new RegExp('(?:^|\\s)' + cand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:s|es)?(?:\\s|$)');
    return re.test(restoStr);
  };

  let categoriaId = null, cajaId = null, sentido = null, mejorLargo = 0;

  if (tipo === 'ahorro') {
    sentido = 'aporte';   // por voz solo se guarda; para sacar se usa la caja
    for (const c of db.cajas) {
      const cand = normalizar(c.nombre);
      if (aparece(cand) && cand.length > mejorLargo) { mejorLargo = cand.length; cajaId = c.id; }
    }
    if (!cajaId) cajaId = db.cajas[0].id;
  } else {
    for (const c of catsDe(tipo)) {
      for (const cand of [normalizar(c.nombre), ...(c.claves || []).map(normalizar)]) {
        if (aparece(cand) && cand.length > mejorLargo) { mejorLargo = cand.length; categoriaId = c.id; }
      }
    }
  }

  /* --- descripción --- */
  const palabras = orig.filter((t, i) => !usado[i] && !RELLENO.has(tokens[i]) && /\p{L}/u.test(t));
  let descripcion = palabras.join(' ').trim();
  if (descripcion) descripcion = descripcion.charAt(0).toUpperCase() + descripcion.slice(1);

  /* --- moneda: la que se nombre, si se nombra alguna --- */
  const nombrada = tokens.find(t => PALABRAS_MONEDA[t]);

  return { tipo, monto, categoriaId, cajaId, sentido, descripcion, fecha, textoVoz: texto.trim(),
           moneda: nombrada ? PALABRAS_MONEDA[nombrada] : null };
}

/* ---------------------------------------------------------
   Estado de la interfaz
   --------------------------------------------------------- */
let vista = 'resumen';
let mesSel = hoyISO().slice(0, 7);
let filtroMov = 'todos';
let busqueda = '';

/* Filtros avanzados (Premium). `periodo` en meses hacia atrás; 0 = sólo el
   mes que se está viendo, que es el comportamiento de siempre. */
let filtros = { periodo: 0, cats: [], montoMin: null, montoMax: null };
const filtrosActivos = () =>
  filtros.periodo !== 0 || filtros.cats.length > 0 ||
  filtros.montoMin != null || filtros.montoMax != null;
let catTipoVista = 'egreso';
let mesVista = 'grafico';
let grupoActivo = null;

let editandoMov  = null;   // id o null
let editandoCat  = null;   // id o null
let editandoCaja = null;   // id o null
let borradorTipo = 'egreso';
let borradorCatId = null;
let borradorCajaId = null;
let borradorSentido = 'aporte';
let borradorEmoji = '🏷️';
let borradorCatTipo = 'egreso';
let borradorCajaEmoji = '🏦';

/* ---------------------------------------------------------
   Avisos
   --------------------------------------------------------- */
let toastT = null;
function avisar(msg) {
  /* Cada aviso suena según lo que dice, salvo que la acción ya haya
     hecho su propio sonido recién (guardar un gasto, por ejemplo). */
  if (window.Sonido) {
    Sonido.sugerir(/^no |no pude|no se pudo|no hay|falta|error|sin permiso/i.test(msg) ? 'error'
      : /eliminad|borrad|quitad|desactivad/i.test(msg) ? 'borrar' : 'exito');
  }
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('se-va');
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => {
    if (reducirMovimiento()) { t.hidden = true; return; }
    t.classList.add('se-va');
    setTimeout(() => { t.hidden = true; t.classList.remove('se-va'); }, DUR_SALIDA);
  }, 2600);
}

/* ---------------------------------------------------------
   Diálogo propio
   El confirm() del sistema no se puede estilar, sólo ofrece dos opciones y
   dentro del WebView del APK no siempre aparece. Este lo reemplaza y además
   permite preguntas de tres caminos (por ejemplo: reemplazar o fusionar).
   --------------------------------------------------------- */
let dlgResolver = null;

/** Devuelve la clave de la acción elegida, o null si se cerró sin elegir. */
function preguntar({ titulo, texto, acciones }) {
  return new Promise(resolver => {
    $('#dlgTitle').textContent = titulo;

    const cuerpo = $('#dlgTexto');
    cuerpo.innerHTML = '';
    (Array.isArray(texto) ? texto : [texto]).filter(Boolean).forEach(t => {
      const p = document.createElement('p');
      p.className = 'dialog-text';
      p.textContent = t;
      cuerpo.appendChild(p);
    });

    const cont = $('#dlgActions');
    cont.innerHTML = '';
    acciones.forEach(a => {
      const b = document.createElement('button');
      const estilo = a.estilo === 'peligro' ? 'btn-danger'
        : a.estilo === 'primario' ? 'btn-primary' : 'btn-ghost';
      b.className = `btn ${estilo}`;
      b.type = 'button';
      b.textContent = a.texto;
      b.addEventListener('click', () => cerrarDlg(a.clave));
      cont.appendChild(b);
      if (a.nota) {
        const n = document.createElement('p');
        n.className = 'dialog-nota';
        n.textContent = a.nota;
        cont.appendChild(n);
      }
    });

    dlgResolver = resolver;

    /* Un diálogo puede abrirse mientras el anterior todavía se está
       yendo —pasa en toda confirmación de dos pasos—. Si no se cancela
       aquella salida, su temporizador esconde este diálogo recién
       abierto y la app parece trabada. */
    clearTimeout(salidaDlg);
    salidaDlg = null;
    $('#dlg').classList.remove('se-va');
    $('#dlgBack').classList.remove('se-va');

    $('#dlgBack').hidden = false;
    $('#dlg').hidden = false;
    document.body.style.overflow = 'hidden';
    const primero = cont.querySelector('button');
    if (primero) primero.focus();
  });
}

let salidaDlg = null;

function cerrarDlg(valor = null) {
  const dlg = $('#dlg'), fondo = $('#dlgBack');
  if (reducirMovimiento()) {
    dlg.hidden = true; fondo.hidden = true;
  } else {
    dlg.classList.add('se-va'); fondo.classList.add('se-va');
    clearTimeout(salidaDlg);
    salidaDlg = setTimeout(() => {
      dlg.hidden = true; fondo.hidden = true;
      dlg.classList.remove('se-va'); fondo.classList.remove('se-va');
      salidaDlg = null;
    }, DUR_SALIDA);
  }
  // El scroll se libera sólo si abajo no quedó una hoja abierta.
  if (!$('.sheet:not([hidden])')) document.body.style.overflow = '';
  const r = dlgResolver;
  dlgResolver = null;
  if (r) r(valor);
}

/** Atajo para un sí/no. */
const confirmar = (titulo, texto, textoSi = 'Sí, dale', peligro = false) =>
  preguntar({
    titulo, texto,
    acciones: [
      { clave: 'si', texto: textoSi, estilo: peligro ? 'peligro' : 'primario' },
      { clave: null, texto: 'Cancelar' }
    ]
  }).then(r => r === 'si');

/* ---------------------------------------------------------
   Render: Resumen
   --------------------------------------------------------- */
function totales(ym) {
  let ingresos = 0, egresos = 0, ahorro = 0;
  for (const m of movsDelMes(ym)) {
    if (m.tipo === 'ingreso') ingresos += m.monto;
    else if (m.tipo === 'ahorro') ahorro += m.monto * signoAhorro(m);
    else egresos += m.monto;
  }
  // `ahorro` es el neto del mes: positivo si guardaste, negativo si sacaste.
  return { ingresos, egresos, ahorro, balance: ingresos - egresos - ahorro };
}

function renderResumen() {
  pintarAccesoResumenMes();
  pintarAvisoVersion();
  pintarAvisoCopia();
  pintarAvisoFijos();
  pintarAvisoPresu();
  $('#mesLabel').textContent = mesLegible(mesSel);
  $('#mesLabel2').textContent = mesLegible(mesSel);

  const t = totales(mesSel);
  const tPrev = totales(mesSumar(mesSel, -1));

  const hero = $('#heroBalance');
  hero.textContent = plata(t.balance);
  hero.style.color = t.balance < 0 ? 'var(--bad)' : 'var(--ink)';

  const cant = movsDelMes(mesSel).length;
  const plural = `${cant} movimiento${cant === 1 ? '' : 's'}`;
  let nota;
  if (cant === 0) nota = 'Todavía no cargaste movimientos este mes.';
  else if (t.ahorro > 0) nota = `${plural} · ${plata(t.ahorro)} fueron a ahorro`;
  else if (t.ahorro < 0) nota = `${plural} · sacaste ${plata(-t.ahorro)} del ahorro`;
  else if (t.ingresos > 0 && t.balance >= 0) nota = `${plural} · te sobró el ${Math.round((t.balance / t.ingresos) * 100)}% de lo que entró`;
  else if (t.balance < 0) nota = `${plural} · gastaste más de lo que entró`;
  else nota = `${plural} · todavía no registraste ingresos`;
  $('#heroNota').textContent = nota;

  $('#kpiIngresos').textContent = plata(t.ingresos);
  $('#kpiEgresos').textContent = plata(t.egresos);
  $('#kpiIngresosDelta').innerHTML = delta(t.ingresos, tPrev.ingresos, false);
  $('#kpiEgresosDelta').innerHTML  = delta(t.egresos, tPrev.egresos, true);

  renderAhorroCard(t);
  renderCatChart(t.egresos);
  renderMesChart();
  renderMesTabla();
}

function renderAhorroCard(t) {
  const card = $('#cardAhorro');
  if (!db.cajas.length) { card.hidden = true; return; }
  card.hidden = false;

  $('#ahorroTotal').textContent = plata(totalAhorrado());
  $('#ahorroSub').textContent =
      t.ahorro > 0 ? `+${plata(t.ahorro)} este mes`
    : t.ahorro < 0 ? `−${plata(-t.ahorro)} este mes`
    : 'Sin movimientos este mes';

  const filas = db.cajas.map(c => ({ ...c, saldo: saldoCaja(c.id) }))
    .sort((a, b) => b.saldo - a.saldo);
  $('#ahorroCajas').innerHTML = filas.map(c => `
    <div class="cajamini">
      <span class="cajamini-emoji">${esc(c.emoji)}</span>
      <span class="cajamini-name">${esc(c.nombre)}</span>
      <span class="cajamini-val">${plata(c.saldo)}</span>
    </div>`).join('');
}

function delta(ahora, antes, subirEsMalo) {
  if (!antes) return antes === 0 && ahora === 0 ? '' : '<span>sin dato del mes anterior</span>';
  const pct = Math.round(((ahora - antes) / antes) * 100);
  if (pct === 0) return '<span>igual que el mes pasado</span>';
  const sube = pct > 0;
  const clase = sube === subirEsMalo ? 'up' : 'down';
  return `<span class="${clase}">${sube ? '▲' : '▼'} ${Math.abs(pct)}% vs. mes pasado</span>`;
}

function renderCatChart(totalEgresos) {
  const cont = $('#catChart');
  const sub = $('#catChartSub');
  const movs = movsDelMes(mesSel).filter(m => m.tipo === 'egreso');

  if (!movs.length) {
    sub.textContent = 'Sin egresos este mes';
    cont.innerHTML = vacio('🧾', 'Nada para mostrar', 'Cargá un gasto y vas a ver acá el reparto por categoría.');
    return;
  }

  const porCat = new Map();
  for (const m of movs) {
    const k = m.categoriaId || 'sin';
    porCat.set(k, (porCat.get(k) || 0) + m.monto);
  }
  const filas = Array.from(porCat.entries())
    .map(([id, monto]) => {
      const c = catPorId(id);
      return { nombre: c ? c.nombre : 'Sin categoría', emoji: c ? c.emoji : '❓', monto };
    })
    .sort((a, b) => b.monto - a.monto);

  const max = filas[0].monto;
  sub.textContent = `${filas.length} categoría${filas.length === 1 ? '' : 's'} · ${plata(totalEgresos)} en total`;

  cont.innerHTML = filas.map(f => {
    const pct = totalEgresos ? Math.round((f.monto / totalEgresos) * 100) : 0;
    const ancho = Math.max(2, (f.monto / max) * 100);
    return `<div class="catrow">
      <div class="catrow-top">
        <span class="catrow-emoji">${esc(f.emoji)}</span>
        <span class="catrow-name">${esc(f.nombre)}</span>
        <span class="catrow-pct">${pct}%</span>
        <span class="catrow-val">${plata(f.monto)}</span>
      </div>
      <div class="catrow-track"><div class="catrow-fill" style="width:${ancho}%"></div></div>
    </div>`;
  }).join('');
}

function ultimosMeses(n = 6) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ym = mesSumar(mesSel, -i);
    out.push({ ym, ...totales(ym) });
  }
  return out;
}

function renderMesChart() {
  const cont = $('#mesChart');
  const datos = ultimosMeses(6);
  const hayAlgo = datos.some(d => d.ingresos || d.egresos);

  if (!hayAlgo) {
    cont.innerHTML = vacio('📈', 'Sin historial todavía', 'Con dos o tres meses cargados vas a poder comparar.');
    return;
  }

  const W = Math.max(280, cont.clientWidth || 320);
  const H = 190, padL = 42, padR = 8, padT = 10, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const maxVal = Math.max(...datos.flatMap(d => [d.ingresos, d.egresos]), 1);
  const tope = escalaLinda(maxVal);
  const y = v => padT + plotH - (v / tope) * plotH;

  const bandW = plotW / datos.length;
  const GAP = 2;                                       // separador de superficie
  const barW = Math.min(20, (bandW - 18 - GAP) / 2);
  const mesHoy = hoyISO().slice(0, 7);

  const ticks = [0, tope / 2, tope];
  const grid = ticks.map(v => `
    <line class="${v === 0 ? 'base-line' : 'grid-line'}" x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}"/>
    <text class="tick" x="${padL - 7}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${v === 0 ? '0' : plataCorta(v, false)}</text>`).join('');

  const barras = datos.map((d, i) => {
    const cx = padL + bandW * i + bandW / 2;
    const xIn = cx - barW - GAP / 2;
    const xOut = cx + GAP / 2;
    const hIn = Math.max(d.ingresos > 0 ? 2 : 0, (d.ingresos / tope) * plotH);
    const hOut = Math.max(d.egresos > 0 ? 2 : 0, (d.egresos / tope) * plotH);
    const base = padT + plotH;
    return `
      ${grupoActivo === i ? `<rect class="group-on" x="${(padL + bandW * i + 2).toFixed(1)}" y="${padT - 4}" width="${(bandW - 4).toFixed(1)}" height="${plotH + 8}" rx="8"/>` : ''}
      ${hIn > 0 ? barraSVG(xIn, base - hIn, barW, hIn, 'bar-in') : ''}
      ${hOut > 0 ? barraSVG(xOut, base - hOut, barW, hOut, 'bar-out') : ''}
      <text class="xlab ${d.ym === mesHoy ? 'is-now' : ''}" x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${mesCorto(d.ym)}</text>
      <rect class="hit" data-grupo="${i}" x="${(padL + bandW * i).toFixed(1)}" y="${padT - 6}" width="${bandW.toFixed(1)}" height="${plotH + 24}" tabindex="0" role="button"
            aria-label="${mesLegible(d.ym)}: ingresos ${plata(d.ingresos)}, egresos ${plata(d.egresos)}"/>`;
  }).join('');

  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
     aria-label="Ingresos y egresos de los últimos 6 meses">${grid}${barras}</svg>
     <div id="mesTip"></div>`;

  if (grupoActivo != null && datos[grupoActivo]) {
    const d = datos[grupoActivo];
    $('#mesTip').innerHTML = `<div class="mes-tip">
      <b style="text-transform:capitalize">${esc(mesLegible(d.ym))}</b>
      <div class="row"><span class="key key-in"></span><span>Ingresos</span><span>${plata(d.ingresos)}</span></div>
      <div class="row"><span class="key key-out"></span><span>Egresos</span><span>${plata(d.egresos)}</span></div>
      ${d.ahorro ? `<div class="row"><span class="key key-ah"></span><span>${d.ahorro > 0 ? 'A ahorro' : 'Del ahorro'}</span><span>${plata(Math.abs(d.ahorro))}</span></div>` : ''}
      <div class="row"><span style="width:10px"></span><span>Balance</span><span>${plata(d.balance)}</span></div>
    </div>`;
  }

  $$('#mesChart .hit').forEach(el => {
    const act = () => {
      const i = Number(el.dataset.grupo);
      grupoActivo = grupoActivo === i ? null : i;
      renderMesChart();
    };
    el.addEventListener('click', act);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
  });
}

/** Columna con extremo de dato redondeado (4px) y base cuadrada */
function barraSVG(x, yTop, w, h, clase) {
  const r = Math.min(4, w / 2, h);
  return `<path class="${clase}" d="M${x.toFixed(1)} ${(yTop + h).toFixed(1)} L${x.toFixed(1)} ${(yTop + r).toFixed(1)} Q${x.toFixed(1)} ${yTop.toFixed(1)} ${(x + r).toFixed(1)} ${yTop.toFixed(1)} L${(x + w - r).toFixed(1)} ${yTop.toFixed(1)} Q${(x + w).toFixed(1)} ${yTop.toFixed(1)} ${(x + w).toFixed(1)} ${(yTop + r).toFixed(1)} L${(x + w).toFixed(1)} ${(yTop + h).toFixed(1)} Z"/>`;
}

function escalaLinda(max) {
  const mag = Math.pow(10, Math.floor(Math.log10(max)));
  for (const paso of [1, 2, 2.5, 5, 10]) {
    const t = paso * mag;
    if (t >= max) return t;
  }
  return 10 * mag;
}

function renderMesTabla() {
  const datos = ultimosMeses(6);
  $('#mesTabla').innerHTML = `<table>
    <thead><tr><th>Mes</th><th>Ingresos</th><th>Egresos</th><th>Ahorro</th><th>Balance</th></tr></thead>
    <tbody>${datos.map(d => `<tr>
      <td style="text-transform:capitalize">${esc(mesLegible(d.ym))}</td>
      <td>${plata(d.ingresos)}</td>
      <td>${plata(d.egresos)}</td>
      <td>${d.ahorro ? plata(d.ahorro) : '—'}</td>
      <td>${plata(d.balance)}</td>
    </tr>`).join('')}</tbody></table>`;
}

const vacio = (emoji, titulo, texto) =>
  `<div class="empty"><div class="empty-emoji">${emoji}</div><p class="empty-title">${esc(titulo)}</p><p class="empty-text">${esc(texto)}</p></div>`;

/* ---------------------------------------------------------
   Render: Movimientos
   --------------------------------------------------------- */
function renderMovimientos() {
  const cont = $('#listaMov');
  const q = normalizar(busqueda);

  /* Sin Premium los filtros avanzados no se aplican aunque hubieran quedado
     puestos: el alcance vuelve al mes que se está mirando. */
  const avanzado = puede('filtros');
  let movs = (avanzado && filtros.periodo !== 0)
    ? movimientosDelPeriodo(filtros.periodo)
    : movsDelMes(mesSel);

  if (filtroMov !== 'todos') movs = movs.filter(m => m.tipo === filtroMov);

  if (avanzado) {
    if (filtros.cats.length) {
      const set = new Set(filtros.cats);
      movs = movs.filter(m => set.has(m.categoriaId));
    }
    if (filtros.montoMin != null) movs = movs.filter(m => m.monto >= filtros.montoMin);
    if (filtros.montoMax != null) movs = movs.filter(m => m.monto <= filtros.montoMax);
  }

  if (q) movs = movs.filter(m => {
    const c = m.tipo === 'ahorro' ? cajaPorId(m.cajaId) : catPorId(m.categoriaId);
    return normalizar(m.descripcion).includes(q) || normalizar(c ? c.nombre : '').includes(q);
  });

  pintarResumenFiltros(movs, avanzado);

  if (!movs.length) {
    const donde = (avanzado && filtros.periodo !== 0)
      ? 'en el período elegido' : 'en ' + mesLegible(mesSel);
    cont.innerHTML = db.movimientos.length
      ? vacio('🔍', 'Nada por acá', `No hay movimientos con esos filtros ${donde}.`)
      : vacio('🎤', 'Empezá cargando uno', 'Tocá «Voz» y decí algo como «gasté 25 mil en nafta», o cargalo a mano con el +.');
    return;
  }

  movs.sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || '').localeCompare(a.creado || ''));

  const porDia = new Map();
  for (const m of movs) {
    if (!porDia.has(m.fecha)) porDia.set(m.fecha, []);
    porDia.get(m.fecha).push(m);
  }

  cont.innerHTML = Array.from(porDia.entries()).map(([fecha, lista]) => {
    const neto = lista.reduce((s, m) => s + efectoDisponible(m), 0);
    return `<div class="daygroup">
      <div class="dayhead"><span>${esc(fechaLegible(fecha))}</span><span class="daysum">${neto >= 0 ? '+' : '−'}${plata(Math.abs(neto)).replace('-', '')}</span></div>
      <div class="movlist">${lista.map(filaMov).join('')}</div>
    </div>`;
  }).join('');

  $$('#listaMov .movrow').forEach(el => el.addEventListener('click', () => abrirMov(el.dataset.id)));
}

function filaMov(m) {
  const esAhorro = m.tipo === 'ahorro';
  const retiro = esAhorro && m.sentido === 'retiro';
  const caja = esAhorro ? cajaPorId(m.cajaId) : null;
  const c = esAhorro ? null : catPorId(m.categoriaId);
  const entra = efectoDisponible(m) > 0;      // respecto de la plata disponible
  const signo = entra ? '+' : '−';
  const titulo = m.descripcion ||
    (esAhorro ? (retiro ? 'Saqué del ahorro' : 'Guardé en el ahorro') : (c ? c.nombre : 'Movimiento'));
  const sub = esAhorro
    ? `Ahorro · ${caja ? caja.nombre : 'caja eliminada'}`
    : (c ? c.nombre : 'Sin categoría');
  const emoji = esAhorro ? (caja ? caja.emoji : '🏦') : (c ? c.emoji : '❓');
  const micro = m.porVoz
    ? `<svg viewBox="0 0 24 24" aria-label="cargado por voz"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M5 11a7 7 0 0 0 14 0" fill="none" stroke="currentColor" stroke-width="2"/></svg>`
    : '';
  return `<button class="movrow" data-id="${m.id}">
    <span class="mov-emoji ${esAhorro ? 'is-ahorro' : ''}">${esc(emoji)}</span>
    <span class="mov-mid">
      <span class="mov-name">${esc(titulo)}</span>
      <span class="mov-sub">${micro}${esc(sub)}</span>
    </span>
    <span class="mov-amt ${entra ? 'is-in' : 'is-out'}">${signo}${plata(m.monto).replace('-', '')}</span>
  </button>`;
}

/* ---------------------------------------------------------
   Render: Categorías
   --------------------------------------------------------- */
function renderCategorias() {
  const cont = $('#listaCat');
  const lista = catsDe(catTipoVista);
  if (!lista.length) {
    cont.innerHTML = vacio('🏷️', 'Sin categorías', 'Creá la primera con el botón de abajo.');
    return;
  }
  const uso = new Map();
  for (const m of db.movimientos) uso.set(m.categoriaId, (uso.get(m.categoriaId) || 0) + 1);

  cont.innerHTML = `<div class="catlist">${lista.map(c => `
    <button class="catitem" data-id="${c.id}">
      <span class="catitem-emoji">${esc(c.emoji)}</span>
      <span class="catitem-name">${esc(c.nombre)}</span>
      <span class="catitem-count">${uso.get(c.id) || 0}</span>
      <svg class="catitem-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>`).join('')}</div>`;

  $$('#listaCat .catitem').forEach(el => el.addEventListener('click', () => abrirCat(el.dataset.id)));
}

/* ---------------------------------------------------------
   Render: Ahorros
   --------------------------------------------------------- */
function renderAhorros() {
  const total = totalAhorrado();
  const t = totales(mesSel);
  $('#ahorroHero').textContent = plata(total);
  $('#ahorroHero').style.color = total < 0 ? 'var(--bad)' : 'var(--ink)';

  const n = db.cajas.length;
  $('#ahorroHeroNota').textContent = !n
    ? 'Creá tu primera caja para empezar.'
    : t.ahorro > 0 ? `Este mes sumaste ${plata(t.ahorro)}`
    : t.ahorro < 0 ? `Este mes sacaste ${plata(-t.ahorro)}`
    : `Repartido en ${n} caja${n === 1 ? '' : 's'}`;

  renderAhorroChart();
  renderListaCajas();
}

function renderListaCajas() {
  const cont = $('#listaCajas');
  if (!db.cajas.length) {
    cont.innerHTML = vacio('🏦', 'Sin cajas todavía',
      'Una caja es un destino para tu plata: «Fondo de emergencia», «Vacaciones», «Camioneta». Creá la primera acá abajo.');
    return;
  }
  const filas = db.cajas.map(c => ({ ...c, saldo: saldoCaja(c.id) }));
  const tope = Math.max(...filas.map(c => Math.max(0, c.saldo)), 1);

  cont.innerHTML = `<div class="catlist">${filas.map(c => `
    <button class="cajaitem" data-id="${c.id}">
      <span class="catitem-emoji">${esc(c.emoji)}</span>
      <span class="cajaitem-mid">
        <span class="catitem-name">${esc(c.nombre)}</span>
        <span class="cajaitem-track"><span class="cajaitem-fill" style="width:${(Math.max(0, c.saldo) / tope) * 100}%"></span></span>
      </span>
      <span class="cajaitem-val">${plata(c.saldo)}</span>
      <svg class="catitem-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>`).join('')}</div>`;

  $$('#listaCajas .cajaitem').forEach(el => el.addEventListener('click', () => abrirCaja(el.dataset.id)));
}

/* Área + línea: la evolución del saldo acumulado mes a mes. Una sola serie,
   así que no lleva leyenda; el valor final va etiquetado sobre la punta. */
function renderAhorroChart() {
  const cont = $('#ahorroChart');
  const datos = [];
  for (let i = 5; i >= 0; i--) {
    const ym = mesSumar(mesSel, -i);
    datos.push({ ym, saldo: saldoAlCierre(ym) });
  }
  if (!datos.some(d => d.saldo !== 0)) {
    cont.innerHTML = vacio('🪴', 'Todavía no hay historial',
      'Cuando empieces a destinar plata al ahorro vas a ver acá cómo crece.');
    return;
  }

  const W = Math.max(280, cont.clientWidth || 320);
  const H = 190, padL = 46, padR = 16, padT = 22, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const tope = escalaLinda(Math.max(...datos.map(d => d.saldo), 1));
  const x = i => padL + (plotW / (datos.length - 1)) * i;
  const y = v => padT + plotH - (Math.max(0, v) / tope) * plotH;
  const base = padT + plotH;
  const mesHoy = hoyISO().slice(0, 7);

  const ticks = [0, tope / 2, tope];
  const grid = ticks.map(v => `
    <line class="${v === 0 ? 'base-line' : 'grid-line'}" x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}"/>
    <text class="tick" x="${padL - 7}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${v === 0 ? '0' : plataCorta(v, false)}</text>`).join('');

  const puntos = datos.map((d, i) => `${x(i).toFixed(1)},${y(d.saldo).toFixed(1)}`).join(' L');
  const area = `M${x(0).toFixed(1)},${base} L${puntos} L${x(datos.length - 1).toFixed(1)},${base} Z`;
  const linea = `M${puntos}`;

  const ultimo = datos[datos.length - 1];
  const ux = x(datos.length - 1), uy = y(ultimo.saldo);
  const arriba = uy - 12 > padT;

  const xlabs = datos.map((d, i) =>
    `<text class="xlab ${d.ym === mesHoy ? 'is-now' : ''}" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${mesCorto(d.ym)}</text>`).join('');

  cont.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img"
     aria-label="Saldo ahorrado al cierre de cada uno de los últimos 6 meses. Hoy: ${plata(ultimo.saldo)}">
    ${grid}
    <path class="ah-area" d="${area}"/>
    <path class="ah-line" d="${linea}" fill="none"/>
    <circle class="ah-dot" cx="${ux.toFixed(1)}" cy="${uy.toFixed(1)}" r="4.5"/>
    <text class="ah-lab" x="${Math.min(ux, W - padR).toFixed(1)}" y="${(arriba ? uy - 12 : uy + 20).toFixed(1)}" text-anchor="end">${plata(ultimo.saldo)}</text>
    ${xlabs}
  </svg>`;
}

/* ---------------------------------------------------------
   Navegación
   --------------------------------------------------------- */
function irA(v) {
  const cambia = vista !== v;
  vista = v;
  $$('.view').forEach(s => { s.hidden = s.id !== 'view-' + v; });

  /* La vista que entra aparece con un desplazamiento mínimo. Se
     reinicia la animación quitando y volviendo a poner la clase, si no
     el navegador la ignora al repetir la misma vista. */
  if (cambia && !reducirMovimiento()) {
    const sec = $('#view-' + v);
    if (sec) { sec.classList.remove('entra'); void sec.offsetWidth; sec.classList.add('entra'); }
  }
  $$('.nav-btn').forEach(b => b.classList.toggle('is-on', b.dataset.view === v));
  $('#viewTitle').textContent = { resumen: 'Resumen', movimientos: 'Movimientos', ahorros: 'Ahorros', categorias: 'Categorías' }[v];
  window.scrollTo({ top: 0 });
  renderTodo();
}

/* Tope de navegación: el mes actual. Si por una copia vieja hubiera movimientos
   más adelante, se corre hasta ahí para no dejarlos escondidos. */
function mesTope() {
  return db.movimientos.reduce((max, m) => {
    const ym = mesDeISO(m.fecha);
    return ym > max ? ym : max;
  }, hoyISO().slice(0, 7));
}

function actualizarNavMes() {
  const alTope = mesSel >= mesTope();
  ['#mesNext', '#mesNext2'].forEach(sel => {
    const b = $(sel);
    b.disabled = alTope;
    b.setAttribute('aria-disabled', String(alTope));
    b.title = alTope ? 'No hay meses posteriores' : 'Mes siguiente';
  });
}

function renderTodo() {
  actualizarNavMes();
  if (vista === 'resumen') { renderResumen(); renderMetas(); renderPresupuestos(); }
  if (vista === 'movimientos') { $('#mesLabel2').textContent = mesLegible(mesSel); pintarAccesoFijos(); pintarAccesoFiltros(); renderMovimientos(); }
  if (vista === 'ahorros') { renderAhorros(); pintarCupo('#cupoCajas', 'cajas'); }
  if (vista === 'categorias') {
    renderCategorias();
    pintarCupo('#cupoCat', catTipoVista === 'ingreso' ? 'catIngreso' : 'catEgreso');
  }
}

function cambiarMes(delta) {
  const destino = mesSumar(mesSel, delta);
  if (destino > mesTope()) return;        // no se navega al futuro
  mesSel = destino;
  /* El balance cambia solo y sin aviso al pasar de mes; este golpecito
     es lo que hace que la vista no se sienta un salto. */
  const h = $('#heroBalance');
  if (h && !reducirMovimiento()) { h.classList.remove('cambia'); void h.offsetWidth; h.classList.add('cambia'); }
  grupoActivo = null;
  renderTodo();
}

/* ---------------------------------------------------------
   Hojas
   --------------------------------------------------------- */
/* Las hojas entran y salen animadas. Lo que más se notaba era la
   salida: abrían deslizándose y desaparecían de golpe, que es lo que
   hace sentir una app «dura». Ahora bajan antes de esconderse.

   El `hidden` se pone recién al terminar, pero la hoja deja de recibir
   toques apenas empieza a irse: si no, un segundo toque durante la
   animación vuelve a disparar la acción. */
const DUR_SALIDA = 200;
const salidas = new Map();

function abrirHoja(id) {
  const hoja = $(`#${id}`), fondo = $(`#${id}Back`);
  const pend = salidas.get(id);
  if (pend) { clearTimeout(pend); salidas.delete(id); }

  hoja.classList.remove('se-va');
  fondo.classList.remove('se-va');
  fondo.hidden = false;
  hoja.hidden = false;
  document.body.style.overflow = 'hidden';
}

function cerrarHoja(id) {
  const hoja = $(`#${id}`), fondo = $(`#${id}Back`);
  if (!hoja || hoja.hidden) return;

  if (reducirMovimiento()) {
    hoja.hidden = true; fondo.hidden = true;
    if (!$('.sheet:not([hidden])')) document.body.style.overflow = '';
    return;
  }

  hoja.classList.add('se-va');
  fondo.classList.add('se-va');

  const t = setTimeout(() => {
    hoja.hidden = true; fondo.hidden = true;
    hoja.classList.remove('se-va');
    fondo.classList.remove('se-va');
    salidas.delete(id);
    if (!$('.sheet:not([hidden])')) document.body.style.overflow = '';
  }, DUR_SALIDA);
  salidas.set(id, t);
}

/** Respeta la preferencia del sistema: hay gente a la que el movimiento
    le marea, y otra que lo apaga por batería. */
const reducirMovimiento = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- hoja de movimiento ---- */
function pintarCatPicker() {
  const cont = $('#fCategoria');

  if (borradorTipo === 'ahorro') {
    if (!db.cajas.length) {
      cont.innerHTML = `<p class="field-help">Todavía no tenés cajas de ahorro. Creá una en la pestaña Ahorros.</p>`;
      return;
    }
    if (!db.cajas.some(c => c.id === borradorCajaId)) borradorCajaId = db.cajas[0].id;
    cont.innerHTML = db.cajas.map(c => `
      <button type="button" class="catchip ${c.id === borradorCajaId ? 'is-on' : ''}" data-id="${c.id}">
        <span class="e">${esc(c.emoji)}</span>${esc(c.nombre)}
      </button>`).join('');
    $$('#fCategoria .catchip').forEach(el => el.addEventListener('click', () => {
      borradorCajaId = el.dataset.id;
      pintarCatPicker();
      actualizarTope();
    }));
    return;
  }

  const lista = catsDe(borradorTipo);
  if (!lista.length) {
    cont.innerHTML = `<p class="field-help">No hay categorías de ${borradorTipo}s. Creá una en la pestaña Categorías.</p>`;
    return;
  }
  if (!lista.some(c => c.id === borradorCatId)) borradorCatId = lista[0].id;
  cont.innerHTML = lista.map(c => `
    <button type="button" class="catchip ${c.id === borradorCatId ? 'is-on' : ''}" data-id="${c.id}">
      <span class="e">${esc(c.emoji)}</span>${esc(c.nombre)}
    </button>`).join('');
  $$('#fCategoria .catchip').forEach(el => el.addEventListener('click', () => {
    borradorCatId = el.dataset.id;
    pintarCatPicker();
  }));
}

function setTipoBorrador(t) {
  borradorTipo = t;
  $('#tipoEgreso').classList.toggle('is-on', t === 'egreso');
  $('#tipoIngreso').classList.toggle('is-on', t === 'ingreso');
  $('#tipoAhorro').classList.toggle('is-on', t === 'ahorro');
  $('#segSentido').hidden = t !== 'ahorro';
  $('#lblCategoria').textContent = t === 'ahorro' ? 'Caja de ahorro' : 'Categoría';
  actualizarTope();
  $('#fDesc').placeholder = t === 'ahorro' ? 'Ej.: para el viaje a Brasil'
    : t === 'ingreso' ? 'Ej.: cobranza del mostrador'
    : 'Ej.: nafta de la camioneta';
  pintarCatPicker();
}

function setSentidoBorrador(sen) {
  borradorSentido = sen;
  $('#sentidoAporte').classList.toggle('is-on', sen === 'aporte');
  $('#sentidoRetiro').classList.toggle('is-on', sen === 'retiro');
  actualizarTope();
}

/* Mostrar el techo antes de escribir el monto evita el error en vez de avisarlo. */
function actualizarTope() {
  const el = $('#fTope');
  if (borradorTipo !== 'ahorro') { el.hidden = true; return; }
  el.hidden = false;

  let tope, texto;
  if (borradorSentido === 'retiro') {
    tope = borradorCajaId ? saldoCaja(borradorCajaId, editandoMov) : 0;
    texto = tope > 0 ? `En esta caja hay ${plata(tope)}` : 'Esta caja está vacía';
  } else {
    tope = disponible(editandoMov);
    texto = tope > 0
      ? `Tenés ${plata(tope)} disponibles para guardar`
      : 'No te queda plata disponible para guardar';
  }
  el.textContent = texto;
  el.classList.toggle('is-cero', tope <= 0);
}

function abrirMov(id = null, prefill = null) {
  editandoMov = id;
  $('#fError').hidden = true;
  const echo = $('#voiceEcho');

  if (id) {
    const m = db.movimientos.find(x => x.id === id);
    if (!m) return;
    $('#sheetMovTitle').textContent = 'Editar movimiento';
    $('#btnBorrarMov').hidden = false;
    borradorCatId = m.categoriaId;
    borradorCajaId = m.cajaId || null;
    setSentidoBorrador(m.sentido || 'aporte');
    setTipoBorrador(m.tipo);
    $('#fMonto').value = String(m.monto).replace('.', ',');
    $('#fDesc').value = m.descripcion || '';
    $('#fFecha').value = m.fecha;
    echo.hidden = !m.textoVoz;
    if (m.textoVoz) echo.textContent = `«${m.textoVoz}»`;
  } else {
    $('#sheetMovTitle').textContent =
        prefill && (prefill.textoVoz || prefill.ticket) ? 'Confirmá el movimiento'
      : prefill && prefill.tipo === 'ahorro' ? (prefill.sentido === 'retiro' ? 'Sacar del ahorro' : 'Guardar en el ahorro')
      : 'Nuevo movimiento';
    $('#btnBorrarMov').hidden = true;
    borradorCatId = prefill && prefill.categoriaId ? prefill.categoriaId : null;
    borradorCajaId = prefill && prefill.cajaId ? prefill.cajaId : borradorCajaId;
    setSentidoBorrador(prefill && prefill.sentido ? prefill.sentido : 'aporte');
    setTipoBorrador(prefill ? prefill.tipo : 'egreso');
    $('#fMonto').value = prefill && prefill.monto != null ? String(prefill.monto).replace('.', ',') : '';
    $('#fDesc').value = prefill ? prefill.descripcion || '' : '';
    $('#fFecha').value = prefill ? prefill.fecha : hoyISO();
    echo.hidden = !(prefill && prefill.textoVoz);
    if (prefill && prefill.textoVoz) echo.textContent = `«${prefill.textoVoz}»`;
    if (prefill && prefill.ticket) {
      echo.hidden = false;
      echo.textContent = prefill.ticket.echo;
    }
  }
  echo.classList.toggle('is-ticket', !!(prefill && prefill.ticket));
  echo.classList.toggle('is-revisar', !!(prefill && prefill.ticket && prefill.ticket.revisar));
  $('#sheetMov').dataset.ticket = !id && prefill && prefill.ticket ? prefill.ticket.clave || '-' : '';
  $('#fFecha').max = hoyISO();   // se fija en cada apertura por si cambió el día
  $('#sheetMov').dataset.voz = prefill && prefill.textoVoz ? prefill.textoVoz : '';
  abrirHoja('sheetMov');
  if (!id && (!prefill || prefill.monto == null)) setTimeout(() => $('#fMonto').focus(), 240);
}

function guardarMov() {
  const err = $('#fError');
  const fallar = msg => { err.textContent = msg; err.hidden = false; };
  const monto = numeroDeTexto($('#fMonto').value);
  if (monto == null || monto <= 0) { fallar('Poné un monto mayor a cero.'); $('#fMonto').focus(); return; }

  // El atributo `max` del calendario es sólo una ayuda: el valor igual se puede
  // escribir a mano, así que la fecha se comprueba acá.
  const fecha = $('#fFecha').value || hoyISO();
  if (fecha > hoyISO()) {
    fallar('No se pueden cargar movimientos con fecha futura.');
    $('#fFecha').focus();
    return;
  }

  const esAhorro = borradorTipo === 'ahorro';
  if (esAhorro && !borradorCajaId) { fallar('Elegí una caja de ahorro.'); return; }
  if (!esAhorro && !borradorCatId) { fallar('Elegí una categoría.'); return; }

  // Ni la caja puede quedar en rojo ni se puede guardar plata que no tenés.
  // Al editar, el monto del propio movimiento no cuenta para el tope.
  if (esAhorro && borradorSentido === 'retiro') {
    const enLaCaja = saldoCaja(borradorCajaId, editandoMov);
    if (monto > enLaCaja + 0.009) {
      fallar(`Esa caja tiene ${plata(enLaCaja)}. No podés sacar más que eso.`);
      return;
    }
  }
  if (esAhorro && borradorSentido === 'aporte') {
    const enMano = disponible(editandoMov);
    if (monto > enMano + 0.009) {
      fallar(enMano > 0
        ? `Solo tenés ${plata(enMano)} disponibles. No podés guardar más que eso.`
        : 'No te queda plata disponible. Cargá primero el ingreso que falta.');
      return;
    }
  }

  const textoVoz = $('#sheetMov').dataset.voz || '';
  const campos = {
    tipo: borradorTipo,
    monto: Math.round(monto * 100) / 100,
    categoriaId: esAhorro ? null : borradorCatId,
    cajaId: esAhorro ? borradorCajaId : null,
    sentido: esAhorro ? borradorSentido : null,
    descripcion: $('#fDesc').value.trim(),
    fecha
  };

  if (editandoMov) {
    Object.assign(db.movimientos.find(x => x.id === editandoMov), campos);
  } else {
    db.movimientos.push({ id: uid(), ...campos, creado: new Date().toISOString(), porVoz: !!textoVoz, textoVoz });
  }
  guardar();
  Sonido.tocar(editandoMov ? 'exito' : borradorTipo);
  const claveTicket = $('#sheetMov').dataset.ticket;
  if (claveTicket && claveTicket !== '-' && !esAhorro) recordarComercio(claveTicket, borradorCatId, campos.descripcion);
  $('#sheetMov').dataset.ticket = '';
  mesSel = mesDeISO(fecha);
  grupoActivo = null;
  cerrarHoja('sheetMov');
  renderTodo();
  const etiqueta = esAhorro ? (borradorSentido === 'retiro' ? 'Retiro' : 'Ahorro')
    : borradorTipo === 'ingreso' ? 'Ingreso' : 'Egreso';
  avisar(editandoMov ? 'Movimiento actualizado' : `${etiqueta} de ${plata(monto)} guardado`);
  editandoMov = null;
}

async function borrarMov() {
  if (!editandoMov) return;
  const m = db.movimientos.find(x => x.id === editandoMov);
  if (!await confirmar('Eliminar movimiento',
    m ? `${plata(m.monto)} · ${fechaLegible(m.fecha)}` : '¿Eliminar este movimiento?',
    'Eliminar', true)) return;
  if (!m || editandoMov !== m.id) return;   // por si la hoja se cerró mientras preguntaba
  db.movimientos = db.movimientos.filter(x => x.id !== editandoMov);
  guardar();
  cerrarHoja('sheetMov');
  editandoMov = null;
  renderTodo();
  avisar('Movimiento eliminado');
}

/* ---- hoja de categoría ---- */
const EMOJIS = ['🛒','🍽️','🍕','☕','🍺','🥖','🥩','🍦','⛽','🚌','🚕','🚗','🛵','🚲','✈️','🏠','💡','🔥','💧','🌐','📱','📺','🧹','🛠️','🪑','💊','🏥','🦷','🧠','👕','👟','🧥','🎒','🎉','🎬','🎮','🎵','🏖️','🏋️','⚽','🎾','🐶','🐱','📚','✏️','🎓','💼','📦','🚚','🧾','🏦','💳','💰','📈','🎁','🤝','🏷️','🧼','🔧','🪙','👶','🎂','🧴','🌱','🔩','🥽','🦺','🧰','💵','🪪','📝'];

function pintarGrillaEmoji(contId, actual, alElegir) {
  $(contId).innerHTML = EMOJIS.map(e =>
    `<button type="button" class="emoji-opt ${e === actual ? 'is-on' : ''}" data-e="${e}" aria-label="Emoji ${e}">${e}</button>`).join('');
  $$(contId + ' .emoji-opt').forEach(el => el.addEventListener('click', () => alElegir(el.dataset.e)));
}

function pintarEmojiGrid() {
  pintarGrillaEmoji('#emojiGrid', borradorEmoji, e => {
    borradorEmoji = e;
    $('#catEmojiPreview').textContent = e;
    $('#catEmojiInput').value = '';
    pintarEmojiGrid();
  });
}

function pintarEmojiGridCaja() {
  pintarGrillaEmoji('#cajaEmojiGrid', borradorCajaEmoji, e => {
    borradorCajaEmoji = e;
    $('#cajaEmojiPreview').textContent = e;
    $('#cajaEmojiInput').value = '';
    pintarEmojiGridCaja();
  });
}

function setCatTipoBorrador(t) {
  // el presupuesto aparece o desaparece según el tipo elegido
  borradorCatTipo = t;
  $('#catTipoEgreso').classList.toggle('is-on', t === 'egreso');
  $('#catTipoIngreso').classList.toggle('is-on', t === 'ingreso');
  pintarFilaPresupuesto();
}

function abrirCat(id = null) {
  // El tope es sólo para crear: editar y borrar lo que ya existe, siempre.
  if (!id && cupoLleno(catTipoVista === 'ingreso' ? 'catIngreso' : 'catEgreso')) return;
  editandoCat = id;
  $('#catError').hidden = true;
  if (id) {
    const c = catPorId(id);
    if (!c) return;
    $('#sheetCatTitle').textContent = 'Editar categoría';
    $('#btnBorrarCat').hidden = false;
    $('#catNombre').value = c.nombre;
    borradorEmoji = c.emoji;
    setCatTipoBorrador(c.tipo);
  } else {
    $('#sheetCatTitle').textContent = 'Nueva categoría';
    $('#btnBorrarCat').hidden = true;
    $('#catNombre').value = '';
    borradorEmoji = '🏷️';
    setCatTipoBorrador(catTipoVista);
  }
  const c = id ? catPorId(id) : null;
  $('#catPresupuesto').value = (c && c.presupuesto > 0) ? c.presupuesto : '';
  pintarFilaPresupuesto();

  $('#catEmojiPreview').textContent = borradorEmoji;
  $('#catEmojiInput').value = '';
  pintarEmojiGrid();
  abrirHoja('sheetCat');
}

/** El presupuesto sólo tiene sentido en egresos. Sin Premium se ve el
    anzuelo en lugar del campo: es más honesto que esconder la función. */
function pintarFilaPresupuesto() {
  const esEgreso = borradorCatTipo === 'egreso';
  const pro = puede('presupuestos');
  $('#filaPresupuesto').hidden = !(esEgreso && pro);
  $('#presuPro').hidden = !(esEgreso && !pro);
  const sello = $('#selloPresu');
  if (sello) {
    sello.hidden = !(esEgreso && pro);
    sello.textContent = 'Incluido con Premium';
  }
}

function guardarCat() {
  const nombre = $('#catNombre').value.trim();
  const err = $('#catError');
  if (!nombre) {
    err.textContent = 'Ponele un nombre.';
    err.hidden = false;
    $('#catNombre').focus();
    return;
  }
  const dup = db.categorias.find(c => c.id !== editandoCat && c.tipo === borradorCatTipo && normalizar(c.nombre) === normalizar(nombre));
  if (dup) {
    err.textContent = 'Ya tenés una categoría con ese nombre.';
    err.hidden = false;
    return;
  }
  /* El tope se guarda sólo si la categoría es de egreso y hay Premium.
     Si alguien pierde Premium, el número que ya tenía NO se borra: deja de
     mostrarse y vuelve a aparecer si reactiva. */
  let presupuesto;
  if (borradorCatTipo === 'egreso' && puede('presupuestos')) {
    const v = numeroDeTexto($('#catPresupuesto').value);
    presupuesto = (v != null && v > 0) ? Math.round(v * 100) / 100 : null;
  }

  if (editandoCat) {
    const c = catPorId(editandoCat);
    Object.assign(c, { nombre, emoji: borradorEmoji, tipo: borradorCatTipo });
    if (presupuesto !== undefined) c.presupuesto = presupuesto;
    if (borradorCatTipo === 'ingreso') c.presupuesto = null;   // un ingreso no tiene tope
  } else {
    db.categorias.push({
      id: uid(), nombre, emoji: borradorEmoji, tipo: borradorCatTipo,
      claves: [normalizar(nombre)],
      presupuesto: presupuesto || null
    });
  }
  guardar();
  catTipoVista = borradorCatTipo;
  $$('[data-cattipo]').forEach(b => b.classList.toggle('is-on', b.dataset.cattipo === catTipoVista));
  cerrarHoja('sheetCat');
  editandoCat = null;
  renderTodo();
  avisar('Categoría guardada');
}

async function borrarCat() {
  if (!editandoCat) return;
  const usados = db.movimientos.filter(m => m.categoriaId === editandoCat);
  const c = catPorId(editandoCat);
  const otros = db.categorias.find(x => x.id !== editandoCat && x.tipo === c.tipo);
  if (usados.length) {
    if (!otros) { avisar('No puedo borrarla: tiene movimientos y no hay otra categoría donde moverlos.'); return; }
    if (!await confirmar(`Eliminar «${c.nombre}»`,
      [`Tiene ${usados.length} movimiento${usados.length === 1 ? '' : 's'}.`,
       `Se van a mover a «${otros.nombre}».`], 'Eliminar y mover', true)) return;
    usados.forEach(m => { m.categoriaId = otros.id; });
  } else if (!await confirmar('Eliminar categoría', `«${c.nombre}» no tiene movimientos cargados.`, 'Eliminar', true)) return;

  if (editandoCat !== c.id) return;   // por si la hoja se cerró mientras preguntaba
  db.categorias = db.categorias.filter(x => x.id !== editandoCat);
  guardar();
  cerrarHoja('sheetCat');
  editandoCat = null;
  renderTodo();
  avisar('Categoría eliminada');
}

/* ---- hoja de caja de ahorro ---- */
function abrirCaja(id = null) {
  if (!id && cupoLleno('cajas')) return;
  editandoCaja = id;
  $('#cajaError').hidden = true;

  if (id) {
    const c = cajaPorId(id);
    if (!c) return;
    $('#sheetCajaTitle').textContent = c.nombre;
    $('#btnBorrarCaja').hidden = false;
    $('#cajaNombre').value = c.nombre;
    borradorCajaEmoji = c.emoji;
    $('#cajaSaldoBox').hidden = false;
    $('#cajaSaldo').textContent = plata(saldoCaja(id));
    pintarMovsCaja(id);
  } else {
    $('#sheetCajaTitle').textContent = 'Nueva caja';
    $('#btnBorrarCaja').hidden = true;
    $('#cajaNombre').value = '';
    borradorCajaEmoji = '🏦';
    $('#cajaSaldoBox').hidden = true;
    $('#cajaMovsBox').hidden = true;
  }
  pintarMetasCaja(id);
  $('#cajaEmojiPreview').textContent = borradorCajaEmoji;
  $('#cajaEmojiInput').value = '';
  pintarEmojiGridCaja();
  abrirHoja('sheetCaja');
  if (!id) setTimeout(() => $('#cajaNombre').focus(), 240);
}

/* Acá los signos son los de la caja, no los de la plata disponible:
   un aporte le entra (+) aunque en el resumen general haya salido. */
function pintarMovsCaja(id) {
  const movs = db.movimientos
    .filter(m => m.tipo === 'ahorro' && m.cajaId === id)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado || '').localeCompare(a.creado || ''))
    .slice(0, 40);

  const box = $('#cajaMovsBox');
  if (!movs.length) { box.hidden = true; return; }
  box.hidden = false;

  $('#cajaMovs').innerHTML = `<div class="movlist">${movs.map(m => {
    const retiro = m.sentido === 'retiro';
    return `<button class="movrow" data-mov="${m.id}">
      <span class="mov-emoji flecha">${retiro ? '↓' : '↑'}</span>
      <span class="mov-mid">
        <span class="mov-name">${esc(m.descripcion || (retiro ? 'Retiro' : 'Depósito'))}</span>
        <span class="mov-sub">${esc(fechaLegible(m.fecha))}</span>
      </span>
      <span class="mov-amt ${retiro ? 'is-out' : 'is-in'}">${retiro ? '−' : '+'}${plata(m.monto)}</span>
    </button>`;
  }).join('')}</div>`;

  $$('#cajaMovs .movrow').forEach(el => el.addEventListener('click', () => {
    cerrarHoja('sheetCaja');
    abrirMov(el.dataset.mov);
  }));
}

function guardarCaja() {
  const nombre = $('#cajaNombre').value.trim();
  const err = $('#cajaError');
  if (!nombre) {
    err.textContent = 'Ponele un nombre a la caja.';
    err.hidden = false;
    $('#cajaNombre').focus();
    return;
  }
  const dup = db.cajas.find(c => c.id !== editandoCaja && normalizar(c.nombre) === normalizar(nombre));
  if (dup) {
    err.textContent = 'Ya tenés una caja con ese nombre.';
    err.hidden = false;
    return;
  }
  /* Las metas sólo se tocan con Premium. Si alguien lo pierde, los
     números que ya había puesto no se borran: dejan de mostrarse y
     vuelven si reactiva, igual que los presupuestos. */
  let metas;
  if (puede('metas')) {
    const t = numeroDeTexto($('#cajaMeta').value);
    const m = numeroDeTexto($('#cajaMetaMensual').value);
    metas = {
      meta: (t != null && t > 0) ? Math.round(t * 100) / 100 : null,
      metaMensual: (m != null && m > 0) ? Math.round(m * 100) / 100 : null
    };
  }

  if (editandoCaja) {
    const c = cajaPorId(editandoCaja);
    Object.assign(c, { nombre, emoji: borradorCajaEmoji });
    if (metas) Object.assign(c, metas);
  } else {
    db.cajas.push({
      id: uid(), nombre, emoji: borradorCajaEmoji,
      meta: (metas && metas.meta) || null,
      metaMensual: (metas && metas.metaMensual) || null,
      creada: new Date().toISOString()
    });
  }
  guardar();
  cerrarHoja('sheetCaja');
  editandoCaja = null;
  renderTodo();
  avisar('Caja guardada');
}

async function borrarCaja() {
  if (!editandoCaja) return;
  const c = cajaPorId(editandoCaja);
  const movs = db.movimientos.filter(m => m.tipo === 'ahorro' && m.cajaId === editandoCaja);
  const otra = db.cajas.find(x => x.id !== editandoCaja);

  if (movs.length) {
    if (otra) {
      if (!await confirmar(`Eliminar «${c.nombre}»`,
        [`Tiene ${movs.length} movimiento${movs.length === 1 ? '' : 's'} y un saldo de ${plata(saldoCaja(editandoCaja))}.`,
         `Se van a pasar a «${otra.nombre}», sumándose a su saldo.`], 'Eliminar y pasar', true)) return;
      movs.forEach(m => { m.cajaId = otra.id; });
    } else {
      if (!await confirmar(`Eliminar «${c.nombre}»`,
        [`Es tu única caja y tiene ${movs.length} movimiento${movs.length === 1 ? '' : 's'}.`,
         'Si la borrás también se borran esos movimientos.'], 'Eliminar todo', true)) return;
      db.movimientos = db.movimientos.filter(m => !(m.tipo === 'ahorro' && m.cajaId === editandoCaja));
    }
  } else if (!await confirmar('Eliminar caja', `«${c.nombre}» no tiene movimientos cargados.`, 'Eliminar', true)) return;

  if (editandoCaja !== c.id) return;   // por si la hoja se cerró mientras preguntaba
  db.cajas = db.cajas.filter(x => x.id !== editandoCaja);
  guardar();
  cerrarHoja('sheetCaja');
  editandoCaja = null;
  renderTodo();
  avisar('Caja eliminada');
}

function moverPlataCaja(sentido) {
  const id = editandoCaja;
  if (!id) return;
  cerrarHoja('sheetCaja');
  abrirMov(null, { tipo: 'ahorro', sentido, cajaId: id, monto: null, descripcion: '', fecha: hoyISO() });
}

/* ---------------------------------------------------------
   Voz
   --------------------------------------------------------- */
/* Dos motores de voz, misma interfaz:
   - En el APK, el reconocedor nativo de Android (anda sin internet si está
     bajado el paquete de español).
   - En el navegador, la Web Speech API.
   El parser y todo lo demás son los mismos en los dos casos. */
const esNativo = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
                    && window.Capacitor.isNativePlatform());
const VozNativa = esNativo && window.Capacitor.Plugins ? window.Capacitor.Plugins.SpeechRecognition : null;
/* iPad con iPadOS se presenta como Mac: se lo reconoce por la pantalla táctil. */
const esIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
              || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const hayVoz = !!(VozNativa || SR);

let rec = null, grabando = false, textoFinal = '';
let oyentes = [], yaResolvio = false, cancelado = false;

function abrirVoz() {
  textoFinal = '';
  cancelado = false;
  $('#micTexto').textContent = '';
  $('#micEjemplos').hidden = false;
  $('#micEstado').classList.remove('is-rec');
  if (!hayVoz) {
    $('#micEstado').textContent = 'Este navegador no reconoce voz. Probá con Chrome, o cargalo a mano con el +.';
    $('#micBig').disabled = true;
  } else {
    $('#micEstado').textContent = 'Tocá el micrófono y decí el movimiento.';
    $('#micBig').disabled = false;
  }
  abrirHoja('sheetVoz');
}

/* ---- estados compartidos por los dos motores ---- */
function vozEmpezo() {
  if (grabando) return;
  grabando = true;
  Sonido.tocar('micOn');
  yaResolvio = false;
  textoFinal = '';
  $('#micBig').classList.add('is-rec');
  $('#micEstado').textContent = 'Escuchando… hablá tranquilo.';
  $('#micEstado').classList.add('is-rec');
  $('#micEjemplos').hidden = true;
}

function vozTermino() {
  if (grabando) Sonido.tocar('micOff');
  grabando = false;
  $('#micBig').classList.remove('is-rec');
  $('#micEstado').classList.remove('is-rec');
}

function vozFallo(msg) {
  vozTermino();
  yaResolvio = true;
  $('#micEstado').textContent = msg;
  $('#micEjemplos').hidden = false;
}

function vozResultado() {
  if (yaResolvio || cancelado) return;
  yaResolvio = true;
  const dicho = (textoFinal || $('#micTexto').textContent || '').trim();
  if (!dicho) {
    $('#micEstado').textContent = 'No te escuché. Probá de nuevo.';
    $('#micEjemplos').hidden = false;
    return;
  }
  let p = parsearVoz(dicho);
  const avisos = [];

  /* "Gasté 50 dólares en nafta" estando en pesos va a la billetera en
     dólares, y al revés. Se vuelve a leer la frase ya en la otra
     billetera, porque las categorías de cada una son distintas. */
  if (p.moneda && p.moneda !== moneda()) {
    if (p.moneda === 'USD' && !db.billeteras.USD && !puede('divisas')) {
      avisos.push('La billetera en dólares es Premium: lo cargo en pesos.');
    } else if (usarBilletera(p.moneda)) {
      p = parsearVoz(dicho);
      avisos.push(`Va a la billetera en ${MONEDAS[p.moneda].nombre}.`);
    }
  }

  cerrarHoja('sheetVoz');
  abrirMov(null, p);
  if (p.monto == null) avisos.push('No encontré el monto, completalo a mano.');
  if (avisos.length) avisar(avisos.join(' '));
}

function alternarGrabacion() {
  if (!hayVoz) return;
  if (grabando) { detenerVoz(); return; }
  if (VozNativa) grabarNativo(); else grabarWeb();
}

function detenerVoz() {
  if (VozNativa) { VozNativa.stop().catch(() => {}); return; }
  try { rec.stop(); } catch (e) {}
}

function cancelarVoz() {
  cancelado = true;
  yaResolvio = true;
  if (grabando) {
    if (VozNativa) VozNativa.stop().catch(() => {});
    else try { rec.abort(); } catch (e) {}
  }
  limpiarOyentes();
  vozTermino();
  cerrarHoja('sheetVoz');
}

async function limpiarOyentes() {
  const hs = oyentes; oyentes = [];
  for (const h of hs) { try { await h.remove(); } catch (e) {} }
}

/* ---- motor nativo (APK) ---- */
async function grabarNativo() {
  try {
    const d = await VozNativa.available();
    if (d && d.available === false) {
      vozFallo('Este teléfono no tiene reconocimiento de voz disponible.');
      return;
    }
  } catch (e) { /* si no contesta, sigo: el permiso decide */ }

  try {
    let perm = await VozNativa.checkPermissions();
    if (!perm || perm.speechRecognition !== 'granted') perm = await VozNativa.requestPermissions();
    if (!perm || perm.speechRecognition !== 'granted') {
      vozFallo('Falta el permiso de micrófono. Habilitalo en los ajustes del teléfono.');
      return;
    }
  } catch (e) {
    vozFallo('No pude pedir el permiso de micrófono.');
    return;
  }

  await limpiarOyentes();
  try {
    oyentes.push(await VozNativa.addListener('partialResults', d => {
      if (d && d.matches && d.matches.length) {
        textoFinal = d.matches[0];
        $('#micTexto').textContent = textoFinal;
      }
    }));
    oyentes.push(await VozNativa.addListener('listeningState', d => {
      if (!d) return;
      if (d.status === 'started') vozEmpezo();
      if (d.status === 'stopped') { vozTermino(); vozResultado(); limpiarOyentes(); }
    }));
  } catch (e) { /* sin eventos igual sirve: start() devuelve el resultado */ }

  vozEmpezo();   // por si el evento 'started' no llega
  try {
    const r = await VozNativa.start({ language: 'es-AR', maxResults: 1, partialResults: true, popup: false });
    if (r && r.matches && r.matches.length) {
      textoFinal = r.matches[0];
      $('#micTexto').textContent = textoFinal;
      vozTermino();
      vozResultado();
      limpiarOyentes();
    }
  } catch (e) {
    vozFallo('No pude activar el micrófono. Probá otra vez.');
    limpiarOyentes();
  }
}

/* ---- motor del navegador (PWA) ---- */
function grabarWeb() {
  rec = new SR();
  rec.lang = 'es-AR';
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;

  rec.onstart = vozEmpezo;

  rec.onresult = ev => {
    let interino = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      if (r.isFinal) textoFinal += r[0].transcript + ' ';
      else interino += r[0].transcript;
    }
    $('#micTexto').textContent = (textoFinal + interino).trim();
  };

  rec.onerror = ev => {
    const msgs = {
      'not-allowed': 'Falta permiso del micrófono. Habilitalo en los ajustes del navegador.',
      'service-not-allowed': 'Falta permiso del micrófono. Habilitalo en los ajustes del navegador.',
      'no-speech': 'No te escuché. Probá de nuevo.',
      'audio-capture': 'No encuentro el micrófono.',
      'network': 'El reconocimiento de voz necesita internet.'
    };
    vozFallo(msgs[ev.error] || 'No pude escuchar. Probá otra vez.');
  };

  rec.onend = () => { vozTermino(); vozResultado(); };

  try { rec.start(); }
  catch (e) { vozFallo('No pude activar el micrófono. Probá otra vez.'); }
}

/* ---------------------------------------------------------
   Ajustes
   --------------------------------------------------------- */
function aplicarTema(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  $$('[data-tema]').forEach(b => b.classList.toggle('is-on', b.dataset.tema === t));
}

function abrirAjustes() {
  aplicarTema(db.ajustes.tema || 'auto');
  const nm = db.movimientos.length, nc = db.categorias.length, nj = db.cajas.length;
  const nf = (db.fijos || []).length;
  $('#statsLinea').textContent = (db.billeteras.USD ? `Billetera en ${MONEDAS[moneda()].nombre}: ` : '')
    + `${nm} movimiento${nm === 1 ? '' : 's'}, ${nc} categorías, ${nj} caja${nj === 1 ? '' : 's'} de ahorro`
    + (nf ? ` y ${nf} fijo${nf === 1 ? '' : 's'}` : '') + ' en este dispositivo.';
  $('#appVer').textContent = `Mis Gastos · BETA ${APP_VER}${esNativo ? ' · APK' : ''}`;
  pintarEstadoCopia();
  pintarAvisosAjustes();
  pintarPlan();
  abrirHoja('sheetSet');
}

/* =========================================================
   Copia de seguridad

   Los datos viven sólo en este dispositivo, así que la copia es la única red
   de contención: sirve para cambiar de teléfono, para pasar de la PWA al APK
   y para no perder todo si se borran los datos del navegador.
   ========================================================= */

/** Versión del formato del ARCHIVO, no de la app: sube sólo si cambia la forma
    de los datos, para que una copia vieja se siga pudiendo leer. */
const FORMATO_COPIA = 2;   // 2: con billetera en dólares (ver armarCopia)

/* ---------- estado ---------- */

/** Días desde la última copia; null si nunca hubo una. */
function diasSinCopia() {
  const u = db.ajustes && db.ajustes.ultimaCopia;
  if (!u) return null;
  const t = new Date(u).getTime();
  if (!isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function pintarEstadoCopia() {
  const el = $('#copiaEstado');
  if (!el) return;
  const d = diasSinCopia();
  const hayDatos = db.movimientos.length > 0;
  if (d === null) {
    el.textContent = hayDatos
      ? 'Todavía no guardaste ninguna copia.'
      : 'Los datos viven sólo en este dispositivo. Guardá una copia cada tanto.';
    el.classList.toggle('is-alerta', hayDatos);
  } else {
    el.textContent = d === 0 ? 'Última copia: hoy.'
      : d === 1 ? 'Última copia: ayer.'
      : `Última copia: hace ${d} días.`;
    el.classList.toggle('is-alerta', d >= 30);
  }
}

function marcarCopiaHecha() {
  db.ajustes.ultimaCopia = new Date().toISOString();
  delete db.ajustes.avisoCopiaHasta;
  guardar();
  pintarEstadoCopia();
  pintarAvisoCopia();
}

/** Recordatorio en el Resumen: sólo si ya hay datos que valga la pena perder. */
function pintarAvisoCopia() {
  const el = $('#avisoCopia');
  if (!el) return;
  const d = diasSinCopia();
  const hasta = db.ajustes && db.ajustes.avisoCopiaHasta;
  const postergado = hasta && hoyISO() < hasta;
  const mostrar = window.__adminForzarAvisoCopia ||
    (db.movimientos.length >= 15 && (d === null || d >= 30) && !postergado);
  el.hidden = !mostrar;
  if (!mostrar) return;
  $('#avisoCopiaTexto').textContent = d === null
    ? `Tenés ${db.movimientos.length} movimientos cargados y ninguna copia guardada. Si se borran los datos del teléfono, se pierden.`
    : `Hace ${d} días que no guardás una copia de tus datos.`;
}

function postergarAvisoCopia() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  db.ajustes.avisoCopiaHasta = hoyISO(d);
  window.__adminForzarAvisoCopia = false;
  guardar();
  pintarAvisoCopia();
  avisar('Listo, te lo recuerdo en dos semanas');
}

/* ---------- armar y leer el archivo ---------- */

/** Objeto que se guarda en el archivo. La cabecera deja que una versión futura
    sepa qué está leyendo, y el resumen se puede mirar sin abrir los datos. */
function armarCopia() {
  const ars = db.billeteras.ARS, usd = db.billeteras.USD;
  const fechas = ars.movimientos.concat(usd ? usd.movimientos : []).map(m => m.fecha).sort();
  return {
    app: 'mis-gastos',
    /* Sin billetera en dólares sigue siendo el formato 1, que cualquier
       versión lee. Con dólares es el 2: una versión vieja la rechaza en
       lugar de importar los pesos y perder los dólares sin avisar. */
    formato: usd ? 2 : 1,
    appVersion: APP_VER,
    exportado: new Date().toISOString(),
    origen: esNativo ? 'apk' : 'web',
    resumen: {
      movimientos: ars.movimientos.length,
      categorias: ars.categorias.length,
      cajas: ars.cajas.length,
      movimientosEnDolares: usd ? usd.movimientos.length : 0,
      desde: fechas.length ? fechas[0] : null,
      hasta: fechas.length ? fechas[fechas.length - 1] : null
    },
    datos: paraGuardar(db)
  };
}

const nombreCopia = () => `mis-gastos-${hoyISO()}.json`;

/** Normaliza lo que viene de afuera. Un archivo puede estar cortado, editado a
    mano o venir de otra versión: antes de dejarlo entrar se revisa campo por
    campo. Un movimiento al que le falta la categoría se reasigna en lugar de
    perderse, porque perder plata en silencio es lo peor que podría pasar. */
function sanearDatos(entrada) {
  const aviso = { descartados: 0, reasignados: 0, futuros: 0 };
  const esFecha = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
    && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
  const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  const categorias = [];
  for (const c of entrada.categorias) {
    const nombre = c ? texto(c.nombre, 40) : '';
    const tipo = c && (c.tipo === 'ingreso' ? 'ingreso' : c.tipo === 'egreso' ? 'egreso' : null);
    if (!nombre || !tipo) continue;
    const pres = Number(c.presupuesto);
    categorias.push({
      id: String(c.id || uid()),
      nombre, tipo,
      emoji: texto(c.emoji, 8) || '🏷️',
      claves: Array.isArray(c.claves) ? c.claves.filter(k => typeof k === 'string') : [normalizar(nombre)],
      // sólo los egresos llevan tope; un número roto se trata como "sin tope"
      presupuesto: (tipo === 'egreso' && isFinite(pres) && pres > 0) ? Math.round(pres * 100) / 100 : null
    });
  }

  const cajas = [];
  for (const j of (Array.isArray(entrada.cajas) ? entrada.cajas : [])) {
    const nombre = j ? texto(j.nombre, 40) : '';
    if (!nombre) continue;
    const mt = Number(j.meta), mm = Number(j.metaMensual);
    cajas.push({
      id: String(j.id || uid()),
      nombre,
      emoji: texto(j.emoji, 8) || '🏦',
      meta: (isFinite(mt) && mt > 0) ? Math.round(mt * 100) / 100 : null,
      metaMensual: (isFinite(mm) && mm > 0) ? Math.round(mm * 100) / 100 : null,
      creada: typeof j.creada === 'string' ? j.creada : new Date().toISOString()
    });
  }

  const idsCat = new Set(categorias.map(c => c.id));
  const idsCaja = new Set(cajas.map(c => c.id));

  /* Red de contención para los movimientos huérfanos. */
  function catDeRespaldo(tipo) {
    let c = categorias.find(x => x.tipo === tipo && normalizar(x.nombre).startsWith('otros'))
         || categorias.find(x => x.tipo === tipo);
    if (!c) {
      c = {
        id: uid(),
        nombre: tipo === 'ingreso' ? 'Otros ingresos' : 'Otros',
        emoji: tipo === 'ingreso' ? '🎁' : '📦',
        tipo, claves: []
      };
      categorias.push(c);
      idsCat.add(c.id);
    }
    return c.id;
  }
  function cajaDeRespaldo() {
    if (!cajas.length) {
      const c = { id: uid(), nombre: 'Ahorro', emoji: '🏦', creada: new Date().toISOString() };
      cajas.push(c);
      idsCaja.add(c.id);
    }
    return cajas[0].id;
  }

  const hoy = hoyISO();
  const usados = new Set();
  const movimientos = [];

  for (const m of entrada.movimientos) {
    if (!m || !esFecha(m.fecha)) { aviso.descartados++; continue; }
    const monto = Number(m.monto);
    if (!Number.isFinite(monto) || monto <= 0) { aviso.descartados++; continue; }
    const tipo = m.tipo === 'ingreso' ? 'ingreso'
      : m.tipo === 'ahorro' ? 'ahorro'
      : m.tipo === 'egreso' ? 'egreso' : null;
    if (!tipo) { aviso.descartados++; continue; }

    let categoriaId = null, cajaId = null, sentido = null;
    if (tipo === 'ahorro') {
      sentido = m.sentido === 'retiro' ? 'retiro' : 'aporte';
      cajaId = String(m.cajaId);
      if (!idsCaja.has(cajaId)) { cajaId = cajaDeRespaldo(); aviso.reasignados++; }
    } else {
      categoriaId = String(m.categoriaId);
      if (!idsCat.has(categoriaId)) { categoriaId = catDeRespaldo(tipo); aviso.reasignados++; }
    }

    if (m.fecha > hoy) aviso.futuros++;

    let id = String(m.id || uid());
    if (usados.has(id)) id = uid();
    usados.add(id);

    movimientos.push({
      id, tipo,
      monto: Math.round(monto * 100) / 100,
      categoriaId, cajaId, sentido,
      descripcion: texto(m.descripcion, 140),
      fecha: m.fecha,
      creado: typeof m.creado === 'string' ? m.creado : new Date().toISOString(),
      porVoz: !!m.porVoz,
      textoVoz: texto(m.textoVoz, 240)
    });
  }

  /* Los fijos. Un fijo con la categoría rota o el día fuera de rango no se
     descarta: se arregla, porque perder una programación en silencio es tan
     molesto como perder un movimiento. */
  const esMes = v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
  const fijos = [];
  for (const f of (Array.isArray(entrada.fijos) ? entrada.fijos : [])) {
    if (!f || typeof f !== 'object') continue;
    const tipo = f.tipo === 'ingreso' ? 'ingreso' : f.tipo === 'egreso' ? 'egreso' : null;
    const monto = Number(f.monto);
    if (!tipo || !isFinite(monto) || monto <= 0) { aviso.descartados++; continue; }

    let categoriaId = f.categoriaId;
    if (!idsCat.has(categoriaId)) {          // misma red que los movimientos
      categoriaId = catDeRespaldo(tipo);
      aviso.reasignados++;
    }

    const dia = Math.min(31, Math.max(1, Math.round(Number(f.dia)) || 1));
    fijos.push({
      id: String(f.id || uid()),
      tipo, monto: Math.round(monto * 100) / 100,
      categoriaId,
      descripcion: texto(f.descripcion, 80),
      dia,
      desde: esMes(f.desde) ? f.desde : mesDeISO(hoyISO()),
      hasta: esMes(f.hasta) ? f.hasta : null,
      plazoMeses: Number.isInteger(f.plazoMeses) && f.plazoMeses > 0 && f.plazoMeses <= 360 ? f.plazoMeses : null,
      activo: f.activo !== false,
      generados: Array.isArray(f.generados) ? f.generados.filter(esMes) : [],
      creado: typeof f.creado === 'string' ? f.creado : new Date().toISOString()
    });
  }

  const temaCrudo = entrada.ajustes && entrada.ajustes.tema;
  const tema = ['auto', 'light', 'dark'].includes(temaCrudo) ? temaCrudo : 'auto';

  return {
    datos: {
      version: 2,
      categorias, cajas, movimientos, fijos,
      ajustes: {
        tema,
        ultimaCopia: (entrada.ajustes && entrada.ajustes.ultimaCopia) || null
      }
    },
    aviso
  };
}

/** Lee el texto de una copia. Lanza un Error cuyo mensaje se le puede mostrar
    al usuario tal cual. Acepta las copias viejas, que eran la base pelada. */
function leerCopia(texto) {
  const noEs = 'No pude leer ese archivo. ¿Es la copia que exportó Mis Gastos?';
  let crudo;
  try { crudo = JSON.parse(texto); }
  catch (e) { throw new Error(noEs); }
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) throw new Error(noEs);

  const conCabecera = crudo.app === 'mis-gastos' && crudo.datos && typeof crudo.datos === 'object';
  if (conCabecera && Number(crudo.formato) > FORMATO_COPIA) {
    throw new Error('Esa copia la hizo una versión más nueva de Mis Gastos. Actualizá la app y probá otra vez.');
  }

  const entrada = conCabecera ? crudo.datos : crudo;
  if (!entrada || !Array.isArray(entrada.categorias) || !Array.isArray(entrada.movimientos)) {
    throw new Error('Ese archivo no tiene los datos de Mis Gastos adentro.');
  }

  const { datos, aviso } = sanearDatos(entrada);

  /* La billetera en dólares pasa por el mismo control que la de pesos. */
  const usd = entrada.billeteras && entrada.billeteras.USD;
  if (usd && Array.isArray(usd.categorias) && Array.isArray(usd.movimientos)) {
    const r = sanearDatos(usd);
    const { categorias, cajas, movimientos, fijos } = r.datos;
    datos.billeteras = { USD: { categorias, cajas, movimientos, fijos } };
    for (const k of Object.keys(aviso)) aviso[k] += r.aviso[k];
  }

  return {
    datos, aviso,
    meta: {
      exportado: conCabecera && typeof crudo.exportado === 'string' ? crudo.exportado : null,
      origen: conCabecera ? (crudo.origen || null) : null,
      appVersion: conCabecera ? (crudo.appVersion || null) : null
    }
  };
}

/** Suma una copia a lo que ya hay sin repetir nada. Función pura: devuelve una
    base nueva y no toca la que recibe.

    Las categorías y las cajas se emparejan por nombre, no por id, porque dos
    instalaciones distintas (la PWA y el APK, por ejemplo) generan ids propios
    para «Supermercado». Los movimientos se comparan por id y, si eso no
    alcanza, por su contenido, así reimportar la misma copia no duplica nada. */
function fusionar(actual, entrante) {
  const r = JSON.parse(JSON.stringify(actual));
  const resumen = { movs: 0, repetidos: 0, cats: 0, cajas: 0, fijos: 0, fijosRepetidos: 0 };

  const claveCat = c => `${c.tipo}|${normalizar(c.nombre)}`;
  const mapaCat = new Map();
  const porCat = new Map(r.categorias.map(c => [claveCat(c), c.id]));
  for (const c of entrante.categorias) {
    const k = claveCat(c);
    if (porCat.has(k)) {
      /* La categoría ya existe. Si la de acá no tiene tope y la que entra
         sí, se adopta: es información que el usuario puso y perderla al
         importar sería un regalo envenenado. */
      const mia = r.categorias.find(x => x.id === porCat.get(k));
      if (mia && !mia.presupuesto && c.presupuesto) mia.presupuesto = c.presupuesto;
      mapaCat.set(c.id, porCat.get(k));
      continue;
    }
    const id = uid();
    r.categorias.push({ ...c, id });
    porCat.set(k, id);
    mapaCat.set(c.id, id);
    resumen.cats++;
  }

  const mapaCaja = new Map();
  const porCaja = new Map(r.cajas.map(c => [normalizar(c.nombre), c.id]));
  for (const c of entrante.cajas) {
    const k = normalizar(c.nombre);
    if (porCaja.has(k)) {
      // misma lógica que con los presupuestos: no se pierde lo que el
      // usuario había puesto en la copia que trae
      const mia = r.cajas.find(x => x.id === porCaja.get(k));
      if (mia) {
        if (!mia.meta && c.meta) mia.meta = c.meta;
        if (!mia.metaMensual && c.metaMensual) mia.metaMensual = c.metaMensual;
      }
      mapaCaja.set(c.id, porCaja.get(k));
      continue;
    }
    const id = uid();
    r.cajas.push({ ...c, id });
    porCaja.set(k, id);
    mapaCaja.set(c.id, id);
    resumen.cajas++;
  }

  const huella = m => [
    m.fecha, m.tipo, m.monto, m.sentido || '',
    m.categoriaId || '', m.cajaId || '', normalizar(m.descripcion)
  ].join('|');

  const ids = new Set(r.movimientos.map(m => m.id));
  const huellas = new Set(r.movimientos.map(huella));

  for (const m of entrante.movimientos) {
    const nuevo = {
      ...m,
      categoriaId: m.categoriaId ? (mapaCat.get(m.categoriaId) || m.categoriaId) : null,
      cajaId: m.cajaId ? (mapaCaja.get(m.cajaId) || m.cajaId) : null
    };
    if (ids.has(nuevo.id) || huellas.has(huella(nuevo))) { resumen.repetidos++; continue; }
    r.movimientos.push(nuevo);
    ids.add(nuevo.id);
    huellas.add(huella(nuevo));
    resumen.movs++;
  }

  /* Fijos. Dos fijos son el mismo si coinciden tipo, monto, día y
     descripción: así reimportar la misma copia no deja el alquiler dos
     veces. Los meses ya generados se unen, para que al volver una copia
     vieja no se recarguen movimientos que ya existen. */
  r.fijos = r.fijos || [];
  const claveFijo = f => `${f.tipo}|${f.monto}|${f.dia}|${normalizar(f.descripcion)}`;
  const porFijo = new Map(r.fijos.map(f => [claveFijo(f), f]));

  for (const f of (entrante.fijos || [])) {
    const nuevo = { ...f, categoriaId: mapaCat.get(f.categoriaId) || f.categoriaId };
    const ya = porFijo.get(claveFijo(nuevo));
    if (ya) {
      ya.generados = Array.from(new Set((ya.generados || []).concat(nuevo.generados || []))).sort();
      resumen.fijosRepetidos++;
      continue;
    }
    nuevo.id = uid();
    r.fijos.push(nuevo);
    porFijo.set(claveFijo(nuevo), nuevo);
    resumen.fijos++;
  }

  return { datos: r, resumen };
}

/* ---------- exportar ---------- */

async function exportar() {
  const texto = JSON.stringify(armarCopia(), null, 2);

  /* En el APK no sirve la descarga del navegador: el WebView de Android no
     tiene gestor de descargas y los blob: se pierden sin avisar. Hay que
     escribir el archivo y pasarlo al menú de compartir del sistema. */
  if (esNativo) {
    const P = (window.Capacitor && window.Capacitor.Plugins) || {};
    if (P.Filesystem && P.Share) {
      try {
        const { uri } = await P.Filesystem.writeFile({
          path: nombreCopia(), data: texto, directory: 'CACHE', encoding: 'utf8'
        });
        await P.Share.share({
          title: 'Copia de Mis Gastos',
          dialogTitle: 'Guardá la copia donde la vayas a encontrar',
          files: [uri]
        });
        marcarCopiaHecha();
        avisar('Copia guardada');
        return;
      } catch (e) {
        /* Si la persona cerró el menú de compartir, no se guardó nada:
           hay que decirlo. Antes se volvía en silencio y el botón parecía
           roto, que es exactamente lo que no tiene que pasar con el
           único botón que protege los datos. */
        const msg = (e && (e.message || e.errorMessage)) || '';
        if (/cancel|abort|dismiss/i.test(msg)) {
          avisar('No se guardó la copia. Probá de nuevo y elegí dónde guardarla.');
          return;
        }
        console.warn('No pude compartir la copia:', e);
      }
    }
    mostrarCopiaComoTexto(texto);             // último recurso: copiar y pegar
    return;
  }

  /* En iPhone, la app instalada en la pantalla de inicio no tiene dónde
     mostrar una descarga: abre el archivo a pantalla completa y sin botón
     para volver. El menú de compartir sí ofrece «Guardar en Archivos». */
  if (esIOS && navigator.canShare) {
    const archivo = new File([texto], nombreCopia(), { type: 'application/json' });
    if (navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], title: 'Copia de Mis Gastos' });
        marcarCopiaHecha();
        avisar('Copia guardada');
      } catch (e) {
        if (e && e.name === 'AbortError') avisar('No se guardó la copia. Probá de nuevo y elegí «Guardar en Archivos».');
        else { console.warn('No pude compartir la copia:', e); mostrarCopiaComoTexto(texto); }
      }
      return;
    }
  }

  try {
    const blob = new Blob([texto], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreCopia();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    marcarCopiaHecha();
    avisar('Copia descargada');
  } catch (e) {
    console.warn('No pude descargar la copia:', e);
    mostrarCopiaComoTexto(texto);
  }
}

/* ---------- hoja de texto (mostrar o pegar) ---------- */

let modoHojaCopia = 'mostrar';

function mostrarCopiaComoTexto(texto) {
  modoHojaCopia = 'mostrar';
  $('#sheetCopiaTitle').textContent = 'Copia de seguridad';
  $('#copiaAyuda').textContent = 'No pude guardar el archivo solo en este teléfono. Copiá este texto y pegalo donde lo vayas a encontrar: un mensaje guardado, un mail para vos mismo o una nota en Drive. Sirve igual que el archivo.';
  const t = $('#copiaTexto');
  t.value = texto;
  t.readOnly = true;
  t.placeholder = '';
  $('#btnCopiaCopiar').hidden = false;
  $('#btnCopiaUsar').hidden = true;
  abrirHoja('sheetCopia');
  setTimeout(() => { t.focus(); t.select(); }, 80);
}

function pedirCopiaComoTexto() {
  modoHojaCopia = 'pegar';
  $('#sheetCopiaTitle').textContent = 'Pegar una copia';
  $('#copiaAyuda').textContent = 'Pegá acá el contenido del archivo de copia.';
  const t = $('#copiaTexto');
  t.value = '';
  t.readOnly = false;
  t.placeholder = '{ "app": "mis-gastos", ... }';
  $('#btnCopiaCopiar').hidden = true;
  $('#btnCopiaUsar').hidden = false;
  abrirHoja('sheetCopia');
  setTimeout(() => t.focus(), 80);
}

async function copiarAlPortapapeles() {
  const t = $('#copiaTexto');
  const exito = () => { avisar('Texto copiado'); marcarCopiaHecha(); };
  try {
    await navigator.clipboard.writeText(t.value);
    exito();
    return;
  } catch (e) { /* sin permiso o sin API: se intenta a la vieja usanza */ }
  try {
    t.readOnly = false;
    t.focus(); t.select();
    const ok = document.execCommand('copy');
    t.readOnly = true;
    if (ok) { exito(); return; }
  } catch (e) { /* nada */ }
  avisar('Copialo a mano: el texto ya está seleccionado.');
}

/* ---------- importar ---------- */

async function pedirImportacion() {
  const via = await preguntar({
    titulo: 'Importar una copia',
    texto: 'Traé el archivo .json que exportaste, o pegá el texto si lo tenés en un mensaje.',
    acciones: [
      { clave: 'archivo', texto: 'Elegir archivo', estilo: 'primario' },
      { clave: 'texto', texto: 'Pegar el texto' },
      { clave: null, texto: 'Cancelar' }
    ]
  });
  if (via === 'archivo') $('#fileImportar').click();
  if (via === 'texto') pedirCopiaComoTexto();
}

function importar(file) {
  const fr = new FileReader();
  fr.onerror = () => avisar('No pude leer ese archivo.');
  fr.onload = () => aplicarImportacion(String(fr.result || ''));
  fr.readAsText(file);
}

const soloAviso = (titulo, texto) => preguntar({
  titulo, texto, acciones: [{ clave: null, texto: 'Entendido', estilo: 'primario' }]
});

async function aplicarImportacion(texto) {
  let copia;
  try { copia = leerCopia(texto); }
  catch (e) { await soloAviso('No pude importar', e.message); return; }

  const { datos, aviso, meta } = copia;
  const usdEntra = datos.billeteras && datos.billeteras.USD;
  const nuevosUSD = usdEntra ? usdEntra.movimientos.length : 0;
  const nuevos = datos.movimientos.length + nuevosUSD;
  const tengo = Object.values(db.billeteras).reduce((s, b) => s + b.movimientos.length, 0);

  let cuando = null;
  if (meta.exportado) {
    const f = fechaLegible(meta.exportado.slice(0, 10));
    cuando = /^(Hoy|Ayer|Mañana)$/.test(f) ? f.toLowerCase() : `el ${f.toLowerCase()}`;
  }

  const nARS = datos.movimientos.length;
  const lineas = [
    `La copia trae ${nARS} movimiento${nARS === 1 ? '' : 's'}, ` +
    `${datos.categorias.length} categorías y ${datos.cajas.length} caja${datos.cajas.length === 1 ? '' : 's'} de ahorro.` +
    (cuando ? ` Se hizo ${cuando}.` : '')
  ];
  if (usdEntra) lineas.push(`Además trae la billetera en dólares, con ${nuevosUSD} movimiento${nuevosUSD === 1 ? '' : 's'}.`);
  if (aviso.descartados) lineas.push(`${aviso.descartados} movimiento${aviso.descartados === 1 ? '' : 's'} del archivo venían dañados y quedan afuera.`);
  if (aviso.reasignados) lineas.push(`${aviso.reasignados} movimiento${aviso.reasignados === 1 ? '' : 's'} perdieron su categoría original y van a «Otros».`);
  if (aviso.futuros) lineas.push(`${aviso.futuros} movimiento${aviso.futuros === 1 ? '' : 's'} tienen fecha futura. Mirá que la fecha del teléfono esté bien.`);

  if (!nuevos && !datos.categorias.length) {
    await soloAviso('No pude importar', 'Esa copia está vacía.');
    return;
  }

  let modo;
  if (!tengo) {
    modo = await preguntar({
      titulo: 'Importar copia',
      texto: lineas.concat('Ahora no tenés movimientos cargados, así que no se pierde nada.'),
      acciones: [
        { clave: 'reemplazar', texto: 'Importar', estilo: 'primario' },
        { clave: null, texto: 'Cancelar' }
      ]
    });
  } else {
    modo = await preguntar({
      titulo: 'Importar copia',
      texto: lineas.concat(`Ya tenés ${tengo} movimiento${tengo === 1 ? '' : 's'} cargados. Elegí qué hacer con ellos.`),
      acciones: [
        { clave: 'fusionar', texto: 'Sumar a lo que tengo', estilo: 'primario',
          nota: 'Agrega lo que falta y saltea lo que ya está cargado.' },
        { clave: 'reemplazar', texto: 'Reemplazar todo', estilo: 'peligro',
          nota: 'Borra lo de ahora y deja sólo lo de la copia.' },
        { clave: null, texto: 'Cancelar' }
      ]
    });
  }
  if (!modo) return;

  const tema = db.ajustes.tema || 'auto';   // el tema es de este teléfono, no de la copia
  const monedaAntes = moneda();             // y la billetera que se estaba viendo, también

  if (modo === 'reemplazar') {
    db = enMemoria(datos);
    avisar(`Importados ${nuevos} movimiento${nuevos === 1 ? '' : 's'}`);
  } else {
    /* Cada billetera se fusiona con la suya: nunca se mezclan pesos con dólares. */
    const ars = fusionar(db.billeteras.ARS, datos);
    const unido = { ...ars.datos, ajustes: db.ajustes };
    const resumen = ars.resumen;
    const usdHay = db.billeteras.USD;
    if (usdEntra && usdHay) {
      const u = fusionar(usdHay, usdEntra);
      unido.billeteras = { USD: u.datos };
      resumen.movs += u.resumen.movs;
      resumen.repetidos += u.resumen.repetidos;
    } else if (usdEntra || usdHay) {
      unido.billeteras = { USD: usdEntra || usdHay };
      if (usdEntra) resumen.movs += nuevosUSD;
    }
    db = enMemoria(unido);
    avisar(resumen.movs
      ? `Sumados ${resumen.movs} movimiento${resumen.movs === 1 ? '' : 's'}` +
        (resumen.repetidos ? `; ${resumen.repetidos} ya estaban` : '')
      : 'No había nada nuevo para sumar');
  }

  db.ajustes.tema = tema;
  db.ajustes.moneda = monedaAntes;
  db.ajustes.ultimaCopia = new Date().toISOString();
  delete db.ajustes.avisoCopiaHasta;
  guardar();

  aplicarTema(tema);
  pintarMoneda();
  cerrarHoja('sheetCopia');
  cerrarHoja('sheetSet');
  mesSel = hoyISO().slice(0, 7);
  grupoActivo = null;
  renderTodo();
}

/* ---------- borrar todo ---------- */

async function borrarTodo() {
  const n = Object.values(db.billeteras).reduce((s, b) => s + b.movimientos.length, 0);
  const r = await preguntar({
    titulo: 'Borrar todos los datos',
    texto: [
      `Se borran ${n} movimiento${n === 1 ? '' : 's'} y las cajas de ahorro, y las categorías vuelven a las originales.` +
      (db.billeteras.USD ? ' También se borra la billetera en dólares.' : ''),
      'No se puede deshacer.'
    ],
    acciones: [
      { clave: 'copia', texto: 'Mejor guardar una copia', estilo: 'primario' },
      { clave: 'borrar', texto: 'Borrar todo', estilo: 'peligro' },
      { clave: null, texto: 'Cancelar' }
    ]
  });
  if (r === 'copia') { exportar(); return; }
  if (r !== 'borrar') return;
  if (!await confirmar('Última confirmación', 'Esto borra todo ahora mismo.', 'Sí, borrar todo', true)) return;

  const tema = db.ajustes.tema || 'auto';
  db = enMemoria(datosIniciales());
  db.ajustes.tema = tema;
  guardar();
  pintarMoneda();
  cerrarHoja('sheetSet');
  mesSel = hoyISO().slice(0, 7);
  grupoActivo = null;
  renderTodo();
  avisar('Todo borrado');
}

/* ---------------------------------------------------------
   Eventos
   --------------------------------------------------------- */
function conectar() {
  $$('.nav-btn').forEach(b => b.addEventListener('click', () => irA(b.dataset.view)));

  $('#mesPrev').addEventListener('click', () => cambiarMes(-1));
  $('#mesNext').addEventListener('click', () => cambiarMes(1));
  $('#mesPrev2').addEventListener('click', () => cambiarMes(-1));
  $('#mesNext2').addEventListener('click', () => cambiarMes(1));
  $('#mesLabel').addEventListener('click', () => { mesSel = hoyISO().slice(0, 7); grupoActivo = null; renderTodo(); });
  $('#mesLabel2').addEventListener('click', () => { mesSel = hoyISO().slice(0, 7); renderTodo(); });

  $$('[data-vista]').forEach(b => b.addEventListener('click', () => {
    mesVista = b.dataset.vista;
    $$('[data-vista]').forEach(x => x.classList.toggle('is-on', x === b));
    $('#mesChart').hidden = mesVista === 'tabla';
    $('#mesLegend').hidden = mesVista === 'tabla';
    $('#mesTabla').hidden = mesVista !== 'tabla';
    if (mesVista === 'grafico') renderMesChart();   // se midió a 0 mientras estaba oculto
  }));

  $$('[data-filtro]').forEach(b => b.addEventListener('click', () => {
    filtroMov = b.dataset.filtro;
    $$('[data-filtro]').forEach(x => x.classList.toggle('is-on', x === b));
    renderMovimientos();
  }));
  $('#buscar').addEventListener('input', e => { busqueda = e.target.value; renderMovimientos(); });

  $$('[data-cattipo]').forEach(b => b.addEventListener('click', () => {
    catTipoVista = b.dataset.cattipo;
    $$('[data-cattipo]').forEach(x => x.classList.toggle('is-on', x === b));
    renderCategorias();
    pintarCupo('#cupoCat', catTipoVista === 'ingreso' ? 'catIngreso' : 'catEgreso');
  }));
  $('#btnNuevaCat').addEventListener('click', () => abrirCat(null));

  $('#fabAdd').addEventListener('click', () => abrirMov(null));
  $('#fabVoz').addEventListener('click', abrirVoz);
  $('#fabTicket').addEventListener('click', abrirTicket);

  // hoja ticket
  $('#sheetTicketClose').addEventListener('click', cerrarTicket);
  $('#sheetTicketBack').addEventListener('click', cerrarTicket);
  $('#btnTicketFoto').addEventListener('click', () => $('#fileTicketFoto').click());
  $('#btnTicketGaleria').addEventListener('click', () => $('#fileTicketGaleria').click());
  ['#fileTicketFoto', '#fileTicketGaleria'].forEach(sel => $(sel).addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) procesarTicket(f);
  }));

  // hoja movimiento
  $('#sheetMovClose').addEventListener('click', () => { cerrarHoja('sheetMov'); editandoMov = null; });
  $('#sheetMovBack').addEventListener('click', () => { cerrarHoja('sheetMov'); editandoMov = null; });
  $('#tipoEgreso').addEventListener('click', () => setTipoBorrador('egreso'));
  $('#tipoIngreso').addEventListener('click', () => setTipoBorrador('ingreso'));
  $('#tipoAhorro').addEventListener('click', () => setTipoBorrador('ahorro'));
  $('#sentidoAporte').addEventListener('click', () => setSentidoBorrador('aporte'));
  $('#sentidoRetiro').addEventListener('click', () => setSentidoBorrador('retiro'));
  $('#btnGuardarMov').addEventListener('click', guardarMov);
  $('#btnBorrarMov').addEventListener('click', borrarMov);
  $('#fMonto').addEventListener('keydown', e => { if (e.key === 'Enter') guardarMov(); });

  // hoja voz
  $('#sheetVozClose').addEventListener('click', cancelarVoz);
  $('#sheetVozBack').addEventListener('click', cancelarVoz);
  $('#micBig').addEventListener('click', alternarGrabacion);

  // hoja categoría
  $('#sheetCatClose').addEventListener('click', () => { cerrarHoja('sheetCat'); editandoCat = null; });
  $('#sheetCatBack').addEventListener('click', () => { cerrarHoja('sheetCat'); editandoCat = null; });
  $('#catTipoEgreso').addEventListener('click', () => setCatTipoBorrador('egreso'));
  $('#catTipoIngreso').addEventListener('click', () => setCatTipoBorrador('ingreso'));
  $('#btnGuardarCat').addEventListener('click', guardarCat);
  $('#btnBorrarCat').addEventListener('click', borrarCat);
  $('#catEmojiInput').addEventListener('input', e => {
    const v = Array.from(e.target.value.trim())[0] ? e.target.value.trim() : '';
    if (v) { borradorEmoji = v; $('#catEmojiPreview').textContent = v; pintarEmojiGrid(); }
  });

  // hoja de caja de ahorro
  $('#btnNuevaCaja').addEventListener('click', () => abrirCaja(null));
  $('#sheetCajaClose').addEventListener('click', () => { cerrarHoja('sheetCaja'); editandoCaja = null; });
  $('#sheetCajaBack').addEventListener('click', () => { cerrarHoja('sheetCaja'); editandoCaja = null; });
  $('#btnGuardarCaja').addEventListener('click', guardarCaja);
  $('#btnBorrarCaja').addEventListener('click', borrarCaja);
  $('#btnCajaIngresar').addEventListener('click', () => moverPlataCaja('aporte'));
  $('#btnCajaRetirar').addEventListener('click', () => moverPlataCaja('retiro'));
  $('#cajaEmojiInput').addEventListener('input', e => {
    const v = e.target.value.trim();
    if (v) { borradorCajaEmoji = v; $('#cajaEmojiPreview').textContent = v; pintarEmojiGridCaja(); }
  });

  // ajustes
  $('#btnAjustes').addEventListener('click', abrirAjustes);
  $('#sheetSetClose').addEventListener('click', () => cerrarHoja('sheetSet'));
  $('#sheetSetBack').addEventListener('click', () => cerrarHoja('sheetSet'));
  $$('[data-tema]').forEach(b => b.addEventListener('click', () => {
    db.ajustes.tema = b.dataset.tema;
    guardar();
    aplicarTema(b.dataset.tema);
    if (vista === 'resumen') renderMesChart();
  }));
  $$('[data-moneda]').forEach(b => b.addEventListener('click', () => {
    if (usarBilletera(b.dataset.moneda)) abrirAjustes();   // refresca los números de la hoja
  }));
  /* En la cabecera hay sólo dos billeteras: tocar cambia a la otra. */
  $('#btnMoneda').addEventListener('click', () => {
    const otra = moneda() === 'ARS' ? 'USD' : 'ARS';
    if (usarBilletera(otra)) avisar(`Billetera en ${MONEDAS[otra].nombre}`);
  });
  $('#btnExportar').addEventListener('click', exportar);
  /* Pregunta primero: archivo o texto pegado. En el APK el selector de
     archivos es incómodo y mucha gente tiene la copia en un mensaje. */
  $('#btnImportar').addEventListener('click', pedirImportacion);

  /* Los dos botones del aviso del Resumen. Estaban dibujados pero sin
     conectar: se tocaban y no pasaba nada. */
  $('#avisoCopiaOk').addEventListener('click', exportar);
  $('#avisoCopiaNo').addEventListener('click', postergarAvisoCopia);

  /* La hoja de texto, que sirve para las dos puntas: mostrar la copia
     cuando no se pudo guardar el archivo, y pegarla para importarla. */
  $('#sheetCopiaClose').addEventListener('click', () => cerrarHoja('sheetCopia'));
  $('#sheetCopiaBack').addEventListener('click', () => cerrarHoja('sheetCopia'));
  $('#btnCopiaCopiar').addEventListener('click', copiarAlPortapapeles);
  $('#btnCopiaUsar').addEventListener('click', () => {
    const texto = $('#copiaTexto').value.trim();
    if (!texto) { avisar('Pegá primero el contenido de la copia.'); return; }
    cerrarHoja('sheetCopia');
    aplicarImportacion(texto);
  });
  $('#fileImportar').addEventListener('change', e => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; });
  $('#btnBorrarTodo').addEventListener('click', borrarTodo);

  // teclado
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    ['sheetMov', 'sheetVoz', 'sheetCat', 'sheetCaja', 'sheetSet', 'sheetCopia', 'sheetLic', 'sheetPro', 'sheetFijos', 'sheetFijo', 'sheetComp', 'sheetFiltros', 'sheetAdmin'].forEach(id => { if (!$(`#${id}`).hidden) cerrarHoja(id); });
    if (!$('#sheetTicket').hidden) cerrarTicket();
  });

  // re-dibujar el gráfico al cambiar el ancho
  let rt = null;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (vista === 'resumen' && mesVista === 'grafico') renderMesChart();
      if (vista === 'ahorros') renderAhorroChart();
    }, 160);
  });
}

/* =========================================================
   Metas de ahorro (Premium)

   Cada caja puede tener dos objetivos, y son cosas distintas:

   · La **meta total** es a dónde querés llegar: 2 millones para la
     camioneta. Mide el saldo acumulado de la caja.
   · La **meta mensual** es cuánto te propusiste apartar cada mes. Mide
     sólo lo del mes que estás viendo, y se reinicia solo.

   Se pueden poner las dos, una sola o ninguna. Cuando están las dos, la
   app calcula a qué ritmo vas: con lo que apartás por mes, cuántos meses
   faltan para la meta total. Eso es lo que convierte un número abstracto
   en una fecha.
   ========================================================= */

/** Lo que se apartó en una caja durante un mes (aportes menos retiros). */
function aportadoEnMes(cajaId, ym) {
  let total = 0;
  for (const m of movsDelMes(ym)) {
    if (m.tipo === 'ahorro' && m.cajaId === cajaId) total += m.monto * signoAhorro(m);
  }
  return total;
}

/**
 * Estado de las metas de una caja. Función pura sobre los datos.
 *
 * `faltanMeses` es null si no se puede estimar: sin meta mensual, o
 * cuando el mes vino en rojo —si estás sacando plata en vez de poner, no
 * hay ritmo que proyectar y mentir una fecha sería peor que no darla.
 */
function estadoMetas(caja, ym) {
  const saldo = saldoCaja(caja.id);
  const meta = Number(caja.meta) > 0 ? Number(caja.meta) : null;
  const mensual = Number(caja.metaMensual) > 0 ? Number(caja.metaMensual) : null;
  const esteMes = aportadoEnMes(caja.id, ym);

  const r = {
    saldo, meta, mensual, esteMes,
    hayMetas: !!(meta || mensual),
    pctTotal: meta ? Math.max(0, (saldo / meta) * 100) : null,
    faltaTotal: meta ? Math.max(0, meta - saldo) : null,
    cumplida: meta ? saldo >= meta : false,
    /* La barra se acota a cero para no dibujarse hacia atrás, pero el
       faltante no: si el mes vino en rojo porque sacaste plata, para
       cerrarlo con la meta cumplida hace falta reponer eso además. Es
       menos cómodo de leer y es el número real. */
    pctMes: mensual ? Math.max(0, (esteMes / mensual) * 100) : null,
    faltaMes: mensual ? Math.max(0, mensual - esteMes) : null,
    cumplidaMes: mensual ? esteMes >= mensual : false,
    faltanMeses: null,
    mesLlegada: null
  };

  if (meta && mensual && !r.cumplida) {
    r.faltanMeses = Math.ceil(r.faltaTotal / mensual);
    r.mesLlegada = mesSumar(ym, r.faltanMeses);
  }
  return r;
}

/** Las cajas que tienen alguna meta puesta, para el resumen. */
const cajasConMeta = () =>
  (db.cajas || []).filter(c => Number(c.meta) > 0 || Number(c.metaMensual) > 0);

/* ---------- dentro de la hoja de la caja ---------- */

function pintarMetasCaja(id) {
  const pro = puede('metas');
  const hayCaja = !!id;

  $('#metasPro').hidden = !(hayCaja && !pro);
  $('#cajaMetas').hidden = !(hayCaja && pro);
  $('#metaResumen').hidden = true;
  if (!hayCaja || !pro) return;

  const c = cajaPorId(id);
  if (!c) return;

  $('#cajaMeta').value = Number(c.meta) > 0 ? c.meta : '';
  $('#cajaMetaMensual').value = Number(c.metaMensual) > 0 ? c.metaMensual : '';

  const e = estadoMetas(c, mesSel);
  if (!e.hayMetas) return;

  $('#metaResumen').hidden = false;
  $('#metaResumen').innerHTML = filaMeta(e);
}

/** El resumen de progreso que se ve arriba de los campos. */
function filaMeta(e) {
  const partes = [];

  if (e.meta) {
    const clase = e.cumplida ? 'is-lista' : '';
    partes.push(`
      <div class="meta-bloque ${clase}">
        <div class="meta-top">
          <span class="meta-tit">Meta total</span>
          <span class="meta-pct">${Math.round(e.pctTotal)}%</span>
        </div>
        <div class="catrow-track"><div class="meta-fill" style="width:${Math.min(100, e.pctTotal)}%"></div></div>
        <p class="meta-pie">${e.cumplida
          ? `¡Llegaste! ${plata(e.saldo)} de ${plata(e.meta)}`
          : `${plata(e.saldo)} de ${plata(e.meta)} · faltan ${plata(e.faltaTotal)}`}</p>
      </div>`);
  }

  if (e.mensual) {
    const clase = e.cumplidaMes ? 'is-lista' : '';
    partes.push(`
      <div class="meta-bloque ${clase}">
        <div class="meta-top">
          <span class="meta-tit">Este mes</span>
          <span class="meta-pct">${Math.round(e.pctMes)}%</span>
        </div>
        <div class="catrow-track"><div class="meta-fill" style="width:${Math.min(100, e.pctMes)}%"></div></div>
        <p class="meta-pie">${e.cumplidaMes
          ? `Ya apartaste ${plata(e.esteMes)} de ${plata(e.mensual)}`
          : `${plata(e.esteMes)} de ${plata(e.mensual)} · faltan ${plata(e.faltaMes)}`}</p>
      </div>`);
  }

  if (e.faltanMeses != null) {
    const n = e.faltanMeses;
    partes.push(`<p class="meta-ritmo">A ${plata(e.mensual)} por mes, llegás en ${n} mes${n === 1 ? '' : 'es'} · ${mesLegible(e.mesLlegada)}</p>`);
  }

  return partes.join('');
}

/* ---------- la tarjeta del Resumen ---------- */

function renderMetas() {
  const card = $('#cardMetas');
  if (!card) return;

  const lista = puede('metas') ? cajasConMeta() : [];
  card.hidden = !lista.length;
  if (!lista.length) return;

  const estados = lista.map(c => ({ caja: c, e: estadoMetas(c, mesSel) }));
  const listas = estados.filter(x => x.e.cumplida).length;
  $('#metasSub').textContent = listas
    ? `${listas} de ${lista.length} cumplida${listas === 1 ? '' : 's'}`
    : `${lista.length} caja${lista.length === 1 ? '' : 's'} con meta`;

  $('#listaMetas').innerHTML = estados.map(({ caja, e }) => {
    /* Si hay meta total se muestra ésa, que es la que la persona tiene en
       la cabeza; si sólo hay mensual, se muestra la del mes. */
    const usaTotal = !!e.meta;
    const pct = usaTotal ? e.pctTotal : e.pctMes;
    const lista_ = usaTotal ? e.cumplida : e.cumplidaMes;
    const pie = usaTotal
      ? (e.cumplida ? `¡Llegaste! ${plata(e.meta)}` : `${plata(e.saldo)} de ${plata(e.meta)}`)
      : (e.cumplidaMes ? `Este mes: ${plata(e.esteMes)} de ${plata(e.mensual)}` : `Este mes: ${plata(e.esteMes)} de ${plata(e.mensual)}`);
    const ritmo = (usaTotal && e.faltanMeses != null)
      ? `<span class="meta-row-ritmo">${e.faltanMeses} mes${e.faltanMeses === 1 ? '' : 'es'}</span>` : '';

    return `<button class="meta-row ${lista_ ? 'is-lista' : ''}" data-id="${caja.id}">
      <span class="meta-row-top">
        <span class="catrow-emoji">${esc(caja.emoji)}</span>
        <span class="catrow-name">${esc(caja.nombre)}</span>
        <span class="meta-pct">${Math.round(pct)}%</span>
      </span>
      <span class="catrow-track"><span class="meta-fill" style="width:${Math.min(100, pct)}%"></span></span>
      <span class="meta-row-pie">${esc(pie)}${ritmo}</span>
    </button>`;
  }).join('');

  $$('#listaMetas .meta-row').forEach(el =>
    el.addEventListener('click', () => { irA('ahorros'); abrirCaja(el.dataset.id); }));
}

/* =========================================================
   Presupuestos por categoría (Premium)

   Un tope mensual de gasto por categoría. No bloquea nada —la app no
   está para impedirte gastar— pero te avisa cuando te pasaste, que es
   la diferencia entre enterarte el día 12 o a fin de mes.

   El tope vive en la categoría (`c.presupuesto`), así viaja solo en las
   copias de seguridad y en la fusión al importar.
   ========================================================= */

const CERCA = 0.8;      // desde el 80% del tope se considera "cerca"

/** Cuánto se gastó en una categoría en un mes. */
function gastadoEnCat(catId, ym) {
  let total = 0;
  for (const m of movsDelMes(ym)) {
    if (m.tipo === 'egreso' && m.categoriaId === catId) total += m.monto;
  }
  return total;
}

/**
 * Estado de cada presupuesto en un mes. Función pura sobre categorías y
 * movimientos, para poder probarla sin navegador.
 *
 * `estado` es 'ok', 'cerca' o 'pasado'. `pct` puede superar el 100: es
 * justamente el dato que interesa cuando alguien se fue al diablo.
 */
function estadoPresupuestos(ym) {
  const out = [];
  for (const c of db.categorias) {
    if (c.tipo !== 'egreso') continue;
    const limite = Number(c.presupuesto);
    if (!isFinite(limite) || limite <= 0) continue;

    const gastado = gastadoEnCat(c.id, ym);
    const pct = limite ? (gastado / limite) * 100 : 0;
    out.push({
      cat: c, limite, gastado,
      resto: limite - gastado,
      pct,
      estado: gastado > limite ? 'pasado' : (gastado >= limite * CERCA ? 'cerca' : 'ok')
    });
  }
  // Primero los que están peor: es lo que la persona necesita ver.
  return out.sort((a, b) => b.pct - a.pct);
}

/* ---------- la tarjeta del Resumen ---------- */

function renderPresupuestos() {
  const card = $('#cardPresu');
  if (!card) return;

  const lista = puede('presupuestos') ? estadoPresupuestos(mesSel) : [];
  card.hidden = !lista.length;
  if (!lista.length) return;

  const pasados = lista.filter(p => p.estado === 'pasado').length;
  $('#presuSub').textContent = pasados
    ? `${pasados} de ${lista.length} pasado${pasados === 1 ? '' : 's'}`
    : `${lista.length} categoría${lista.length === 1 ? '' : 's'} con tope`;

  $('#listaPresu').innerHTML = lista.map(p => {
    const ancho = Math.min(100, Math.max(1, p.pct));
    const resto = p.resto >= 0
      ? `Queda ${plata(p.resto)}`
      : `Te pasaste ${plata(Math.abs(p.resto))}`;
    return `<div class="presurow is-${p.estado}">
      <div class="presurow-top">
        <span class="catrow-emoji">${esc(p.cat.emoji)}</span>
        <span class="catrow-name">${esc(p.cat.nombre)}</span>
        <span class="presurow-pct">${Math.round(p.pct)}%</span>
      </div>
      <div class="catrow-track"><div class="presurow-fill" style="width:${ancho}%"></div></div>
      <div class="presurow-pie">
        <span>${plata(p.gastado)} de ${plata(p.limite)}</span>
        <span class="presurow-resto">${resto}</span>
      </div>
    </div>`;
  }).join('');
}

/** Aviso arriba del Resumen cuando hay topes pasados. */
function pintarAvisoPresu() {
  const el = $('#avisoPresu');
  if (!el) return;
  const pasados = puede('presupuestos')
    ? estadoPresupuestos(mesSel).filter(p => p.estado === 'pasado') : [];

  el.hidden = !pasados.length;
  if (!pasados.length) return;

  const nombres = pasados.map(p => p.cat.nombre);
  const lista = nombres.length === 1 ? nombres[0]
    : nombres.length === 2 ? `${nombres[0]} y ${nombres[1]}`
    : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;

  $('#avisoPresuTitulo').textContent = pasados.length === 1
    ? 'Te pasaste de un presupuesto'
    : `Te pasaste de ${pasados.length} presupuestos`;

  const demas = pasados.reduce((a, p) => a + (p.gastado - p.limite), 0);
  $('#avisoPresuTexto').textContent =
    `${lista}: ${plata(demas)} por encima de lo que te habías puesto para ${mesLegible(mesSel).toLowerCase()}.`;
}

/* =========================================================
   Buscar y filtrar en el historial (Premium)

   La versión gratis busca dentro del mes que se está viendo. Premium
   abre el alcance: podés barrer varios meses o todo lo cargado, acotar
   por categoría y por rango de monto, y ver el total de lo que te quedó
   filtrado —que suele ser la respuesta que uno buscaba.
   ========================================================= */

const PERIODOS = [
  { v: 0,  et: 'Este mes' },
  { v: 3,  et: '3 meses' },
  { v: 6,  et: '6 meses' },
  { v: 12, et: '1 año' },
  { v: -1, et: 'Todo' }
];

/** Movimientos de los últimos `meses` contando el actual. -1 = todo. */
function movimientosDelPeriodo(meses) {
  if (meses === -1) return db.movimientos.slice();
  const desde = mesSumar(mesSel, -(meses - 1));
  return db.movimientos.filter(m => {
    const ym = mesDeISO(m.fecha);
    return ym >= desde && ym <= mesSel;
  });
}

/** Línea con el total de lo filtrado. Sólo cuando hay filtros puestos. */
function pintarResumenFiltros(movs, avanzado) {
  const el = $('#resumenFiltros');
  if (!el) return;
  const mostrar = avanzado && filtrosActivos();
  el.hidden = !mostrar;
  if (!mostrar) return;

  const eg = movs.filter(m => m.tipo === 'egreso').reduce((a, m) => a + m.monto, 0);
  const ing = movs.filter(m => m.tipo === 'ingreso').reduce((a, m) => a + m.monto, 0);
  const n = movs.length;

  const partes = [`${n} movimiento${n === 1 ? '' : 's'}`];
  if (eg) partes.push(`${plata(eg)} en egresos`);
  if (ing) partes.push(`${plata(ing)} en ingresos`);
  $('#resumenFiltrosTexto').textContent = partes.join(' · ');
}

/** Etiqueta del botón: resume qué hay puesto sin tener que abrirlo. */
function pintarAccesoFiltros() {
  const el = $('#accesoFiltros');
  if (!el) return;
  const sub = $('#accesoFiltrosSub');
  marcarAccesoPro('#accesoFiltros', 'filtros');

  if (!puede('filtros')) {
    sub.textContent = 'Buscá en todo el historial, no sólo en este mes';
    el.classList.remove('is-activo');
    return;
  }
  if (!filtrosActivos()) {
    sub.textContent = 'Buscá en varios meses, por categoría o por monto';
    el.classList.remove('is-activo');
    return;
  }

  const p = PERIODOS.find(x => x.v === filtros.periodo);
  const partes = [p ? p.et : 'Este mes'];
  if (filtros.cats.length) partes.push(`${filtros.cats.length} categoría${filtros.cats.length === 1 ? '' : 's'}`);
  if (filtros.montoMin != null || filtros.montoMax != null) partes.push('por monto');
  sub.textContent = partes.join(' · ');
  el.classList.add('is-activo');
}

/* ---------- la hoja ---------- */

function abrirFiltros() {
  if (!puede('filtros')) { abrirPremium('filtros'); return; }
  $$('[data-periodo]').forEach(b => b.classList.toggle('is-on', Number(b.dataset.periodo) === filtros.periodo));
  $('#filtroMin').value = filtros.montoMin != null ? filtros.montoMin : '';
  $('#filtroMax').value = filtros.montoMax != null ? filtros.montoMax : '';
  pintarFiltroCats();
  abrirHoja('sheetFiltros');
}

function pintarFiltroCats() {
  const cont = $('#filtroCats');
  const sel = new Set(filtros.cats);
  cont.innerHTML = db.categorias.map(c => `
    <button type="button" class="catchip ${sel.has(c.id) ? 'is-on' : ''}" data-id="${c.id}">
      <span class="e">${esc(c.emoji)}</span>${esc(c.nombre)}
    </button>`).join('');
  $$('#filtroCats .catchip').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.id;
    filtros.cats = filtros.cats.includes(id)
      ? filtros.cats.filter(x => x !== id)
      : filtros.cats.concat(id);
    pintarFiltroCats();
  }));
}

function aplicarFiltros() {
  const min = numeroDeTexto($('#filtroMin').value);
  const max = numeroDeTexto($('#filtroMax').value);
  const err = $('#filtroError');

  if (min != null && max != null && min > max) {
    err.textContent = 'El monto mínimo no puede ser mayor que el máximo.';
    err.hidden = false;
    return;
  }
  err.hidden = true;

  filtros.montoMin = min != null && min > 0 ? min : null;
  filtros.montoMax = max != null && max > 0 ? max : null;

  cerrarHoja('sheetFiltros');
  pintarAccesoFiltros();
  renderMovimientos();
}

function limpiarFiltros() {
  filtros = { periodo: 0, cats: [], montoMin: null, montoMax: null };
  $('#filtroError').hidden = true;
  pintarAccesoFiltros();
  renderMovimientos();
  if (!$('#sheetFiltros').hidden) abrirFiltros();   // refresca la hoja abierta
}

function conectarFiltros() {
  $('#accesoFiltros').addEventListener('click', abrirFiltros);
  $('#sheetFiltrosClose').addEventListener('click', () => cerrarHoja('sheetFiltros'));
  $('#sheetFiltrosBack').addEventListener('click', () => cerrarHoja('sheetFiltros'));
  $('#btnAplicarFiltros').addEventListener('click', aplicarFiltros);
  $('#btnLimpiarFiltros').addEventListener('click', limpiarFiltros);
  $('#btnQuitarFiltros').addEventListener('click', limpiarFiltros);

  $$('[data-periodo]').forEach(b => b.addEventListener('click', () => {
    filtros.periodo = Number(b.dataset.periodo);
    $$('[data-periodo]').forEach(x => x.classList.toggle('is-on', x === b));
  }));
}

/* =========================================================
   Comparar períodos (Premium)

   La pregunta que contesta esta pantalla es «¿en qué se me fue la plata
   este mes que antes no?». Por eso ordena por la diferencia y no por el
   monto: una categoría chica que se duplicó dice más que una grande que
   quedó igual.

   Se compara contra el mes anterior o contra el promedio de los últimos
   meses. El promedio es más justo cuando hay gastos que caen salteados
   —el seguro, la obra social— y el mes anterior sirve para ver el salto
   puntual.
   ========================================================= */

const MODOS_COMP = {
  anterior: { etiqueta: 'Mes anterior',  meses: 1 },
  tres:     { etiqueta: 'Promedio 3 meses', meses: 3 },
  seis:     { etiqueta: 'Promedio 6 meses', meses: 6 }
};

let modoComp = 'anterior';

/** Egresos por categoría de un mes, como Map id → monto. */
function egresosPorCat(ym) {
  const m = new Map();
  for (const mv of movsDelMes(ym)) {
    if (mv.tipo !== 'egreso') continue;
    const k = mv.categoriaId || 'sin';
    m.set(k, (m.get(k) || 0) + mv.monto);
  }
  return m;
}

/**
 * Compara un mes contra los `meses` anteriores. Función pura sobre los
 * datos; devuelve una fila por categoría que aparezca en cualquiera de
 * los dos lados.
 *
 * `base` es el promedio del período de comparación. Con `meses: 1` el
 * promedio es simplemente el mes anterior.
 */
function compararPeriodos(ym, meses) {
  const ahora = egresosPorCat(ym);

  /* Se promedia sobre los meses que de verdad existen. Si alguien tiene
     dos meses cargados y pide el promedio de seis, dividir por seis
     mostraría una caída inventada. */
  const previos = [];
  for (let i = 1; i <= meses; i++) previos.push(mesSumar(ym, -i));
  const conDatos = previos.filter(m => movsDelMes(m).length > 0);
  const divisor = conDatos.length || 1;

  const base = new Map();
  for (const m of conDatos) {
    for (const [k, v] of egresosPorCat(m)) base.set(k, (base.get(k) || 0) + v);
  }
  for (const [k, v] of base) base.set(k, v / divisor);

  const ids = new Set([...ahora.keys(), ...base.keys()]);
  const filas = [];
  for (const id of ids) {
    const c = catPorId(id);
    const act = ahora.get(id) || 0;
    const ant = base.get(id) || 0;
    const dif = act - ant;
    filas.push({
      id,
      nombre: c ? c.nombre : 'Sin categoría',
      emoji: c ? c.emoji : '❓',
      actual: act,
      base: ant,
      dif,
      // sin base no hay porcentaje posible: es gasto nuevo
      pct: ant > 0 ? (dif / ant) * 100 : (act > 0 ? null : 0),
      nuevo: ant === 0 && act > 0,
      dejado: act === 0 && ant > 0
    });
  }

  filas.sort((a, b) => b.dif - a.dif);     // lo que más subió, primero

  const totalAct = [...ahora.values()].reduce((a, b) => a + b, 0);
  const totalAnt = [...base.values()].reduce((a, b) => a + b, 0);

  return {
    filas,
    totalActual: totalAct,
    totalBase: totalAnt,
    dif: totalAct - totalAnt,
    pct: totalAnt > 0 ? ((totalAct - totalAnt) / totalAnt) * 100 : null,
    mesesUsados: conDatos.length,
    hayDatos: conDatos.length > 0
  };
}

/* ---------- pantalla ---------- */

function abrirComparar() {
  if (!puede('comparar')) { abrirPremium('comparar'); return; }
  renderComparar();
  abrirHoja('sheetComp');
}

const signo = n => (n > 0 ? '+' : n < 0 ? '−' : '');
const montoConSigno = n => `${signo(n)}${plata(Math.abs(n))}`;

function renderComparar() {
  $$('[data-modocomp]').forEach(b => b.classList.toggle('is-on', b.dataset.modocomp === modoComp));
  $('#compMes').textContent = mesLegible(mesSel);

  const r = compararPeriodos(mesSel, MODOS_COMP[modoComp].meses);

  if (!r.hayDatos) {
    $('#compResumen').hidden = true;
    $('#listaComp').innerHTML = vacio('📊', 'Todavía no hay con qué comparar',
      'Cuando tengas otro mes cargado vas a poder ver en qué cambió tu gasto.');
    return;
  }

  $('#compResumen').hidden = false;
  const clase = r.dif > 0 ? 'es-sube' : r.dif < 0 ? 'es-baja' : '';
  $('#compDif').className = `comp-dif ${clase}`;
  $('#compDif').textContent = montoConSigno(r.dif);
  $('#compDifPct').textContent = r.pct == null ? '' :
    `${signo(r.pct)}${Math.abs(Math.round(r.pct))}%`;
  $('#compDetalle').textContent =
    `${plata(r.totalActual)} este mes contra ${plata(r.totalBase)} ` +
    (MODOS_COMP[modoComp].meses === 1 ? 'el mes anterior'
      : `de promedio en ${r.mesesUsados} mes${r.mesesUsados === 1 ? '' : 'es'}`);

  // Las que no se movieron no aportan nada a la lectura.
  const filas = r.filas.filter(f => Math.abs(f.dif) >= 1);
  if (!filas.length) {
    $('#listaComp').innerHTML = vacio('🟰', 'Gastaste casi lo mismo',
      'No hay diferencias para destacar contra ese período.');
    return;
  }

  $('#listaComp').innerHTML = filas.map(f => {
    const cl = f.dif > 0 ? 'es-sube' : 'es-baja';
    const nota = f.nuevo ? 'nuevo este mes'
      : f.dejado ? 'no gastaste este mes'
      : f.pct == null ? ''
      : `${signo(f.pct)}${Math.abs(Math.round(f.pct))}%`;
    return `<div class="comprow">
      <span class="catrow-emoji">${esc(f.emoji)}</span>
      <span class="comprow-txt">
        <span class="catrow-name">${esc(f.nombre)}</span>
        <span class="comprow-sub">${plata(f.actual)} contra ${plata(f.base)}</span>
      </span>
      <span class="comprow-dif ${cl}">
        <span class="comprow-monto">${montoConSigno(f.dif)}</span>
        <span class="comprow-pct">${esc(nota)}</span>
      </span>
    </div>`;
  }).join('');
}

function conectarComparar() {
  $('#accesoComp').addEventListener('click', abrirComparar);
  $('#sheetCompClose').addEventListener('click', () => cerrarHoja('sheetComp'));
  $('#sheetCompBack').addEventListener('click', () => cerrarHoja('sheetComp'));
  $$('[data-modocomp]').forEach(b => b.addEventListener('click', () => {
    modoComp = b.dataset.modocomp;
    renderComparar();
  }));
}

/* =========================================================
   Movimientos fijos (Premium)

   Un «fijo» es una plantilla: el alquiler, el gimnasio, el sueldo. La app
   la carga sola todos los meses y uno se olvida.

   Tres reglas que hacen que esto no moleste:

   1. Nunca se carga antes de la fecha. Si el alquiler es el 5, el día 1
      no existe todavía. Tampoco se carga nada con fecha futura, igual que
      en la carga a mano.
   2. Cada fijo se acuerda de qué meses ya generó. Si la persona borra el
      movimiento de un mes —porque ese mes no lo pagó—, no se lo volvemos
      a meter al otro día. Por eso la memoria vive en el fijo y no se
      deduce mirando los movimientos.
   3. Lo generado es un movimiento común y corriente: se edita, se borra y
      cuenta en el resumen como cualquier otro. El fijo es la plantilla,
      no una clase aparte de plata.
   ========================================================= */

/** Último día de un mes 'AAAA-MM'. Sirve para que un fijo del día 31 caiga
    el 28 o 29 en febrero en lugar de perderse. */
function ultimoDiaDelMes(ym) {
  const [a, m] = ym.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

/** La fecha que le toca a un fijo en un mes dado. */
function fechaDelFijo(fijo, ym) {
  const dia = Math.min(Math.max(1, fijo.dia || 1), ultimoDiaDelMes(ym));
  return `${ym}-${String(dia).padStart(2, '0')}`;
}

/**
 * Qué meses le deben a un fijo. Función pura: con los mismos datos y la
 * misma fecha devuelve siempre lo mismo, así se puede probar sola.
 *
 * Devuelve los meses de más viejo a más nuevo.
 */
function mesesPendientes(fijo, hoy = hoyISO()) {
  if (!fijo || fijo.activo === false) return [];

  const mesHoy = mesDeISO(hoy);
  const ya = new Set(fijo.generados || []);
  const pendientes = [];

  let ym = fijo.desde || mesHoy;
  if (ym > mesHoy) return [];                 // todavía no arrancó

  /* El tope es el mes actual: más adelante serían fechas futuras. El límite
     de vueltas es por las dudas, para que un `desde` corrupto no cuelgue
     la app con un bucle infinito. */
  for (let i = 0; i < 600 && ym <= mesHoy; i++, ym = mesSumar(ym, 1)) {
    if (fijo.hasta && ym > fijo.hasta) break;
    if (ya.has(ym)) continue;
    if (fechaDelFijo(fijo, ym) > hoy) continue;   // el día todavía no llegó
    pendientes.push(ym);
  }
  return pendientes;
}

/* ---------------------------------------------------------
   Plazo: sin fin, una cantidad de meses (cuotas) o hasta un mes.
   En los dos últimos casos se guarda `hasta` (el último mes que se
   carga); con cuotas además `plazoMeses`, para poder decir "3 de 12".
   --------------------------------------------------------- */
function cuotaDe(f, ym) {
  if (!f.plazoMeses || !f.desde) return null;
  const [a1, m1] = f.desde.split('-').map(Number), [a2, m2] = ym.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
}
function descripcionDeCuota(f, ym) {
  const base = f.descripcion || '';
  const n = cuotaDe(f, ym);
  if (!n || n > f.plazoMeses) return base;
  const cuota = `cuota ${n}/${f.plazoMeses}`;
  return base ? `${base} · ${cuota}` : cuota.charAt(0).toUpperCase() + cuota.slice(1);
}
function fijoTerminado(f, mesHoy = mesDeISO(hoyISO())) {
  return !!(f.hasta && f.hasta < mesHoy);
}
function textoPlazo(f) {
  const mesHoy = mesDeISO(hoyISO());
  if (!f.hasta) return '';
  if (fijoTerminado(f, mesHoy)) return 'terminado';
  if (f.plazoMeses) {
    const n = Math.max(1, Math.min(f.plazoMeses, cuotaDe(f, mesHoy) || 1));
    return `cuota ${n} de ${f.plazoMeses}`;
  }
  return `hasta ${mesLegible(f.hasta)}`;
}

let borradorPlazo = 'sinfin';
function pintarPlazo() {
  $$('[data-plazo]').forEach(b => b.classList.toggle('is-on', b.dataset.plazo === borradorPlazo));
  $('#plazoMesesFila').hidden = borradorPlazo !== 'meses';
  $('#plazoHastaFila').hidden = borradorPlazo !== 'hasta';
  const f = editandoFijo ? (db.fijos || []).find(x => x.id === editandoFijo) : null;
  const desde = f && f.desde ? f.desde : mesDeISO(hoyISO());
  $('#fijoHasta').min = desde;
  const ayuda = $('#plazoAyuda');
  if (borradorPlazo === 'sinfin') ayuda.textContent = 'Se carga todos los meses hasta que lo pauses o lo elimines.';
  else if (borradorPlazo === 'meses') {
    const n = parseInt($('#fijoMeses').value, 10);
    ayuda.textContent = Number.isFinite(n) && n > 0
      ? `Desde ${mesLegible(desde)} hasta ${mesLegible(mesSumar(desde, n - 1))}. Cada movimiento dice el número de cuota.`
      : 'Ideal para cuotas: cada movimiento dice el número de cuota.';
  } else {
    const h = $('#fijoHasta').value;
    ayuda.textContent = h ? `Se carga desde ${mesLegible(desde)} hasta ${mesLegible(h)}, inclusive.` : 'Elegí el último mes en que se carga.';
  }
}

/**
 * Carga lo que haya pendiente de todos los fijos.
 *
 * No corre sin Premium: los fijos quedan guardados y en pausa. Devuelve
 * cuántos movimientos cargó, para poder avisarlo.
 */
/* Corre en todas las billeteras, no sólo en la que se está viendo: si no,
   el alquiler en dólares no se cargaría hasta que alguien abra esa
   billetera. Lo cargado se suma a `cargadosRecien` de cada una. */
function correrFijos() {
  if (!puede('fijos')) return 0;

  let total = 0;
  for (const [cod, b] of Object.entries(db.billeteras)) {
    const n = correrFijosDe(b);
    if (n) cargadosRecien[cod] = (cargadosRecien[cod] || 0) + n;
    total += n;
  }
  if (total) guardar();
  return total;
}

function correrFijosDe(b) {
  const hoy = hoyISO();
  let cargados = 0;

  for (const f of b.fijos) {
    for (const ym of mesesPendientes(f, hoy)) {
      /* La categoría puede haber sido borrada después de crear el fijo.
         Antes que perder el movimiento, se carga en la primera que haya
         del mismo tipo; si no hay ninguna, se saltea sin romper nada. */
      let catId = f.categoriaId;
      if (!b.categorias.some(c => c.id === catId)) {
        const alt = b.categorias.find(c => c.tipo === f.tipo);
        if (!alt) continue;
        catId = alt.id;
      }

      b.movimientos.push({
        id: uid(),
        tipo: f.tipo,
        monto: f.monto,
        categoriaId: catId,
        cajaId: null,
        sentido: null,
        descripcion: descripcionDeCuota(f, ym),
        fecha: fechaDelFijo(f, ym),
        creado: new Date().toISOString(),
        porVoz: false,
        textoVoz: '',
        fijoId: f.id          // deja rastro de dónde salió
      });

      f.generados = (f.generados || []).concat(ym);
      cargados++;
    }
  }
  return cargados;
}

/* ---------------------------------------------------------
   Aviso en el Resumen
   --------------------------------------------------------- */

/** Fijos cargados en esta sesión, por billetera: cada una avisa los suyos. */
let cargadosRecien = {};

function pintarAvisoFijos() {
  const el = $('#avisoFijos');
  if (!el) return;
  const n = cargadosRecien[moneda()] || 0;
  el.hidden = !n;
  if (!n) return;
  $('#avisoFijosTexto').textContent = n === 1
    ? 'Se cargó 1 movimiento fijo. Revisalo por las dudas: si algo no era así, editalo o borralo.'
    : `Se cargaron ${n} movimientos fijos. Revisalos por las dudas: si alguno no era así, editalo o borralo.`;
}

/* ---------------------------------------------------------
   Pantalla de fijos
   --------------------------------------------------------- */

let editandoFijo = null;
let borradorFijoTipo = 'egreso';
let borradorFijoCat = null;

const fijosActivos = () => (db.fijos || []).filter(f => f.activo !== false);

/** Botón de acceso en la vista de Movimientos. */
function pintarAccesoFijos() {
  const el = $('#accesoFijos');
  if (!el) return;
  const n = fijosActivos().length;
  const sub = $('#accesoFijosSub');
  marcarAccesoPro('#accesoFijos', 'fijos');
  if (!puede('fijos')) {
    sub.textContent = (db.fijos || []).length
      ? `${(db.fijos || []).length} en pausa`
      : 'Cargá el alquiler y el sueldo una vez y se cargan solos';
  } else {
    sub.textContent = n === 0 ? 'Todavía no programaste ninguno'
      : n === 1 ? '1 programado'
      : `${n} programados`;
  }
}

function abrirFijos() {
  if (!puede('fijos')) { abrirPremium('fijos'); return; }
  renderFijos();
  abrirHoja('sheetFijos');
}

function renderFijos() {
  const cont = $('#listaFijos');
  const lista = db.fijos || [];

  if (!lista.length) {
    cont.innerHTML = vacio('🔁', 'Sin movimientos fijos',
      'Programá el alquiler, el sueldo o la cuota del gimnasio y se cargan solos todos los meses.');
    return;
  }

  const orden = [...lista].sort((a, b) => (a.dia || 1) - (b.dia || 1));
  cont.innerHTML = `<div class="catlist">${orden.map(f => {
    const c = catPorId(f.categoriaId);
    const pausado = f.activo === false;
    const terminado = fijoTerminado(f);
    const plazo = textoPlazo(f);
    return `
    <button class="fijoitem ${pausado ? 'is-pausado' : ''} ${terminado ? 'is-terminado' : ''}" data-id="${f.id}">
      <span class="catitem-emoji">${esc(c ? c.emoji : '🏷️')}</span>
      <span class="fijoitem-txt">
        <span class="fijoitem-name">${esc(f.descripcion || (c ? c.nombre : 'Movimiento fijo'))}</span>
        <span class="fijoitem-sub">El ${f.dia} de cada mes · ${esc(c ? c.nombre : 'sin categoría')}${plazo ? ' · ' + plazo : ''}${pausado && !terminado ? ' · en pausa' : ''}</span>
      </span>
      <span class="fijoitem-monto ${f.tipo === 'ingreso' ? 'es-in' : 'es-out'}">${f.tipo === 'ingreso' ? '+' : '−'}${plata(f.monto).replace('-', '')}</span>
    </button>`;
  }).join('')}</div>`;

  $$('#listaFijos .fijoitem').forEach(el =>
    el.addEventListener('click', () => abrirFijo(el.dataset.id)));
}

function abrirFijo(id = null) {
  editandoFijo = id;
  const f = id ? (db.fijos || []).find(x => x.id === id) : null;

  borradorFijoTipo = f ? f.tipo : 'egreso';
  borradorFijoCat = f ? f.categoriaId : null;

  $('#sheetFijoTitle').textContent = f ? 'Editar fijo' : 'Nuevo movimiento fijo';
  $('#fijoMonto').value = f ? f.monto : '';
  $('#fijoDesc').value = f ? (f.descripcion || '') : '';
  $('#fijoDia').value = f ? f.dia : 1;
  $('#fijoActivo').checked = f ? f.activo !== false : true;
  borradorPlazo = !f || !f.hasta ? 'sinfin' : f.plazoMeses ? 'meses' : 'hasta';
  $('#fijoMeses').value = f && f.plazoMeses ? f.plazoMeses : 12;
  $('#fijoHasta').value = f && f.hasta ? f.hasta : '';
  pintarPlazo();
  $('#filaFijoActivo').hidden = !f;
  $('#btnBorrarFijo').hidden = !f;
  $('#fijoError').hidden = true;

  $$('[data-fijotipo]').forEach(b => b.classList.toggle('is-on', b.dataset.fijotipo === borradorFijoTipo));
  pintarFijoCatPicker();
  abrirHoja('sheetFijo');
}

function pintarFijoCatPicker() {
  const cont = $('#fijoCategoria');
  const lista = catsDe(borradorFijoTipo);
  if (!lista.length) {
    cont.innerHTML = `<p class="field-help">No tenés categorías de ${borradorFijoTipo}. Creá una primero.</p>`;
    return;
  }
  if (!lista.some(c => c.id === borradorFijoCat)) borradorFijoCat = lista[0].id;
  cont.innerHTML = lista.map(c => `
    <button type="button" class="catchip ${c.id === borradorFijoCat ? 'is-on' : ''}" data-id="${c.id}">
      <span class="e">${esc(c.emoji)}</span>${esc(c.nombre)}
    </button>`).join('');
  $$('#fijoCategoria .catchip').forEach(el => el.addEventListener('click', () => {
    borradorFijoCat = el.dataset.id;
    pintarFijoCatPicker();
  }));
}

function guardarFijo() {
  const err = $('#fijoError');
  const fallar = m => { err.textContent = m; err.hidden = false; };

  const monto = numeroDeTexto($('#fijoMonto').value);
  if (monto == null || monto <= 0) { fallar('Poné un monto mayor a cero.'); $('#fijoMonto').focus(); return; }

  const dia = parseInt($('#fijoDia').value, 10);
  if (!Number.isFinite(dia) || dia < 1 || dia > 31) { fallar('El día tiene que estar entre 1 y 31.'); return; }

  if (!borradorFijoCat) { fallar('Elegí una categoría.'); return; }

  const previo = editandoFijo ? (db.fijos || []).find(x => x.id === editandoFijo) : null;
  const desde = previo && previo.desde ? previo.desde : mesDeISO(hoyISO());
  let hasta = null, plazoMeses = null;
  if (borradorPlazo === 'meses') {
    const n = parseInt($('#fijoMeses').value, 10);
    if (!Number.isFinite(n) || n < 1 || n > 360) { fallar('La cantidad de meses tiene que estar entre 1 y 360.'); return; }
    plazoMeses = n;
    hasta = mesSumar(desde, n - 1);
  } else if (borradorPlazo === 'hasta') {
    hasta = $('#fijoHasta').value;
    if (!/^\d{4}-\d{2}$/.test(hasta)) { fallar('Elegí hasta qué mes se carga.'); return; }
    if (hasta < desde) { fallar(`El último mes no puede ser anterior a ${mesLegible(desde)}, cuando arranca.`); return; }
  }

  const campos = {
    tipo: borradorFijoTipo,
    monto: Math.round(monto * 100) / 100,
    categoriaId: borradorFijoCat,
    descripcion: $('#fijoDesc').value.trim(),
    dia,
    hasta,
    plazoMeses,
    activo: $('#fijoActivo').checked
  };

  db.fijos = db.fijos || [];

  if (editandoFijo) {
    Object.assign(db.fijos.find(x => x.id === editandoFijo), campos);
  } else {
    /* Arranca este mes. Si el día ya pasó, se carga enseguida; si no,
       cuando llegue. Nunca hacia atrás: nadie quiere que al programar el
       alquiler le aparezcan seis meses de alquileres viejos. */
    db.fijos.push({
      id: uid(), ...campos,
      desde,
      generados: [],
      creado: new Date().toISOString()
    });
  }

  guardar();
  cerrarHoja('sheetFijo');
  editandoFijo = null;

  const n = correrFijos();          // puede corresponder cargarlo ya mismo
  renderFijos();
  renderTodo();
  avisar(n ? 'Fijo guardado y cargado este mes' : 'Movimiento fijo guardado');
}

async function borrarFijo() {
  if (!editandoFijo) return;
  const f = (db.fijos || []).find(x => x.id === editandoFijo);
  const si = await confirmar('Eliminar movimiento fijo',
    [f ? `${f.descripcion || 'Movimiento fijo'} · el ${f.dia} de cada mes` : '',
     'Los movimientos que ya se cargaron se quedan como están. Deja de cargarse de acá en adelante.'],
    'Eliminar', true);
  if (!si) return;
  db.fijos = (db.fijos || []).filter(x => x.id !== editandoFijo);
  guardar();
  editandoFijo = null;
  cerrarHoja('sheetFijo');
  renderFijos();
  renderTodo();
  avisar('Movimiento fijo eliminado');
}

function conectarFijos() {
  $('#accesoFijos').addEventListener('click', abrirFijos);
  $('#sheetFijosClose').addEventListener('click', () => cerrarHoja('sheetFijos'));
  $('#sheetFijosBack').addEventListener('click', () => cerrarHoja('sheetFijos'));
  $('#btnNuevoFijo').addEventListener('click', () => abrirFijo(null));

  $('#sheetFijoClose').addEventListener('click', () => { cerrarHoja('sheetFijo'); editandoFijo = null; });
  $('#sheetFijoBack').addEventListener('click', () => { cerrarHoja('sheetFijo'); editandoFijo = null; });
  $('#btnGuardarFijo').addEventListener('click', guardarFijo);
  $('#btnBorrarFijo').addEventListener('click', borrarFijo);
  $$('[data-plazo]').forEach(b => b.addEventListener('click', () => { borradorPlazo = b.dataset.plazo; pintarPlazo(); }));
  $('#fijoMeses').addEventListener('input', pintarPlazo);
  $('#fijoHasta').addEventListener('change', pintarPlazo);

  $$('[data-fijotipo]').forEach(b => b.addEventListener('click', () => {
    borradorFijoTipo = b.dataset.fijotipo;
    $$('[data-fijotipo]').forEach(x => x.classList.toggle('is-on', x === b));
    borradorFijoCat = null;
    pintarFijoCatPicker();
  }));

  $('#avisoFijosOk').addEventListener('click', () => {
    cargadosRecien[moneda()] = 0;
    pintarAvisoFijos();
  });
}

/* =========================================================
   Recordatorios

   Una app de gastos sirve sólo si se usa todos los días, y lo que hace
   que se use no es la app: es acordarse. De eso se ocupan estos avisos.

   Cómo funciona, que es lo que permite que ande sin servidor:

   · Un recordatorio por día, a las 21, SIEMPRE: haya entrado o no la
     persona ese día. Son siete avisos que se repiten solos cada semana
     (uno por día de la semana), así que siguen llegando aunque no abra
     la app en meses, y sobreviven a que se reinicie el teléfono.
   · El día 1 de cada mes, a las 10, un aviso de que está listo el
     resumen del mes que terminó.
   · Cada vez que se abre la app se reprograma todo, y las variaciones
     de texto se corren de día: así no le toca siempre el mismo texto al
     mismo día de la semana.

   Los textos rotan. Un recordatorio que dice siempre lo mismo se vuelve
   invisible a la semana. Tienen que servir tanto si ya cargó algo hoy
   como si no.

   **Esto sólo funciona de verdad en el APK.** El navegador no puede
   despertar una página cerrada para mostrar un aviso a una hora
   determinada: haría falta un servidor de notificaciones push. En la
   PWA, entonces, ni se pide el permiso: pedir algo que no vas a poder
   cumplir es peor que no ofrecerlo.
   ========================================================= */

const HORA_RECORDATORIO = 21;     // el aviso del día, a las 21
const HORA_RESUMEN = 10;          // el del resumen, el día 1 a las 10
const CANAL_AVISOS = 'recordatorios';
const ICONO_NOTIF = 'ic_stat_misgastos';   // android/app/src/main/res/drawable

/* Cinco variaciones. Valen tanto para quien ya cargó como para quien no. */
const AVISOS_DIA = [
  { t: '¿Cómo venís hoy?',        c: 'Cargá lo que gastaste antes de que se te mezcle con mañana.' },
  { t: 'Dos minutos y listo',     c: 'Anotá los gastos del día mientras los tenés frescos.' },
  { t: 'Un repaso rápido',        c: '¿Hubo algún gasto hoy que todavía no cargaste?' },
  { t: 'Antes de que se olvide',  c: 'Lo que no se anota hoy, mañana ya no se acuerda nadie.' },
  { t: 'Cerrá el día',            c: 'Un minuto ahora te ahorra media hora a fin de mes.' }
];

const AVISO_RESUMEN = { t: 'Tu resumen del mes está listo', c: 'Mirá cuánto entró, cuánto salió y en qué se te fue la plata el mes pasado.' };

const plugNotif = () => (window.Capacitor && window.Capacitor.Plugins &&
                         window.Capacitor.Plugins.LocalNotifications) || null;

/** Los recordatorios tienen sentido sólo donde se pueden cumplir. */
const puedeRecordar = () => !!(esNativo && plugNotif());

/* ---------- permiso ---------- */

/**
 * Se pide una sola vez. Si la persona dice que no, no se vuelve a
 * insistir: queda el interruptor en Ajustes para cuando quiera.
 */
async function pedirPermisoAvisos({ aMano = false } = {}) {
  const P = plugNotif();
  if (!P) return false;

  try {
    let { display } = await P.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale' || aMano) {
      ({ display } = await P.requestPermissions());
    }
    const ok = display === 'granted';
    db.ajustes.avisos = ok;
    db.ajustes.avisosPedidos = true;
    guardar();
    pintarAvisosAjustes();
    if (ok) programarRecordatorios();
    return ok;
  } catch (e) {
    console.warn('No pude pedir el permiso de avisos:', e);
    return false;
  }
}

/** Al primer arranque, una sola vez en la vida de la instalación. */
async function iniciarAvisos() {
  if (!puedeRecordar()) { pintarAvisosAjustes(); return; }
  if (!db.ajustes.avisosPedidos) {
    await pedirPermisoAvisos();
    return;
  }
  if (db.ajustes.avisos) programarRecordatorios();
  pintarAvisosAjustes();
}

/* ---------- programar ---------- */

/** Semana del año: corre qué variación le toca a cada día de la semana. */
function semanaDelAnio(d) {
  const ini = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - ini) / (7 * 86400000));
}

/** Los avisos que se dejan programados. Todos se repiten solos. */
function planDeAvisos(ahora = new Date()) {
  const plan = [];
  const corrimiento = semanaDelAnio(ahora);
  // weekday: 1 = domingo … 7 = sábado (como Calendar.DAY_OF_WEEK de Android)
  for (let w = 1; w <= 7; w++) {
    const a = AVISOS_DIA[(w - 1 + corrimiento) % AVISOS_DIA.length];
    plan.push({ id: 10 + w, title: a.t, body: a.c,
                on: { weekday: w, hour: HORA_RECORDATORIO, minute: 0 } });
  }
  plan.push({ id: 30, title: AVISO_RESUMEN.t, body: AVISO_RESUMEN.c,
              on: { day: 1, hour: HORA_RESUMEN, minute: 0 } });
  return plan;
}

/* Android 8+ manda cada notificación por un «canal», y una notificación
   dirigida a un canal que no existe NO se muestra. Hasta la 2.2 los
   avisos iban a un canal que nunca se creaba. */
let canalListo = false;
async function asegurarCanal() {
  const P = plugNotif();
  if (!P || canalListo || typeof P.createChannel !== 'function') return;
  try {
    await P.createChannel({
      id: CANAL_AVISOS, name: 'Recordatorios',
      description: 'El recordatorio diario y el resumen del mes',
      importance: 4, visibility: 1, vibration: true
    });
    canalListo = true;
  } catch (e) { console.warn('No pude crear el canal de avisos:', e); }
}

async function programarRecordatorios() {
  const P = plugNotif();
  if (!P || !db.ajustes.avisos) return;

  try {
    await asegurarCanal();
    const pend = await P.getPending();
    if (pend && pend.notifications && pend.notifications.length) {
      await P.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
    }

    const plan = planDeAvisos();
    await P.schedule({
      notifications: plan.map(n => ({
        id: n.id,
        title: n.title,
        body: n.body,
        schedule: { on: n.on, allowWhileIdle: true },
        smallIcon: ICONO_NOTIF,
        channelId: CANAL_AVISOS
      }))
    });
  } catch (e) {
    console.warn('No pude programar los recordatorios:', e);
  }
}

async function apagarRecordatorios() {
  const P = plugNotif();
  if (!P) return;
  try {
    const pend = await P.getPending();
    if (pend && pend.notifications && pend.notifications.length) {
      await P.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
    }
  } catch (e) { /* nada que hacer */ }
}

/* ---------- sonidos ---------- */
function conectarSonidosAjustes() {
  const sw = $('#sonidosSwitch');
  if (!sw) return;
  sw.checked = Sonido.activo();
  sw.addEventListener('change', e => {
    Sonido.setActivo(e.target.checked);
    if (e.target.checked) Sonido.tocar('exito');
  });
}

/* ---------- interruptor en Ajustes ---------- */

function pintarAvisosAjustes() {
  const fila = $('#filaAvisos');
  if (!fila) return;

  /* En el navegador no se muestra siquiera: no se puede cumplir. */
  fila.hidden = !puedeRecordar();
  if (!puedeRecordar()) return;

  $('#avisosSwitch').checked = !!db.ajustes.avisos;
  $('#avisosAyuda').textContent = db.ajustes.avisos
    ? `Todos los días a las ${HORA_RECORDATORIO} te recordamos cargar los gastos, y el día 1 te avisamos que está el resumen del mes.`
    : 'Activalos y te recordamos cargar los gastos del día.';
}

async function cambiarAvisos(encender) {
  if (encender) {
    const ok = await pedirPermisoAvisos({ aMano: true });
    if (!ok) {
      $('#avisosSwitch').checked = false;
      await soloAviso('Faltan los permisos',
        'Android tiene bloqueadas las notificaciones de Mis Gastos. Se habilitan desde los ajustes del teléfono, en la ficha de la app.');
    }
    return;
  }
  db.ajustes.avisos = false;
  guardar();
  await apagarRecordatorios();
  pintarAvisosAjustes();
}

function conectarAvisos() {
  const sw = $('#avisosSwitch');
  if (sw) sw.addEventListener('change', e => cambiarAvisos(e.target.checked));
}

/* =========================================================
   Aviso de versión nueva

   La app pregunta de tanto en tanto si hay una versión más nueva. No se
   actualiza sola —un APK bajado fuera de Play Store no puede instalarse
   a sí mismo— pero avisa y deja el link a mano, que es lo que hace la
   diferencia entre un usuario al día y uno con la versión de hace tres
   meses sin enterarse.

   Del lado del servidor es un archivo de dos líneas, `version.json`:

       { "version": "2.0", "apk": "https://…/app-debug.apk",
         "nota": "Metas de ahorro y recordatorios" }

   Publicar una versión pasa a ser editar ese archivo.

   Decisiones para que esto no moleste:
   · Se consulta una vez por día como mucho. No hace falta más.
   · Si no hay internet o el archivo no está, no pasa nada: se calla y
     sigue. Una app que te grita porque no pudo chequear algo es peor
     que una app desactualizada.
   · El aviso se puede posponer, y entonces no vuelve hasta la versión
     siguiente. Nadie quiere pelear todos los días con el mismo cartel.
   ========================================================= */

/* Dónde está el archivo `version.json`.

   Tiene que ser la dirección completa: adentro del APK no hay servidor,
   así que una ruta relativa no apunta a ningún lado.

   Vacío = apagado. Mientras no lo configures, la app ni lo intenta: no
   tiene sentido que miles de teléfonos golpeen una dirección que no
   existe, y en la pantalla de Ajustes se avisa que falta ponerla.

   Apunta al version.json del repositorio de GitHub (rama main). Si el
   repositorio cambia de nombre o de rama, corregí esta línea. */
const URL_VERSION = 'https://raw.githubusercontent.com/matumir/mis-gastos-apk/main/version.json';

const HORAS_ENTRE_CHEQUEOS = 24;

/** Compara "1.10" contra "1.9" como números, no como texto: por orden
    alfabético "1.10" sería menor que "1.9" y el aviso nunca aparecería. */
function versionMayor(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

async function buscarActualizacion({ aMano = false } = {}) {
  const aj = db.ajustes;

  if (!URL_VERSION) {
    if (aMano) avisar('Falta configurar la dirección de las actualizaciones.');
    return;
  }

  if (!aMano) {
    const ultimo = aj.ultimoChequeo ? new Date(aj.ultimoChequeo).getTime() : 0;
    if (Date.now() - ultimo < HORAS_ENTRE_CHEQUEOS * 3600e3) { pintarAvisoVersion(); return; }
  }

  try {
    const res = await fetch(URL_VERSION + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('no disponible');
    const info = await res.json();

    aj.ultimoChequeo = new Date().toISOString();
    if (info && info.version && versionMayor(info.version, APP_VER)) {
      aj.versionNueva = { version: String(info.version), apk: info.apk || '', nota: info.nota || '' };
    } else {
      delete aj.versionNueva;
    }
    guardar();
  } catch (e) {
    /* Sin internet o sin archivo: no es un problema del usuario. */
    if (aMano) avisar('No pude comprobarlo ahora. Probá más tarde.');
  }
  pintarAvisoVersion();
}

function pintarAvisoVersion() {
  const el = $('#avisoVersion');
  if (!el) return;
  const v = db.ajustes.versionNueva;
  const pospuesta = db.ajustes.versionPospuesta;
  const mostrar = !!(v && v.version !== pospuesta);

  el.hidden = !mostrar;
  if (!mostrar) return;

  $('#avisoVersionTexto').textContent = v.nota
    ? `Está la BETA ${v.version}: ${v.nota}`
    : `Está disponible la BETA ${v.version}. La que tenés es la ${APP_VER}.`;

  const bajar = $('#avisoVersionOk');
  bajar.hidden = !v.apk;
  if (v.apk) bajar.href = v.apk;
}

function posponerVersion() {
  const v = db.ajustes.versionNueva;
  if (v) { db.ajustes.versionPospuesta = v.version; guardar(); }
  pintarAvisoVersion();
}

function conectarVersion() {
  const b = $('#btnBuscarVersion');
  if (b) b.hidden = !URL_VERSION || !esNativo;
  $('#avisoVersionNo').addEventListener('click', posponerVersion);
  $('#btnBuscarVersion').addEventListener('click', () => buscarActualizacion({ aMano: true }));
}

/* =========================================================
   Plan: Gratis y Premium

   Mis Gastos es una app personal y se cobra **una sola vez**. No hay
   suscripción, no vence y no hay nada que renovar: el que paga, paga una
   vez y listo.

   Lo que separa un plan del otro es sólo cuánto podés personalizar. Todo
   lo que hace a la app útil —cargar movimientos, la voz, el resumen, los
   gráficos, el ahorro y la copia de seguridad— es gratis y no tiene
   tope. Premium levanta los cupos de categorías y cajas.

   Nada se bloquea hacia atrás: quien ya tenía más categorías de las que
   el plan gratis permite las conserva. Simplemente no puede crear más
   hasta borrar algunas. Sacarle lo que ya armó sería inaceptable.
   ========================================================= */

/* Cómo te contactan para comprar Premium.

   `whatsapp` va en formato internacional, sin +, sin 0 y sin 15:
   54 (país) + 9 (celular) + área sin el 0 + número sin el 15.
   San Francisco, Córdoba: 3564 333963 → 5493564333963

   Si es una línea fija, sacá el 9. Si dejás `whatsapp` vacío, la app
   sigue explicando qué es Premium pero sin botón de contacto. */
const CONTACTO = {
  whatsapp: '5493564333963',
  visible: '+54 3564 333963',
  mensaje: 'Hola! Quiero Mis Gastos Premium.'
};

/** El link de WhatsApp con el mensaje ya escrito: cuanto menos tenga que
    redactar la persona, más chances de que el mensaje llegue. */
function linkContacto() {
  if (!CONTACTO.whatsapp) return '';
  return `https://wa.me/${CONTACTO.whatsapp}?text=${encodeURIComponent(CONTACTO.mensaje)}`;
}

let licencia = null;   // datos verificados de la licencia, o null
let plan = null;       // estado derivado

/** Se verifica de nuevo en cada arranque, no se confía en lo guardado:
    si alguien editó el texto a mano, la firma no cierra y se descarta. */
async function iniciarLicencia() {
  plan = Lic.estado(null, hoyISO());
  const g = Lic.leerGuardada();
  if (g) {
    try {
      const datos = await Lic.verificar(g.texto);
      if (datos.ed === 'per') {
        licencia = datos;
        plan = Lic.estado(datos, hoyISO());
      } else {
        console.warn('La licencia guardada no es de esta app.');
        Lic.borrarLicencia();
      }
    } catch (e) {
      console.warn('La licencia guardada no verifica:', e.message);
      Lic.borrarLicencia();
    }
  }
  aplicarPlan();
}

/* El plan que manda en la práctica:
   · «ver como Gratis» del administrador gana sobre todo (es para probar);
   · si no, la licencia, si está vigente;
   · si no hay licencia, el modo administrador da Premium personal. */
const PLAN_ADMIN = { modo: 'activa', edicion: 'per', nombre: '', admin: true };
function planEfectivo() {
  if (Admin.forzarGratis()) return Lic.estado(null, hoyISO());
  const vigente = !!plan && (plan.modo === 'activa' || plan.modo === 'gracia');
  if (!vigente && Admin.activo()) return PLAN_ADMIN;
  return plan;
}

const esPremium = () => { const p = planEfectivo(); return !!p && (p.modo === 'activa' || p.modo === 'gracia'); };

/** ¿Está habilitada una función paga? La tabla vive en licencia.js. */
const puede = func => Lic.permite(func, planEfectivo());

function aplicarPlan() {
  /* Los fijos corren acá y no en el arranque porque dependen del plan, y
     el plan se resuelve de forma asíncrona. Así también se cargan los que
     estaban en pausa en el momento en que alguien activa Premium. */
  correrFijos();
  pintarMoneda();
  pintarPlan();
  renderTodo();
}

/* ---------------------------------------------------------
   Cupos
   --------------------------------------------------------- */

/** Cuántos hay de cada cosa hoy. */
function usados(cual) {
  if (cual === 'cajas') return db.cajas.length;
  return catsDe(cual === 'catEgreso' ? 'egreso' : 'ingreso').length;
}

const cupoDe = cual => Lic.cupo(cual, usados(cual), planEfectivo());


/** Portero. Devuelve true si hay que cortar porque el cupo está lleno. */
function cupoLleno(cual) {
  const c = cupoDe(cual);
  if (!c.lleno) return false;
  abrirPremium(cual);   // la hoja explica cuál fue el cupo que se llenó
  return true;
}

/* ---------------------------------------------------------
   Lo que se muestra
   --------------------------------------------------------- */

const NOMBRE_CUPO = {
  catEgreso:  'categorías de egreso',
  catIngreso: 'categorías de ingreso',
  cajas:      'cajas de ahorro'
};

/** Línea «4 de 6 categorías de egreso» debajo de cada lista. */
function pintarCupo(idElemento, cual) {
  const el = $(idElemento);
  if (!el) return;
  const c = cupoDe(cual);
  if (c.ilimitado) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('is-lleno', c.lleno);
  el.textContent = c.lleno
    ? `Llegaste a las ${c.tope} ${NOMBRE_CUPO[cual]} del plan gratis.`
    : `${c.usados} de ${c.tope} ${NOMBRE_CUPO[cual]}.`;
}

/**
 * Marca una fila de acceso según el plan.
 *
 * Sin Premium la fila se pone dorada y flota, para que se note que hay
 * algo ahí. Con Premium vuelve al cromo de siempre y el sello pasa a
 * decir que ya lo tiene: una vez que pagó, el dorado deja de ser un
 * anzuelo y es un recibo.
 */
function marcarAccesoPro(sel, func) {
  const el = $(sel);
  if (!el) return;
  const tiene = puede(func);
  el.classList.toggle('es-pro', !tiene);
  el.classList.toggle('es-incluido', tiene);
  const sello = el.querySelector('.sello-pro');
  if (sello) {
    sello.hidden = false;
    sello.textContent = tiene ? 'Incluido con Premium' : 'Premium';
  }
}

/** Los accesos a Premium que viven fuera de Ajustes. Desaparecen apenas
    se activa: insistirle a alguien que ya pagó es la peor publicidad. */
function pintarAccesosPro() {
  const pro = esPremium();
  const pill = $('#btnProHeader'), card = $('#proCard');
  if (pill) pill.hidden = pro;
  if (card) card.hidden = pro;

  marcarAccesoPro('#accesoComp', 'comparar');
  marcarAccesoPro('#accesoFijos', 'fijos');
  marcarAccesoPro('#accesoFiltros', 'filtros');
  marcarAccesoPro('#fabTicket', 'escaner');
}

function pintarPlan() {
  pintarAccesosPro();
  const nom = $('#planNombre'), chip = $('#planChip'), det = $('#planDetalle');
  if (!nom) return;
  const quitar = $('#btnQuitarLic'), activar = $('#btnActivarLic');

  chip.classList.remove('is-activa', 'is-aviso', 'is-vencida');

  if (!esPremium()) {
    nom.textContent = 'Gratis';
    chip.hidden = true;
    const e = cupoDe('catEgreso'), i = cupoDe('catIngreso'), j = cupoDe('cajas');
    det.textContent = `Categorías: ${e.usados} de ${e.tope} de egreso, ${i.usados} de ${i.tope} de ingreso. Cajas de ahorro: ${j.usados} de ${j.tope}.`;
    det.classList.remove('is-alerta');
    quitar.hidden = true;
    activar.textContent = 'Activar Premium';
    return;
  }

  nom.textContent = 'Premium';
  chip.hidden = false;
  chip.textContent = 'Activa';
  chip.classList.add('is-activa');
  const pe = planEfectivo();
  det.classList.remove('is-alerta');
  if (pe.admin) {
    det.textContent = 'Activo por el modo administrador.';
    quitar.hidden = true;
    activar.textContent = 'Activar licencia';
    return;
  }
  det.textContent = pe.nombre
    ? `A nombre de ${pe.nombre}. Pago único, no vence.`
    : 'Pago único, no vence.';
  quitar.hidden = false;
  activar.textContent = 'Cambiar código';
}

/* ---------------------------------------------------------
   Hoja de Premium
   --------------------------------------------------------- */

const MOTIVOS = {
  catEgreso:  () => `Llegaste a las ${Lic.LIMITES.catEgreso} categorías de egreso que incluye el plan gratis.`,
  catIngreso: () => `Llegaste a las ${Lic.LIMITES.catIngreso} categorías de ingreso que incluye el plan gratis.`,
  cajas:      () => `Llegaste a las ${Lic.LIMITES.cajas} cajas de ahorro que incluye el plan gratis.`,
  fijos:      () => 'Programá el alquiler, el sueldo o la cuota del gimnasio una sola vez y que se carguen solos todos los meses.',
  presupuestos: () => 'Ponele un tope mensual a cada categoría y que la app te avise cuando te pasás.',
  metas:      () => 'Ponele una meta a cada caja de ahorro y mirá cuánto te falta y en cuántos meses llegás.',
  comparar:   () => 'Mirá en qué se te fue la plata este mes comparado con los anteriores, categoría por categoría.',
  filtros:    () => 'Buscá en todo tu historial, no sólo en el mes que estás viendo: por categoría, por monto o por período.',
  escaner:    () => 'Sacale una foto al ticket y el gasto se carga solo: lee el QR de la factura o, si no tiene, el texto. Todo en tu teléfono.',
  divisas:    () => 'Llevá tus dólares en una billetera aparte, con sus propios ingresos, egresos, fijos y cajas de ahorro, sin mezclarlos con los pesos.'
};

function abrirPremium(motivo) {
  const p = $('#proMotivo');
  /* Sin motivo puntual —se entró desde la cabecera o la tarjeta— conviene
     decir primero que lo que ya usa es gratis, y recién después qué suma. */
  p.textContent = MOTIVOS[motivo] ? MOTIVOS[motivo]()
    : 'Todo lo que la app ya hace sigue siendo gratis. Premium suma los movimientos fijos y saca los topes de categorías y cajas.';

  /* Un <a> y no un botón con JS: en el WebView del APK los enlaces
     http(s) se los pasa el sistema a WhatsApp, y además se pueden
     mantener apretados para copiar. */
  const comprar = $('#btnProComprar');
  const link = linkContacto();
  comprar.hidden = !link;
  if (link) comprar.href = link;
  $('#proContacto').hidden = !CONTACTO.visible;
  $('#proContactoNum').textContent = CONTACTO.visible;

  abrirHoja('sheetPro');
}

/* ---------------------------------------------------------
   Activar y quitar
   --------------------------------------------------------- */

function abrirLicencia() {
  $('#licTexto').value = '';
  $('#licError').hidden = true;
  abrirHoja('sheetLic');
  setTimeout(() => $('#licTexto').focus(), 60);
}

async function activarLicencia() {
  const err = $('#licError');
  err.hidden = true;
  const texto = $('#licTexto').value;

  /* El código de administrador se escribe en el mismo lugar. */
  if (Admin.pareceCodigo(texto)) {
    if (await Admin.esCodigo(texto)) {
      Admin.activar(texto);
      aplicarPlan();
      cerrarHoja('sheetLic');
      cerrarHoja('sheetPro');
      pintarAdmin();
      Sonido.tocar('premium');
      avisar('Modo administrador activado, con Premium. El panel está en Ajustes.');
    } else {
      err.textContent = 'Ese código no es válido.';
      err.hidden = false;
    }
    return;
  }

  let datos;
  try {
    datos = await Lic.verificar(texto);
  } catch (e) {
    err.textContent = e.message;
    err.hidden = false;
    return;
  }

  /* Esta app sólo acepta licencias personales. Las de negocio son de otro
     producto; aceptarlas acá sería prometer algo que la app no tiene. */
  if (datos.ed !== 'per') {
    err.textContent = 'Ese código es del sistema para negocios, no de esta app.';
    err.hidden = false;
    return;
  }

  const est = Lic.estado(datos, hoyISO());
  if (est.modo === 'vencida') {
    err.textContent = 'Ese código ya no es válido. Escribinos y te pasamos uno nuevo.';
    err.hidden = false;
    return;
  }

  if (!Lic.guardarLicencia(texto, datos)) {
    err.textContent = 'No pude guardar el código en este dispositivo.';
    err.hidden = false;
    return;
  }

  licencia = datos;
  plan = est;
  aplicarPlan();
  cerrarHoja('sheetLic');
  cerrarHoja('sheetPro');
  Sonido.tocar('premium');
  avisar(datos.nombre ? `Premium activado: ${datos.nombre}` : 'Premium activado');
}

async function quitarLicencia() {
  const si = await confirmar('¿Quitar Premium de este dispositivo?',
    'La app vuelve al plan gratis. Tus datos no se tocan: las categorías y cajas que tengas de más se quedan, sólo no vas a poder crear nuevas. Podés volver a activar el mismo código cuando quieras.',
    'Sí, quitar', true);
  if (!si) return;
  Lic.borrarLicencia();
  licencia = null;
  plan = Lic.estado(null, hoyISO());
  aplicarPlan();
  avisar('Premium quitado de este dispositivo');
}

function conectarLicencia() {
  $('#btnActivarLic').addEventListener('click', () => esPremium() ? abrirLicencia() : abrirPremium(null));
  $('#btnQuitarLic').addEventListener('click', quitarLicencia);
  $('#btnLicActivar').addEventListener('click', activarLicencia);
  $('#sheetLicClose').addEventListener('click', () => cerrarHoja('sheetLic'));
  $('#sheetLicBack').addEventListener('click', () => cerrarHoja('sheetLic'));

  $('#sheetProClose').addEventListener('click', () => cerrarHoja('sheetPro'));
  $('#sheetProBack').addEventListener('click', () => cerrarHoja('sheetPro'));
  $('#btnProTengo').addEventListener('click', () => { cerrarHoja('sheetPro'); abrirLicencia(); });
  $('#presuPro').addEventListener('click', () => { cerrarHoja('sheetCat'); editandoCat = null; abrirPremium('presupuestos'); });
  $('#metasPro').addEventListener('click', () => { cerrarHoja('sheetCaja'); editandoCaja = null; abrirPremium('metas'); });
  $('#btnProHeader').addEventListener('click', () => abrirPremium(null));
  $('#btnProCard').addEventListener('click', () => abrirPremium(null));
}

/* ---------------------------------------------------------
   Arranque
   --------------------------------------------------------- */
db = cargar();
if (!localStorage.getItem(CLAVE)) guardar();   // deja fijas las categorías por defecto
aplicarTema(db.ajustes.tema || 'auto');
conectar();
conectarLicencia();
conectarFijos();
conectarComparar();
conectarFiltros();
conectarVersion();
conectarAvisos();
conectarResumenMes();
conectarAdmin();
conectarSonidosAjustes();
irA('resumen');
/* La verificación es asíncrona (Web Crypto). La app arranca en modo libre y
   se corrige en cuanto termina, unos milisegundos después. */
iniciarLicencia();
/* El modo administrador también se verifica de nuevo en cada arranque. */
Admin.iniciar().then(() => { aplicarPlan(); pintarAdmin(); });
/* Una vez por día, en segundo plano y sin molestar si falla. Sólo en el
   APK: la versión web se actualiza sola (service worker), y mostrarle a
   alguien con iPhone un botón para bajar un APK no tiene sentido. */
if (esNativo) buscarActualizacion();
/* Los recordatorios: en el APK se piden al primer arranque. */
iniciarAvisos();
/* El resumen del mes anterior, en los primeros días del mes. */
iniciarResumenMensual();
// el ancho real recién está disponible después del primer pintado
requestAnimationFrame(() => { if (vista === 'resumen') renderMesChart(); });

if ('serviceWorker' in navigator && !esNativo) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW:', e));
  });
}

/* ---------- versión web: instalarla ----------
   Hasta que salga en las tiendas, en iPhone y en la computadora se usa la
   versión web. Importa que quede instalada: Safari borra los datos de los
   sitios que no se abren en una semana, pero no los de las apps que están
   en la pantalla de inicio. */
if (!esNativo) {
  /* Pide que el navegador no borre los datos cuando le falte espacio. */
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  let pedidoInstalar = null;   // el botón "Instalar" de Chrome/Edge
  const instalada = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches)
                          || navigator.standalone === true;
  const COMPARTIR_IOS = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:1.1em;height:1.1em;vertical-align:-0.2em;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M12 3.5v11M8 7.5l4-4 4 4M6.5 11H5.5v9h13v-9h-1"/></svg>';

  const pintarInstalar = () => {
    const fila = $('#filaInstalar'), caja = $('#instalarAyuda');
    if (instalada()) { fila.hidden = true; return; }
    if (esIOS) {
      caja.innerHTML = `<p class="field-help">En Safari tocá ${COMPARTIR_IOS} <b>Compartir</b> y después <b>Agregar a pantalla de inicio</b>. Queda con su ícono, abre sin internet y Safari no borra tus datos.</p>`;
    } else if (pedidoInstalar) {
      caja.innerHTML = '<p class="field-help">Queda con su ícono y abre sin internet.</p><button class="btn btn-ghost btn-block" id="btnInstalar">Instalar en este dispositivo</button>';
      $('#btnInstalar').addEventListener('click', async () => {
        const p = pedidoInstalar;
        if (!p) return;
        pedidoInstalar = null;
        p.prompt();
        try { await p.userChoice; } catch (e) {}
        pintarInstalar();
      });
    } else {
      caja.innerHTML = '<p class="field-help">Desde el menú del navegador elegí <b>Instalar app</b> o <b>Agregar a pantalla de inicio</b>.</p>';
    }
    fila.hidden = false;
  };
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; pintarInstalar(); });
  window.addEventListener('appinstalled', () => { pedidoInstalar = null; pintarInstalar(); });
  pintarInstalar();
}

// para probar el parser desde la consola
window.__parsearVoz = parsearVoz;
