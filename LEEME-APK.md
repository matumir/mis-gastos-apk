# Mis Gastos — proyecto Android

Proyecto [Capacitor](https://capacitorjs.com) listo para compilar el APK. La app
web vive en `www/` y es exactamente la misma que la PWA; `android/` es el proyecto
nativo, ya configurado con nombre, íconos, permisos y el reconocimiento de voz
nativo integrado.

**No compilé el APK acá**: este entorno no tiene el SDK de Android y no puede
descargarlo (`dl.google.com`, `maven.google.com` y `repo1.maven.org` están
bloqueados). Abajo están los tres caminos para generarlo, ordenados de menos a
más instalación.

---

## Opción A — GitHub Actions (no instalás el SDK)

Los servidores de GitHub ya traen el SDK de Android. El workflow está incluido.

**Esta parte necesita una computadora, una sola vez.** Desde el celular no se
puede: el proyecto tiene 146 archivos en carpetas anidadas y el subidor web de
GitHub no sirve para eso en un teléfono.

1. Creá un repositorio en [github.com/new](https://github.com/new). Puede ser
   privado; Actions funciona igual.
2. Subí esta carpeta. Con git:
   ```bash
   cd mis-gastos-apk
   git init && git add . && git commit -m "Mis Gastos"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/mis-gastos.git
   git push -u origin main
   ```
   Sin git: en el repo vacío, *uploading an existing file* y arrastrá la carpeta.
   Ojo que el subidor web acepta hasta 100 archivos por vez, así que van dos
   tandas: primero todo menos `android/`, después `android/`.
3. El workflow arranca solo con el push. Lo seguís en la pestaña **Actions**.
4. A los ~5 minutos tenés el APK en dos lados:
   - **Releases** (columna derecha del repo) → `app-debug.apk` suelto. **Este es
     el que te sirve desde el celular**: tocás el link y baja el APK listo.
   - **Actions → el run → Artifacts**, que baja como `.zip` y hay que descomprimir.

### Bajarlo e instalarlo en el celular

1. Desde el teléfono, entrá al repo en GitHub (iniciá sesión si es privado).
2. **Releases** → la última → tocá `app-debug.apk`.
3. Abrí el archivo bajado. Android te va a decir que esa app —Chrome o Archivos—
   no tiene permiso para instalar: tocá **Configuración**, activá **Permitir de
   esta fuente**, volvé atrás e **Instalar**.
4. Si aparece Play Protect avisando que no reconoce la app, es porque no viene de
   Play Store. **Instalar de todas formas**.

Para las siguientes versiones, basta con `git push`: se compila sola y aparece un
Release nuevo.

## Opción B — Android Studio (lo más cómodo si vas a iterar)

1. Instalá [Android Studio](https://developer.android.com/studio). Trae el SDK.
2. ```bash
   cd mis-gastos-apk
   npm install
   npx cap open android
   ```
3. En Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
4. El archivo queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

## Opción C — línea de comandos

Necesitás JDK 21 y el SDK de Android (`ANDROID_HOME` apuntando a él).

```bash
cd mis-gastos-apk
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```

---

## Instalar el APK en el teléfono

Pasalo al celular (cable, Drive, WhatsApp) y abrilo. Android va a pedirte
habilitar **instalar apps de orígenes desconocidos** para la aplicación desde la
que lo abrís; es normal en un APK que no viene de Play Store.

Es un APK **de depuración**, firmado con la clave de debug. Sirve perfecto para
usarlo vos. Para publicarlo en Play Store hace falta una clave propia y
`assembleRelease`; si llegás a ese punto, avisame y lo configuramos.

---

## En iPhone y en la computadora (versión web)

iPhone no instala APKs: hasta que la app salga en las tiendas se usa la versión
web, que se publica sola en cada `git push` (`.github/workflows/web.yml`) en
**https://matumir.github.io/mis-gastos-apk/**.

1. Abrila en **Safari**, tocá **Compartir** y después **Agregar a pantalla de inicio**.
2. Queda con su ícono, se abre a pantalla completa y funciona sin internet.

Conviene instalarla siempre: Safari borra los datos de los sitios que no se abren
en una semana, pero no los de las apps de la pantalla de inicio. Los datos de la
versión web quedan en ese navegador y no se comparten con el APK; para pasarlos
se usa *Ajustes → Copia de seguridad*. En la computadora (Chrome o Edge) se instala
con *Ajustes → Instalar la app* o desde el menú del navegador.

Las versiones nuevas llegan solas: la próxima vez que se abre con internet.

**Una sola vez**, después del primer push: en el repo, *Settings → Pages → Source:
Deploy from a branch → `gh-pages` / `(root)` → Save*.

- `scripts/preparar-web.mjs` — arma la versión web en `dist/` y le agrega a `VERSION`
  de `www/sw.js` el commit publicado, así cada publicación se detecta como nueva.

### Recordatorios en la versión web (iPhone y computadora)

Los mismos avisos que el APK: todos los días a las 21 y el día 1 a las 10 el del resumen,
a la hora del teléfono. Una página no puede programarlos, así que los manda un servidor
con **Web Push**: el **mismo proyecto de Supabase que ARAC Partidos**, con tabla y función
propias (todo lo de Mis Gastos empieza con `misgastos`), así que no se toca nada de ARAC.
En iPhone llegan sólo con la app instalada en la pantalla de inicio (iOS 16.4 o más nuevo).
La primera vez que se abre, la app pregunta *¿Te recordamos cargar los gastos?*: un toque en
**Activar recordatorios** muestra el permiso del sistema y quedan prendidos. No puede mostrar
el permiso sola al abrirse, como el APK: en iPhone una página sólo puede pedirlo cuando se
toca un botón. Se pregunta una sola vez; después quedan en *Ajustes → Recordatorios*.

Al servidor sólo va la «suscripción» del teléfono (una dirección anónima para mandarle
avisos) y su zona horaria. Ningún dato de gastos. Al apagarlos se borra.

**Se configura una sola vez**, en el proyecto de Supabase de ARAC:

1. **SQL Editor → New query**: pegá `supabase/recordatorio.sql` entero y tocá *Run*.
   Crea la tabla `misgastos_push`, sus funciones y el envío automático de cada hora
   (`misgastos-recordatorio` en *Integrations → Cron*).
2. **Edge Functions → Deploy a new function → Via Editor**: nombrala
   `misgastos-recordatorio` (exacto), pegá `supabase/functions/misgastos-recordatorio/index.ts`
   y tocá *Deploy*. Después, en los ajustes de la función, desactivá
   **Verify JWT / Enforce JWT verification** y guardá.
3. **Edge Functions → Secrets**: no hay que cargar nada nuevo. Usa los de ARAC
   (`VAPID_PUBLICA`, `VAPID_PRIVADA` y `ARAC_CLAVE_PUSH`); fijate que estén.

**Para probar:** en el iPhone, con la app instalada, prendé *Ajustes → Recordatorios* y
aceptá el permiso. Después, desde el panel de administrador, *Recordatorio de prueba*:
lo manda el servidor y llega en unos segundos.

Para revisar desde Supabase (*SQL Editor*):
`select endpoint, zona, ultimo_recordatorio, ultimo_resumen from misgastos_push;`
muestra los teléfonos suscriptos y cuándo les llegó el último aviso.

Archivos: `www/push.js` (prender y apagar en la app), `www/sw.js` (mostrar el aviso y
abrir la app al tocarlo), `supabase/recordatorio.sql` y
`supabase/functions/misgastos-recordatorio/index.ts`. Los textos de los avisos están
repetidos en `www/app.js` (APK) y en la función: si se cambian, cambiarlos en los dos.

---

## Cómo quedó la voz

El motor de voz cambia solo según dónde corra la app, con el mismo código:

| Dónde | Motor | Internet |
|---|---|---|
| APK | `SpeechRecognizer` nativo de Android, vía [`@capacitor-community/speech-recognition`](https://github.com/capacitor-community/speech-recognition) | No, si el teléfono tiene bajado el paquete de español sin conexión |
| Navegador (PWA) | Web Speech API | Sí |

La detección es `window.Capacitor.isNativePlatform()`. Todo lo demás —el parser
de montos y modismos, las categorías, el dashboard, los topes— es el mismo código
en los dos casos.

En el APK, la primera vez que toques el micrófono Android va a pedirte el permiso
una sola vez y queda. Los permisos ya están declarados en el manifest, incluido el
bloque `<queries>` que desde Android 11 hace falta para que la app "vea" el
servicio de reconocimiento del sistema.

Probado en un teléfono real: la voz nativa funciona.

---

## Actualizar el APK sin perder los datos

Android sólo deja instalar una actualización encima de una app si **las dos
están firmadas con la misma clave**. Si no coinciden, muestra «paquete en
conflicto» o «no se instaló la aplicación», y la única salida es desinstalar
—lo que borra todos los datos de la app.

Hasta la v1.2 el workflow no guardaba la clave: GitHub creaba una distinta en
cada compilación, así que cada actualización habría obligado a desinstalar. Ya
está arreglado: el paso *Conservar la clave de firma* la guarda entre
compilaciones.

**La primera instalación de la v1.2 es la excepción**: la app que tenés puesta
quedó firmada con una clave vieja, así que hay que desinstalarla antes. Si
cargaste datos de verdad en el teléfono, anotalos: la v1.1 no tiene exportar,
así que no hay forma de sacarlos. De la v1.2 en adelante, las actualizaciones
entran encima y los datos quedan.

> **Detalle a tener en cuenta:** GitHub borra los cachés que no se usan durante
> 7 días. Si pasás más de una semana sin compilar, puede generar una clave nueva
> y volver el problema. Antes de empezar a vender hay que pasar a una clave de
> **release** propia, guardada como *secret* del repositorio: es la misma que
> vas a necesitar para Play Store y no vence nunca. Avisame cuando llegues a ese
> punto y lo configuramos.

---

## Copia de seguridad y licencia (desde la v1.2)

**Copia de seguridad.** En el APK, *Guardar copia* no baja un archivo como en el
navegador —el WebView de Android no tiene gestor de descargas— sino que escribe
el archivo y abre el **menú de compartir** del sistema, para mandarlo a Drive, a
un mail o a un mensaje guardado. Si eso tampoco se puede, muestra el texto en
pantalla para copiarlo a mano.

Para eso el proyecto usa dos plugins más, ya declarados en `package.json`:

| Plugin | Para qué |
|---|---|
| `@capacitor/filesystem` | escribir el archivo de la copia |
| `@capacitor/share` | pasarlo al menú de compartir |

`npx cap sync android` los instala solo; con GitHub Actions no hay que hacer nada.

**Licencia.** La verificación es offline, con Web Crypto, y anda igual en el APK
que en el navegador. Las licencias se emiten desde la carpeta
`mis-gastos-licencias`.

> ⚠ **`clave-privada.json` no va nunca a este repositorio.** Es la firma con la
> que se emiten las licencias: si se filtra, cualquiera puede fabricarlas.
> Mantenela en su carpeta, fuera de git.

---

## Si después querés cambiar algo de la app

Editás los archivos de `www/` y volvés a compilar:

```bash
npx cap sync android          # copia www/ adentro del proyecto Android
cd android && ./gradlew assembleDebug
```

Con GitHub Actions es sólo hacer `git push`: el workflow sincroniza y compila solo.

---

## Datos del proyecto

| | |
|---|---|
| Nombre | Mis Gastos |
| ID de aplicación | `com.misgastos.app` |
| Versión de la app | BETA 2.0 |
| Capacitor | 7.4.3 |
| minSdk / targetSdk | 23 (Android 6) / 35 (Android 15) |
| Java | 21 |
| Permisos | `RECORD_AUDIO`, `INTERNET` |

El ID de aplicación es permanente una vez publicada en Play Store. Si pensás
publicarla y preferís otro, cambialo **antes** del primer build en
`capacitor.config.json` y corré `npx cap sync android`.

---

## Escáner de tickets (Premium, desde la 2.2)

Botón con el ícono de ticket, al lado de «Voz». Todo se procesa en el teléfono:

1. Busca el **QR de la factura electrónica** (AFIP/ARCA). Si está, el total, la fecha y el
   CUIT salen exactos y en un segundo.
2. Si no hay QR, **lee el texto** (Tesseract, español) y busca el TOTAL, la fecha y el
   comercio. Si la foto no se ve clara, hace un segundo intento en blanco y negro. Si el
   total no coincide con lo pagado (tarjeta, efectivo menos vuelto), avisa para revisar.
3. Abre la hoja de movimiento prellenada: **nada se guarda sin tocar «Guardar»**.
4. Recuerda la categoría y el nombre que elegiste para cada comercio (por CUIT o nombre).

Las librerías están en `www/vendor/` (~11 MB, dentro del APK; en la web se bajan la
primera vez que se usa el escáner y quedan guardadas). La cámara se abre con el selector
de archivos del sistema, así que no hace falta un permiso nuevo.

Probado en navegador con tickets generados (QR, texto inclinado, poco contraste, borroso).
**Falta probarlo con tickets térmicos reales en un teléfono**: es lo primero a revisar.

---

## Novedades de la BETA 2.7

Dos formas nuevas de cargar sin escribir (Premium). Todo pasa en el teléfono: nada se
envía a ningún lado.

- **Comprobantes de transferencias.** En Mercado Pago, Ualá o el banco: *Compartir
  comprobante → Mis Gastos*. La app lo lee (imagen, PDF o texto) y abre el movimiento
  listo para confirmar: importe, fecha, si entró o salió la plata y a quién. En el
  escáner también se puede elegir la captura del comprobante (así funciona en iPhone).
  Recuerda la categoría y la descripción que le pusiste a cada persona.
- **Detectar pagos y transferencias (sólo Android).** Con el permiso de *Acceso a
  notificaciones*, la app lee los avisos con importe de 28 billeteras y bancos (lista en
  `www/detectar.js`, `APPS`). Las transferencias y pagos aparecen en el Resumen
  (*Detectamos N movimientos*) para cargarlos con un toque o todos juntos; se descartan
  solas las promociones, los pagos rechazados y los vencimientos. Avisa si uno parece
  repetido. Se ofrece una vez al abrir la app con Premium y se prende o apaga en Ajustes.

**El permiso en Android 13 o más nuevo.** Como el APK no viene de Play Store, Android
marca *Acceso a notificaciones* como **ajuste restringido** (el interruptor aparece gris).
La app lo explica, pero el camino es: *Ajustes del teléfono → Apps → Mis Gastos → ⋮
(arriba a la derecha) → Permitir ajustes restringidos*, y después activar el acceso.

**Qué falta probar en un teléfono:** los textos reales de los avisos de cada billetera y
comprobantes reales. Los textos de los avisos los decide cada app y no hay una lista
pública: el lector busca el verbo (*transferiste*, *te envió*, *compra aprobada*…) y el
importe, no una frase exacta. Si una billetera avisa con otras palabras, se agregan en
`FRASES` de `www/detectar.js`. Para probar sin esperar un aviso: *Administrador →
Simular avisos de billetera*.

Código: `android/.../LectorAvisos.java` (el servicio que lee los avisos), `ColaAvisos.java`
(los guarda hasta que la app los levanta), `LectorPlugin.java` (permiso y compartir) y
`www/detectar.js` (interpreta los textos; se prueba sin teléfono).

## Novedades de la BETA 2.6

- **Balance total** en la tarjeta del balance del mes: lo que entró menos lo que salió
  y lo que fue a ahorro, en todo lo cargado (la suma de los balances de todos los meses).
  En la billetera en dólares, también en pesos.
- **Criptomonedas** en Cotizaciones: Bitcoin, Ethereum, BNB, Solana, XRP, Cardano,
  Dogecoin, TRON y Litecoin, en dólares y con la variación de 24 h, de
  [CoinGecko](https://www.coingecko.com) (sin clave). Se pueden tener a la vista en el
  Resumen como las demás. Si CoinGecko no contesta, el dólar se actualiza igual.
- **Versión web (iPhone y computadora):** se actualiza sola. Revisa si hay versión nueva
  al volver a la app y cada media hora (en iPhone la app instalada no se recarga sola).
  Cuando está bajada, se recarga sola si no hay nada abierto; si hay algo a medio cargar,
  muestra *Hay una versión nueva · Actualizar*. *Ajustes → Buscar actualizaciones* ahora
  también está en la web. El service worker sirve todo del cache de la versión
  instalada: ya no se mezcla una página nueva con código viejo.
- **Recordatorios en iPhone y en la computadora:** los mismos del APK, mandados por el
  servidor con Web Push desde el proyecto de Supabase de ARAC. Ver *Recordatorios en la
  versión web*, arriba, para configurarlo.

## Novedades de la BETA 2.5

- **Cotizaciones** (en las dos billeteras, gratis): una hoja con los 7 tipos de dólar
  (oficial, blue, MEP, CCL, mayorista, cripto y tarjeta) y el euro, el real, el peso
  chileno y el peso uruguayo al oficial, con compra y venta. En el Resumen, una tarjeta
  muestra las que cada uno elija tener a la vista (de entrada, oficial y blue); se
  eligen en la misma hoja y quedan en `ajustes.cotizVista`.
  Vienen de [DolarApi.com](https://dolarapi.com), con [Bluelytics](https://bluelytics.com.ar)
  de respaldo (sólo dólar oficial, blue y euro). Lo hace `www/cotizaciones.js`; la
  última respuesta se guarda en `misgastos.cotizaciones` (fuera de las copias) para
  verla sin conexión, y no se vuelve a preguntar antes de 15 minutos.
- **Billetera en dólares en pesos:** balance, ingresos y egresos muestran al lado
  «≈ $ …» al dólar oficial de venta.
- **Voz:** ya no pierde la última palabra. En Android el aviso de «dejé de escuchar»
  llega antes que el resultado final; ahora se espera ese resultado (hasta 1,5 s).
- **Privacidad:** `privacidad.html` explica la consulta de cotizaciones.

## Novedades de la BETA 2.4

- **Billetera en dólares (Premium).** Ingresos, egresos, fijos, presupuestos y cajas
  de ahorro completamente aparte de los pesos. Se cambia con el botón `ARS`/`USD` de
  la cabecera o en *Ajustes → Billetera*. Arranca con una copia de las categorías de
  pesos (sin los presupuestos) y las cajas de inicio; desde ahí cada una va por su lado.
  Los topes del plan gratis cuentan por billetera.
- **Guardado:** la billetera en pesos sigue en el mismo lugar de siempre y la de
  dólares va aparte (`billeteras.USD`), así lo ya cargado no se toca. Sin Premium no se
  puede crear, pero si ya existe se sigue viendo: lo que alguien armó no se le saca.
- **Voz:** «gasté 50 dólares en nafta» va a la billetera en dólares aunque estés en
  pesos (y «pesos» al revés), avisando dónde quedó.
- **Fijos:** se cargan en las dos billeteras, se esté viendo la que se esté viendo.
- **Tickets:** en la billetera en dólares, una factura en dólares queda con su importe
  original; un ticket en pesos se carga igual pero avisa para revisar.
- **Copia de seguridad:** lleva las dos billeteras. Si hay dólares es el formato 2,
  que las versiones anteriores rechazan en lugar de importar sólo los pesos.

## Novedades de la BETA 2.3

- **Recordatorios arreglados.** Hasta la 2.2 se mandaban a un canal de Android que
  nunca se creaba, y en Android 8+ eso hace que no se muestren. Ahora se crea el canal
  `recordatorios` y hay un ícono propio (`res/drawable/ic_stat_misgastos.xml`).
- **Un recordatorio por día, siempre**, a las 21, con 5 textos que rotan. Son avisos
  que se repiten solos cada semana: siguen llegando aunque no se abra la app y después
  de reiniciar el teléfono. El día 1 a las 10, aviso de que está el resumen del mes.
- **Resumen del mes en diapositivas**: aparece una vez al entrar en los primeros 7 días
  del mes, y queda un acceso en el Resumen esos días.
- **Plazo en los movimientos fijos**: sin fin, por cantidad de meses (dice «cuota 3/12»)
  o hasta un mes.
- **Sonidos** sintetizados (sin archivos). Se apagan en Ajustes → Sonidos.
- **Modo administrador** (da Premium y un panel de pruebas; se verifica en cada arranque): el código está en la carpeta privada de licencias (`ADMIN.txt`).
- **Tickets**: ya no confunde la columna «Total» del encabezado con el total; suma los
  productos (con descuentos) y compara contra lo pagado.
