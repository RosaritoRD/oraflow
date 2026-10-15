# Taller del PC

> **09/10/2026: el PC pasó a Linux Mint.** Vive en `~/servicios/taller` (usuario `tu-usuario`,
> Tailscale IP_DE_TU_VPS) como servicio de usuario `taller.service` (`systemctl --user status taller`,
> registro con `journalctl --user -u taller`). Lo instala `servicios.sh taller` (fuente en
> ~/taller). Lo de abajo sobre `C:\taller`, `.bat` y tareas programadas es la versión Windows.


Servicio que hace el ffmpeg de Oraflow en el PC del autor (RTX 2070, 24 hilos).
La VPS lo usa desde `utils/ffmpeg-remoto.js` (`FFMPEG_REMOTO_URL`); si no
responde o falla, la VPS lo hace ella.

- Puerto 8096, solo acepta a la VPS por Tailscale (IP_DE_TU_PC) y al propio PC.
- Arranque: tarea programada «Taller Oraflow» (al iniciar sesión) → `arrancar.bat`.
- Instalar/actualizar: copiar estos archivos a `C:\taller`, y una vez
  `python -m venv .venv` + `.venv\Scripts\python -m pip install fastapi uvicorn httpx pytest`.
- Pruebas: `C:\taller\.venv\Scripts\python -m pytest -q C:\taller\tests` (usan el ffmpeg del PC).
- Registro: `C:\taller\taller.log`. Caché de archivos: `C:\taller\cache` (3 días sin uso → se borra).
