#!/usr/bin/env python3
"""Serves the app on your computer: python3 tools/serve.py [port]

Like `python3 -m http.server`, but tells the browser to re-check every file, so after the
course is updated you never get a mix of old and new files.

The app loads every lesson file at startup (over 300 of them), so the server keeps connections
open (HTTP/1.1) and listens on both 127.0.0.1 and ::1. Windows tries "localhost" on IPv6 first:
with only an IPv4 server, each new connection waited about two seconds before falling back.
"""
import functools
import http.server
import socket
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class FreshHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"  # keep-alive: one connection serves many files

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_request(self, code="-", size="-"):
        # a page load makes hundreds of requests: print only the failed ones
        try:
            failed = int(code) >= 400
        except (TypeError, ValueError):
            failed = True
        if failed:
            super().log_request(code, size)


class IPv6Server(http.server.ThreadingHTTPServer):
    address_family = socket.AF_INET6


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(FreshHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    try:
        ipv6 = IPv6Server(("::1", port), handler)
        threading.Thread(target=ipv6.serve_forever, daemon=True).start()
    except OSError:
        pass  # no IPv6 on this machine: 127.0.0.1 alone is fine there
    print(f"Français is running at http://localhost:{port}  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
