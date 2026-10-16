#!/usr/bin/env python3
"""Local web app for extracting sales ledger entries with Ollama."""

import base64
import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
OLLAMA_URL = "http://127.0.0.1:11434"
# The default `qwen3-vl:2b` tag reasons for a long time before answering; `-instruct` skips that.
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3-vl:2b-instruct")
# Ollama's default 4096-token context is too small for a ledger photo plus its JSON answer.
NUM_CTX = 8192
# Keep the model loaded between pages so only the first page after a break pays the load time.
KEEP_ALIVE = "30m"
MAX_IMAGE_BYTES = 12 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

SYSTEM_PROMPT = """You extract handwritten sales ledger rows from a single page image.
Return only a JSON object with an `entries` array. Each entry must have `date`, `item`,
`quantity`, `amount`, and `uncertain_fields`. Use strings for values exactly as written;
use an empty string when a value is missing or cannot be read. `uncertain_fields` is an
array containing any of date, item, quantity, amount that you could not read confidently.
Do not invent values, calculate totals, normalize dates, or merge separate rows. Ignore
headers, totals, and notes that are not individual sales. Keep entries in page order."""


def ollama_request(path, payload=None, timeout=300):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = Request(
        f"{OLLAMA_URL.rstrip('/')}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/status":
            try:
                result = ollama_request("/api/tags", timeout=3)
                models = [model.get("name", "") for model in result.get("models", [])]
                self.send_json(200, {"ollama": True, "models": models, "defaultModel": DEFAULT_MODEL})
            except (OSError, URLError, HTTPError, ValueError):
                self.send_json(200, {"ollama": False, "models": [], "defaultModel": DEFAULT_MODEL})
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/extract":
            self.send_json(404, {"error": "Not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > MAX_IMAGE_BYTES * 2:
                self.send_json(413, {"error": "Image is too large. Choose an image under 12 MB."})
                return
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                self.send_json(400, {"error": "Invalid image request."})
                return
            mime_type = request.get("mimeType", "")
            image_data = request.get("image", "")
            model = request.get("model", DEFAULT_MODEL)
            if not isinstance(mime_type, str) or not isinstance(model, str) or not isinstance(image_data, str):
                self.send_json(400, {"error": "Invalid image request."})
                return
            model = model.strip()
            if mime_type not in ALLOWED_TYPES:
                self.send_json(415, {"error": "Choose a JPEG, PNG, or WebP image."})
                return
            if not model or len(model) > 120:
                self.send_json(400, {"error": "Enter a valid Ollama model name."})
                return
            image_bytes = base64.b64decode(image_data, validate=True)
            if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
                self.send_json(413, {"error": "Image is too large. Choose an image under 12 MB."})
                return

            response = ollama_request("/api/chat", {
                "model": model,
                "stream": False,
                "format": "json",
                "keep_alive": KEEP_ALIVE,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": "Extract the sales entries from this ledger page.",
                     "images": [base64.b64encode(image_bytes).decode("ascii")]},
                ],
                "options": {"temperature": 0, "num_ctx": NUM_CTX},
            })
            content = response.get("message", {}).get("content", "")
            extracted = json.loads(content)
            entries = extracted.get("entries") if isinstance(extracted, dict) else None
            if not isinstance(entries, list):
                raise ValueError("The model response did not contain an entries list.")
            cleaned = []
            fields = ("date", "item", "quantity", "amount")
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                uncertain = entry.get("uncertain_fields", [])
                if not isinstance(uncertain, list):
                    uncertain = []
                cleaned.append({
                    field: str(entry.get(field) or "")[:500] for field in fields
                } | {"uncertain_fields": [field for field in uncertain if field in fields]})
            self.send_json(200, {"entries": cleaned})
        except (json.JSONDecodeError, ValueError, base64.binascii.Error) as error:
            self.send_json(400, {"error": str(error) or "Could not read the image request."})
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            self.send_json(502, {"error": f"Ollama returned an error ({error.code}). {detail[:300]}"})
        except (URLError, TimeoutError, OSError) as error:
            self.send_json(502, {"error": f"Couldn't reach Ollama at {OLLAMA_URL}. Start Ollama and check the model name. ({error})"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Ledger Lift is ready at http://127.0.0.1:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Ledger Lift.")
        server.server_close()
