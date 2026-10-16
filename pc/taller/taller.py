"""Workshop: Oraflow's ffmpeg runs on this PC (07/10/2026).

The VPS (keizac-vps) is still the "office": schedule, database, uploading to
YouTube. Whenever Oraflow needs ffmpeg, it asks this workshop; if the
workshop doesn't answer or fails, the VPS does it itself (utils/ffmpeg-remoto.js).

  GET  /api/salud                     status, cores, jobs
  HEAD /api/archivos/<sha256>         do I already have this file?
  PUT  /api/archivos/<sha256>         upload a file (the sha256 is checked)
  GET  /api/archivos/<sha256>         download a file (the outputs)
  POST /api/trabajos                  {args, entradas: {ruta_relativa: sha}, salidas: [ruta_relativa], limite_s}
  GET  /api/trabajos/<id>             status and, when done, {salidas: {ruta: {sha, bytes}}, stdout, stderr}

Security: it only serves the VPS over Tailscale and this PC; job paths are
relative to a folder of its own, with no absolute paths or URLs.
Files are stored by their sha256 in cache/ and deleted after 3 days unused.
"""
from __future__ import annotations

import ctypes
import hashlib
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response

BASE = Path(os.environ.get("TALLER_DIR", Path(__file__).resolve().parent))
CACHE = BASE / "cache"
TRABAJOS = BASE / "trabajos"
PUERTO = int(os.environ.get("TALLER_PUERTO", "8096"))
FFMPEG = os.environ.get("TALLER_FFMPEG") or shutil.which("ffmpeg") or "ffmpeg"
MAX_PARALELO = int(os.environ.get("TALLER_PARALELO", "3"))
CACHE_DIAS = float(os.environ.get("TALLER_CACHE_DIAS", "3"))
CACHE_MAX_BYTES = int(float(os.environ.get("TALLER_CACHE_GB", "40")) * 1e9)
IPS_POR_DEFECTO = {"127.0.0.1", "::1", "YOUR_VPS_IP"}  # este PC y keizac-vps por Tailscale
SALIDA_MAX = 8 * 1024 * 1024  # stdout/stderr returned

SHA = re.compile(r"^[0-9a-f]{64}$")
REL = re.compile(r"^[es]/[A-Za-z0-9_.-]{1,100}(/[A-Za-z0-9_.%-]{1,100})?$")
# Nada de rutas absolutas (C:\, \\servidor, /algo al principio), subir de carpeta ni URLs.
PROHIBIDO = re.compile(r"[A-Za-z]:[\\/]|\\\\|\.\.[\\/]|://|^/|[=':,]/[A-Za-z]")


def ips_permitidas() -> set[str]:
    extra = os.environ.get("TALLER_IPS_PERMITIDAS", "")
    return IPS_POR_DEFECTO | {ip.strip() for ip in extra.split(",") if ip.strip()}


def args_seguros(args) -> bool:
    if not isinstance(args, list) or not args or not all(isinstance(a, str) for a in args):
        return False
    return not any(PROHIBIDO.search(a) for a in args)


def sha256_de(ruta: Path) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloque)
    return h.hexdigest()


def despierto(activo: bool) -> None:
    """While there is work, Windows doesn't suspend the PC (does nothing on other systems)."""
    if sys.platform != "win32":
        return
    ES_CONTINUOUS, ES_SYSTEM_REQUIRED = 0x80000000, 0x00000001
    ctypes.windll.kernel32.SetThreadExecutionState(ES_CONTINUOUS | (ES_SYSTEM_REQUIRED if activo else 0))


def limpia_cache(ahora: float | None = None) -> int:
    """Deletes what has gone CACHE_DIAS unused and, if still over the cap, the oldest."""
    ahora = ahora or time.time()
    archivos = sorted((p for p in CACHE.glob("*") if p.is_file()), key=lambda p: p.stat().st_mtime)
    borrados, total = 0, sum(p.stat().st_size for p in archivos)
    for p in archivos:
        viejo = ahora - p.stat().st_mtime > CACHE_DIAS * 86400
        if viejo or total > CACHE_MAX_BYTES:
            total -= p.stat().st_size
            p.unlink(missing_ok=True)
            borrados += 1
    return borrados


