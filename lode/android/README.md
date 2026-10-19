# lode

The magnetic field around your phone, drawn on your phone.

lode reads the phone's magnetometer (calibrated and raw), plus its orientation, and draws the field as flowing lines through a drawing of the phone, as a trail in field space, or as a ribbon unrolled through time.

**Install:** [download the latest lode.apk](https://github.com/Oppositecity/lode/releases/latest/download/lode.apk) on an Android phone and open it.

Web version with phyphox import: [opposite.city/lode](https://opposite.city/lode/)

## Layout

- `app/src/main/java/city/opposite/lode/MainActivity.java`: reads the sensors and hands batches of readings to the page
- `app/src/main/assets/index.html`: everything you see
- `.github/workflows/build.yml`: builds and signs the apk on every push and publishes it as a release

Each sample passed to the page is 14 numbers: time, calibrated x y z, raw x y z, the phone's own field (bias) x y z, and the orientation quaternion x y z w.
