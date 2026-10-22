/* =========================================================
   Mis Gastos — resumen del mes, en diapositivas

   Al entrar en los primeros días de un mes nuevo aparece, una sola vez,
   el resumen del mes que terminó: cuánto entró y salió, en qué se fue,
   cómo viene contra los meses anteriores, el ahorro y algunos datos
   sueltos. Se pasa deslizando, como un carrusel.

   Este archivo se carga ANTES de app.js y usa sus funciones (db,
   totales, movsDelMes, plata…) recién cuando se lo llama, que es
   siempre después de que app.js terminó de arrancar.
   ========================================================= */
'use strict';

/* Cuántos días del mes nuevo se sigue ofreciendo el resumen del anterior.
   La idea es el día 1, pero no todo el mundo abre la app justo ese día:
   si entra el 3, igual le corresponde verlo. */
const DIAS_VENTANA_RESUMEN = 7;

/* ---------------------------------------------------------
   Números
   --------------------------------------------------------- */
function diasDelMes(ym) {
  const [a, m] = ym.split('-').map(Number);
  return new Date(a, m, 0).getDate();
}

/** Variación porcentual; null si no hay base para comparar. */
function variacion(act, ant) {
  if (!ant) return null;
  return Math.round(((act - ant) / ant) * 100);
}

function calcularResumenMes(ym) {
  const movs = movsDelMes(ym);
  const t = totales(ym);
  const prevYm = mesSumar(ym, -1);
  const tPrev = totales(prevYm);
  const prevConDatos = movsDelMes(prevYm).length > 0;

  /* --- categorías --- */
  const porCat = egresosPorCat(ym);
  const cats = [...porCat.entries()]
    .map(([id, monto]) => {
      const c = catPorId(id);
      return { id, nombre: c ? c.nombre : 'Sin categoría', emoji: c ? c.emoji : '🏷️', monto,
               pct: t.egresos ? Math.round((monto / t.egresos) * 100) : 0 };
    })
    .sort((a, b) => b.monto - a.monto);

  /* --- contra el mes anterior, categoría por categoría --- */
  const cambios = [];
  if (prevConDatos) {
    const ant = egresosPorCat(prevYm);
    const ids = new Set([...porCat.keys(), ...ant.keys()]);
    for (const id of ids) {
      const c = catPorId(id);
      const a = porCat.get(id) || 0, b = ant.get(id) || 0;
      if (Math.abs(a - b) < 1) continue;
      cambios.push({ nombre: c ? c.nombre : 'Sin categoría', emoji: c ? c.emoji : '🏷️',
                     act: a, ant: b, dif: a - b, pct: variacion(a, b) });
    }
    cambios.sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif));
  }

  /* --- promedio de egresos de los 3 meses anteriores con datos --- */
  const previos = [1, 2, 3].map(i => mesSumar(ym, -i)).filter(m => movsDelMes(m).length);
  const prom3 = previos.length
    ? previos.reduce((s, m) => s + totales(m).egresos, 0) / previos.length : null;

  /* --- ahorro --- */
  let aportes = 0, retiros = 0;
  const porCaja = new Map();
  for (const m of movs) {
    if (m.tipo !== 'ahorro') continue;
    const v = m.monto * signoAhorro(m);
    if (v > 0) aportes += v; else retiros -= v;
    porCaja.set(m.cajaId, (porCaja.get(m.cajaId) || 0) + v);
  }
  const cajas = [...porCaja.entries()].map(([id, neto]) => {
    const c = cajaPorId(id);
    return { nombre: c ? c.nombre : 'Caja', emoji: c ? c.emoji : '🐷', neto };
  }).sort((a, b) => b.neto - a.neto);

  /* --- datos sueltos --- */
  const egresos = movs.filter(m => m.tipo === 'egreso');
  const porDia = new Map();
  egresos.forEach(m => porDia.set(m.fecha, (porDia.get(m.fecha) || 0) + m.monto));
  let diaMax = null;
  for (const [fecha, monto] of porDia) if (!diaMax || monto > diaMax.monto) diaMax = { fecha, monto };

  const mayor = egresos.reduce((a, m) => (!a || m.monto > a.monto ? m : a), null);
  const cuentaCat = new Map();
  egresos.forEach(m => cuentaCat.set(m.categoriaId, (cuentaCat.get(m.categoriaId) || 0) + 1));
  let frecuente = null;
  for (const [id, n] of cuentaCat) if (!frecuente || n > frecuente.n) frecuente = { id, n };

  const pasados = db.categorias
    .filter(c => c.tipo === 'egreso' && c.presupuesto > 0 && (porCat.get(c.id) || 0) > c.presupuesto)
    .map(c => ({ nombre: c.nombre, emoji: c.emoji, exceso: (porCat.get(c.id) || 0) - c.presupuesto }));
  const conPresupuesto = db.categorias.filter(c => c.tipo === 'egreso' && c.presupuesto > 0).length;

  return {
    ym, prevYm, prevConDatos,
    cantidad: movs.length,
    diasConCarga: new Set(movs.map(m => m.fecha)).size,
    ingresos: t.ingresos, egresos: t.egresos, ahorroNeto: t.ahorro, balance: t.balance,
    tasaAhorro: t.ingresos > 0 ? Math.round(((t.ingresos - t.egresos) / t.ingresos) * 100) : null,
    prev: { ingresos: tPrev.ingresos, egresos: tPrev.egresos },
    varIngresos: prevConDatos ? variacion(t.ingresos, tPrev.ingresos) : null,
    varEgresos: prevConDatos ? variacion(t.egresos, tPrev.egresos) : null,
    cats, cambios,
    prom3, varProm3: prom3 ? variacion(t.egresos, prom3) : null, mesesProm: previos.length,
    ahorro: { aportes, retiros, neto: aportes - retiros, totalAlCierre: saldoAlCierre(ym), cajas },
    datos: {
      diaMax,
      promedioDiario: t.egresos / diasDelMes(ym),
      mayor: mayor ? { monto: mayor.monto, descripcion: mayor.descripcion,
                       cat: catPorId(mayor.categoriaId) } : null,
      frecuente: frecuente ? { cat: catPorId(frecuente.id), n: frecuente.n } : null,
      porVoz: movs.filter(m => m.porVoz).length,
      presupuestos: { pasados, total: conPresupuesto }
    }
  };
}

