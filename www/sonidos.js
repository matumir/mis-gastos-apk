/* =========================================================
   Mis Gastos — sonidos

   Todos se sintetizan con Web Audio: no hay archivos de audio que
   bajar ni que pesen en el APK, y suenan igual en el teléfono y en el
   navegador.

   Criterio: cortos (casi todos debajo de 200 ms), bajitos y con
   envolvente suave, para que acompañen sin cansar. Un toque genérico
   para cualquier botón y sonidos propios para lo que importa: guardar
   un gasto, un ingreso o un ahorro, borrar, un error, la voz, el
   escáner, activar Premium.

   Se apagan desde Ajustes → Sonidos (se guarda en este dispositivo).
   ========================================================= */
(function (global) {
  'use strict';

  const CLAVE = 'misgastos.sonidos';
  let ctx = null;
  let ultimoEspecial = 0;
  let tapPendiente = null;

  function activo() {
    try { return localStorage.getItem(CLAVE) !== '0'; } catch (e) { return true; }
  }
  function setActivo(si) {
    try { localStorage.setItem(CLAVE, si ? '1' : '0'); } catch (e) { /* nada */ }
  }

  function contexto() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  /** Una nota con ataque y caída suaves. `f2` hace un barrido de f a f2. */
  function nota(c, { f, f2 = null, t = 0, dur = 0.12, vol = 0.1, forma = 'sine' }) {
    const o = c.createOscillator(), g = c.createGain();
    const ini = c.currentTime + t;
    o.type = forma;
    o.frequency.setValueAtTime(f, ini);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, ini + dur);
    g.gain.setValueAtTime(0.0001, ini);
    g.gain.exponentialRampToValueAtTime(vol, ini + Math.min(0.012, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, ini + dur);
    o.connect(g); g.connect(c.destination);
    o.start(ini); o.stop(ini + dur + 0.02);
  }

  /** Ruido filtrado: para el «obturador» del escáner. */
  function ruido(c, { t = 0, dur = 0.06, vol = 0.06, desde = 2500 }) {
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'highpass'; f.frequency.value = desde;
    g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(c.destination);
    s.start(c.currentTime + t);
  }

  const SONIDOS = {
    // cualquier botón: un clic apenas audible
    tap:      c => nota(c, { f: 1400, f2: 900, dur: 0.035, vol: 0.035, forma: 'triangle' }),
    // pasar de diapositiva en el resumen del mes
    slide:    c => nota(c, { f: 900, f2: 1300, dur: 0.06, vol: 0.04 }),
    // guardado genérico / algo salió bien
    exito:    c => { nota(c, { f: 880, dur: 0.09, vol: 0.09 }); nota(c, { f: 1320, t: 0.08, dur: 0.14, vol: 0.09 }); },
    // un gasto: dos notas que bajan, sin sonar a «error»
    egreso:   c => { nota(c, { f: 784, dur: 0.08, vol: 0.09 }); nota(c, { f: 587, t: 0.075, dur: 0.14, vol: 0.09 }); },
    // un ingreso: moneda
    ingreso:  c => { nota(c, { f: 988, dur: 0.07, vol: 0.08, forma: 'triangle' }); nota(c, { f: 1319, t: 0.065, dur: 0.22, vol: 0.08, forma: 'triangle' }); },
    // ahorro: campanita de tres notas
    ahorro:   c => [784, 988, 1175].forEach((f, i) => nota(c, { f, t: i * 0.07, dur: 0.24, vol: 0.07 })),
    // borrar: barrido hacia abajo
    borrar:   c => nota(c, { f: 520, f2: 160, dur: 0.18, vol: 0.09, forma: 'triangle' }),
    // error: dos golpecitos graves
    error:    c => { nota(c, { f: 220, dur: 0.08, vol: 0.09, forma: 'triangle' }); nota(c, { f: 196, t: 0.11, dur: 0.11, vol: 0.09, forma: 'triangle' }); },
    // voz
    micOn:    c => nota(c, { f: 520, f2: 1040, dur: 0.13, vol: 0.08 }),
    micOff:   c => nota(c, { f: 1040, f2: 520, dur: 0.13, vol: 0.07 }),
    // escáner: obturador y confirmación
    escaneo:  c => { ruido(c, { dur: 0.05 }); nota(c, { f: 1175, t: 0.09, dur: 0.1, vol: 0.08 }); nota(c, { f: 1568, t: 0.17, dur: 0.16, vol: 0.08 }); },
    // Premium activado / resumen del mes: arpegio con brillo
    premium:  c => [523, 659, 784, 1047, 1319].forEach((f, i) => nota(c, { f, t: i * 0.06, dur: 0.32, vol: 0.06 })),
    resumen:  c => [659, 880, 1109].forEach((f, i) => nota(c, { f, t: i * 0.09, dur: 0.3, vol: 0.06 }))
  };

  function sonar(nombre) {
    if (!activo() || !SONIDOS[nombre]) return false;
    const c = contexto();
    if (!c) return false;
    try { SONIDOS[nombre](c); } catch (e) { return false; }
    return true;
  }

  /** Un sonido propio de una acción. Cancela el «tap» del mismo toque. */
  function tocar(nombre) {
    if (tapPendiente) { clearTimeout(tapPendiente); tapPendiente = null; }
    if (nombre !== 'tap' && nombre !== 'slide') ultimoEspecial = Date.now();
    return sonar(nombre);
  }

  /** Sugerencia de menor prioridad (por ejemplo, desde un aviso): no suena
      si otra acción ya hizo su sonido recién. */
  function sugerir(nombre) {
    if (Date.now() - ultimoEspecial < 400) return false;
    return tocar(nombre);
  }

  /* Cualquier toque en algo tocable hace el clic. Se difiere un instante:
     si en ese mismo toque la acción pide su propio sonido, el clic se
     cancela y no se pisan. */
  const TOCABLE = 'button, a.btn, .seg-btn, .catchip, .chip, .nav-btn, .fab, .acceso, .catitem, .fijoitem, .movrow, .meta-row, input[type=checkbox], label.check-row';
  function escucharToques(doc) {
    doc.addEventListener('click', e => {
      const el = e.target && e.target.closest && e.target.closest(TOCABLE);
      if (!el || el.disabled) return;
      if (tapPendiente) clearTimeout(tapPendiente);
      tapPendiente = setTimeout(() => { tapPendiente = null; sonar('tap'); }, 0);
    }, true);

    /* Un mensaje de error en un formulario suena a error, venga de donde
       venga: así no hay que acordarse en cada validación. */
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        const el = m.target;
        if (el.classList && el.classList.contains('form-error') && !el.hidden) { tocar('error'); break; }
      }
    });
    const enganchar = () => obs.observe(doc.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    if (doc.body) enganchar(); else doc.addEventListener('DOMContentLoaded', enganchar);
  }

  if (typeof document !== 'undefined') escucharToques(document);

  global.Sonido = { tocar, sugerir, activo, setActivo, nombres: Object.keys(SONIDOS) };
})(typeof window !== 'undefined' ? window : globalThis);
