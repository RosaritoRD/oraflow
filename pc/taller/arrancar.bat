@echo off
rem Arranca el taller (ffmpeg para Oraflow) en el puerto 8096. Lo usan la tarea programada y CONFIGURAR-TALLER.bat.
cd /d C:\taller
"C:\taller\.venv\Scripts\python.exe" "C:\taller\taller.py" >> "C:\taller\taller.log" 2>&1
