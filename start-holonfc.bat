@echo off
REM ──────────────────────────────────────────────────────────────────────
REM  HoloNFC · Modo kiosco
REM  Inicia el servidor y abre Chrome en modo kiosko para admin + proyector.
REM
REM  Para que arranque solo con Windows:
REM    1. Crear acceso directo de este .bat
REM    2. Pegarlo en:  shell:startup
REM       (Win+R  →  shell:startup  →  Enter)
REM ──────────────────────────────────────────────────────────────────────

setlocal
cd /d "%~dp0"

REM ── 1. Levantar el servidor (background) ──────────────────────────────
echo [HoloNFC] Iniciando servidor backend...
start "HoloNFC server" /MIN cmd /c "npm run server"

REM ── 1b. Levantar el puente NFC físico (background) ───────────────────
echo [HoloNFC] Iniciando puente NFC...
start "HoloNFC Bridge" /MIN powershell -NoProfile -ExecutionPolicy Bypass -File .\nfc-bridge.ps1

REM ── 2. Esperar a que el puerto 3000 responda ──────────────────────────
echo [HoloNFC] Esperando a que el servidor este listo...
:waitloop
timeout /t 2 /nobreak >nul
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing -Uri http://localhost:3000/api/health/event-readiness -TimeoutSec 1).StatusCode } catch { exit 1 }" >nul 2>&1
if errorlevel 1 goto waitloop
echo [HoloNFC] Servidor listo.

REM ── 3. Detectar Chrome ────────────────────────────────────────────────
set CHROME=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe"      set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe"      set CHROME="%LocalAppData%\Google\Chrome\Application\chrome.exe"

if not defined CHROME (
  echo [HoloNFC] ERROR: No se encontro Google Chrome. Instalalo o editar el .bat con el path correcto.
  pause
  exit /b 1
)

REM ── 4. Abrir el proyector en kiosko (pantalla 2 si hay) ───────────────
REM El operador puede mover la ventana a la pantalla del holograma con
REM Win+Shift+Flecha derecha. Para automatizar la posicion en pantalla 2,
REM ajustar --window-position abajo (ej: --window-position=1920,0).
echo [HoloNFC] Abriendo proyector en modo kiosko...
start "HoloNFC projector" %CHROME% ^
  --new-window ^
  --kiosk ^
  --autoplay-policy=no-user-gesture-required ^
  --user-data-dir="%TEMP%\holonfc-projector" ^
  --app=http://localhost:3000/projector.html?v=xfade-1

REM ── 5. Abrir el admin en kiosko (pantalla principal) ──────────────────
timeout /t 1 /nobreak >nul
echo [HoloNFC] Abriendo admin...
start "HoloNFC admin" %CHROME% ^
  --new-window ^
  --start-maximized ^
  --user-data-dir="%TEMP%\holonfc-admin" ^
  --app=http://localhost:3000

echo.
echo [HoloNFC] Sistema iniciado.
echo  - Admin:     http://localhost:3000
echo  - Proyector: http://localhost:3000/projector.html
echo.
echo Cerrar esta ventana NO detiene el servidor. Para detener todo:
echo   taskkill /F /IM node.exe
echo.
endlocal
