# Firma estable, aviso de versión y privacidad

## 1. Firma estable del APK (una sola vez, ~15 min, en tu PC con Windows)

Sin clave propia, cada actualización puede obligar a desinstalar y perder los datos.
**Hacelo antes de repartir el APK a más gente.** Quienes ya tengan instalada una versión
anterior van a tener que desinstalar **una última vez** (antes: Ajustes → Guardar copia).

### a) Conseguir `keytool` (viene con Java)

En PowerShell, probá:

    keytool -help

- Si responde, seguí al paso b.
- Si dice que no lo encuentra y tenés **Android Studio**, usalo con la ruta completa:
  `& "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -help`
- Si no tenés ninguno: instalá **Eclipse Temurin JDK 21** desde adoptium.net
  (marcá "Set JAVA_HOME" y "Add to PATH"), cerrá y abrí PowerShell de nuevo.

### b) Crear la clave

Elegí una carpeta segura (por ejemplo `Documentos\MisGastos-clave`), abrí PowerShell ahí y corré:

    keytool -genkeypair -v -keystore mis-gastos.keystore -alias misgastos -keyalg RSA -keysize 2048 -validity 10000

- Te pide una contraseña (no se ve mientras escribís) y que la repitas.
- Después pregunta nombre, organización, ciudad, etc. Podés completar o dejar en blanco
  con Enter. Al final escribí `si` (o `yes`) para confirmar.
- Si pregunta una contraseña aparte para la clave, apretá Enter para usar la misma.

Queda el archivo `mis-gastos.keystore`.

### c) Respaldarla — esto es lo importante

Guardá `mis-gastos.keystore` **y** la contraseña en dos lugares (Drive + pendrive, por ejemplo).
Si se pierden, nunca más vas a poder actualizar la app en los teléfonos donde ya está instalada.
**Nunca la subas al repositorio.**

### d) Convertirla a texto

En PowerShell, en la misma carpeta (queda copiado en el portapapeles):

    [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\mis-gastos.keystore")) | Set-Clipboard

### e) Cargar los 4 secretos en GitHub

github.com/matumir/mis-gastos-apk → **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Uno por uno:

| Name | Secret |
|---|---|
| `MG_KEYSTORE_B64` | pegá lo copiado en el paso d (Ctrl+V) |
| `MG_STORE_PASS` | la contraseña |
| `MG_KEY_ALIAS` | `misgastos` |
| `MG_KEY_PASS` | la misma contraseña |

### f) Compilar

Subí esta versión al repositorio (o Actions → Compilar APK → **Run workflow**).
En el run, el paso «Preparar la clave de firma» **no** debe mostrar la advertencia amarilla
«Sin clave propia». Si la muestra, algún secreto quedó mal escrito.

El APK sale siempre con el mismo nombre, así el link no cambia nunca:
`https://github.com/matumir/mis-gastos-apk/releases/latest/download/mis-gastos.apk`

## 2. Aviso de versión nueva (ya configurado)

- La app consulta una vez por día
  `https://raw.githubusercontent.com/matumir/mis-gastos-apk/main/version.json`
  (el `version.json` de la raíz de este proyecto).
- **Si tu repositorio no se llama `mis-gastos-apk` o la rama no es `main`**, corregí
  `URL_VERSION` en `www/app.js` y el link en `version.json`.
- El repositorio tiene que ser **público** (si no, ni el aviso ni la descarga funcionan).
- Sólo se chequea en el APK. La versión web se actualiza sola.

**Cada vez que publiques una versión:** subí `APP_VER` en `www/app.js`, `VERSION` en
`www/sw.js`, `versionCode` (+1) y `versionName` en `android/app/build.gradle`, y por último
el número y la nota en `version.json`. Los teléfonos con una versión menor muestran el aviso.

## 3. Política de privacidad

`www/privacidad.html`, enlazada desde Ajustes → Privacidad. En la web queda en
`https://matumir.github.io/mis-gastos-apk/privacidad.html` (sirve como enlace para las tiendas).
Completá `[TU NOMBRE COMPLETO Y CUIT]` y `[TU EMAIL]`. Si algún día sumás contador de
usuarios, anuncios o algo que mande datos afuera, **hay que actualizarla antes**.