/** Un consejo de cierre, el más útil que se pueda decir con estos números. */
function consejoDelMes(r) {
  const mesQueViene = mesLegible(mesSumar(r.ym, 1));
  if (r.ingresos > 0 && r.egresos > r.ingresos)
    return `Gastaste más de lo que entró. En ${mesQueViene}, mirá primero ${r.cats[0] ? r.cats[0].nombre.toLowerCase() : 'tus categorías más grandes'}: es donde más se te fue.`;
  const subio = r.cambios.find(c => c.dif > 0 && c.pct != null && c.pct >= 25 && c.act >= r.egresos * 0.1);
  if (subio) return `${subio.nombre} subió ${subio.pct}% contra el mes anterior. Vale la pena ponerle un ojo en ${mesQueViene}.`;
  if (r.datos.presupuestos.pasados.length)
    return `Te pasaste del presupuesto en ${r.datos.presupuestos.pasados.map(p => p.nombre).join(', ')}. ¿Lo ajustás o lo cuidás más este mes?`;
  if (r.tasaAhorro != null && r.tasaAhorro >= 20)
    return `Te quedó el ${r.tasaAhorro}% de lo que entró. Muy buen mes: si podés, mandá una parte al ahorro.`;
  if (r.diasConCarga < 10)
    return `Cargaste movimientos en ${r.diasConCarga} días. Cuanto más completo, más te dice el resumen: probá cargar un poquito cada día.`;
  return `Seguí así en ${mesQueViene}: lo que se anota, se controla.`;
}

/* ---------------------------------------------------------
   Armado de las diapositivas
   --------------------------------------------------------- */
function etiquetaVar(pct, subirEsBueno) {
  if (pct == null) return '';
  if (pct === 0) return '<span class="rm-var">igual que el mes anterior</span>';
  const sube = pct > 0;
  const bueno = sube === subirEsBueno;
  return `<span class="rm-var ${bueno ? 'es-bien' : 'es-mal'}">${sube ? '▲' : '▼'} ${Math.abs(pct)}% vs. ${esc(mesLegible(mesSumar(rmEstado.r.ym, -1)))}</span>`;
}

