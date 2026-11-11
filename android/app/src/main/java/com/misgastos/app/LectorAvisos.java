package com.misgastos.app;

import android.app.Notification;
import android.content.Context;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.regex.Pattern;

/**
 * Lee las notificaciones de las billeteras y bancos para detectar
 * transferencias y pagos (Premium, y sólo si la persona lo activó y le dio
 * el permiso de «Acceso a notificaciones» en los ajustes del sistema).
 *
 * Qué mira y qué no:
 *  · Sólo las apps de la lista que le pasa la app (Mercado Pago, Ualá,
 *    bancos…). Los avisos de WhatsApp, del correo o de cualquier otra app
 *    ni se leen.
 *  · De esas apps, sólo los avisos que traen un importe ("$ 3.000").
 *  · Lo que encuentra queda en el teléfono, en una cola privada
 *    (ColaAvisos) hasta que la app lo procesa. No se envía a ningún lado.
 *
 * Acá no se interpreta nada: qué es un ingreso, qué un egreso y qué una
 * promoción lo decide detectar.js, que se puede probar sin teléfono.
 */
public class LectorAvisos extends NotificationListenerService {

    private static final Pattern PLATA =
        Pattern.compile("(US\\$|U\\$S|U\\$D|USD|ARS|\\$)\\s{0,2}\\d", Pattern.CASE_INSENSITIVE);

    @Override
    public void onListenerConnected() {
        // Lo que llegó mientras el servicio no estaba conectado (recién
        // activado, o después de reiniciar el teléfono) sigue en la barra.
        try {
            StatusBarNotification[] activas = getActiveNotifications();
            if (activas == null) return;
            for (StatusBarNotification sbn : activas) mirar(sbn);
        } catch (RuntimeException e) {
            // el sistema puede negarlo si justo se está desconectando
        }
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        mirar(sbn);
    }

    private static String texto(CharSequence s) {
        return s == null ? "" : s.toString().trim();
    }

    private void mirar(StatusBarNotification sbn) {
        try {
            if (sbn == null) return;
            Context c = getApplicationContext();
            String paquete = sbn.getPackageName();
            if (!ColaAvisos.interesa(c, paquete)) return;

            Notification n = sbn.getNotification();
            if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            Bundle extras = n.extras;
            if (extras == null) return;

            String titulo = texto(extras.getCharSequence(Notification.EXTRA_TITLE));
            CharSequence largo = extras.getCharSequence(Notification.EXTRA_BIG_TEXT);
            String cuerpo = texto(largo != null ? largo : extras.getCharSequence(Notification.EXTRA_TEXT));
            if (!PLATA.matcher(titulo + " " + cuerpo).find()) return;

            if (ColaAvisos.agregar(c, paquete, sbn.getKey(), sbn.getPostTime(), titulo, cuerpo)) {
                LectorPlugin.hayNuevo();
            }
        } catch (RuntimeException e) {
            // Un aviso con datos raros no puede tirar abajo el servicio.
        }
    }
}
