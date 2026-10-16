"""Workshop tests. They run with real ffmpeg (the PC's).

    C:\\taller\\.venv\\Scripts\\python -m pytest -q C:\\taller\\tests
"""
import hashlib
import os
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture()
def cliente(tmp_path, monkeypatch):
    monkeypatch.setenv("TALLER_DIR", str(tmp_path))
    import importlib

    import taller
    importlib.reload(taller)
    from fastapi.testclient import TestClient

    app = taller.crear_app({"testclient"})
    return TestClient(app), taller


def sube(c, datos: bytes) -> str:
    sha = hashlib.sha256(datos).hexdigest()
    assert c.put(f"/api/archivos/{sha}", content=datos).status_code == 200
    return sha


def espera(c, id_, limite=60):
    t0 = time.time()
    while time.time() - t0 < limite:
        r = c.get(f"/api/trabajos/{id_}").json()
        if r["estado"] in ("listo", "error"):
            return r
        time.sleep(0.2)
    raise AssertionError("the job did not finish")


def test_solo_ips_permitidas(tmp_path, monkeypatch):
    monkeypatch.setenv("TALLER_DIR", str(tmp_path))
    import taller
    from fastapi.testclient import TestClient

    c = TestClient(taller.crear_app({"YOUR_VPS_IP"}))
    assert c.get("/api/salud").status_code == 403


def test_subir_comprueba_el_sha(cliente):
    c, _ = cliente
    malo = "0" * 64
    assert c.put(f"/api/archivos/{malo}", content=b"hola").status_code == 400
    sha = sube(c, b"hola")
    assert c.head(f"/api/archivos/{sha}").status_code == 200
    assert c.get(f"/api/archivos/{sha}").content == b"hola"
    assert c.head(f"/api/archivos/{'1' * 64}").status_code == 404


@pytest.mark.parametrize("args", [
    ["-i", "C:\\Windows\\win.ini", "s/0.mp4"],
    ["-i", "e/0.mp4", "/tmp/fuera.mp4"],
    ["-i", "http://x.com/a.mp4", "s/0.mp4"],
    ["-i", "../../secreto", "s/0.mp4"],
    ["-vf", "subtitles='/app/data/x.ass'", "s/0.mp4"],
    ["-i", "\\\\servidor\\c$\\x", "s/0.mp4"],
])
def test_rechaza_rutas_peligrosas(cliente, args):
    c, _ = cliente
    r = c.post("/api/trabajos", json={"args": args, "entradas": {}, "salidas": ["s/0.mp4"]})
    assert r.status_code == 400


def test_filtros_normales_si_valen(cliente):
    _, taller = cliente
    assert taller.args_seguros(["-vf", "scale=1920:1080,zoompan=z='1+0.0006*on':x='iw/2-(iw/zoom/2)'", "s/0.mp4"])
    assert taller.args_seguros(["-vf", "subtitles='e/1.ass':fontsdir='e/d0'", "s/0.mp4"])


def test_faltan_entradas(cliente):
    c, _ = cliente
    r = c.post("/api/trabajos", json={"args": ["-i", "e/0.wav", "s/0.mp3"], "entradas": {"e/0.wav": "a" * 64}, "salidas": ["s/0.mp3"]})
    assert r.status_code == 409


def test_trabajo_real_con_ffmpeg(cliente):
    c, _ = cliente
    r = c.post("/api/trabajos", json={
        "args": ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "s/tono.wav"],
        "entradas": {}, "salidas": ["s/tono.wav"]})
    assert r.status_code == 200, r.text
    fin = espera(c, r.json()["id"])
    assert fin["estado"] == "listo", fin
    sal = fin["salidas"]["s/tono.wav"]
    datos = c.get(f"/api/archivos/{sal['sha']}").content
    assert len(datos) == sal["bytes"] > 1000
    # And that output serves as input for the next step without uploading it again.
    r2 = c.post("/api/trabajos", json={"args": ["-y", "-v", "error", "-i", "e/0.wav", "-c:a", "libmp3lame", "s/0.mp3"],
                                       "entradas": {"e/0.wav": sal["sha"]}, "salidas": ["s/0.mp3"]})
    assert espera(c, r2.json()["id"])["estado"] == "listo"


def test_error_de_ffmpeg_se_devuelve(cliente):
    c, _ = cliente
    r = c.post("/api/trabajos", json={"args": ["-v", "error", "-i", "e/no.wav", "s/0.mp3"], "entradas": {}, "salidas": ["s/0.mp3"]})
    fin = espera(c, r.json()["id"])
    assert fin["estado"] == "error"
    assert "e/no.wav" in (fin["stderr"] or "")


def test_limpieza_borra_lo_viejo(cliente):
    c, taller = cliente
    sha = sube(c, b"viejo")
    viejo = time.time() - 10 * 86400
    os.utime(taller.CACHE / sha, (viejo, viejo))
    assert taller.limpia_cache() == 1
    assert c.head(f"/api/archivos/{sha}").status_code == 404
