"""The local test server.

Threaded AND gzipping, and the second half is not a nicety.

Production serves every text asset with content-encoding: gzip. The stdlib
one-liner this replaces served them raw, so every local measurement against
a throttled connection was made against a page roughly four times heavier
than the one visitors actually get — js/stage/stage.js alone is 46KB raw and
about 10KB gzipped.

That made the slow-4G LCP test in tests/perf.spec.ts a test of the wrong
page. It had been passing on margin rather than on merit, and the first time
the site put on some legitimate weight it went over by 8ms — which read as a
regression in the site when it was a defect in the harness. A test bench that
does not serve what the server serves is measuring fiction.

Threaded because the single-threaded stdlib server serialises every request
and starves parallel Playwright workers into false timeouts.
"""
import gzip
import io
import sys
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# What Vercel compresses. Binary media is already compressed; gzipping it
# again costs CPU and gains nothing.
COMPRESSIBLE = (
    'text/', 'application/javascript', 'text/javascript',
    'application/json', 'image/svg+xml', 'application/xml',
)


class GzipHandler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        self._gz = False
        super().__init__(*a, **kw)

    def send_header(self, key, value):
        # Decide on the way past: the body is written after the headers, so
        # content-length has to be corrected here, before it is sent.
        if key.lower() == 'content-type':
            self._gz = (
                any(str(value).startswith(p) for p in COMPRESSIBLE)
                and 'gzip' in self.headers.get('Accept-Encoding', '')
            )
        if key.lower() == 'content-length' and self._gz:
            return  # replaced below, once the compressed size is known
        super().send_header(key, value)

    def end_headers(self):
        if self._gz:
            super().send_header('Content-Encoding', 'gzip')
        super().end_headers()

    def copyfile(self, source, outputfile):
        if not self._gz:
            return super().copyfile(source, outputfile)
        outputfile.write(gzip.compress(source.read(), 6))

    def send_head(self):
        # SimpleHTTPRequestHandler writes content-length before we know the
        # compressed size, so buffer the response and send it ourselves.
        if 'gzip' not in self.headers.get('Accept-Encoding', ''):
            self._gz = False
            return super().send_head()
        path = self.translate_path(self.path)
        import os
        if os.path.isdir(path):
            self._gz = False
            return super().send_head()
        ctype = self.guess_type(path)
        if not any(str(ctype).startswith(p) for p in COMPRESSIBLE):
            self._gz = False
            return super().send_head()
        try:
            with open(path, 'rb') as f:
                body = gzip.compress(f.read(), 6)
        except OSError:
            self._gz = False
            return super().send_head()
        self.send_response(200)
        super().send_header('Content-Type', ctype)
        super().send_header('Content-Encoding', 'gzip')
        super().send_header('Content-Length', str(len(body)))
        super().send_header('Cache-Control', 'no-store')
        super().end_headers()
        self._gz = False
        return io.BytesIO(body)

    def log_message(self, *a):
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    ThreadingHTTPServer(('', port), GzipHandler).serve_forever()
