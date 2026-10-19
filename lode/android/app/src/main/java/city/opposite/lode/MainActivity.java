package city.opposite.lode;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;

public class MainActivity extends Activity implements SensorEventListener {

    private WebView web;
    private SensorManager sm;
    private Sensor mag, magRaw, rot;
    private final Object lock = new Object();
    private final StringBuilder buf = new StringBuilder();
    private final float[] q = {0f, 0f, 0f, 1f};
    private final float[] raw = {0f, 0f, 0f, 0f, 0f, 0f};
    private long t0 = 0;
    private volatile int accuracy = -1;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        web.addJavascriptInterface(new Bridge(), "LodeNative");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");

        sm = (SensorManager) getSystemService(SENSOR_SERVICE);
        mag = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
        magRaw = sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED);
        rot = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (mag != null) sm.registerListener(this, mag, SensorManager.SENSOR_DELAY_FASTEST);
        if (magRaw != null) sm.registerListener(this, magRaw, SensorManager.SENSOR_DELAY_FASTEST);
        if (rot != null) sm.registerListener(this, rot, SensorManager.SENSOR_DELAY_GAME);
    }

    @Override
    protected void onPause() {
        super.onPause();
        sm.unregisterListener(this);
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        int type = e.sensor.getType();
        if (type == Sensor.TYPE_ROTATION_VECTOR) {
            float x = e.values[0], y = e.values[1], z = e.values[2];
            float w = e.values.length > 3 ? e.values[3] : (float) Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z));
            synchronized (lock) { q[0] = x; q[1] = y; q[2] = z; q[3] = w; }
        } else if (type == Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED) {
            synchronized (lock) { System.arraycopy(e.values, 0, raw, 0, Math.min(6, e.values.length)); }
        } else if (type == Sensor.TYPE_MAGNETIC_FIELD) {
            synchronized (lock) {
                if (t0 == 0) t0 = e.timestamp;
                if (buf.length() > 400000) buf.setLength(0);
                buf.append((e.timestamp - t0) / 1e9).append(',')
                   .append(e.values[0]).append(',').append(e.values[1]).append(',').append(e.values[2]).append(',')
                   .append(raw[0]).append(',').append(raw[1]).append(',').append(raw[2]).append(',')
                   .append(raw[3]).append(',').append(raw[4]).append(',').append(raw[5]).append(',')
                   .append(q[0]).append(',').append(q[1]).append(',').append(q[2]).append(',').append(q[3]).append(';');
            }
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int acc) {
        if (sensor.getType() == Sensor.TYPE_MAGNETIC_FIELD) accuracy = acc;
    }

    private class Bridge {
        @JavascriptInterface
        public String drain() {
            synchronized (lock) {
                String out = buf.toString();
                buf.setLength(0);
                return out;
            }
        }

        @JavascriptInterface
        public int accuracy() {
            return accuracy;
        }

        @JavascriptInterface
        public String sensor() {
            if (mag == null) return "";
            int us = mag.getMinDelay();
            String rate = us > 0 ? Math.round(1e6 / us) + " Hz max" : "";
            return mag.getName() + "|" + rate + "|" + (magRaw != null) + "|" + (rot != null);
        }

        @JavascriptInterface
        public void shareApp() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, "lode: the magnetic field around your phone https://opposite.city/lode/");
                startActivity(Intent.createChooser(i, "share lode"));
            });
        }
    }
}
