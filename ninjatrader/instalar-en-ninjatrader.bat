@echo off
chcp 65001 >nul
title Instalar Command Pro Clone en NinjaTrader 8
echo.
echo  Instalador de Command Pro Clone para NinjaTrader 8
echo  -------------------------------------------------
echo  IMPORTANTE: cierra NinjaTrader antes de continuar.
echo.
pause

rem Carpeta Documentos real (tambien si esta en OneDrive)
for /f "usebackq delims=" %%D in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"`) do set "DOCS=%%D"
set "NT=%DOCS%\NinjaTrader 8\bin\Custom"

if not exist "%NT%" (
  echo.
  echo  ERROR: no encuentro la carpeta de NinjaTrader:
  echo    %NT%
  echo  Abre NinjaTrader una vez y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

set "SRC=%~dp0"

echo.
echo  Borrando copias duplicadas antiguas (archivos con " (1)", " (2)"...)
del /q "%NT%\AddOns\CC* (*).cs" 2>nul
del /q "%NT%\Strategies\CC* (*).cs" 2>nul

echo  Copiando AddOns...
copy /Y "%SRC%AddOns\CCBridge.cs"        "%NT%\AddOns\" >nul || goto fallo
copy /Y "%SRC%AddOns\CCCommandCenter.cs" "%NT%\AddOns\" >nul || goto fallo
copy /Y "%SRC%AddOns\CCHub.cs"           "%NT%\AddOns\" >nul || goto fallo
copy /Y "%SRC%AddOns\CCMarketFeed.cs"    "%NT%\AddOns\" >nul || goto fallo

echo  Copiando estrategias...
copy /Y "%SRC%Strategies\*.cs" "%NT%\Strategies\" >nul || goto fallo

echo.
echo  Instalado en:
echo    %NT%
echo.
echo  Ahora:
echo    1. Abre NinjaTrader
echo    2. New - NinjaScript Editor - pulsa F5 (no debe salir nada en rojo)
echo    3. Cierra y vuelve a abrir NinjaTrader y conecta tu cuenta
echo.
pause
exit /b 0

:fallo
echo.
echo  ERROR al copiar. Comprueba que NinjaTrader esta cerrado y que este
echo  archivo esta dentro de la carpeta "ninjatrader" (junto a AddOns y Strategies).
echo.
pause
exit /b 1
