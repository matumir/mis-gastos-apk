package com.misgastos.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Los plugins propios se anotan antes de que arranque el puente.
        registerPlugin(LectorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
