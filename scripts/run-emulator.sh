#!/bin/bash
# Builds and installs the debug app on the running emulator.
# Waits for the emulator to be fully booted before starting the build.

cd /c/hipk

ADB_PATH="${ADB_PATH:-adb}"
if [[ "$ADB_PATH" == *":"* ]]; then
    ADB_PATH=$(cygpath -u "$ADB_PATH")
fi

echo ""
echo ">>> Waiting for emulator to be online and fully booted..."

# Wait until adb sees at least one emulator
while true; do
    DEVICE=$("$ADB_PATH" devices 2>/dev/null | grep "^emulator.*device$" | awk '{print $1}' | head -1)
    if [ -n "$DEVICE" ]; then break; fi
    echo "    ... no emulator yet, retrying in 3s"
    sleep 3
done

echo ">>> Emulator found: $DEVICE. Waiting for full boot..."

# Wait for sys.boot_completed = 1
BOOT_DONE=""
while [ "$BOOT_DONE" != "1" ]; do
    sleep 3
    BOOT_DONE=$("$ADB_PATH" -s "$DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
done

echo ">>> Waiting for Package Manager to start..."
while true; do
    if "$ADB_PATH" -s "$DEVICE" shell pm path android >/dev/null 2>&1; then
        break
    fi
    sleep 2
done

# Wait a moment for the system to stabilize
sleep 5

# Disable package verifier to prevent INSTALL_FAILED_VERIFICATION_FAILURE
echo ">>> Disabling package verification on emulator..."
"$ADB_PATH" -s "$DEVICE" shell settings put global verifier_verify_adb_installs 0 || true
"$ADB_PATH" -s "$DEVICE" shell settings put global package_verifier_enable 0 || true

echo ">>> Emulator is fully booted! Starting build..."
echo ""

# Get AVD Name to pass to expo run:android
AVD_NAME=$("$ADB_PATH" -s "$DEVICE" shell getprop ro.boot.qemu.avd_name 2>/dev/null | tr -d '\r')
if [ -n "$AVD_NAME" ]; then
    echo ">>> AVD Name detected: $AVD_NAME"
    TARGET_DEVICE="$AVD_NAME"
else
    echo ">>> Could not detect AVD name. Falling back to ID: $DEVICE"
    TARGET_DEVICE="$DEVICE"
fi

# Kill any existing Metro process on port 8081
echo ">>> Checking port 8081..."
PID_8081=$(netstat -ano 2>/dev/null | grep ":8081 " | grep "LISTENING" | awk '{print $5}' | head -1)
if [ -n "$PID_8081" ]; then
    echo ">>> Port 8081 in use by PID $PID_8081 — killing it..."
    taskkill //F //PID "$PID_8081" > /dev/null 2>&1 || true
    sleep 1
else
    echo ">>> Port 8081 is free."
fi
echo ">>> Running: node restore-native.js && npx expo run:android -d $TARGET_DEVICE"
echo ""

node restore-native.js && npx expo run:android -d "$TARGET_DEVICE"

echo ""
echo "================================================"
echo "  BUILD/INSTALL COMPLETE (or failed above)."
echo "  This tab will stay open - press Ctrl+C to exit."
echo "================================================"
echo ""

exec bash
