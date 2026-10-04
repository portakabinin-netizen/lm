#!/bin/bash
# Option 7: Build APK → Start Emulator → Start Metro → Install & Launch
# Fix: Metro must be running BEFORE the app launches to avoid "Unable to load script"

ADB="C:/Hiresh/Android/Sdk/platform-tools/adb.exe"
EMULATOR="C:/Hiresh/Android/Sdk/emulator/emulator.exe"
AVD="Pixel_8"
PROJECT="/c/hipk"
APK="$PROJECT/android/app/build/outputs/apk/debug/app-debug.apk"
PACKAGE="com.hibiz.app"
ACTIVITY="com.hibiz.app/.MainActivity"

cd "$PROJECT"

# ── helper: wait until device is truly online ──────────────────────────────
wait_online() {
    local dev="$1" label="$2" max="${3:-50}"
    printf "  Waiting for device to stabilize (%s)..." "$label"
    for i in $(seq 1 $max); do
        ST=$("$ADB" -s "$dev" get-state 2>/dev/null | tr -d '\r')
        if [ "$ST" = "device" ]; then
            printf " OK\n"
            return 0
        fi
        printf "."
        sleep 2
    done
    printf "\n  Forcing final wait..."
    "$ADB" -s "$dev" wait-for-device
    printf " OK\n"
}

# ── helper: wait until Metro port 8081 is accepting connections ────────────
wait_metro() {
    local max="${1:-60}"
    printf "  Waiting for Metro to be ready on port 8081..."
    for i in $(seq 1 $max); do
        # Try connecting to Metro status endpoint
        if curl -s --max-time 1 "http://localhost:8081/status" 2>/dev/null | grep -q "packager-status:running" 2>/dev/null; then
            printf " OK (Metro ready)\n"
            return 0
        fi
        # Fallback: check if port 8081 is open via netcat/bash /dev/tcp
        if (echo > /dev/tcp/localhost/8081) 2>/dev/null; then
            printf " OK (port open)\n"
            return 0
        fi
        printf "."
        sleep 2
    done
    printf "\n  WARNING: Metro may not be fully ready, proceeding anyway...\n"
}

# ══════════════════════════════════════════════════════════════
#  STEP 1: Build APK  (emulator NOT running → 100% CPU/RAM)
# ══════════════════════════════════════════════════════════════
echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  [1/5] Building Debug APK               │"
echo "└─────────────────────────────────────────┘"

node restore-native.js || { echo "ERROR: restore-native.js failed"; exit 1; }

cd android
./gradlew assembleDebug --no-daemon -Dorg.gradle.jvmargs='-Xmx4096m' \
  || { echo "ERROR: Gradle build failed"; exit 1; }
./gradlew --stop >/dev/null 2>&1 || true
cd ..

[ -f "$APK" ] || { echo "ERROR: APK not found: $APK"; exit 1; }
echo "✓ APK ready"

# ══════════════════════════════════════════════════════════════
#  STEP 2: Start Metro Bundler FIRST (background)
#  The app MUST be able to reach Metro when it launches.
# ══════════════════════════════════════════════════════════════
echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  [2/5] Starting Metro Bundler           │"
echo "└─────────────────────────────────────────┘"

# Kill any stale Metro on 8081 before starting a fresh one
if (echo > /dev/tcp/localhost/8081) 2>/dev/null; then
    echo "  Port 8081 already in use — killing old process..."
    # Try to kill via PID (Windows-compatible fallback)
    METRO_PID=$(netstat -ano 2>/dev/null | grep ":8081 " | grep "LISTENING" | awk '{print $NF}' | head -1)
    [ -n "$METRO_PID" ] && taskkill //F //PID "$METRO_PID" >/dev/null 2>&1 || true
    sleep 2
fi

# Start Metro in the background, log to file
METRO_LOG="$PROJECT/scripts/metro.log"
> "$METRO_LOG"
npx expo start --port 8081 2>&1 | tee "$METRO_LOG" &
METRO_PID=$!
disown $METRO_PID
echo "  Metro PID: $METRO_PID (log: scripts/metro.log)"

# Wait until Metro is accepting connections before proceeding
wait_metro 90

# ══════════════════════════════════════════════════════════════
#  STEP 3: Start emulator
# ══════════════════════════════════════════════════════════════
echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  [3/5] Starting Emulator: $AVD          │"
echo "└─────────────────────────────────────────┘"

# Clean stale locks that cause silent launch failures
USERPROFILE_UNIX=$(cygpath -u "$USERPROFILE" 2>/dev/null || echo "$USERPROFILE")
rm -rf "${USERPROFILE_UNIX}/.android/avd/${AVD}.avd/hardware-qemu.ini.lock" 2>/dev/null || true
rm -f  "${USERPROFILE_UNIX}/.android/avd/${AVD}.avd/multiinstance.lock"     2>/dev/null || true

# Launch emulator detached (disown keeps it alive after script ends)
"$EMULATOR" -avd "$AVD" -no-snapshot-save -no-boot-anim > "$PROJECT/scripts/emulator.log" 2>&1 &
EMUL_PID=$!
disown $EMUL_PID
echo "  Emulator PID: $EMUL_PID"