function diapositivas(r) {
  const nombreMes = mesLegible(r.ym);
  const Nombre = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
  const S = [];

  /* 1. Portada */
  S.push(`
    <div class="rm-slide rm-portada">
      <p class="rm-kicker">Tu mes en números</p>
      <h3 class="rm-gigante">${esc(Nombre)}</h3>
      <p class="rm-balance ${r.balance >= 0 ? 'es-bien' : 'es-mal'}">${r.balance >= 0 ? 'Te sobraron' : 'Te faltaron'} <strong>${plata(Math.abs(r.balance))}</strong></p>
      <div class="rm-chips">
        <span>${r.cantidad} movimiento${r.cantidad === 1 ? '' : 's'}</span>
        <span>${r.diasConCarga} día${r.diasConCarga === 1 ? '' : 's'} con cargas</span>
      </div>
      <p class="rm-pista-txt">Deslizá para ver el resto →</p>
    </div>`);

  /* 2. Entró y salió */
  const maxIE = Math.max(r.ingresos, r.egresos, 1);
  S.push(`
    <div class="rm-slide">
      <p class="rm-kicker">💸 Entró y salió</p>
      <div class="rm-fila-grande">
        <span>Ingresos</span><strong class="es-bien">${plata(r.ingresos)}</strong>
        ${etiquetaVar(r.varIngresos, true)}
        <div class="rm-barra"><i class="es-in" style="width:${(r.ingresos / maxIE) * 100}%"></i></div>
      </div>
      <div class="rm-fila-grande">
        <span>Egresos</span><strong class="es-mal">${plata(r.egresos)}</strong>
        ${etiquetaVar(r.varEgresos, false)}
        <div class="rm-barra"><i class="es-out" style="width:${(r.egresos / maxIE) * 100}%"></i></div>
      </div>
      ${r.tasaAhorro != null
        ? `<p class="rm-destacado">${r.tasaAhorro >= 0
            ? `Te quedó el <strong>${r.tasaAhorro}%</strong> de lo que entró.`
            : `Gastaste <strong>${Math.abs(r.tasaAhorro)}%</strong> más de lo que entró.`}</p>`
        : '<p class="rm-destacado">No cargaste ingresos este mes.</p>'}
    </div>`);

  /* 3. En qué se fue */
  const top = r.cats.slice(0, 5);
  const resto = r.cats.slice(5).reduce((s, c) => s + c.monto, 0);
  const max = top.length ? top[0].monto : 1;
  S.push(`
    <div class="rm-slide">
      <p class="rm-kicker">🧾 ¿En qué se fue?</p>
      ${top.length ? `
        ${top[0] ? `<p class="rm-destacado">Lo que más pesó: <strong>${esc(top[0].emoji)} ${esc(top[0].nombre)}</strong>, el ${top[0].pct}% de lo que gastaste.</p>` : ''}
        <div class="rm-cats">
          ${top.map(c => `
            <div class="rm-cat">
              <div class="rm-cat-linea"><span>${esc(c.emoji)} ${esc(c.nombre)}</span><strong>${plata(c.monto)}</strong></div>
              <div class="rm-barra"><i style="width:${(c.monto / max) * 100}%"></i></div>
              <span class="rm-cat-pct">${c.pct}% del total</span>
            </div>`).join('')}
          ${resto > 0 ? `<p class="rm-nota">Y ${plata(resto)} en otras categorías.</p>` : ''}
        </div>` : '<p class="rm-destacado">No cargaste gastos este mes.</p>'}
    </div>`);

  /* 4. Contra otros meses */
  if (r.prevConDatos || r.prom3) {
    const subas = r.cambios.filter(c => c.dif > 0).slice(0, 3);
    const bajas = r.cambios.filter(c => c.dif < 0).slice(0, 3);
    const linea = c => `
      <li><span>${esc(c.emoji)} ${esc(c.nombre)}</span>
        <strong class="${c.dif > 0 ? 'es-mal' : 'es-bien'}">${c.dif > 0 ? '+' : '−'}${plata(Math.abs(c.dif))}${c.pct != null ? ` <small>(${c.pct > 0 ? '+' : ''}${c.pct}%)</small>` : ' <small>(nuevo)</small>'}</strong></li>`;
    S.push(`
      <div class="rm-slide">
        <p class="rm-kicker">📊 Contra otros meses</p>
        ${r.prom3 != null ? `<p class="rm-destacado">Gastaste ${plata(r.egresos)}; tu promedio ${r.mesesProm === 1 ? 'del mes anterior' : `de los ${r.mesesProm} meses anteriores`} es ${plata(r.prom3)}${r.varProm3 != null && r.varProm3 !== 0 ? ` (<span class="${r.varProm3 > 0 ? 'es-mal' : 'es-bien'}">${r.varProm3 > 0 ? '+' : ''}${r.varProm3}%</span>)` : ''}.</p>` : ''}
        ${subas.length ? `<p class="rm-sub">Subieron</p><ul class="rm-lista">${subas.map(linea).join('')}</ul>` : ''}
        ${bajas.length ? `<p class="rm-sub">Bajaron</p><ul class="rm-lista">${bajas.map(linea).join('')}</ul>` : ''}
        ${!subas.length && !bajas.length ? '<p class="rm-nota">Gastaste casi lo mismo en cada categoría que el mes anterior.</p>' : ''}
      </div>`);
  }

  /* 5. Ahorro */
  const a = r.ahorro;
  S.push(`
    <div class="rm-slide">
      <p class="rm-kicker">🐷 Ahorro</p>
      ${a.aportes || a.retiros ? `
        <p class="rm-gigante-num ${a.neto >= 0 ? 'es-bien' : 'es-mal'}">${a.neto >= 0 ? '+' : '−'}${plata(Math.abs(a.neto))}</p>
        <p class="rm-destacado">${a.neto >= 0 ? 'Guardaste' : 'Sacaste'} eso en neto${a.retiros ? ` (guardaste ${plata(a.aportes)} y sacaste ${plata(a.retiros)})` : ''}.</p>
        ${a.cajas.length ? `<ul class="rm-lista">${a.cajas.map(c => `<li><span>${esc(c.emoji)} ${esc(c.nombre)}</span><strong class="${c.neto >= 0 ? 'es-bien' : 'es-mal'}">${c.neto >= 0 ? '+' : '−'}${plata(Math.abs(c.neto))}</strong></li>`).join('')}</ul>` : ''}
      ` : '<p class="rm-destacado">Este mes no moviste plata del ahorro.</p>'}
      <p class="rm-nota">En total, al cierre del mes tenías <strong>${plata(a.totalAlCierre)}</strong> ahorrados.</p>
    </div>`);

  /* 6. Datos sueltos */
  const d = r.datos;
  const items = [];
  if (d.diaMax) items.push(['📅', 'El día que más gastaste', `${fechaLegible(d.diaMax.fecha)}: ${plata(d.diaMax.monto)}`]);
  if (r.egresos > 0) items.push(['📆', 'Gasto promedio por día', plata(Math.round(d.promedioDiario))]);
  if (d.mayor) items.push(['💥', 'El gasto más grande', `${plata(d.mayor.monto)}${d.mayor.descripcion ? ` · ${d.mayor.descripcion}` : d.mayor.cat ? ` · ${d.mayor.cat.nombre}` : ''}`]);
  if (d.frecuente && d.frecuente.cat) items.push(['🔁', 'La categoría más usada', `${d.frecuente.cat.emoji} ${d.frecuente.cat.nombre} (${d.frecuente.n} veces)`]);
  if (d.porVoz) items.push(['🎙️', 'Cargados por voz', `${d.porVoz} de ${r.cantidad}`]);
  if (d.presupuestos.total) items.push(['🎯', 'Presupuestos',
    d.presupuestos.pasados.length
      ? `Te pasaste en ${d.presupuestos.pasados.length} de ${d.presupuestos.total}: ${d.presupuestos.pasados.map(p => p.nombre).join(', ')}`
      : `Cumpliste los ${d.presupuestos.total}`]);
  if (items.length) {
    S.push(`
      <div class="rm-slide">
        <p class="rm-kicker">🔎 Datos del mes</p>
        <ul class="rm-datos">
          ${items.map(([e, t, v]) => `<li><span class="rm-datos-e">${e}</span><span><small>${esc(t)}</small><strong>${esc(v)}</strong></span></li>`).join('')}
        </ul>
      </div>`);
  }

  /* 7. Cierre */
  const sig = mesLegible(mesSumar(r.ym, 1));
  S.push(`
    <div class="rm-slide rm-cierre">
      <p class="rm-kicker">✨ Para ${esc(sig)}</p>
      <p class="rm-consejo">${esc(consejoDelMes(r))}</p>
      <button class="btn btn-primary btn-block" data-rm-cerrar>Empezar ${esc(sig)}</button>
    </div>`);

  return S;
}

