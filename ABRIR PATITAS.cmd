@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 24 o superior desde https://nodejs.org/
  pause
  exit /b 1
)
if not exist "node_modules\pg\package.json" (
  echo Ejecuta npm.cmd ci en esta carpeta y volve a abrir PATITAS.
  echo Segui la guia de PostgreSQL del README.md.
  pause
  exit /b 1
)
echo.
echo PATITAS - Deja esta ventana abierta mientras usas la app.
echo Abri http://127.0.0.1:3000 en tu navegador.
echo.
node servidor.js
pause
