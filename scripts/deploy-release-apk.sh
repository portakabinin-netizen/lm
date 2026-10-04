#!/usr/bin/env bash
set -e

# Option 6: Build Release APK -> Install & Launch on ALL connected devices

# Ensure ADB is accessible (use environment variable or fallback)
ANDROID_HOME_UNIX="${ANDROID_HOME}"
if [[ "$ANDROID_HOME" == *":"* || "$ANDROID_HOME" == *"\\"* ]]; then
    ANDROID_HOME_UNIX=$(cygpath -u "$ANDROID_HOME")
fi

if [ -z "$ANDROID_HOME_UNIX" ]; then
    ANDROID_HOME_UNIX="/c/Hiresh/Android/Sdk"
fi

ADB="$ANDROID_HOME_UNIX/platform-tools/adb"
if [ ! -f "$ADB" ] && [ -f "${ADB}.exe" ]; then
    ADB="${ADB}.exe"
fi
if [ ! -f "$ADB" ]; then
    ADB="adb" # Fallback to PATH
fi

echo "=============================================="
echo "      RELEASE BUILD & DEPLOYMENT SCRIPT       "
echo "=============================================="
echo ""

echo "1. Restoring native build files..."
node restore-native.js
echo "✅ Native files restored."
echo ""

echo "2. Building Release APK via Gradle..."
cd android
./gradlew assembleRelease --no-daemon "-Dorg.gradle.jvmargs=-Xmx4096m"
cd ..
echo "✅ Release APK built successfully."
echo ""

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_PATH" ]; then
    echo "❌ ERROR: APK not found at $APK_PATH"
    exit 1
fi

echo "3. Detecting connected Android devices..."
# Get all connected devices with their states
device_list=$("$ADB" devices | tr -d '\r' | grep -v 'List of devices' | grep -v '^$' || true)

if [ -z "$device_list" ]; then
    echo "⚠️  No connected Android devices or emulators found!"
    echo "Please connect a device with USB Debugging enabled, or launch an emulator."
    exit 1
fi

# Pre-process: Try to reconnect wireless devices that are offline
while read -r line; do
    if [ -n "$line" ]; then
        dev_id=$(echo "$line" | tr -s ' ' '\t' | cut -f1)
        dev_state=$(echo "$line" | tr -s ' ' '\t' | cut -f2)
        if [ "$dev_state" = "offline" ] && [[ "$dev_id" == *":"* ]]; then
            echo "🔄 Wireless device $dev_id is offline. Attempting to reconnect..."
            "$ADB" connect "$dev_id" || true
            sleep 1
        fi
    fi
done <<< "$device_list"

# Refresh device list after reconnection attempts
device_list=$("$ADB" devices | tr -d '\r' | grep -v 'List of devices' | grep -v '^$' || true)

active_devices=()
skipped_devices=()
has_unauthorized=false
has_offline=false

while read -r line; do
    if [ -n "$line" ]; then
        dev_id=$(echo "$line" | tr -s ' ' '\t' | cut -f1)
        dev_state=$(echo "$line" | tr -s ' ' '\t' | cut -f2)
        
        if [ "$dev_state" = "device" ]; then
            active_devices+=("$dev_id")
        else
            skipped_devices+=("$dev_id ($dev_state)")
            if [ "$dev_state" = "unauthorized" ]; then
                echo "❌ Device $dev_id is UNAUTHORIZED!"
                echo "   👉 Please check your phone screen and tap 'Allow' on the USB Debugging prompt."
                has_unauthorized=true
            elif [ "$dev_state" = "offline" ]; then
                echo "❌ Device $dev_id is OFFLINE!"
                echo "   👉 Try toggling USB/Wireless debugging off and on, or reconnecting."
                has_offline=true
            else
                echo "⚠️  Device $dev_id is in state: $dev_state"
            fi
        fi
    fi
done <<< "$device_list"

if [ ${#active_devices[@]} -eq 0 ]; then
    echo ""
    echo "⚠️  No authorized, active Android devices found to install the APK."
    if [ "$has_unauthorized" = true ] || [ "$has_offline" = true ]; then
        echo "Please resolve the device state warnings above and run again."
    fi
    exit 1
fi

# Detect package name dynamically
PACKAGE_NAME=$(node -e "try{const a=require('./app.json');console.log(a.expo&&a.expo.android&&a.expo.android.package||a.expo.name||'')}catch(e){}" 2>/dev/null || true)
if [ -z "$PACKAGE_NAME" ]; then
    PACKAGE_NAME=$(grep applicationId android/app/build.gradle | head -1 | tr -d ' ' | cut -d'"' -f2 | tr -d "'" | tr -d '"' || true)
fi

if [ -z "$PACKAGE_NAME" ]; then
    PACKAGE_NAME="com.hibiz.app" # Fallback
fi

echo "📦 Package Name: $PACKAGE_NAME"
echo ""

echo "4. Installing and launching APK on active devices..."
for dev in "${active_devices[@]}"; do
    echo "🚀 Installing on device: $dev..."
    
    # Disable package verification on device (helps avoid blockages)
    "$ADB" -s "$dev" shell settings put global verifier_verify_adb_installs 0 2>/dev/null || true
    "$ADB" -s "$dev" shell settings put global package_verifier_enable 0 2>/dev/null || true
    
    # Try installing
    INSTALL_OUT=$("$ADB" -s "$dev" install -r "$APK_PATH" 2>&1 || true)
    echo "$INSTALL_OUT"
    if echo "$INSTALL_OUT" | grep -q "Failure"; then
        if echo "$INSTALL_OUT" | grep -q "INSTALL_FAILED_USER_RESTRICTED"; then
            echo ""
            echo "❌ ERROR: Installation restricted by the device!"
            echo "👉 For Xiaomi/MIUI/HyperOS devices:"
            echo "   1. Go to Settings -> Additional Settings -> Developer Options."
            echo "   2. Enable 'Install via USB' (requires Mi Account login on some models)."
            echo "   3. Also enable 'USB debugging (Security settings)' if present."
            echo "👉 For other devices: Ensure USB debugging and 'Install via USB' are enabled."
            echo ""
            exit 1
        fi
        
        echo "⚠️  Installation failed. This is usually caused by a signature mismatch with a previously installed app version."
        echo "🔄 Attempting to clean-uninstall the old version first..."
        "$ADB" -s "$dev" uninstall "$PACKAGE_NAME" || true
        echo "🚀 Retrying installation..."
        if ! "$ADB" -s "$dev" install -r "$APK_PATH"; then
            echo "❌ Installation failed again."
            exit 1
        fi
    fi
    
    echo "🏃 Running app on device: $dev..."
    # Launch via monkey or am start
    if ! "$ADB" -s "$dev" shell am start -n "$PACKAGE_NAME/.MainActivity" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER; then
        echo "⚠️  Failed to start MainActivity directly. Trying fallback launch via monkey..."
        "$ADB" -s "$dev" shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    fi
done

echo ""
if [ ${#skipped_devices[@]} -gt 0 ]; then
    echo "⚠️  Deployment completed with warnings:"
    echo "   - Successfully installed/launched on: ${active_devices[*]}"
    echo "   - Skipped offline/unauthorized devices: ${skipped_devices[*]}"
else
    echo "✅ APK successfully installed and launched on all connected devices!"
fi
echo ""
echo "Press Enter to close this window..."
read -r
