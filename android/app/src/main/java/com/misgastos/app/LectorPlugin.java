package com.misgastos.app;

import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.pdf.PdfRenderer;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.Settings;
import android.service.notification.NotificationListenerService;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/**
 * El puente entre la app (JavaScript) y dos cosas que sólo se pueden hacer
 * del lado de Android:
 *
 *  1. Leer los avisos de las billeteras: pedir el permiso de «Acceso a
 *     notificaciones», prender y apagar el servicio (LectorAvisos) y
 *     entregarle a la app lo que encontró.
 *  2. Recibir un comprobante que se comparte desde otra app («Compartir →
 *     Mis Gastos»): una imagen, un PDF (se pasa a imagen la primera
 *     página) o un texto.
 *
 * Nada de esto sale del teléfono.
 */
@CapacitorPlugin(name = "Lector")
public class LectorPlugin extends Plugin {

    private static final String EXTRA_VISTO = "com.misgastos.app.COMPARTIDO_VISTO";
    private static final int MAX_BYTES = 12 * 1024 * 1024;   // lo que se acepta leer
    private static final int LIVIANO = 2 * 1024 * 1024;      // hasta acá la imagen va como está
    private static final int LADO_MAX = 2400;                // lado mayor al achicar
    private static final int ANCHO_PDF = 1600;
    private static final int MAX_TEXTO = 20000;

    private static volatile LectorPlugin instancia;

    private final Object candado = new Object();
    private JSObject compartido;   // lo último que se compartió y la app todavía no levantó

    @Override
    public void load() {
        instancia = this;
        reconectarSiHaceFalta();
    }

    @Override
    protected void handleOnDestroy() {
        if (instancia == this) instancia = null;
    }

    @Override
    protected void handleOnResume() {
        // Al volver de los ajustes del sistema la app revisa si le dieron el permiso.
        notifyListeners("vuelta", new JSObject());
    }

    /** Lo llama el servicio cuando sumó un aviso y la app está abierta. */
    static void hayNuevo() {
        LectorPlugin p = instancia;
        if (p != null) p.notifyListeners("nuevo", new JSObject());
    }

    /* ---------------------------------------------------------
       Avisos de billeteras
       --------------------------------------------------------- */

    private ComponentName servicio() {
        return new ComponentName(getContext(), LectorAvisos.class);
    }

