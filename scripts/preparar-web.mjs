// Arma la versión web (PWA) en dist/: copia www/ y le agrega a VERSION de sw.js
// el commit publicado, así cada publicación cambia sw.js y el teléfono detecta
// que hay una versión nueva aunque no se haya subido VERSION a mano.
// Uso: node scripts/preparar-web.mjs   (lo corre .github/workflows/web.yml)
import fs from 'node:fs';
import path from 'node:path';

const WWW = 'www', DIST = 'dist';
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(WWW, DIST, { recursive: true });

const swPath = path.join(DIST, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
const m = sw.match(/const VERSION = '([^']+)';/);
if (!m) throw new Error("sw.js no tiene la línea const VERSION = '…';");
const commit = (process.env.GITHUB_SHA || Date.now().toString(36)).slice(0, 7);
const version = `${m[1]}-${commit}`;
sw = sw.replace(m[0], `const VERSION = ${JSON.stringify(version)};`);
fs.writeFileSync(swPath, sw);

// Cada archivo de la lista del service worker tiene que existir: si falta uno,
// cache.addAll falla entero y la app no queda guardada para usar sin internet.
const lista = sw.match(/const ARCHIVOS = \[([\s\S]*?)\];/);
if (!lista) throw new Error('sw.js no tiene la lista ARCHIVOS');
const archivos = [...lista[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
const faltan = archivos.filter(f => f !== './' && !fs.existsSync(path.join(DIST, f)));
if (faltan.length) throw new Error('sw.js lista archivos que no existen: ' + faltan.join(', '));

// Al revés no rompe nada (se guardan la primera vez que se usan), pero conviene saberlo.
const sueltos = fs.readdirSync(DIST, { withFileTypes: true })
  .filter(e => e.isFile() && /\.(js|css|html)$/.test(e.name) && e.name !== 'sw.js')
  .map(e => './' + e.name)
  .filter(f => !archivos.includes(f));
for (const f of sueltos) console.log(`::warning::${f} no está en ARCHIVOS de sw.js: sin internet no abre hasta que se use una vez.`);

console.log(`Versión web ${version}: ${archivos.length} archivos para usar sin internet.`);
