@echo off
setlocal enabledelayedexpansion
title Build Tool - APK + GitHub + GitLab

REM ================================================================
REM  CONFIG
REM ================================================================
set "WIN_DIR=C:\hipk"
set "TARGET_DIR=/c/hipk"
set "ANDROID_HOME=C:\Hiresh\Android\Sdk"
set "ANDROID_HOME_BASH=/c/Hiresh/Android/Sdk"
set "PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%"
set "SCRIPTS_WIN=%WIN_DIR%\.bat_scripts"
set "SCRIPTS_BASH=/c/hipk/.bat_scripts"

REM ── GitLab backend data folder ──────────────────────────────────
set "GITLAB_DIR_WIN=C:\Users\herry\Dropbox\backend-GitLab"
set "GITLAB_DIR_BASH=/c/Users/herry/Dropbox/backend-GitLab"

REM ── Locate Git Bash ─────────────────────────────────────────────
set "BASH_CMD=C:\Program Files\Git\bin\bash.exe"
if exist "%LocalAppData%\Programs\Git\bin\bash.exe" set "BASH_CMD=%LocalAppData%\Programs\Git\bin\bash.exe"
if exist "%ProgramFiles%\Git\bin\bash.exe"          set "BASH_CMD=%ProgramFiles%\Git\bin\bash.exe"
if exist "C:\Program Files\Git\bin\bash.exe"        set "BASH_CMD=C:\Program Files\Git\bin\bash.exe"

REM ── Windows Terminal? ────────────────────────────────────────────
set "HAS_WT=0"
where wt >nul 2>&1
if not errorlevel 1 set "HAS_WT=1"

REM ── Ensure temp script folder exists ────────────────────────────
if not exist "%SCRIPTS_WIN%" mkdir "%SCRIPTS_WIN%"

REM ================================================================
REM  MENU
REM ================================================================
:MENU
cls
echo.
echo  +--------------------------------------------------+
echo  ^|           BUILD AND DEPLOY TOOL                  ^|
echo  +--------------------------------------------------+
echo  ^|  Dir  : %TARGET_DIR%                            ^|
echo  +--------------------------------------------------+
echo.
echo   1)  Create Release APK
echo   2)  Create AAB  ^(Play Store bundle^)
echo   3)  Update Backend on GitHub
echo   4)  Update Backend on GitLab
echo   5)  All  ^(Release APK + GitHub push^)
echo   6)  Run Backend    ^(npm run dev^)
echo   7)  Run Frontend   ^(npx expo start -c^)
echo   8)  Build + Install APK on ALL connected devices
echo   9)  Emulator  ^(Start + Build Debug APK + Install + Launch^)
echo   0)  Exit
echo.
set /p CHOICE="  Enter choice: "

if "%CHOICE%"=="1" goto BUILD_APK
if "%CHOICE%"=="2" goto BUILD_AAB
if "%CHOICE%"=="3" goto PUSH_GITHUB
if "%CHOICE%"=="4" goto PUSH_GITLAB
if "%CHOICE%"=="5" goto BUILD_ALL
if "%CHOICE%"=="6" goto RUN_DEV
if "%CHOICE%"=="7" goto RUN_EXPO
if "%CHOICE%"=="8" goto RUN_ANDROID
if "%CHOICE%"=="9" goto RUN_EMULATOR
if "%CHOICE%"=="0" exit /b
goto MENU

REM ================================================================
REM  HELPER — launch a .sh file in a new tab or window
REM  %1 = window title   %2 = bash-style path to .sh file
REM ================================================================
:OPEN_TAB
setlocal
set "TITLE=%~1"
set "SHPATH=%~2"
if "%HAS_WT%"=="1" (
    wt -w hipk_window new-tab --title "%TITLE%" -d "%WIN_DIR%" "%BASH_CMD%" -c "bash '%SHPATH%' \; exec bash"
) else (
    start "%TITLE%" "%BASH_CMD%" -c "bash '%SHPATH%' ; exec bash"
)
endlocal & exit /b 0