/* ---------------------------------------------------------
   Carrusel
   --------------------------------------------------------- */
const rmEstado = { r: null, i: 0, n: 0 };

function abrirResumenMes(ym) {
  if (!ym || !movsDelMes(ym).length) { avisar('Ese mes no tiene movimientos para resumir.'); return false; }
  const r = calcularResumenMes(ym);
  rmEstado.r = r;
  const slides = diapositivas(r);
  rmEstado.n = slides.length;
  rmEstado.i = 0;

  const nombre = mesLegible(ym);
  $('#rmTitulo').textContent = `Resumen de ${nombre}`;
  const pista = $('#rmPista');
  pista.innerHTML = slides.join('');
  pista.scrollLeft = 0;
  $('#rmPuntos').innerHTML = slides.map((_, k) =>
    `<button class="rm-punto${k === 0 ? ' is-on' : ''}" data-rm-ir="${k}" aria-label="Diapositiva ${k + 1} de ${slides.length}"></button>`).join('');
  pintarRmControles();

  abrirHoja('sheetResumen');
  if (window.Sonido) Sonido.tocar('resumen');
  return true;
}

function pintarRmControles() {
  const { i, n } = rmEstado;
  $$('#rmPuntos .rm-punto').forEach((p, k) => p.classList.toggle('is-on', k === i));
  $('#rmAnterior').disabled = i === 0;
  $('#rmSiguiente').textContent = i >= n - 1 ? 'Listo' : 'Siguiente';
}

