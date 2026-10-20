@echo off
chcp 65001 >nul
title Command - panel del bot (no cierres esta ventana)
rem Arranca el panel en http://localhost:5173/panel.html y lo abre en Edge con los
rem temporizadores sin frenar, para que el bot siga revisando velas aunque la
rem ventana quede minimizada o te desconectes del Escritorio remoto.

cd /d "%~dp0.."

where node >nul 2>nul || (
  echo.
  echo  ERROR: falta Node.js. Instalalo desde https://nodejs.org ^(version LTS^) y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  Instalando dependencias por primera vez...
  call npm install || goto fallo
)

echo  Arrancando el panel...
start "Command - servidor" /min cmd /c "npm run panel:vps"

rem Esperar a que el servidor responda
set /a TRIES=0
:esperar
timeout /t 2 /nobreak >nul
set /a TRIES+=1
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:5173/panel.html -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }" && goto abrir
if %TRIES% lss 30 goto esperar
goto fallo

:abrir
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" (
  start "" http://localhost:5173/panel.html
  echo  AVISO: no encuentro Edge; se ha abierto el navegador por defecto, que puede frenar el bot en segundo plano.
  goto fin
)
start "" "%EDGE%" --user-data-dir="%LOCALAPPDATA%\CommandPanelEdge" --no-first-run ^
  --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows ^
  --app=http://localhost:5173/panel.html

:fin
echo.
echo  Panel abierto. Deja NinjaTrader y esta ventana del panel abiertos.
exit /b 0

:fallo
echo.
echo  ERROR: el panel no ha arrancado. Ejecuta "npm run panel:vps" en esta carpeta y mira el mensaje.
echo.
pause
exit /b 1
