"""Pruebas del taller del PC (necesitan ffmpeg y el venv del taller: fastapi):
    en el PC:  cd ~/servicios/taller && .venv/bin/python -m unittest test_taller -v
"""
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path

_aqui = Path(__file__).resolve().parent
sys.path[:0] = [str(_aqui), str(_aqui.parents[1] / "pc" / "taller")]  # junto a taller.py en el PC, o desde el repo
os.environ.setdefault("TALLER_DIR", tempfile.mkdtemp())  # no tocar la caché real
import taller  # noqa: E402


class ResumenError(unittest.TestCase):
    def test_saca_las_lineas_que_explican_el_fallo(self):
        stderr = ("ffmpeg version 6.1 Copyright\n  built with gcc\n"
                  "[Parsed_subtitles_1 @ 0x6] Using font provider fontconfig\n"
                  "[concat @ 0x62] Impossible to open 'e/e/0.mp4'\n"
                  "[in#0 @ 0x62] Error opening input: No such file or directory\n"
                  "Error opening input file e/1.txt.\n")
        r = taller.resumen_error(stderr)
        self.assertIn("Impossible to open 'e/e/0.mp4'", r)
        self.assertNotIn("Using font provider", r)
        self.assertNotIn("ffmpeg version", r)

    def test_sin_lineas_de_error_devuelve_el_final(self):
        self.assertEqual(taller.resumen_error("uno\ndos\ntres"), "dos | tres")

    def test_vacio(self):
        self.assertEqual(taller.resumen_error(""), "")


class Cuentas(unittest.TestCase):
    def espera(self, t):
        for _ in range(200):
            if t.get("fin"):
                return
            time.sleep(0.05)
        self.fail("el trabajo no terminó")

    def test_cuenta_hechos_y_fallos_con_el_motivo(self):
        tl = taller.Taller()
        ok = tl.nuevo(["-f", "lavfi", "-i", "anullsrc=d=0.2", "s/a.wav"], {}, ["s/a.wav"], 30)
        self.espera(ok)
        malo = tl.nuevo(["-i", "e/no-existe.mp4", "s/b.mp4"], {}, ["s/b.mp4"], 30)
        self.espera(malo)
        c = tl.cuentas()
        self.assertEqual((c["hechos"], c["fallos"]), (1, 1))
        self.assertIn("no-existe.mp4", c["ultimo_error"])
        self.assertIn("no-existe.mp4", malo["error"])


if __name__ == "__main__":
    unittest.main()
