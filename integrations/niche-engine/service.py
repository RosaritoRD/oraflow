"""Private HTTP adapter for sentien-labs/youtube-niche.

The upstream project is intentionally pinned in the Dockerfile. This adapter keeps long-running
scans outside Oraflow's Node process and returns a small, stable JSON contract to the dashboard.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import os
import re
import subprocess
import threading
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


PORT = int(os.environ.get("NICHE_ENGINE_PORT", "8765"))
DATA_DIR = Path(os.environ.get("NICHE_ENGINE_DATA", "/data"))
RUNS_DIR = DATA_DIR / "runs"
RUNS_FILE = DATA_DIR / "runs.json"
UPSTREAM_COMMIT = "d8f605c273e15cbdcb536ef8e4b076ef892172be"
MAX_LOG_CHARS = 8000

store_lock = threading.Lock()
worker_lock = threading.Lock()


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def load_runs() -> list[dict]:
    with store_lock:
        try:
            data = json.loads(RUNS_FILE.read_text())
            return data if isinstance(data, list) else []
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return []


def save_runs(runs: list[dict]) -> None:
    with store_lock:
        RUNS_FILE.parent.mkdir(parents=True, exist_ok=True)
        temporary = RUNS_FILE.with_suffix(".tmp")
        temporary.write_text(json.dumps(runs[:30], ensure_ascii=False, indent=2))
        temporary.replace(RUNS_FILE)


def update_run(run_id: str, **changes) -> dict | None:
    runs = load_runs()
    for run in runs:
        if run.get("id") == run_id:
            run.update(changes)
            save_runs(runs)
            return run
    return None


def public_run(run: dict, include_log: bool = False) -> dict:
    visible = {key: value for key, value in run.items() if key != "log"}
    if include_log and run.get("log"):
        visible["log"] = run["log"][-MAX_LOG_CHARS:]
    return visible


def prepare_auth() -> dict:
    if os.environ.get("YOUTUBE_API_KEY", "").strip():
        return {"configured": True, "verified": False, "mode": "api_key", "message": "YouTube Data API key configured; verification pending"}

    credentials_path = Path(os.environ.get("ORAFLOW_CREDENTIALS", "/config/credentials.json"))
    token_path = Path(os.environ.get("ORAFLOW_TOKENS", "/config/tokens.json"))
    if not credentials_path.exists() or not token_path.exists():
        return {
            "configured": False,
            "verified": False,
            "mode": "none",
            "message": "Add YOUTUBE_API_KEY or complete YouTube OAuth setup",
        }

    try:
        credentials = json.loads(credentials_path.read_text())
        youtube = credentials.get("youtube") or {}
        if not youtube.get("client_id") or not youtube.get("client_secret"):
            raise ValueError("YouTube OAuth client fields are missing")
        tokens = json.loads(token_path.read_text())
        youtube_tokens = tokens.get("youtube") or tokens
        if not youtube_tokens.get("refresh_token") and not youtube_tokens.get("access_token") and not youtube_tokens.get("token"):
            raise ValueError("YouTube OAuth token fields are missing")
        auth_dir = DATA_DIR / "auth"
        auth_dir.mkdir(parents=True, exist_ok=True)
        derived_path = auth_dir / "client_secret.json"
        derived_token_path = auth_dir / "token.json"
        derived_path.write_text(json.dumps({
            "web": {
                "client_id": youtube["client_id"],
                "client_secret": youtube["client_secret"],
                "redirect_uris": youtube.get("redirect_uris") or [],
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        }))
        derived_path.chmod(0o600)
        derived_token_path.write_text(json.dumps(youtube_tokens))
        derived_token_path.chmod(0o600)
        os.environ["YOUTUBE_OAUTH_CLIENT_SECRET"] = str(derived_path)
        os.environ["YOUTUBE_OAUTH_TOKEN"] = str(derived_token_path)
        return {"configured": True, "verified": False, "mode": "oauth", "message": "Oraflow YouTube OAuth configured; verification pending"}
    except (OSError, ValueError, json.JSONDecodeError, TypeError, KeyError):
        return {
            "configured": False,
            "verified": False,
            "mode": "none",
            "message": "Oraflow YouTube OAuth files are incomplete",
        }


AUTH = {"configured": False, "verified": False, "mode": "none", "message": "Starting"}


def as_float(value, default=None):
    try:
        return float(value) if value not in (None, "") else default
    except (TypeError, ValueError):
        return default


def percent(value):
    number = as_float(value)
    return round(number * 100) if number is not None else None


def next_month_signal(row: dict) -> dict:
    opportunity = as_float(row.get("opportunity"), 0.0)
    demand = as_float(row.get("demand"), 0.0)
    supply_gap = as_float(row.get("supply_gap"), 0.0)
    trend_values = [
        as_float(row.get("trend_slope_score")),
        as_float(row.get("trend_breakout_score")),
        as_float(row.get("trend_rising_score")),
    ]
    present_trends = [value for value in trend_values if value is not None]
    momentum = sum(present_trends) / len(present_trends) if present_trends else None
    durability = as_float(row.get("trends_durability"))
    weighted = [(opportunity, 0.35), (demand, 0.20), (supply_gap, 0.15)]
    if momentum is not None:
        weighted.append((momentum, 0.20))
    if durability is not None:
        weighted.append((durability, 0.10))
    total_weight = sum(weight for _, weight in weighted) or 1.0
    score = sum(value * weight for value, weight in weighted) / total_weight
    if score >= 0.68 and momentum is not None and momentum >= 0.55:
        label = "Rising opportunity"
        direction = "up"
    elif score >= 0.48:
        label = "Worth watching"
        direction = "steady"
    else:
        label = "Weak signal"
        direction = "down"
    return {
        "score": round(score * 100),
        "label": label,
        "direction": direction,
        "trendAvailable": momentum is not None,
    }


def parse_results(run_dir: Path) -> list[dict]:
    report_path = None
    for candidate in sorted(run_dir.glob("*.csv"), key=lambda path: path.stat().st_mtime, reverse=True):
        try:
            with candidate.open(newline="") as handle:
                fields = csv.DictReader(handle).fieldnames or []
            if "topic" in fields and "opportunity" in fields and "snapshot_id" not in fields:
                report_path = candidate
                break
        except OSError:
            continue
    if not report_path:
        return []

    results = []
    with report_path.open(newline="") as handle:
        for index, row in enumerate(csv.DictReader(handle), 1):
            results.append({
                "rank": index,
                "topic": row.get("topic") or "Untitled niche",
                "opportunity": percent(row.get("opportunity")),
                "demand": percent(row.get("demand")),
                "lowSupply": percent(row.get("supply_gap")),
                "monetization": percent(row.get("cpm_score")),
                "confidence": percent(row.get("confidence")),
                "durability": percent(row.get("trends_durability")),
                "medianViewsPerDay": round(as_float(row.get("median_vpd"), 0)),
                "recentHits": round(as_float(row.get("recent_success_count"), 0)),
                "credibleCompetitors": round(as_float(row.get("credible_results"), 0)),
                "risingSearches": [item.strip() for item in (row.get("trend_rising_terms") or "").split(";") if item.strip()][:5],
                "candidateSource": row.get("candidate_source") or "engine",
                "nextMonth": next_month_signal(row),
            })
    return results


def sanitize_failure(output: str) -> str:
    compact = " ".join((output or "").split())
    if "invalid_client" in compact:
        return "Google rejected the current YouTube OAuth client. Update the OAuth credentials or add YOUTUBE_API_KEY."
    if "no YouTube auth" in compact:
        return "YouTube research authentication is not configured. Add YOUTUBE_API_KEY or complete OAuth."
    if "quota" in compact.lower():
        return "The YouTube Data API quota is exhausted. Try again after the quota resets."
    return compact[-600:] or "The niche scan ended without producing a report."


def scan_worker(run_id: str) -> None:
    with worker_lock:
        run = update_run(run_id, status="running", startedAt=utc_now(), progress=12)
        if not run:
            return
        run_dir = RUNS_DIR / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        command = [
            "python", "-m", "youtube_niche", run["seed"],
            "--max-seeds", str(run["maxCandidates"]),
            "--top-n", "20",
            "--query-samples", "1",
            "--no-llm",
            "--snapshot",
            "--snapshot-horizons", "30",
            "--out-dir", str(run_dir),
            "--region-code", run["region"],
            "--relevance-language", run["language"],
            "--trends-geo", run["region"],
        ]
        update_run(run_id, progress=24)
        try:
            completed = subprocess.run(
                command,
                cwd=run_dir,
                capture_output=True,
                text=True,
                timeout=720,
                env=os.environ.copy(),
                check=False,
            )
            output = f"{completed.stdout}\n{completed.stderr}".strip()
            if completed.returncode != 0:
                failure = sanitize_failure(output)
                if "invalid_client" in output:
                    AUTH.update({"configured": False, "verified": False, "message": failure})
                update_run(
                    run_id,
                    status="failed",
                    progress=100,
                    completedAt=utc_now(),
                    error=failure,
                    log=output[-MAX_LOG_CHARS:],
                )
                return
            results = parse_results(run_dir)
            if not results:
                update_run(
                    run_id,
                    status="failed",
                    progress=100,
                    completedAt=utc_now(),
                    error="The engine completed but found no sufficiently relevant opportunities.",
                    log=output[-MAX_LOG_CHARS:],
                )
                return
            update_run(
                run_id,
                status="complete",
                progress=100,
                completedAt=utc_now(),
                results=results,
                resultCount=len(results),
                error=None,
                log=output[-MAX_LOG_CHARS:],
            )
            AUTH.update({"verified": True, "message": f"YouTube {AUTH.get('mode', 'API')} access verified"})
        except subprocess.TimeoutExpired as error:
            captured = f"{error.stdout or ''}\n{error.stderr or ''}"
            update_run(
                run_id,
                status="failed",
                progress=100,
                completedAt=utc_now(),
                error="The niche scan exceeded the 12-minute safety limit.",
                log=captured[-MAX_LOG_CHARS:],
            )
        except Exception as error:  # keep the private worker alive after unexpected provider errors
            update_run(
                run_id,
                status="failed",
                progress=100,
                completedAt=utc_now(),
                error=f"Niche engine failure: {type(error).__name__}",
            )


def active_run(runs: list[dict]) -> dict | None:
    return next((run for run in runs if run.get("status") in {"queued", "running"}), None)


class Handler(BaseHTTPRequestHandler):
    server_version = "OraflowNicheEngine/1.0"

    def log_message(self, fmt, *args):
        print(f"[niche-engine] {self.address_string()} {fmt % args}")

    def send_json(self, status: int, payload: dict | list) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as error:
            raise ValueError("Invalid content length") from error
        if length <= 0 or length > 32768:
            raise ValueError("Request body must be between 1 byte and 32 KB")
        try:
            data = json.loads(self.rfile.read(length))
        except json.JSONDecodeError as error:
            raise ValueError("Request body must be valid JSON") from error
        if not isinstance(data, dict):
            raise ValueError("Request body must be a JSON object")
        return data

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        runs = load_runs()
        if path == "/health":
            current = active_run(runs)
            self.send_json(HTTPStatus.OK, {
                "ok": True,
                "source": "sentien-labs/youtube-niche",
                "commit": UPSTREAM_COMMIT,
                "auth": AUTH,
                "activeRunId": current.get("id") if current else None,
            })
            return
        if path == "/runs":
            self.send_json(HTTPStatus.OK, {"runs": [public_run(run) for run in runs[:12]]})
            return
        match = re.fullmatch(r"/runs/([a-f0-9-]+)", path)
        if match:
            run = next((item for item in runs if item.get("id") == match.group(1)), None)
            if not run:
                self.send_json(HTTPStatus.NOT_FOUND, {"error": "Run not found"})
                return
            self.send_json(HTTPStatus.OK, public_run(run, include_log=run.get("status") == "failed"))
            return
        self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/") or "/"
        if path != "/scan":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return
        if not AUTH.get("configured"):
            self.send_json(HTTPStatus.CONFLICT, {"error": AUTH.get("message"), "code": "auth_required"})
            return
        try:
            body = self.read_json()
            seed = " ".join(str(body.get("seed") or "").split())
            region = str(body.get("region") or "US").upper()
            language = str(body.get("language") or "en").lower()
            max_candidates = int(body.get("maxCandidates") or 5)
            if len(seed) < 3 or len(seed) > 120:
                raise ValueError("Seed must contain 3 to 120 characters")
            if not re.fullmatch(r"[A-Z]{2}", region):
                raise ValueError("Region must be a two-letter country code")
            if not re.fullmatch(r"[a-z]{2,3}", language):
                raise ValueError("Language must be a two or three-letter code")
            if max_candidates < 1 or max_candidates > 8:
                raise ValueError("Candidate count must be between 1 and 8")
        except (ValueError, TypeError) as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return

        runs = load_runs()
        current = active_run(runs)
        if current:
            self.send_json(HTTPStatus.CONFLICT, {
                "error": "A niche scan is already running",
                "code": "scan_active",
                "run": public_run(current),
            })
            return
        run = {
            "id": str(uuid.uuid4()),
            "seed": seed,
            "region": region,
            "language": language,
            "maxCandidates": max_candidates,
            "status": "queued",
            "progress": 4,
            "createdAt": utc_now(),
            "startedAt": None,
            "completedAt": None,
            "resultCount": 0,
            "results": [],
            "error": None,
            "source": f"sentien-labs/youtube-niche@{UPSTREAM_COMMIT[:8]}",
        }
        runs.insert(0, run)
        save_runs(runs)
        threading.Thread(target=scan_worker, args=(run["id"],), daemon=True).start()
        self.send_json(HTTPStatus.ACCEPTED, public_run(run))


def main() -> None:
    global AUTH
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    AUTH = prepare_auth()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[niche-engine] listening on :{PORT}; auth={AUTH['mode']}")
    server.serve_forever()


if __name__ == "__main__":
    main()
