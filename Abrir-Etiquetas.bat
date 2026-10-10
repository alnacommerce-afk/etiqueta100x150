@echo off
title Etiquetas 100x150 (feche esta janela para desligar)
cd /d "%~dp0"
"%USERPROFILE%\.bun\bin\bun.exe" run dev --open
pause
