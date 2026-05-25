@echo off
REM Detiene el servidor + cierra las ventanas de Chrome de HoloNFC.
echo [HoloNFC] Cerrando proyector y admin...
taskkill /F /FI "WINDOWTITLE eq HoloNFC*" >nul 2>&1

echo [HoloNFC] Cerrando servidor...
taskkill /F /IM node.exe >nul 2>&1

echo [HoloNFC] Todo cerrado.
timeout /t 2 /nobreak >nul
