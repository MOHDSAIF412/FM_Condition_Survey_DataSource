# Building the Android app

The Android app is the **same app as the web portal** — the exact React build,
wrapped with [Capacitor](https://capacitorjs.com) so it installs as a real APK
and runs fully offline on site.

Nothing was rewritten. `android/` is a thin native shell around `dist/`.

---

## What you need to install once

| Tool | Version | Where |
| --- | --- | --- |
| JDK | **17** | Bundled with Android Studio, or [Temurin 17](https://adoptium.net/temurin/releases/?version=17) |
| Android Studio | latest | <https://developer.android.com/studio> |
| Android SDK | API 36 | Installed via Android Studio's SDK Manager |

In Android Studio: **More Actions → SDK Manager → SDK Platforms**, tick
**Android API 36**, then **SDK Tools → Android SDK Build-Tools**. Apply.

Then set `JAVA_HOME` and `ANDROID_HOME`, or just build from inside Android
Studio, which sets them for you.

---

## Build a debug APK (for testing on your own phones)

```bash
npm run android:build
```

That runs the web build, copies it into the native project, and produces:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Copy that file to a phone and open it. You'll need to allow
*Install unknown apps* for whichever app you used to transfer it.

## Run on a connected phone

Enable **Developer options → USB debugging** on the phone, plug it in, then:

```bash
npm run android:open
```

Android Studio opens the project — press the green **Run** button.

---

## Build a release APK / AAB (for the Play Store)

### 1. Create a signing key — once, and never lose it

```bash
keytool -genkey -v -keystore fm-survey-release.keystore -alias fm-survey -keyalg RSA -keysize 2048 -validity 10000
```

> **Back this file and its passwords up somewhere safe.** If you lose the
> keystore you can never publish an update to the same Play Store listing —
> you'd have to ship a brand new app and lose all installs. `.gitignore`
> deliberately blocks `*.keystore` and `keystore.properties` from being
> committed, because this repository is public.

### 2. Point Gradle at it

Create `android/keystore.properties` (already gitignored):

```properties
storeFile=../fm-survey-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=fm-survey
keyPassword=YOUR_KEY_PASSWORD
```

Then add the signing config to `android/app/build.gradle` — Android Studio's
**Build → Generate Signed Bundle / APK** wizard will do this for you.

### 3. Build

```bash
cd android && ./gradlew bundleRelease
```

Output: `android/app/build/outputs/bundle/release/app-release.aab` — that's the
file the Play Console wants.

---

## After you change any app code

The native project holds a **copy** of the web build, so it does not update
itself. After editing anything in `src/`:

```bash
npm run android:sync
```

Then rebuild. Forgetting this is the single most common reason an APK still
shows old behaviour.

---

## What differs from the web portal

Everything looks and behaves identically, with one necessary change under the
hood:

**File saving.** A browser downloads reports through an `<a download>` link.
That link does nothing inside an Android WebView — it fails silently. So on
Android the PDF, Excel and JSON backup are written to the app's own storage and
handed to the system **share sheet**, letting you send them to WhatsApp, email,
Drive or Files. See `src/utils/fileSaver.js`; the browser path is unchanged.

**Camera.** The photo buttons use standard `<input type="file">`. Capacitor
routes these to the system camera and photo picker. The app deliberately does
**not** declare `android.permission.CAMERA`: without that declaration Android
lets the system camera app handle the capture with no runtime permission
prompt, which is simpler and asks the surveyor for less.

**Storage location.** Reports are written to app-scoped external storage
(`Directory.External`), not the public Documents folder — scoped storage on
Android 11+ blocks writes to public Documents, so that path would fail on any
modern phone.

---

## Where data lives

Unchanged from the web app: everything is in the WebView's **IndexedDB**, on
that phone. There is no server and no database.

Uninstalling the app deletes all surveys. Export the PDF/Excel, or take a JSON
backup, before uninstalling or clearing app data.

One genuine improvement over the web portal: the 7-day Safari storage eviction
does not apply, and Android will not clear an installed app's data on its own.
