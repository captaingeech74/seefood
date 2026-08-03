#!/usr/bin/env python3
"""Local-only PaddleOCR-VL 1.6 service for scanned restaurant menu PDFs."""
import json
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

_pipeline = None
_lock = threading.Lock()


def pipeline():
    global _pipeline
    if _pipeline is None:
        from paddleocr import PaddleOCRVL
        _pipeline = PaddleOCRVL(
            pipeline_version="v1.6",
            device="cpu",
            vl_rec_backend="mlx-vlm-server",
            vl_rec_server_url="http://127.0.0.1:8111/",
            vl_rec_api_model_name="PaddlePaddle/PaddleOCR-VL-1.6",
            use_doc_orientation_classify=True,
            use_doc_unwarping=True,
            use_layout_detection=True,
        )
    return _pipeline


class Handler(BaseHTTPRequestHandler):
    server_version = "SeeFoodPaddleOCR/1.0"

    def log_message(self, format, *args):
        return

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(200, {"ok": True, "model": "PaddleOCR-VL-1.6"})
        else:
            self.send_json(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/document/parse":
            return self.send_json(404, {"error": "not_found"})
        length = int(self.headers.get("content-length") or 0)
        if length <= 0 or length > 25 * 1024 * 1024:
            return self.send_json(413, {"error": "invalid_size"})
        content = self.rfile.read(length)
        if not content.startswith(b"%PDF-"):
            return self.send_json(415, {"error": "not_a_pdf"})
        try:
            with tempfile.TemporaryDirectory(prefix="seefood-paddleocr-") as directory:
                root = Path(directory)
                source = root / "menu.pdf"
                output = root / "output"
                source.write_bytes(content)
                output.mkdir()
                with _lock:
                    pages = list(pipeline().predict(input=str(source)))
                    restructured = list(pipeline().restructure_pages(pages, concatenate_pages=True))
                    for result in restructured:
                        result.save_to_markdown(save_path=output)
                markdown = "\n".join(path.read_text(errors="ignore") for path in sorted(output.rglob("*.md")))
                self.send_json(200, {"markdown": markdown, "pageCount": len(pages)})
        except Exception as error:
            self.send_json(500, {"error": f"{type(error).__name__}: {error}"})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8119), Handler).serve_forever()