function irARm(k, suave = true) {
  const pista = $('#rmPista');
  const k2 = Math.max(0, Math.min(rmEstado.n - 1, k));
  pista.scrollTo({ left: k2 * pista.clientWidth, behavior: suave && !reducirMovimiento() ? 'smooth' : 'auto' });
  if (k2 !== rmEstado.i) {
    rmEstado.i = k2;
    pintarRmControles();
    if (window.Sonido) Sonido.tocar('slide');
  }
}

function cerrarResumenMes() { cerrarHoja('sheetResumen'); }

function conectarResumenMes() {
  const pista = $('#rmPista');
  let t = null;
  pista.addEventListener('scroll', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const k = Math.round(pista.scrollLeft / Math.max(1, pista.clientWidth));
      if (k !== rmEstado.i) {
        rmEstado.i = k;
        pintarRmControles();
        if (window.Sonido) Sonido.tocar('slide');
      }
    }, 80);
  }, { passive: true });

  $('#rmAnterior').addEventListener('click', () => irARm(rmEstado.i - 1));
  $('#rmSiguiente').addEventListener('click', () => {
    if (rmEstado.i >= rmEstado.n - 1) cerrarResumenMes(); else irARm(rmEstado.i + 1);
  });
  $('#rmPuntos').addEventListener('click', e => {
    const b = e.target.closest('[data-rm-ir]');
    if (b) irARm(Number(b.dataset.rmIr));
  });
  pista.addEventListener('click', e => { if (e.target.closest('[data-rm-cerrar]')) cerrarResumenMes(); });
  $('#sheetResumenClose').addEventListener('click', cerrarResumenMes);
  $('#sheetResumenBack').addEventListener('click', cerrarResumenMes);
  document.addEventListener('keydown', e => {
    if ($('#sheetResumen').hidden) return;
    if (e.key === 'ArrowRight') irARm(rmEstado.i + 1);
    else if (e.key === 'ArrowLeft') irARm(rmEstado.i - 1);
    else if (e.key === 'Escape') cerrarResumenMes();
  });
  window.addEventListener('resize', () => {
    if (!$('#sheetResumen').hidden) irARm(rmEstado.i, false);
  });

  $('#accesoResumenMes').addEventListener('click', () => abrirResumenMes(mesSumar(mesDeISO(hoyISO()), -1)));
}

/* ---------------------------------------------------------
   Cuándo aparece
   --------------------------------------------------------- */
/** El mes a resumir si corresponde ofrecerlo hoy (visto o no), o null. */
function mesResumible(hoy = new Date()) {
  if (hoy.getDate() > DIAS_VENTANA_RESUMEN) return null;
  const prev = mesSumar(mesDeISO(hoyISO(hoy)), -1);
  return movsDelMes(prev).length ? prev : null;
}

function pintarAccesoResumenMes() {
  const el = $('#accesoResumenMes');
  if (!el) return;
  const ym = mesResumible();
  el.hidden = !ym;
  if (ym) $('#accesoResumenMesNombre').textContent = `Tu resumen de ${mesLegible(ym)}`;
}

/** Al arrancar: si hay un resumen sin ver, se muestra cuando no haya otra
    cosa abierta (el pedido de permisos, una copia, etc.). */
function iniciarResumenMensual({ forzar = false } = {}) {
  pintarAccesoResumenMes();
  const ym = forzar ? mesSumar(mesDeISO(hoyISO()), -1) : mesResumible();
  if (!ym || (!forzar && db.ajustes.resumenVisto === ym)) return;
  let intentos = 0;
  const probar = () => {
    const ocupado = $('.sheet:not([hidden])') || !$('#dlg').hidden;
    if (ocupado && intentos++ < 40) { setTimeout(probar, 1500); return; }
    if (ocupado) return;
    if (abrirResumenMes(ym)) {
      db.ajustes.resumenVisto = ym;
      guardar();
    }
  };
  setTimeout(probar, 700);
}
