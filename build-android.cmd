@echo off
setlocal

set MODE=%1
if "%MODE%"=="" set MODE=debug

echo.
echo === 1/4 Build web assets ===
call npm run build
if errorlevel 1 exit /b 1

echo.
echo === 2/4 Sync to Android ===
call npx cap sync
if errorlevel 1 exit /b 1

echo.
echo === 3/4 Generate icons ===
call npx capacitor-assets generate --android
if errorlevel 1 exit /b 1

echo.
echo === 4/4 Gradle assemble (%MODE%) ===
cd android
if "%MODE%"=="release" (
    call gradlew.bat assembleRelease
) else (
    call gradlew.bat assembleDebug
)
if errorlevel 1 exit /b 1

echo.
echo BUILD COMPLETE
if "%MODE%"=="release" (
    echo APK: android\app\build\outputs\apk\release\app-release.apk
) else (
    echo APK: android\app\build\outputs\apk\debug\app-debug.apk
)
