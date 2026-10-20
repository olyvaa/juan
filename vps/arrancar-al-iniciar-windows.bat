@echo off
chcp 65001 >nul
rem Crea un acceso directo en la carpeta Inicio de Windows para que el panel se abra
rem solo cada vez que este usuario inicie sesion (tambien tras un reinicio del VPS).
set "TARGET=%~dp0iniciar-panel.bat"
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Command panel.lnk"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LNK); $s.TargetPath=$env:TARGET; $s.WorkingDirectory=(Split-Path $env:TARGET); $s.WindowStyle=7; $s.Save()" || goto fallo
echo.
echo  Listo: el panel se abrira solo al iniciar sesion en Windows.
echo  Para quitarlo, borra "Command panel" de: %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
echo.
pause
exit /b 0
:fallo
echo  ERROR al crear el acceso directo.
pause
exit /b 1
