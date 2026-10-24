"""局域网 / 外网隧道用的静态服务器。
- 打开首页时，把 index.html 里引用的 30 多个本地脚本合并成一个文件（带内容指纹、长期缓存）：
  经过外网隧道时每个请求都要来回一趟（约 2 秒），文件多了很容易卡住或有一个失败，合并后只剩 3 个请求，
  手机第二次打开直接用缓存。本机双击 index.html 打开时仍是分开的文件，不受影响。
- 其他文件让浏览器每次确认是否更新（没变时只返回 304），改完代码刷新即可看到新版本。
- 支持 gzip 压缩。
用法：python3 tools/serve.py [端口，默认 8080]"""
import functools, gzip, hashlib, http.server, io, os, re, sys, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPT_RE = re.compile(r'<script src="((?:js|vendor)/[^"?]+)(?:\?[^"]*)?"></script>\n?')
_lock, _cache = threading.Lock(), {}


def build():
    """返回 (改写后的 index.html, 合并脚本名, 合并脚本内容)；源文件没变时用缓存。"""
    html_path = os.path.join(ROOT, 'index.html')
    html = open(html_path, encoding='utf-8').read()
    srcs = SCRIPT_RE.findall(html)
    stamp = tuple((p, os.path.getmtime(os.path.join(ROOT, p))) for p in ['index.html'] + srcs)
    with _lock:
        if _cache.get('stamp') == stamp:
            return _cache['html'], _cache['name'], _cache['js']
        parts = [f'/* ---- {p} ---- */\n' + open(os.path.join(ROOT, p), encoding='utf-8').read() for p in srcs]
        js = '\n;\n'.join(parts).encode('utf-8')
        name = f'__bundle.{hashlib.sha1(js).hexdigest()[:12]}.js'
        first = [True]

        def swap(m):
            if first[0]:
                first[0] = False
                return f'<script src="{name}"></script>\n'
            return ''
        out = SCRIPT_RE.sub(swap, html).encode('utf-8')
        _cache.update(stamp=stamp, html=out, name=name, js=js)
        return out, name, js


class Handler(http.server.SimpleHTTPRequestHandler):
    def send_bytes(self, body, ctype, cache):
        if 'gzip' in self.headers.get('Accept-Encoding', '') and len(body) > 1024:
            body = gzip.compress(body, 6)
            enc = True
        else:
            enc = False
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', cache)
        if enc:
            self.send_header('Content-Encoding', 'gzip')
        self.send_header('Vary', 'Accept-Encoding')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        try:
            if path in ('/', '/index.html'):
                html, _, _ = build()
                return self.send_bytes(html, 'text/html; charset=utf-8', 'no-cache')
            if path.startswith('/__bundle.') and path.endswith('.js'):
                _, name, js = build()
                if path[1:] != name:
                    return self.send_error(404, 'stale bundle')
                return self.send_bytes(js, 'text/javascript; charset=utf-8', 'public, max-age=31536000, immutable')
            if path.endswith(('.css', '.js', '.json', '.svg')):
                f = os.path.join(ROOT, path.lstrip('/'))
                if os.path.isfile(f) and os.path.realpath(f).startswith(ROOT):
                    ctype = {'.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml'}[os.path.splitext(f)[1]]
                    return self.send_bytes(open(f, 'rb').read(), ctype + '; charset=utf-8', 'no-cache')
        except (BrokenPipeError, ConnectionResetError):
            return
        return super().do_GET()

    do_HEAD = do_GET

    def end_headers(self):
        if not any(h.startswith(b'Cache-Control') for h in getattr(self, '_headers_buffer', [])):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = http.server.ThreadingHTTPServer(('0.0.0.0', port), functools.partial(Handler, directory=ROOT))
    print(f'Serving {ROOT} on http://0.0.0.0:{port}/ (scripts bundled, gzip, no-cache)', flush=True)
    server.serve_forever()
