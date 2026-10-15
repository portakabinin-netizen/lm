#!/usr/bin/env bash
set -e

# Ensure ADB is accessible (use environment variable or fallback)
ADB_PATH="${ADB_PATH:-adb}"
if [[ "$ADB_PATH" == *":"* ]]; then
    ADB_PATH=$(cygpath -u "$ADB_PATH")
fi

echo "=============================================="
echo "      ANDROID BUILD & DEPLOYMENT SCRIPT       "
echo "=============================================="
echo ""

echo "1. Restoring native build files..."
node restore-native.js
echo "✅ Native files restored."
echo ""

echo "2. Building debug APK via Gradle..."
cd android
./gradlew assembleDebug
cd ..
echo "✅ Debug APK built successfully."
echo ""

echo "3. Detecting connected Android devices..."
# Get all connected devices with their states
device_list=$("$ADB_PATH" devices | tr -d '\r' | grep -v 'List of devices' | grep -v '^$' || true)

if [ -z "$device_list" ]; then
    echo "⚠️  No connected Android devices or emulators found!"
    echo "Please connect a device with USB Debugging enabled, or launch an emulator."
else
    active_devices=()
    has_unauthorized=false
    has_offline=false

    while read -r line; do
        if [ -n "$line" ]; then
            dev_id=$(echo "$line" | tr -s ' ' '\t' | cut -f1)
            dev_state=$(echo "$line" | tr -s ' ' '\t' | cut -f2)
            
            if [ "$dev_state" = "device" ]; then
                active_devices+=("$dev_id")
            elif [ "$dev_state" = "unauthorized" ]; then
                echo "❌ Device $dev_id is UNAUTHORIZED!"
                echo "   👉 Please check your phone screen and tap 'Allow' on the USB Debugging prompt."
                has_unauthorized=true
            elif [ "$dev_state" = "offline" ]; then
                echo "❌ Device $dev_id is OFFLINE!"
                echo "   👉 Try toggling USB debugging off and on, or reconnecting the cable."
                has_offline=true
            else
                echo "⚠️  Device $dev_id is in state: $dev_state"
            fi
        fi
    done <<< "$device_list"

    if [ ${#active_devices[@]} -eq 0 ]; then
        echo ""
        echo "⚠️  No authorized, active Android devices found to install the APK."
        if [ "$has_unauthorized" = true ] || [ "$has_offline" = true ]; then
            echo "Please resolve the device state warnings above and run again."
        fi
    else
        echo "4. Installing and launching APK on active devices..."
        for dev in "${active_devices[@]}"; do
            echo "🚀 Installing on device: $dev..."
            # Try installing with replace and test flags
            if ! "$ADB_PATH" -s "$dev" install -r -t android/app/build/outputs/apk/debug/app-debug.apk; then
                echo "⚠️  Installation failed. This is usually caused by a signature mismatch with a previously installed app version."
                echo "🔄 Attempting to clean-uninstall the old version first..."
                "$ADB_PATH" -s "$dev" uninstall com.hibiz.app || true
                echo "🚀 Retrying installation..."
                "$ADB_PATH" -s "$dev" install -r -t android/app/build/outputs/apk/debug/app-debug.apk
            fi
            
            echo "🔄 Setting up port reverse for Metro server on device: $dev..."
            "$ADB_PATH" -s "$dev" reverse tcp:8081 tcp:8081
            
            echo "🏃 Running app on device: $dev..."
            # Standard launch command specifying activity, action, and category launcher
            "$ADB_PATH" -s "$dev" shell am start -n com.hibiz.app/.MainActivity -a android.intent.action.MAIN -c android.intent.category.LAUNCHER
        done
        echo "✅ APK successfully installed, port forwarded, and launched on all connected devices!"
        echo ""
        echo "💡 IMPORTANT: Since this is a Debug APK, it needs the Metro dev server to be running."
        echo "   Please make sure you have started the Metro server in another terminal window"
        echo "   using Option 5 in hipk.bat ('npx expo start -c') so the JS bundle can load."
    fi
fi

echo ""
echo "Press Enter to close this window..."
read -r