REM ================================================================
REM  1 — Release APK  (blocking, current window)
REM ================================================================
:BUILD_APK
echo.
echo  [1] Building Release APK...
echo.
"%BASH_CMD%" -c "cd %TARGET_DIR% && node restore-native.js && cd android && ./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs='-Xmx4096m'"
echo.
echo  APK =^> %TARGET_DIR%/android/app/build/outputs/apk/release/app-release.apk
pause
goto MENU

REM ================================================================
REM  2 — Release AAB  (blocking, current window)
REM ================================================================
:BUILD_AAB
echo.
echo  [2] Building Release AAB (Play Store bundle)...
echo.
"%BASH_CMD%" -c "cd %TARGET_DIR% && node restore-native.js && cd android && ./gradlew bundleRelease --no-daemon -Dorg.gradle.jvmargs='-Xmx4096m'"
echo.
echo  AAB =^> %TARGET_DIR%/android/app/build/outputs/bundle/release/app-release.aab
pause
goto MENU

REM ================================================================
REM  3 — Git push backend to GitHub  (blocking, current window)
REM ================================================================
:PUSH_GITHUB
echo.
echo  [3] Pushing backend to GitHub...
echo.
"%BASH_CMD%" -c "cd %TARGET_DIR%/backend && git add . && git commit -m 'update' && git push origin main"
pause
goto MENU

REM ================================================================
REM  4 — Git push backend to GitLab  (blocking, current window)
REM ================================================================
:PUSH_GITLAB
echo.
echo  [4] Pushing backend to GitLab...
echo.
"%BASH_CMD%" -c "cd '%GITLAB_DIR_BASH%' && git add . && git commit -m 'update' && git push origin main"
pause
goto MENU

REM ================================================================
REM  5 — Release APK + GitHub push  (blocking, current window)
REM ================================================================
:BUILD_ALL
echo.
echo  [5] Building Release APK and pushing backend...
echo.
"%BASH_CMD%" -c "cd %TARGET_DIR% && node restore-native.js && cd android && ./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs='-Xmx4096m' && cd ../backend && git add . && git commit -m 'update' && git push origin main"
pause
goto MENU

REM ================================================================
REM  6 — Backend dev server  (new tab, non-blocking)
REM ================================================================
:RUN_DEV
echo.
echo  [6] Starting backend dev server...
echo.
for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING" 2^>nul') do taskkill /F /PID %%A >nul 2>&1
for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":8081 " ^| findstr "LISTENING" 2^>nul') do taskkill /F /PID %%A >nul 2>&1
set "SH_WIN=%SCRIPTS_WIN%\run_dev.sh"
set "SH_BASH=%SCRIPTS_BASH%/run_dev.sh"
> "%SH_WIN%" echo #!/usr/bin/env bash
>> "%SH_WIN%" echo set -e
>> "%SH_WIN%" echo cd '%TARGET_DIR%/backend'
>> "%SH_WIN%" echo echo '==> Starting npm run dev...'
>> "%SH_WIN%" echo npm run dev
call :OPEN_TAB "Backend Server" "%SH_BASH%"
goto MENU

REM ================================================================
REM  7 — Expo frontend  (new tab, non-blocking)
REM ================================================================
:RUN_EXPO
echo.
echo  [7] Starting Expo frontend...
echo.
set "SH_WIN=%SCRIPTS_WIN%\run_expo.sh"
set "SH_BASH=%SCRIPTS_BASH%/run_expo.sh"
> "%SH_WIN%" echo #!/usr/bin/env bash
>> "%SH_WIN%" echo set -e
>> "%SH_WIN%" echo cd '%TARGET_DIR%'
>> "%SH_WIN%" echo echo '==> Starting npx expo start -c...'
>> "%SH_WIN%" echo npx expo start -c
call :OPEN_TAB "Expo Server" "%SH_BASH%"
goto MENU

