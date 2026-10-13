# Android: build, install, and release

## What is included

- App ID: `com.freekickmaster.game`
- Version 2.0, versionCode 2; fullscreen HUD / selectable takers edition.
- Native Capacitor 7 Android host with an accelerated WebGL 2 / Three.js game.
- Every runtime font, credited player portrait, crowd texture, texture-generation routine, scene, sound routine, and JS module is bundled in `assets/public` by `npm run android:sync`.
- Immersive **sensor-landscape** play, display kept awake while the activity is active, Android back-button pause/settings, pause on background, optional native haptics.
- Original adaptive/legacy icons and splash art. `scripts/generate-icons.py` regenerates PNG assets with Pillow.
- No remote `server.url`, localhost API dependency, user account, ads, or analytics.
- Nominal minimum Android 6 (API 23); target and compile SDK 35. A WebView supporting **WebGL 2 and ES2022** is required. Modern Android 10+ hardware is recommended; an old or disabled System WebView can prevent the game from loading even when the OS meets the minimum SDK.

## Obtain the automated build

1. Open the repository's **Actions → Android APK** workflow.
2. Choose a successful run for the branch/version you want.
3. Download the `Free-Kick-Master-Android` artifact and unzip it. Actions artifacts may require a GitHub login.
4. Verify `SHA256SUMS.txt` if desired.
5. Transfer `Free-Kick-Master-debug.apk` to the phone and open it. Android may request permission for your file manager/browser to install unknown apps. This is Android's normal sideload prompt; do not disable Play Protect.
6. Alternatively, use `adb install -r Free-Kick-Master-debug.apk` on a device with USB debugging explicitly enabled.

This is a **debug-signed testing APK**, not a Play Store release. Each fresh CI runner may use a different generated debug key. If Android reports a signature mismatch when updating a previous testing build, uninstall that build first (local preferences/bests will be lost), or use a stable private signing key for release builds.

Artifacts expire after 30 days. Re-run the workflow to create a fresh build. A successful Gradle compile is not a substitute for testing on a physical Android device.

## Build on your machine

Install Node.js 22, Java/JDK **21**, Android Studio, SDK platform **35**, current Android build tools, and platform tools. Accept SDK licences through Android Studio or `sdkmanager --licenses`.

```bash
npm ci
npm run check
npm run android:sync
npm run android:open
```

In Android Studio, allow Gradle to sync, then use **Build APK(s)** or run on a connected phone. For the CLI:

```bash
# Set ANDROID_HOME to your installed SDK directory (or use android/local.properties).
# JAVA_HOME must point to JDK 21.
npm run android:apk
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`.

The generated/copied web assets, SDK paths, Gradle cache, APKs, and signing files are intentionally ignored. Always run `npm run android:sync` after changing web source before building an APK. Do not point the installed app at a development server.

## Release signing

Use Android Studio **Generate Signed Bundle / APK** and create/store a private release keystore securely. Never commit `.jks`, `.keystore`, passwords, or `local.properties`. For CI signing, supply encrypted GitHub secrets and configure a separate release job; the included workflow intentionally requires no signing secrets.

Use an APK for direct installation; use a signed AAB and the store's then-current target-API requirements for Play distribution. The project currently targets API 35; verify store policy before publishing.

## Device checklist

- Fresh install launches without a development server or network connection.
- Landscape works in both orientations; transient system bars can be shown with an edge swipe.
- Open Settings for the pitch map; change players through the HUD card; verify real photos still display in airplane mode.
- Touch the ball contact marker; hold/release power without browser scrolling.
- Leave the app during a charge/run-up/flight; return without an accidental shot or time jump.
- Test every goalkeeper level, wall count, corner, power range, and a replay.
- Verify all 5 challenge attempts and the completion screen.
- Test all three lighting modes and both adaptive-resolution states; check that the performance monitor reports real values.
- Test **Balanced** / **Performance** graphics on weaker GPUs. Performance disables expensive shadow maps and limits render resolution.
- Test native haptics and audio after the first user gesture.
- Back opens Settings (or closes the open dialog); Home backgrounds the app.

## Troubleshooting

- **No Java / SDK in the build environment:** use the included GitHub Actions workflow or an Android Studio workstation. No APK can be honestly claimed to have compiled without a successful Gradle build.
- **Graphics unavailable:** update Android System WebView/Chrome and verify WebGL 2 support. Emulators may need hardware/SwiftShader graphics.
- **Low frame rate:** select Performance in Settings. The physics uses a fixed step; graphics settings do not change the physical rules.
- **INSTALL_FAILED_UPDATE_INCOMPATIBLE:** debug signing keys differ; see above.
- **White screen after a source change:** rebuild and sync; never package an empty/stale `dist` directory.