MOTIVO = re.compile(r"error|impossible|invalid|no such|cannot|could not|unable|not found|failed|unknown", re.I)


def resumen_error(stderr: str, maximo: int = 3) -> str:
    """The ffmpeg lines that say WHY it failed (not the banner or the font warnings)."""
    lineas = [l.strip() for l in (stderr or "").splitlines() if l.strip()]
    motivos = [l for l in lineas if MOTIVO.search(l)] or lineas[-2:]
    return " | ".join(motivos[-maximo:])[:600]


class Taller:
    def __init__(self):
        CACHE.mkdir(parents=True, exist_ok=True)
        TRABAJOS.mkdir(parents=True, exist_ok=True)
        self.trabajos: dict[str, dict] = {}
        self.cupo = threading.Semaphore(MAX_PARALELO)
        self.cerrojo = threading.Lock()
        self._cuentas = {"hechos": 0, "fallos": 0, "ultimo_error": None, "ultimo_error_en": None,
                         "desde": time.time()}

    def cuentas(self) -> dict:
        return dict(self._cuentas)

    def activos(self) -> int:
        return sum(1 for t in self.trabajos.values() if t["estado"] == "trabajando")

    def en_cola(self) -> int:
        return sum(1 for t in self.trabajos.values() if t["estado"] == "en_cola")

    def nuevo(self, args, entradas: dict, salidas: list, limite_s: float) -> dict:
        id_ = uuid.uuid4().hex[:16]
        t = {"id": id_, "estado": "en_cola", "creado": time.time(), "args": args, "entradas": entradas,
             "salidas_pedidas": salidas, "limite_s": limite_s}
        with self.cerrojo:
            self.trabajos[id_] = t
            self._purga()
        threading.Thread(target=self._corre, args=(t,), daemon=True).start()
        return t

    def _purga(self):
        limite = time.time() - 3600
        for k in [k for k, t in self.trabajos.items() if t.get("fin", time.time()) < limite]:
            del self.trabajos[k]

    def _corre(self, t: dict):
        with self.cupo:
            t["estado"], t["inicio"] = "trabajando", time.time()
            carpeta = TRABAJOS / t["id"]
            despierto(True)
            try:
                for rel, sha in t["entradas"].items():
                    destino = carpeta / rel
                    destino.parent.mkdir(parents=True, exist_ok=True)
                    origen = CACHE / sha
                    os.utime(origen)  # used: not deleted by the cleanup
                    try:
                        os.link(origen, destino)
                    except OSError:
                        shutil.copyfile(origen, destino)
                for rel in t["salidas_pedidas"]:
                    (carpeta / rel).parent.mkdir(parents=True, exist_ok=True)
                prioridad = 0x00004000 if sys.platform == "win32" else 0  # BELOW_NORMAL: the PC stays usable
                p = subprocess.run([FFMPEG, "-nostdin", *t["args"]], cwd=carpeta, capture_output=True,
                                   timeout=t["limite_s"], creationflags=prioridad)
                t["stdout"] = p.stdout[-SALIDA_MAX:].decode("utf-8", "replace")
                t["stderr"] = p.stderr[-SALIDA_MAX:].decode("utf-8", "replace")
                if p.returncode != 0:
                    raise RuntimeError(f"ffmpeg exited with {p.returncode}: {resumen_error(t['stderr'])}")
                salidas = {}
                for rel in t["salidas_pedidas"]:
                    ruta = carpeta / rel
                    if not ruta.is_file():
                        raise RuntimeError(f"ffmpeg did not create {rel}")
                    sha = sha256_de(ruta)
                    final = CACHE / sha
                    if final.exists():
                        os.utime(final)
                    else:
                        os.replace(ruta, final)
                    salidas[rel] = {"sha": sha, "bytes": final.stat().st_size}
                t["salidas"], t["estado"] = salidas, "listo"
            except subprocess.TimeoutExpired:
                t["estado"], t["error"] = "error", f"ffmpeg went over {t['limite_s']} s"
            except Exception as e:  # noqa: BLE001 — the error goes back to the VPS, which does it itself
                t["estado"], t["error"] = "error", str(e)
            finally:
                with self.cerrojo:
                    if t["estado"] == "listo":
                        self._cuentas["hechos"] += 1
                    else:
                        self._cuentas.update(fallos=self._cuentas["fallos"] + 1, ultimo_error=t.get("error"),
                                             ultimo_error_en=time.time())
                despierto(self.activos() > 1)
                t["fin"] = time.time()
                shutil.rmtree(carpeta, ignore_errors=True)


