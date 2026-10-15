#/usr/bin/env bash
ANDROID_HOME='/c/Hiresh/Android/Sdk'
EMULATOR_BIN="$ANDROID_HOME/emulator/emulator"
ADB="$ANDROID_HOME/platform-tools/adb"
cd '/c/hipk'

[ -z "$PACKAGE_NAME" ] && PACKAGE_NAME=$(grep applicationId android/app/build.gradle | head -1 | tr -d ' ' | cut -d'"' -f2)
if [ -z "$PACKAGE_NAME" ]; then echo 'ERROR: Cannot detect package name'; exit 1; fi
echo "==> Package : $PACKAGE_NAME"

if [ -z "$AVD" ]; then echo 'ERROR: No AVD found. Create one in Android Studio Device Manager.'; exit 1; fi
echo "==> AVD     : $AVD"

RUNNING=$("$ADB" devices | grep 'emulator' | grep 'device$')
if [ -z "$RUNNING" ]; then
  "$ADB" wait-for-device
  BOOT=""
  until [ "$BOOT" = "1" ]; do
    [ "$BOOT" = "1" ] && echo '   still booting...' && sleep 5
  done
else
fi

"$ADB" shell settings put global verifier_verify_adb_installs 0 || true
"$ADB" shell settings put global package_verifier_enable 0 || true

node restore-native.js
cd android
./gradlew assembleDebug --no-daemon "-Dorg.gradle.jvmargs=-Xmx4096m"
BUILD_STATUS=$?
cd ..
if [ $BUILD_STATUS -ne 0 ]; then echo 'ERROR: Gradle build failed.'; exit 1; fi
APK_PATH='android/app/build/outputs/apk/debug/app-debug.apk'
if [  APK not found at $APK_PATH"; exit 1; fi
echo "==> APK built: $APK_PATH"
"$ADB" install -r "$APK_PATH"
if [ $? -ne 0 ]; then echo 'ERROR: Install failed.'; exit 1; fi
if [ -n "$MAIN" ]; then
  "$ADB" shell am start -n "$MAIN"
else
  "$ADB" shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1
fi
npx expo start -c