REM ================================================================
REM  8 — Build + install on ALL connected physical devices
REM      (new tab, non-blocking)
REM ================================================================
:RUN_ANDROID
echo.
echo  [8] Building and deploying to all connected devices...
echo.
set "SH_WIN=%SCRIPTS_WIN%\deploy_all.sh"
set "SH_BASH=%SCRIPTS_BASH%/deploy_all.sh"
> "%SH_WIN%" echo #!/usr/bin/env bash
>> "%SH_WIN%" echo ANDROID_HOME='%ANDROID_HOME_BASH%'
>> "%SH_WIN%" echo ADB="$ANDROID_HOME/platform-tools/adb"
>> "%SH_WIN%" echo cd '%TARGET_DIR%'
>> "%SH_WIN%" echo echo '==> Restoring native files...'
>> "%SH_WIN%" echo node restore-native.js
>> "%SH_WIN%" echo echo '==> Building Release APK...'
>> "%SH_WIN%" echo cd android
>> "%SH_WIN%" echo ./gradlew assembleRelease --no-daemon "-Dorg.gradle.jvmargs=-Xmx4096m"
>> "%SH_WIN%" echo cd ..
>> "%SH_WIN%" echo APK_PATH='android/app/build/outputs/apk/release/app-release.apk'
>> "%SH_WIN%" echo if [ ! -f "$APK_PATH" ]; then echo 'ERROR: APK not found'; exit 1; fi
>> "%SH_WIN%" echo DEVICES=$("$ADB" devices ^| grep -v 'List of' ^| grep 'device$' ^| awk '{print $1}')
>> "%SH_WIN%" echo if [ -z "$DEVICES" ]; then echo 'ERROR: No devices connected'; exit 1; fi
>> "%SH_WIN%" echo PACKAGE_NAME=$(node -e "try{const a=require('./app.json');console.log(a.expo&&a.expo.android&&a.expo.android.package||a.expo.name||'')}catch(e){}" 2>/dev/null)
>> "%SH_WIN%" echo [ -z "$PACKAGE_NAME" ] ^&^& PACKAGE_NAME=$(grep applicationId android/app/build.gradle ^| head -1 ^| tr -d ' ' ^| cut -d'"' -f2)
>> "%SH_WIN%" echo echo "==> Package: $PACKAGE_NAME"
>> "%SH_WIN%" echo for DEVICE in $DEVICES; do
>> "%SH_WIN%" echo   echo "==> Installing on $DEVICE..."
>> "%SH_WIN%" echo   "$ADB" -s "$DEVICE" install -r "$APK_PATH"
>> "%SH_WIN%" echo   "$ADB" -s "$DEVICE" shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1
>> "%SH_WIN%" echo done
>> "%SH_WIN%" echo echo '==> Done! App installed on all connected devices.'
call :OPEN_TAB "Android Deploy" "%SH_BASH%"
goto MENU

