package com.misgastos.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Los avisos de billeteras que todavía no leyó la app.
 *
 * El servicio que escucha las notificaciones (LectorAvisos) corre aunque la
 * app esté cerrada, así que deja acá lo que encuentra y la app lo levanta
 * la próxima vez que se abre. Se guarda en las preferencias privadas de la
 * app: no sale del teléfono y se borra en cuanto la app lo procesa.
 */
final class ColaAvisos {
    private static final String PREFS = "lector_avisos";
    private static final String K_ACTIVO = "activo";
    private static final String K_PAQUETES = "paquetes";
    private static final String K_COLA = "cola";
    private static final String K_VISTOS = "vistos";
    private static final String K_SIGUIENTE = "siguiente";

    private static final int MAX_COLA = 200;
    private static final int MAX_VISTOS = 300;
    /** Una app puede publicar dos veces el mismo aviso (lo actualiza). */
    private static final long VENTANA_REPETIDO = 60_000L;

    private ColaAvisos() {}

    private static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized boolean activo(Context c) {
        return prefs(c).getBoolean(K_ACTIVO, false);
    }

    static synchronized void configurar(Context c, boolean activo, Set<String> paquetes) {
        SharedPreferences.Editor e = prefs(c).edit().putBoolean(K_ACTIVO, activo);
        if (paquetes != null) e.putStringSet(K_PAQUETES, new HashSet<>(paquetes));
        if (!activo) e.remove(K_COLA);
        e.apply();
    }

    /** ¿Hay que mirar los avisos de esta app? */
    static synchronized boolean interesa(Context c, String paquete) {
        SharedPreferences p = prefs(c);
        if (paquete == null || !p.getBoolean(K_ACTIVO, false)) return false;
        Set<String> paquetes = p.getStringSet(K_PAQUETES, null);
        return paquetes != null && paquetes.contains(paquete);
    }

    private static JSONArray arreglo(SharedPreferences p, String clave) {
        try {
            return new JSONArray(p.getString(clave, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static JSONArray ultimos(JSONArray a, int max) {
        if (a.length() <= max) return a;
        JSONArray corto = new JSONArray();
        for (int i = a.length() - max; i < a.length(); i++) corto.put(a.opt(i));
        return corto;
    }

    /**
     * Suma un aviso a la cola. Devuelve false si ya estaba: el mismo aviso
     * (misma clave y hora) que el sistema vuelve a entregar al reconectar
     * el servicio, o el mismo texto publicado de nuevo en el mismo minuto.
     */
    static synchronized boolean agregar(Context c, String paquete, String clave, long cuando,
                                        String titulo, String texto) {
        SharedPreferences p = prefs(c);
        String huella = paquete + "|" + clave + "|" + cuando;
        String contenido = paquete + "|" + (titulo + "\n" + texto).hashCode();

        JSONArray vistos = arreglo(p, K_VISTOS);
        for (int i = 0; i < vistos.length(); i++) {
            JSONObject v = vistos.optJSONObject(i);
            if (v == null) continue;
            if (huella.equals(v.optString("h"))) return false;
            if (contenido.equals(v.optString("c")) && Math.abs(cuando - v.optLong("t")) < VENTANA_REPETIDO) return false;
        }

        long id = p.getLong(K_SIGUIENTE, 1L);
        JSONArray cola = arreglo(p, K_COLA);
        try {
            JSONObject visto = new JSONObject();
            visto.put("h", huella);
            visto.put("c", contenido);
            visto.put("t", cuando);
            vistos.put(visto);

            JSONObject item = new JSONObject();
            item.put("id", id);
            item.put("paquete", paquete);
            item.put("titulo", titulo);
            item.put("texto", texto);
            item.put("cuando", cuando);
            cola.put(item);
        } catch (JSONException e) {
            return false;
        }

        p.edit()
            .putString(K_COLA, ultimos(cola, MAX_COLA).toString())
            .putString(K_VISTOS, ultimos(vistos, MAX_VISTOS).toString())
            .putLong(K_SIGUIENTE, id + 1)
            .apply();
        return true;
    }

    static synchronized JSONArray leer(Context c) {
        return arreglo(prefs(c), K_COLA);
    }

    /** Saca de la cola lo que la app ya procesó (todo hasta ese id). */
    static synchronized void borrarHasta(Context c, long hasta) {
        SharedPreferences p = prefs(c);
        JSONArray cola = arreglo(p, K_COLA);
        JSONArray queda = new JSONArray();
        for (int i = 0; i < cola.length(); i++) {
            JSONObject item = cola.optJSONObject(i);
            if (item != null && item.optLong("id") > hasta) queda.put(item);
        }
        p.edit().putString(K_COLA, queda.toString()).apply();
    }
}
