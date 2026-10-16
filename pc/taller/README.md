# PC workshop

> **09/10/2026: the PC moved to Linux Mint.** It lives in `~/servicios/taller` (user `your-user`,
> Tailscale YOUR_PC_IP) as the user service `taller.service` (`systemctl --user status taller`,
> logs with `journalctl --user -u taller`). Installed by `servicios.sh taller` (source in
> ~/taller). The notes below about `C:\taller`, `.bat` and scheduled tasks are the Windows version.


Service that runs Oraflow's ffmpeg on the owner's PC (RTX 2070, 24 threads).
The VPS uses it from `utils/ffmpeg-remoto.js` (`FFMPEG_REMOTO_URL`); if it doesn't
answer or fails, the VPS does the work itself.

- Port 8096, only accepts the VPS over Tailscale (YOUR_VPS_IP) and the PC itself.
- Startup: scheduled task «Taller Oraflow» (at logon) → `arrancar.bat`.
- Install/update: copy these files to `C:\taller`, and once
  `python -m venv .venv` + `.venv\Scripts\python -m pip install fastapi uvicorn httpx pytest`.
- Tests: `C:\taller\.venv\Scripts\python -m pytest -q C:\taller\tests` (they use the PC's ffmpeg).
- Log: `C:\taller\taller.log`. File cache: `C:\taller\cache` (3 days unused → deleted).