# Wait for device serial to appear in adb
"$ADB" start-server >/dev/null 2>&1
echo "  Waiting for device..."
while true; do
    DEVICE=$("$ADB" devices 2>/dev/null | grep "^emulator.*device$" | awk '{print $1}' | head -1)
    [ -n "$DEVICE" ] && break
    sleep 3
done
echo "✓ Device: $DEVICE"

# Wait for Android boot_completed
echo "  Waiting for boot..."
while true; do
    BOOT=$("$ADB" -s "$DEVICE" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    [ "$BOOT" = "1" ] && break
    sleep 3
done

# Wait until ABI readable = post-boot ADB reconnect has settled
echo "  Waiting for stability..."
for i in $(seq 1 30); do
    ST=$("$ADB" -s "$DEVICE" get-state 2>/dev/null | tr -d '\r')
    if [ "$ST" = "device" ]; then
        ABI=$("$ADB" -s "$DEVICE" shell getprop ro.product.cpu.abilist 2>/dev/null | tr -d '\r')
        if [ -n "$ABI" ]; then
            echo "✓ Stable — ABI: $ABI"
            break
        fi
    fi
    echo "    attempt $i/30..."
    sleep 3
done
sleep 5   # extra buffer for package manager

# ══════════════════════════════════════════════════════════════
#  STEP 4: Install APK
# ══════════════════════════════════════════════════════════════
echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  [4/5] Installing APK                   │"
echo "└─────────────────────────────────────────┘"

# Disable package verifier to prevent INSTALL_FAILED_VERIFICATION_FAILURE
echo "  Disabling package verification on emulator..."
"$ADB" -s "$DEVICE" shell settings put global verifier_verify_adb_installs 0 || true
"$ADB" -s "$DEVICE" shell settings put global package_verifier_enable 0 || true

# Set up reverse port BEFORE app launches (emulator → host Metro)
echo "  Setting up adb reverse tcp:8081 tcp:8081..."
"$ADB" -s "$DEVICE" reverse tcp:8081 tcp:8081

# cygpath -w → Windows path (C:\…) needed when MSYS_NO_PATHCONV=1 is active
APK_WIN=$(cygpath -w "$APK" 2>/dev/null \
  || echo "C:\\hipk\\android\\app\\build\\outputs\\apk\\debug\\app-debug.apk")

echo "  Uninstalling old version..."
"$ADB" -s "$DEVICE" uninstall "$PACKAGE" 2>/dev/null || true
sleep 1

# Push to /data/local/tmp/ — pm install needs this location (not /sdcard/ FUSE)
# MSYS_NO_PATHCONV=1 stops Git Bash converting /data/local/tmp/ → Windows path
echo "  Pushing APK → /data/local/tmp/..."
PUSH_OUT=$(MSYS_NO_PATHCONV=1 "$ADB" -s "$DEVICE" push \
  "$APK_WIN" "/data/local/tmp/app-debug.apk" 2>&1) || true
echo "$PUSH_OUT"
if ! echo "$PUSH_OUT" | grep -q "pushed"; then
    echo "ERROR: Push failed — no 'pushed' in output"
    exit 1
fi

# Install — quote the shell command so MSYS won't touch the on-device path
echo "  Running pm install..."
MSYS_NO_PATHCONV=1 "$ADB" -s "$DEVICE" shell \
  "pm install -t /data/local/tmp/app-debug.apk"
INSTALL_RC=$?
MSYS_NO_PATHCONV=1 "$ADB" -s "$DEVICE" shell \
  "rm -f /data/local/tmp/app-debug.apk" 2>/dev/null || true

if [ $INSTALL_RC -ne 0 ]; then
    echo "ERROR: pm install failed (exit $INSTALL_RC)"
    exit 1
fi
echo "✓ Installed"

# Give the device a few seconds to begin compiling/optimizing or drop offline
sleep 5

# Device may briefly drop offline after first install — wait for reconnect
wait_online "$DEVICE" "post-install" 40
sleep 2

# ══════════════════════════════════════════════════════════════
#  STEP 5: Launch app
# ══════════════════════════════════════════════════════════════
echo ""
echo "┌─────────────────────────────────────────┐"
echo "│  [5/5] Launching App                    │"
echo "└─────────────────────────────────────────┘"

# Re-confirm reverse tunnel is active (may drop after install reboot)
"$ADB" -s "$DEVICE" reverse tcp:8081 tcp:8081

"$ADB" -s "$DEVICE" shell \
  am start -n "$ACTIVITY" -a android.intent.action.MAIN -c android.intent.category.LAUNCHER

echo ""
echo "┌─────────────────────────────────────────────────────┐"
echo "│  ✓ App launched on $DEVICE                         │"
echo "│  Metro is running in background (PID: $METRO_PID)  │"
echo "│  Metro log: scripts/metro.log                       │"
echo "│  Press Ctrl+C to stop Metro bundler                 │"
echo "└─────────────────────────────────────────────────────┘"

# Keep script alive so Metro (background child) continues to run
# and the terminal stays open for the user to see output
wait $METRO_PID 2>/dev/null
exec bash
