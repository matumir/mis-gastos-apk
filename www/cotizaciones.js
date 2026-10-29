/* =========================================================
   Mis Gastos — cotizaciones.js

   Cotizaciones en pesos: los tipos de dólar de Argentina (oficial, blue,
   MEP, contado con liquidación, mayorista, cripto y tarjeta) y el euro,
   el real, el peso chileno y el peso uruguayo al oficial.

   Vienen de DolarApi.com, que es gratis, no pide clave y deja que la app
   la consulte directo. Si no contesta, se prueba con Bluelytics, que trae
   sólo el dólar oficial, el blue y el euro oficial. Ninguna de las dos
   recibe datos tuyos: la app sólo pide los precios.

   La última respuesta se guarda en el dispositivo, aparte de los datos
   (no viaja en las copias de seguridad), así la app sigue mostrando la
   última cotización conocida —con su fecha— cuando no hay internet.
   ========================================================= */
(function (raiz) {
  'use strict';

  const CLAVE = 'misgastos.cotizaciones';
  const VIGENCIA = 15 * 60000;     // antes de esto no se vuelve a preguntar
  const ESPERA = 8000;             // ms antes de dar por caída una fuente

  /* Todo lo que se puede mostrar, en el orden de la lista. `id` es la
     `casa` de DolarApi para los dólares y el código ISO para las demás
     monedas. `corto` es el nombre cuando se ve suelto, en el Resumen. */
  const CATALOGO = [
    { id: 'oficial',         grupo: 'dolar',  nombre: 'Oficial',                 corto: 'Dólar oficial',   que: 'En bancos y casas de cambio' },
    { id: 'blue',            grupo: 'dolar',  nombre: 'Blue',                    corto: 'Dólar blue',      que: 'El informal, en la calle' },
    { id: 'bolsa',           grupo: 'dolar',  nombre: 'MEP',                     corto: 'Dólar MEP',       que: 'Comprando bonos, legal y en el día' },
    { id: 'contadoconliqui', grupo: 'dolar',  nombre: 'Contado con liquidación', corto: 'Dólar CCL',       que: 'Como el MEP, pero cobrás afuera' },
    { id: 'mayorista',       grupo: 'dolar',  nombre: 'Mayorista',               corto: 'Dólar mayorista', que: 'Entre bancos y empresas' },
    { id: 'cripto',          grupo: 'dolar',  nombre: 'Cripto',                  corto: 'Dólar cripto',    que: 'Con USDT o USDC' },
    { id: 'tarjeta',         grupo: 'dolar',  nombre: 'Tarjeta',                 corto: 'Dólar tarjeta',   que: 'Consumos en dólares con tarjeta' },
    { id: 'EUR',             grupo: 'moneda', nombre: 'Euro',                    corto: 'Euro',            que: 'Unión Europea' },
    { id: 'BRL',             grupo: 'moneda', nombre: 'Real',                    corto: 'Real',            que: 'Brasil' },
    { id: 'CLP',             grupo: 'moneda', nombre: 'Peso chileno',            corto: 'Peso chileno',    que: 'Chile' },
    { id: 'UYU',             grupo: 'moneda', nombre: 'Peso uruguayo',           corto: 'Peso uruguayo',   que: 'Uruguay' }
  ];
  const EN_CATALOGO = new Set(CATALOGO.map(c => c.id));
  const esMoneda = id => CATALOGO.some(c => c.id === id && c.grupo === 'moneda');

  const num = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  const item = (id, compra, venta, fecha) => ({ id, compra: num(compra), venta: num(venta), fecha: fecha || null });

  function leer() {
    try {
      const d = JSON.parse(localStorage.getItem(CLAVE));
      return d && Array.isArray(d.items) && d.items.length ? d : null;
    } catch (e) { return null; }
  }

  function guardar(d) {
    try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch (e) { /* sin espacio: queda en memoria */ }
  }

  async function pedir(url) {
    const corte = new AbortController();
    const t = setTimeout(() => corte.abort(), ESPERA);
    try {
      const r = await fetch(url, { cache: 'no-store', signal: corte.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  /* Cada fuente devuelve una lista de `item`. */
  const FUENTES = [
    {
      nombre: 'DolarApi.com',
      async traer(previa) {
        const [dolares, otras] = await Promise.allSettled([
          pedir('https://dolarapi.com/v1/dolares'),
          pedir('https://dolarapi.com/v1/cotizaciones')
        ]);
        if (dolares.status !== 'fulfilled') throw dolares.reason;
        const lista = dolares.value
          .filter(x => x && EN_CATALOGO.has(x.casa))
          .map(x => item(x.casa, x.compra, x.venta, x.fechaActualizacion));
        if (otras.status === 'fulfilled') {
          for (const x of otras.value) {
            if (x && x.moneda !== 'USD' && EN_CATALOGO.has(x.moneda)) lista.push(item(x.moneda, x.compra, x.venta, x.fechaActualizacion));
          }
        } else if (previa) {
          // si sólo falló la de las otras monedas, quedan las últimas conocidas
          lista.push(...previa.items.filter(x => esMoneda(x.id)));
        }
        return lista;
      }
    },
    {
      nombre: 'Bluelytics',
      async traer() {
        const d = await pedir('https://api.bluelytics.com.ar/v2/latest');
        const f = d && d.last_update;
        return [['oficial', 'oficial'], ['blue', 'blue'], ['EUR', 'oficial_euro']]
          .filter(([, k]) => d && d[k])
          .map(([id, k]) => item(id, d[k].value_buy, d[k].value_sell, f));
      }
    }
  ];

  let enCurso = null;

  /**
   * Trae las cotizaciones. Sin `forzar`, si las guardadas tienen menos de
   * 15 minutos no pregunta. Nunca lanza: si ninguna fuente contesta,
   * devuelve las últimas guardadas (o null) y `error` en true.
   */
  function actualizar({ forzar = false } = {}) {
    const previa = leer();
    if (!forzar && previa && Date.now() - new Date(previa.traido).getTime() < VIGENCIA) {
      return Promise.resolve({ datos: previa, error: false });
    }
    if (enCurso) return enCurso;
    enCurso = (async () => {
      for (const f of FUENTES) {
        try {
          const items = (await f.traer(previa)).filter(x => x.compra || x.venta);
          if (!items.some(x => x.id === 'oficial')) continue;
          const datos = { items, fuente: f.nombre, traido: new Date().toISOString() };
          guardar(datos);
          raiz.dispatchEvent(new CustomEvent('cotizaciones', { detail: datos }));
          return { datos, error: false };
        } catch (e) {
          console.warn(`Cotizaciones: ${f.nombre} no contestó`, e && e.message);
        }
      }
      return { datos: previa, error: true };
    })().finally(() => { enCurso = null; });
    return enCurso;
  }

  /** Precio guardado de un `id` del catálogo y lado ('compra' | 'venta'). */
  function valor(id, lado = 'venta') {
    const d = leer();
    const x = d && d.items.find(c => c.id === id);
    return x ? x[lado] : null;
  }

  raiz.Cotiz = { CATALOGO, leer, actualizar, valor };
})(window);
