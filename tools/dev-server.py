#!/usr/bin/env python3
"""Local preview server for this folder.

The same as `python3 -m http.server`, with one difference: every reply tells
the browser not to keep a copy. Without that, a browser reuses a script it
fetched a minute ago, and a reload shows the old code beside the new page.

    python3 tools/dev-server.py          # http://127.0.0.1:4173
    python3 tools/dev-server.py 8080     # another port

For local use only. It listens on this machine alone.
"""

import functools
import http.server
import pathlib
import sys

SITE = pathlib.Path(__file__).resolve().parent.parent


class FreshHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class PreviewServer(http.server.ThreadingHTTPServer):
    # A browser opens several connections at once, and more than one browser
    # may be looking at the preview. The standard queue of 5 waiting
    # connections overflows, and the browser sees a script or image fail.
    request_queue_size = 128
    daemon_threads = True


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    handler = functools.partial(FreshHandler, directory=str(SITE))
    with PreviewServer(("127.0.0.1", port), handler) as server:
        print(f"Serving {SITE} at http://127.0.0.1:{port}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
