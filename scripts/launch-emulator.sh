#!/bin/bash
# Waits for the Android emulator to be fully booted.

ADB_PATH="${ADB_PATH:-adb}"
if [[ "$ADB_PATH" == *":"* ]]; then
    ADB_PATH=$(cygpath -u "$ADB_PATH")
fi

echo ""
echo ">>> Waiting for emulator to appear in adb..."

# Poll until an emulator shows up
while true; do
    DEVICE=$("$ADB_PATH" devices 2>/dev/null | grep "^emulator.*device$" | awk '{print $1}' | head -1)
    if [ -n "$DEVICE" ]; then
        export ANDROID_SERIAL="$DEVICE"
        export ADB_PATH="$ADB_PATH"
        break
    fi
    echo "    ... waiting for emulator (retrying in 3s)"
    sleep 3
done

echo ">>> Emulator found: $DEVICE"
echo ">>> Waiting for Android to fully boot..."

BOOT_DONE=""
while [ "$BOOT_DONE" != "1" ]; do
    sleep 3
    BOOT_DONE=$("$ADB_PATH" -s "$DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
done

echo ""
echo "================================================"
echo "  EMULATOR IS READY!"
echo "================================================"
echo ""

exit 0
