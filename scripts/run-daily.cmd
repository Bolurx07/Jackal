@echo off
rem Jackal daily run, started by Windows Task Scheduler ("Jackal daily run").
rem Output is appended to data\logs\daily.log
cd /d "%~dp0.."
if not exist "data\logs" mkdir "data\logs"
echo. >> "data\logs\daily.log"
echo ===== %date% %time% ===== >> "data\logs\daily.log"
call "C:\Program Files\nodejs\npm.cmd" run jackal:run >> "data\logs\daily.log" 2>&1
echo ===== finished with exit code %errorlevel% ===== >> "data\logs\daily.log"
