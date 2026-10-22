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
