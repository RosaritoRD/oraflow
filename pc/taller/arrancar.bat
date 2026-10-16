@echo off
rem Starts the workshop (ffmpeg for Oraflow) on port 8096. Used by the scheduled task and CONFIGURAR-TALLER.bat.
cd /d C:\taller
"C:\taller\.venv\Scripts\python.exe" "C:\taller\taller.py" >> "C:\taller\taller.log" 2>&1
