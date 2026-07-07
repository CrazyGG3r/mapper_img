"""
Local web UI for the map generator.

Double-click MapGenerator.bat (or run `python app.py`). It starts a tiny
local server, opens your browser, and you drag & drop images there.
Nothing leaves your machine.
"""

import base64
import io
import json
import threading
import uuid
import webbrowser
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from PIL import Image

from generate_maps import generate_pbr_maps

ROOT = Path(__file__).parent
MAP_ORDER = ["basecolor", "normal", "ao", "roughness", "height"]

# last few results kept in memory so "Save all" can zip without re-processing
_results: dict[str, tuple[str, dict[str, bytes]]] = {}
_result_order: list[str] = []
_lock = threading.Lock()


def _png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def _remember(stem: str, files: dict[str, bytes]) -> str:
    rid = uuid.uuid4().hex[:12]
    with _lock:
        _results[rid] = (stem, files)
        _result_order.append(rid)
        while len(_result_order) > 4:          # cap memory use
            _results.pop(_result_order.pop(0), None)
    return rid


class Handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):  # keep the console quiet
        pass

    def _reply(self, code: int, body: bytes, ctype: str, extra: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    # ------------------------------------------------------------ GET

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/":
            html = (ROOT / "ui.html").read_bytes()
            self._reply(200, html, "text/html; charset=utf-8")
        elif url.path == "/zip":
            rid = parse_qs(url.query).get("id", [""])[0]
            with _lock:
                entry = _results.get(rid)
            if entry is None:
                self._reply(404, b"result expired, regenerate first", "text/plain")
                return
            stem, files = entry
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                for name in MAP_ORDER:
                    z.writestr(f"{stem}_maps/{stem}_{name}.png", files[name])
            self._reply(200, buf.getvalue(), "application/zip",
                        {"Content-Disposition": f'attachment; filename="{stem}_maps.zip"'})
        else:
            self._reply(404, b"not found", "text/plain")

    # ------------------------------------------------------------ POST

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != "/generate":
            self._reply(404, b"not found", "text/plain")
            return
        try:
            q = parse_qs(url.query)

            def num(key, default):
                return float(q.get(key, [default])[0])

            def flag(key):
                return q.get(key, ["0"])[0] == "1"

            raw = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            src = Image.open(io.BytesIO(raw))
            src.load()

            maps = generate_pbr_maps(
                src,
                strength=num("strength", 2.5),
                ao_strength=num("ao", 1.0),
                smooth=num("smooth", 1.0),
                saturation=num("sat", 1.0),
                roughness_amount=num("ramt", 1.0),
                invert_height=flag("invh"),
                invert_roughness=flag("invr"),
                flip_y=flag("invg"),
                world_space=flag("ws"),
            )

            name = unquote(q.get("name", ["image.png"])[0])
            stem = Path(name).stem or "image"
            files = {k: _png_bytes(v) for k, v in maps.items()}
            rid = _remember(stem, files)

            payload = {
                "id": rid,
                "stem": stem,
                "width": src.width,
                "height": src.height,
                "maps": {k: "data:image/png;base64," + base64.b64encode(v).decode()
                         for k, v in files.items()},
            }
            self._reply(200, json.dumps(payload).encode(), "application/json")
        except Exception as exc:  # bad image, decode error, etc.
            self._reply(400, f"{type(exc).__name__}: {exc}".encode(), "text/plain")


def main() -> None:
    server = None
    port = 8765
    for port in range(8765, 8790):
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            break
        except OSError:
            continue
    if server is None:
        raise SystemExit("No free port found between 8765 and 8789.")

    url = f"http://127.0.0.1:{port}/"
    print(f"Map Generator running at {url}")
    print("Close this window (or press Ctrl+C) to quit.")
    threading.Timer(0.4, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