REM ================================================================
REM  9 — Emulator: Start + Build Debug APK + Install + Launch
REM      (new tab, non-blocking)
REM ================================================================
:RUN_EMULATOR
echo.
echo  [9] Starting emulator workflow...
echo.
set "SH_WIN=%SCRIPTS_WIN%\run_emulator.sh"
set "SH_BASH=%SCRIPTS_BASH%/run_emulator.sh"
> "%SH_WIN%" echo #!/usr/bin/env bash
>> "%SH_WIN%" echo ANDROID_HOME='%ANDROID_HOME_BASH%'
>> "%SH_WIN%" echo EMULATOR_BIN="$ANDROID_HOME/emulator/emulator"
>> "%SH_WIN%" echo ADB="$ANDROID_HOME/platform-tools/adb"
>> "%SH_WIN%" echo cd '%TARGET_DIR%'
>> "%SH_WIN%" echo.
>> "%SH_WIN%" echo PACKAGE_NAME=$(node -e "try{const a=require('./app.json');console.log(a.expo&&a.expo.android&&a.expo.android.package||a.expo.name||'')}catch(e){}" 2>/dev/null)
>> "%SH_WIN%" echo [ -z "$PACKAGE_NAME" ] ^&^& PACKAGE_NAME=$(grep applicationId android/app/build.gradle ^| head -1 ^| tr -d ' ' ^| cut -d'"' -f2)
>> "%SH_WIN%" echo if [ -z "$PACKAGE_NAME" ]; then echo 'ERROR: Cannot detect package name'; exit 1; fi
>> "%SH_WIN%" echo echo "==> Package : $PACKAGE_NAME"
>> "%SH_WIN%" echo.
>> "%SH_WIN%" echo AVD=$("$EMULATOR_BIN" -list-avds 2>/dev/null ^| head -1)
>> "%SH_WIN%" echo if [ -z "$AVD" ]; then echo 'ERROR: No AVD found. Create one in Android Studio Device Manager.'; exit 1; fi
>> "%SH_WIN%" echo echo "==> AVD     : $AVD"
>> "%SH_WIN%" echo.
>> "%SH_WIN%" echo RUNNING=$("$ADB" devices ^| grep 'emulator' ^| grep 'device$')
>> "%SH_WIN%" echo if [ -z "$RUNNING" ]; then
>> "%SH_WIN%" echo   echo '==> Launching emulator...'
>> "%SH_WIN%" echo   "$EMULATOR_BIN" -avd "$AVD" -no-snapshot-load > /tmp/emulator.log 2>&1 &
>> "%SH_WIN%" echo   "$ADB" wait-for-device
>> "%SH_WIN%" echo   BOOT=""
>> "%SH_WIN%" echo   until [ "$BOOT" = "1" ]; do
>> "%SH_WIN%" echo     BOOT=$("$ADB" shell getprop sys.boot_completed 2>/dev/null ^| tr -d '\r')
>> "%SH_WIN%" echo     [ "$BOOT" != "1" ] ^&^& echo '   still booting...' ^&^& sleep 5
>> "%SH_WIN%" echo   done
>> "%SH_WIN%" echo   echo '==> Emulator ready!'
>> "%SH_WIN%" echo else
>> "%SH_WIN%" echo   echo '==> Emulator already running, reusing.'
>> "%SH_WIN%" echo fi
>> "%SH_WIN%" echo.
>> "%SH_WIN%" echo echo '==> Disabling package verification on emulator...'
>> "%SH_WIN%" echo "$ADB" shell settings put global verifier_verify_adb_installs 0 ^|^| true
>> "%SH_WIN%" echo "$ADB" shell settings put global package_verifier_enable 0 ^|^| true
>> "%SH_WIN%" echo.
>> "%SH_WIN%" echo echo '==> Restoring native files...'
>> "%SH_WIN%" echo node restore-native.js
>> "%SH_WIN%" echo echo '==> Building Debug APK...'
>> "%SH_WIN%" echo cd android
>> "%SH_WIN%" echo ./gradlew assembleDebug --no-daemon "-Dorg.gradle.jvmargs=-Xmx4096m"
>> "%SH_WIN%" echo BUILD_STATUS=$?
>> "%SH_WIN%" echo cd ..
>> "%SH_WIN%" echo if [ $BUILD_STATUS -ne 0 ]; then echo 'ERROR: Gradle build failed.'; exit 1; fi
>> "%SH_WIN%" echo APK_PATH='android/app/build/outputs/apk/debug/app-debug.apk'
>> "%SH_WIN%" echo if [ ! -f "$APK_PATH" ]; then echo "ERROR: APK not found at $APK_PATH"; exit 1; fi
>> "%SH_WIN%" echo echo "==> APK built: $APK_PATH"
>> "%SH_WIN%" echo echo '==> Installing APK on emulator...'
>> "%SH_WIN%" echo "$ADB" install -r "$APK_PATH"
>> "%SH_WIN%" echo if [ $? -ne 0 ]; then echo 'ERROR: Install failed.'; exit 1; fi
>> "%SH_WIN%" echo echo '==> Launching app...'
>> "%SH_WIN%" echo MAIN=$("$ADB" shell pm dump "$PACKAGE_NAME" 2>/dev/null ^| grep -A1 'android.intent.action.MAIN' ^| grep 'cmp=' ^| head -1 ^| sed 's/.*cmp=//' ^| tr -d ' \r')
>> "%SH_WIN%" echo if [ -n "$MAIN" ]; then
>> "%SH_WIN%" echo   "$ADB" shell am start -n "$MAIN"
>> "%SH_WIN%" echo else
>> "%SH_WIN%" echo   "$ADB" shell monkey -p "$PACKAGE_NAME" -c android.intent.category.LAUNCHER 1
>> "%SH_WIN%" echo fi
>> "%SH_WIN%" echo echo '==> Done! App is live on the emulator.'
>> "%SH_WIN%" echo echo '==> Starting Metro Bundler...'
>> "%SH_WIN%" echo npx expo start -c
call :OPEN_TAB "Emulator + APK" "%SH_BASH%"
goto MENU