def crear_app(permitidas: set[str] | None = None) -> FastAPI:
    permitidas = set(permitidas or ips_permitidas())
    taller = Taller()
    app = FastAPI(title="Taller Oraflow", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.taller = taller

    @app.middleware("http")
    async def solo_ips_permitidas(request: Request, siguiente):
        ip = request.client.host if request.client else ""
        if ip not in permitidas:
            return JSONResponse({"detail": "IP no permitida"}, status_code=403)
        return await siguiente(request)

    @app.get("/api/salud")
    def salud():
        return {"ok": True, "nucleos": os.cpu_count(), "paralelo": MAX_PARALELO,
                "trabajando": taller.activos(), "en_cola": taller.en_cola(), "ffmpeg": FFMPEG,
                **taller.cuentas()}

    def ruta_cache(sha: str) -> Path:
        if not SHA.fullmatch(sha):
            raise HTTPException(400, "invalid sha256")
        return CACHE / sha

    @app.head("/api/archivos/{sha}")
    def existe(sha: str):
        return Response(status_code=200 if ruta_cache(sha).is_file() else 404)

    @app.get("/api/archivos/{sha}")
    def baja(sha: str):
        ruta = ruta_cache(sha)
        if not ruta.is_file():
            raise HTTPException(404, "not found")
        return FileResponse(ruta, media_type="application/octet-stream")

    @app.put("/api/archivos/{sha}")
    async def sube(sha: str, request: Request):
        final = ruta_cache(sha)
        if final.is_file():
            os.utime(final)
            return {"ok": True, "ya_estaba": True}
        tmp = CACHE / f".{sha}.{uuid.uuid4().hex[:8]}.parte"
        h = hashlib.sha256()
        try:
            with open(tmp, "wb") as f:
                async for bloque in request.stream():
                    h.update(bloque)
                    f.write(bloque)
            if h.hexdigest() != sha:
                raise HTTPException(400, "the content does not match its sha256")
            os.replace(tmp, final)
        finally:
            tmp.unlink(missing_ok=True)
        return {"ok": True}

    @app.post("/api/trabajos")
    def crea(datos: dict):
        args, entradas, salidas = datos.get("args"), datos.get("entradas") or {}, datos.get("salidas") or []
        if not args_seguros(args):
            raise HTTPException(400, "invalid args (absolute paths, URLs or '..')")
        if not isinstance(entradas, dict) or not isinstance(salidas, list) or not salidas:
            raise HTTPException(400, "faltan entradas o salidas")
        for rel in [*entradas.keys(), *salidas]:
            if not isinstance(rel, str) or not REL.fullmatch(rel):
                raise HTTPException(400, f"invalid path: {rel!r}")
        faltan = [sha for sha in entradas.values() if not ruta_cache(sha).is_file()]
        if faltan:
            raise HTTPException(409, {"faltan": faltan})
        limite = min(float(datos.get("limite_s") or 4 * 3600), 8 * 3600)
        t = taller.nuevo(args, entradas, salidas, limite)
        return {"id": t["id"], "estado": t["estado"]}

    @app.get("/api/trabajos/{id_}")
    def estado(id_: str):
        t = taller.trabajos.get(id_)
        if not t:
            raise HTTPException(404, "not found")
        visible = {k: t.get(k) for k in ("id", "estado", "error", "salidas", "stdout", "stderr")}
        if t.get("inicio"):
            visible["segundos"] = round((t.get("fin") or time.time()) - t["inicio"], 2)
        return visible

    def limpieza():
        while True:
            try:
                limpia_cache()
            except Exception:  # noqa: BLE001
                pass
            time.sleep(3600)

    threading.Thread(target=limpieza, daemon=True).start()
    return app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(crear_app(), host="0.0.0.0", port=PUERTO, log_level="warning")