    private boolean permitido() {
        Context c = getContext();
        ComponentName cn = servicio();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            return nm != null && nm.isNotificationListenerAccessGranted(cn);
        }
        String lista = Settings.Secure.getString(c.getContentResolver(), "enabled_notification_listeners");
        return lista != null && lista.contains(cn.flattenToString());
    }

    /** Algunos teléfonos sueltan el servicio para ahorrar batería: se pide que lo vuelvan a enganchar. */
    private void reconectarSiHaceFalta() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && ColaAvisos.activo(getContext()) && permitido()) {
                NotificationListenerService.requestRebind(servicio());
            }
        } catch (RuntimeException e) {
            // no es grave: el sistema lo reconecta solo en la mayoría de los casos
        }
    }

    @PluginMethod
    public void estado(PluginCall call) {
        JSObject r = new JSObject();
        r.put("permitido", permitido());
        r.put("activo", ColaAvisos.activo(getContext()));
        call.resolve(r);
    }

    /** Abre la pantalla del sistema donde se da el permiso. No hay otra forma: Android no lo deja pedir con un cartel. */
    @PluginMethod
    public void pedirPermiso(PluginCall call) {
        Intent lista = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Intent detalle = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
                detalle.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME, servicio().flattenToString());
                try {
                    getActivity().startActivity(detalle);
                } catch (ActivityNotFoundException | SecurityException e) {
                    getActivity().startActivity(lista);
                }
            } else {
                getActivity().startActivity(lista);
            }
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("No se pudo abrir la pantalla de permisos.");
        }
    }

    /** Los datos de la app en los ajustes del sistema (para «Permitir ajustes restringidos»). */
    @PluginMethod
    public void abrirInfoApp(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", getContext().getPackageName(), null));
            getActivity().startActivity(i);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("No se pudieron abrir los datos de la app.");
        }
    }

    @PluginMethod
    public void activar(PluginCall call) {
        boolean activo = Boolean.TRUE.equals(call.getBoolean("activo", false));
        Set<String> paquetes = null;
        JSArray lista = call.getArray("paquetes");
        if (lista != null) {
            paquetes = new HashSet<>();
            for (int i = 0; i < lista.length(); i++) {
                String p = lista.optString(i, "");
                if (!p.isEmpty()) paquetes.add(p);
            }
        }
        ColaAvisos.configurar(getContext(), activo, paquetes);
        if (activo) reconectarSiHaceFalta();
        call.resolve();
    }

    @PluginMethod
    public void pendientes(PluginCall call) {
        JSObject r = new JSObject();
        JSONArray cola = ColaAvisos.leer(getContext());
        try {
            r.put("items", new JSArray(cola.toString()));
        } catch (JSONException e) {
            r.put("items", new JSArray());
        }
        call.resolve(r);
    }

    @PluginMethod
    public void borrar(PluginCall call) {
        long hasta = call.getData().optLong("hasta", -1L);
        if (hasta >= 0) ColaAvisos.borrarHasta(getContext(), hasta);
        call.resolve();
    }

    /* ---------------------------------------------------------
       Comprobantes compartidos desde otra app
       --------------------------------------------------------- */

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        // Al reabrir la app desde «recientes» el sistema repite el último pedido.
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
        if (intent.getBooleanExtra(EXTRA_VISTO, false)) return;
        intent.putExtra(EXTRA_VISTO, true);

        final String tipo = intent.getType();
        final CharSequence texto = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        Uri u = null;
        try {
            u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        } catch (RuntimeException e) {
            // un extra que no es un Uri: queda el texto, si hay
        }
        final Uri uri = u;

        // Leer el archivo puede tardar: fuera del hilo de la pantalla.
        new Thread(() -> {
            JSObject r = leerCompartido(uri, tipo, texto);
            synchronized (candado) { compartido = r; }
            notifyListeners("compartido", new JSObject());
        }, "mg-compartido").start();
    }

    /** Entrega (una sola vez) lo que se compartió. */
    @PluginMethod
    public void tomarCompartido(PluginCall call) {
        JSObject r;
        synchronized (candado) {
            r = compartido;
            compartido = null;
        }
        if (r == null) {
            r = new JSObject();
            r.put("tipo", "nada");
        }
        call.resolve(r);
    }

    private static JSObject error(String motivo) {
        JSObject r = new JSObject();
        r.put("tipo", "error");
        r.put("motivo", motivo);
        return r;
    }

    private static JSObject comoTexto(CharSequence s) {
        String t = s.toString().trim();
        if (t.isEmpty()) return error("vacio");
        JSObject r = new JSObject();
        r.put("tipo", "texto");
        r.put("texto", t.length() > MAX_TEXTO ? t.substring(0, MAX_TEXTO) : t);
        return r;
    }

    private static JSObject comoImagen(byte[] bytes, String mime) {
        JSObject r = new JSObject();
        r.put("tipo", "imagen");
        r.put("mime", mime);
        r.put("datos", Base64.encodeToString(bytes, Base64.NO_WRAP));
        return r;
    }

    private JSObject leerCompartido(Uri uri, String tipoPedido, CharSequence texto) {
        if (uri == null) return texto != null ? comoTexto(texto) : error("vacio");
        try {
            ContentResolver cr = getContext().getContentResolver();
            String mime = tipoPedido;
            if (mime == null || mime.endsWith("/*")) {
                String real = cr.getType(uri);
                if (real != null) mime = real;
            }
            if (mime == null) mime = "";
            String ruta = String.valueOf(uri.getLastPathSegment()).toLowerCase();

            byte[] bytes;
            try (InputStream in = cr.openInputStream(uri)) {
                if (in == null) return error("lectura");
                bytes = leerTodo(in);
            }
            if (bytes == null) return error("grande");

            boolean esPdf = mime.equals("application/pdf") || ruta.endsWith(".pdf") || empiezaCon(bytes, "%PDF");
            if (esPdf) return pdfAImagen(bytes);
            if (mime.startsWith("text/")) return comoTexto(new String(bytes, StandardCharsets.UTF_8));
            if (mime.startsWith("image/") || mime.isEmpty()) return imagen(bytes, mime);
            return error("formato");
        } catch (IOException | RuntimeException e) {
            return error("lectura");
        } catch (OutOfMemoryError e) {
            return error("grande");
        }
    }

    private static boolean empiezaCon(byte[] bytes, String firma) {
        if (bytes.length < firma.length()) return false;
        for (int i = 0; i < firma.length(); i++) if (bytes[i] != (byte) firma.charAt(i)) return false;
        return true;
    }

    /** Lee todo el contenido, o null si pasa el tamaño máximo. */
    private static byte[] leerTodo(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) {
            out.write(buf, 0, n);
            if (out.size() > MAX_BYTES) return null;
        }
        return out.toByteArray();
    }

    /** Una imagen liviana va tal cual; una foto pesada se achica (y se endereza) antes de pasarla. */
    private static JSObject imagen(byte[] bytes, String mime) {
        BitmapFactory.Options medidas = new BitmapFactory.Options();
        medidas.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, medidas);
        if (medidas.outWidth <= 0 || medidas.outHeight <= 0) return error("formato");

        int lado = Math.max(medidas.outWidth, medidas.outHeight);
        if (bytes.length <= LIVIANO && lado <= LADO_MAX * 2) {
            return comoImagen(bytes, mime.startsWith("image/") && !mime.endsWith("/*") ? mime : "image/jpeg");
        }

        BitmapFactory.Options opciones = new BitmapFactory.Options();
        opciones.inSampleSize = 1;
        while (lado / (opciones.inSampleSize * 2) >= LADO_MAX) opciones.inSampleSize *= 2;
        Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opciones);
        if (bmp == null) return error("formato");

        int giro = giroExif(bytes);
        if (giro != 0) {
            Matrix m = new Matrix();
            m.postRotate(giro);
            Bitmap girado = Bitmap.createBitmap(bmp, 0, 0, bmp.getWidth(), bmp.getHeight(), m, true);
            if (girado != bmp) bmp.recycle();
            bmp = girado;
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.JPEG, 90, out);
        bmp.recycle();
        return comoImagen(out.toByteArray(), "image/jpeg");
    }

    /** Las fotos de la cámara guardan «está girada» aparte de los píxeles. */
    private static int giroExif(byte[] bytes) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return 0;
        try (InputStream in = new ByteArrayInputStream(bytes)) {
            int o = new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (o == ExifInterface.ORIENTATION_ROTATE_90) return 90;
            if (o == ExifInterface.ORIENTATION_ROTATE_180) return 180;
            if (o == ExifInterface.ORIENTATION_ROTATE_270) return 270;
        } catch (IOException | RuntimeException e) {
            // sin datos de orientación: se deja como está
        }
        return 0;
    }

    /** La primera página del PDF como imagen: el lector de la app trabaja con imágenes. */
    private JSObject pdfAImagen(byte[] bytes) throws IOException {
        File tmp = File.createTempFile("compartido", ".pdf", getContext().getCacheDir());
        try {
            try (OutputStream out = new FileOutputStream(tmp)) {
                out.write(bytes);
            }
            try (ParcelFileDescriptor pfd = ParcelFileDescriptor.open(tmp, ParcelFileDescriptor.MODE_READ_ONLY);
                 PdfRenderer pdf = new PdfRenderer(pfd)) {
                if (pdf.getPageCount() < 1) return error("formato");
                PdfRenderer.Page pagina = pdf.openPage(0);
                try {
                    float escala = (float) ANCHO_PDF / Math.max(1, pagina.getWidth());
                    int ancho = ANCHO_PDF;
                    int alto = Math.max(1, Math.round(pagina.getHeight() * escala));
                    if (alto > ANCHO_PDF * 3) {          // una página larguísima
                        float achicar = (float) (ANCHO_PDF * 3) / alto;
                        ancho = Math.max(1, Math.round(ancho * achicar));
                        alto = ANCHO_PDF * 3;
                    }
                    Bitmap bmp = Bitmap.createBitmap(ancho, alto, Bitmap.Config.ARGB_8888);
                    bmp.eraseColor(Color.WHITE);      // el PDF no pinta el fondo
                    pagina.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
                    ByteArrayOutputStream out = new ByteArrayOutputStream();
                    bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
                    bmp.recycle();
                    return comoImagen(out.toByteArray(), "image/png");
                } finally {
                    pagina.close();
                }
            } catch (SecurityException e) {
                return error("protegido");   // PDF con contraseña
            }
        } finally {
            //noinspection ResultOfMethodCallIgnored
            tmp.delete();
        }
    }
}
