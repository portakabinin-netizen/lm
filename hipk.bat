@echo off
setlocal enabledelayedexpansion
title Build Tool - APK + GitHub

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
echo   2)  Update GitHub  ^(git push^)
echo   3)  All  ^(Release APK + GitHub push^)
echo   4)  Run Python Backend   ^(backend-py  port 5002^)
echo   5)  Run Frontend         ^(npx expo start -c^)
echo   6)  Build + Install APK on ALL connected devices
echo   7)  Emulator  ^(Build APK + Start Metro + Boot Emulator + Install + Launch^)
echo   8)  Create AAB  ^(Play Store bundle^)
echo   9)  Run Node Backend     ^(backend/  port 5000 - legacy^)
echo   0)  Exit
echo.
set /p CHOICE="  Enter choice: "

if "%CHOICE%"=="1" goto BUILD_APK
if "%CHOICE%"=="2" goto PUSH_BACKEND
if "%CHOICE%"=="3" goto BUILD_ALL
if "%CHOICE%"=="4" goto RUN_PYTHON
if "%CHOICE%"=="5" goto RUN_EXPO
if "%CHOICE%"=="6" goto RUN_ANDROID
if "%CHOICE%"=="7" goto RUN_EMULATOR
if "%CHOICE%"=="8" goto BUILD_AAB
if "%CHOICE%"=="9" goto RUN_DEV
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
set "BASH_ARGS_WT=cd %TARGET_DIR% && bash '%SHPATH%' \; exec bash"
set "BASH_ARGS_START=cd %TARGET_DIR% && bash '%SHPATH%' ; exec bash"
if "%HAS_WT%"=="1" (
    wt -w hipk_window new-tab -p 0 -d "%WIN_DIR%" --title "%TITLE%" "%BASH_CMD%" -c "%BASH_ARGS_WT%"
) else (
    start "%TITLE%" "%BASH_CMD%" -c "%BASH_ARGS_START%"
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
REM  2 — Git push backend  (blocking, current window)
REM ================================================================
:PUSH_BACKEND
echo.
echo  [2] Pushing backend to GitHub...
echo.
"%BASH_CMD%" -c "cd %TARGET_DIR%/backend && git add . && git commit -m 'update' && git push origin main"
pause
goto MENU

REM ================================================================
REM  3 — Release APK + GitHub push  (blocking, current window)
REM ================================================================
:BUILD_ALL
echo.
echo  [3] Building Release APK and pushing backend...
echo.
"%BASH_CMD%" -c "cd %TARGET_DIR% && node restore-native.js && cd android && ./gradlew assembleRelease --no-daemon -Dorg.gradle.jvmargs='-Xmx4096m' && cd ../backend && git add . && git commit -m 'update' && git push origin main"
pause
goto MENU

REM ================================================================
REM  4 — Python FastAPI backend  (new tab, non-blocking)
REM ================================================================
:RUN_PYTHON
echo.
echo  [4] Starting Python backend (backend-py) on port 5002...
echo.
for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":5002 " ^| findstr "LISTENING" 2^>nul') do taskkill /F /PID %%A >nul 2>&1
set "SH_WIN=%SCRIPTS_WIN%\run_python.sh"
set "SH_BASH=%SCRIPTS_BASH%/run_python.sh"
> "%SH_WIN%" echo #!/usr/bin/env bash
>> "%SH_WIN%" echo set -e
>> "%SH_WIN%" echo cd '%TARGET_DIR%/backend-py'
>> "%SH_WIN%" echo echo '==> Activating Python venv...'
>> "%SH_WIN%" echo source venv/Scripts/activate 2>/dev/null ^|^| source venv/bin/activate 2>/dev/null ^|^| true
>> "%SH_WIN%" echo echo '==> Starting FastAPI with uvicorn on port 5002...'
>> "%SH_WIN%" echo python main.py
call :OPEN_TAB "Python Backend" "%SH_BASH%"
goto MENU

REM ================================================================
REM  9 — Node.js backend (legacy)  (new tab, non-blocking)
REM ================================================================
:RUN_DEV
echo.
echo  [9] Starting Node backend (backend/) on port 5000 (legacy)...
echo.
for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":5000 " ^| findstr "LISTENING" 2^>nul') do taskkill /F /PID %%A >nul 2>&1
set "SH_WIN=%SCRIPTS_WIN%\run_dev.sh"
set "SH_BASH=%SCRIPTS_BASH%/run_dev.sh"
> "%SH_WIN%" echo #!/usr/bin/env bash
>> "%SH_WIN%" echo set -e
>> "%SH_WIN%" echo cd '%TARGET_DIR%/backend'
>> "%SH_WIN%" echo echo '==> Starting npm run dev (Node legacy)...'
>> "%SH_WIN%" echo npm run dev
call :OPEN_TAB "Node Backend (Legacy)" "%SH_BASH%"
goto MENU

REM ================================================================
REM  5 — Expo frontend  (new tab, non-blocking)
REM ================================================================
:RUN_EXPO
echo.
echo  [5] Starting Expo frontend...
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
REM  6 — Build + install on ALL connected physical devices
REM      (new tab, non-blocking)
REM ================================================================
:RUN_ANDROID
echo.
echo  [6] Building and deploying to all connected devices...
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
REM  7 — Emulator: Build APK → Start Metro → Boot Emulator → Install → Launch
REM      Metro starts BEFORE the app so "Unable to load script" never appears.
REM      (new tab, non-blocking)
REM ================================================================
:RUN_EMULATOR
echo.
echo  [7] Starting emulator + Metro workflow...
echo.
REM Kill stale Metro on port 8081 so the script can start a fresh one
for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":8081 " ^| findstr "LISTENING" 2^>nul') do taskkill /F /PID %%A >nul 2>&1
call :OPEN_TAB "Emulator + Metro + APK" "%TARGET_DIR%/scripts/boot-and-run-emulator.sh"
goto MENU

REM ================================================================
REM  8 — Release AAB  (blocking, current window)
REM ================================================================
:BUILD_AAB
echo.
echo  [8] Building Release AAB (Play Store bundle)...
echo.
"%BASH_CMD%" -c "cd %TARGET_DIR% && node restore-native.js && cd android && ./gradlew bundleRelease --no-daemon -Dorg.gradle.jvmargs='-Xmx4096m'"
echo.
echo  AAB =^> %TARGET_DIR%/android/app/build/outputs/bundle/release/app-release.aab
pause
goto MENU