/* =========================================================
   Mis Gastos — cotizaciones.js

   Cotizaciones en pesos: los tipos de dólar de Argentina (oficial, blue,
   MEP, contado con liquidación, mayorista, cripto y tarjeta) y el euro,
   el real, el peso chileno y el peso uruguayo al oficial.

   Vienen de DolarApi.com, que es gratis, no pide clave y deja que la app
   la consulte directo. Si no contesta, se prueba con Bluelytics, que trae
   sólo el dólar oficial, el blue y el euro oficial. Ninguna de las dos
   recibe datos tuyos: la app sólo pide los precios.

   Las criptomonedas (Bitcoin, Ethereum y las más conocidas) van en
   dólares, con la variación de las últimas 24 horas, y vienen de
   CoinGecko, con las mismas condiciones. Se piden aparte: si una de las
   dos consultas falla, la otra se muestra igual.

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
    { id: 'UYU',             grupo: 'moneda', nombre: 'Peso uruguayo',           corto: 'Peso uruguayo',   que: 'Uruguay' },
    // las cripto: `id` es el de CoinGecko; el precio es en dólares
    { id: 'bitcoin',         grupo: 'cripto', nombre: 'Bitcoin',                 corto: 'Bitcoin',         que: 'BTC' },
    { id: 'ethereum',        grupo: 'cripto', nombre: 'Ethereum',                corto: 'Ethereum',        que: 'ETH' },
    { id: 'binancecoin',     grupo: 'cripto', nombre: 'BNB',                     corto: 'BNB',             que: 'BNB' },
    { id: 'solana',          grupo: 'cripto', nombre: 'Solana',                  corto: 'Solana',          que: 'SOL' },
    { id: 'ripple',          grupo: 'cripto', nombre: 'XRP',                     corto: 'XRP',             que: 'XRP' },
    { id: 'cardano',         grupo: 'cripto', nombre: 'Cardano',                 corto: 'Cardano',         que: 'ADA' },
    { id: 'dogecoin',        grupo: 'cripto', nombre: 'Dogecoin',                corto: 'Dogecoin',        que: 'DOGE' },
    { id: 'tron',            grupo: 'cripto', nombre: 'TRON',                    corto: 'TRON',            que: 'TRX' },
    { id: 'litecoin',        grupo: 'cripto', nombre: 'Litecoin',                corto: 'Litecoin',        que: 'LTC' }
  ];
  const esCripto = id => CATALOGO.some(c => c.id === id && c.grupo === 'cripto');
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

  /** Los pesos, de la primera fuente que conteste. null si ninguna. */
  async function traerPesos(previa) {
    for (const f of FUENTES) {
      try {
        const items = (await f.traer(previa)).filter(x => x.compra || x.venta);
        if (items.some(x => x.id === 'oficial')) return { items, fuente: f.nombre };
      } catch (e) {
        console.warn(`Cotizaciones: ${f.nombre} no contestó`, e && e.message);
      }
    }
    return null;
  }

  /** Las cripto en dólares: [{ id, precio, cambio }]. null si no contesta. */
  async function traerCripto() {
    const ids = CATALOGO.filter(c => c.grupo === 'cripto').map(c => c.id);
    try {
      const d = await pedir(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`);
      const items = ids
        .filter(id => d && d[id] && num(d[id].usd))
        .map(id => ({ id, precio: Number(d[id].usd), cambio: Number.isFinite(d[id].usd_24h_change) ? d[id].usd_24h_change : null }));
      return items.length ? items : null;
    } catch (e) {
      console.warn('Cotizaciones: CoinGecko no contestó', e && e.message);
      return null;
    }
  }

  let enCurso = null;

  /**
   * Trae las cotizaciones. Sin `forzar`, si las guardadas tienen menos de
   * 15 minutos (y ya incluyen las cripto) no pregunta. Nunca lanza: lo que
   * no contesta queda con lo último guardado. `error` dice si fallaron los
   * pesos y `errorCripto` si fallaron las cripto.
   */
  function actualizar({ forzar = false } = {}) {
    const previa = leer();
    const fresca = previa && previa.traidoCripto
      && Date.now() - new Date(previa.traido).getTime() < VIGENCIA
      && Date.now() - new Date(previa.traidoCripto).getTime() < VIGENCIA;
    if (!forzar && fresca) return Promise.resolve({ datos: previa, error: false, errorCripto: false });
    if (enCurso) return enCurso;
    enCurso = (async () => {
      const [pesos, cripto] = await Promise.all([traerPesos(previa), traerCripto()]);
      if (!pesos && !cripto) return { datos: previa, error: true, errorCripto: true };

      const ahora = new Date().toISOString();
      const viejas = previa ? previa.items : [];
      const datos = {
        items: [
          ...(pesos ? pesos.items : viejas.filter(x => !esCripto(x.id))),
          ...(cripto || viejas.filter(x => esCripto(x.id)))
        ],
        fuente: pesos ? pesos.fuente : (previa && previa.fuente) || null,
        traido: pesos ? ahora : (previa && previa.traido) || null,
        traidoCripto: cripto ? ahora : (previa && previa.traidoCripto) || null
      };
      guardar(datos);
      raiz.dispatchEvent(new CustomEvent('cotizaciones', { detail: datos }));
      return { datos, error: !pesos, errorCripto: !cripto };
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
