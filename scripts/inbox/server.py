"""Loopback-only personal dashboard. No execution endpoint."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import threading
from .discovery import discover, DEFAULT_QUERY
from .web_references import Archive
from .reference_candidates import ReferenceCandidates
from .aside_links import open_link


def make_server(store, port=3127):
    token = secrets.token_urlsafe(32)
    collecting = threading.Lock()
    resolving = threading.Lock()
    reference_candidates = ReferenceCandidates(store)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send(self, status, payload, content_type='application/json; charset=utf-8'):
            data = payload.encode() if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
            self.end_headers()
            self.wfile.write(data)

        def trusted(self, write=False):
            origin = 'http://127.0.0.1:' + str(self.server.server_address[1])
            host_ok = self.headers.get('Host') == origin.removeprefix('http://')
            given = self.headers.get('Origin')
            return host_ok and (given == origin if write else given in {None, origin}) and (not write or secrets.compare_digest(self.headers.get('X-Inbox-CSRF',''), token))

        def do_GET(self):
            if not self.trusted(): return self.send(403, {'error':'local origin required'})
            if self.path == '/api/state':
                return self.send(200, dict(**store.snapshot(), csrf=token, collecting=collecting.locked(), storage=str(store.path), webReferences=Archive(store.path.parent/'web-collections').read(), referenceCandidates=reference_candidates.snapshot(), resolving=resolving.locked()))
            assets = {'/cassette-review.json':('cassette-review.json','application/json; charset=utf-8'), '/':('dashboard.html','text/html; charset=utf-8'), '/app.js':('dashboard.js','text/javascript; charset=utf-8'), '/style.css':('dashboard.css','text/css; charset=utf-8')}
            if self.path in assets:
                file, content_type = assets[self.path]
                return self.send(200, (Path(__file__).parent/file).read_text(), content_type)
            return self.send(404, {'error':'not found'})

        def do_POST(self):
            if not self.trusted(True): return self.send(403, {'error':'local origin and CSRF required'})
            try:
                length = int(self.headers.get('Content-Length','0'))
                if not 0 < length <= 32768: raise ValueError('invalid request size')
                if self.headers.get('Content-Type') != 'application/json': raise ValueError('JSON required')
                data = json.loads(self.rfile.read(length))
                if not isinstance(data, dict): raise ValueError('object required')
                if self.path == '/api/open-aside' and set(data) == {'url'}:
                    snap=store.snapshot()
                    allowed={o['url'] for o in snap['observations']}
                    allowed.update(p['url'] for p in Archive(store.path.parent/'web-collections').read()['references'])
                    review=json.loads((Path(__file__).parent/'cassette-review.json').read_text())
                    allowed.update(x['url'] for x in review['sources'])
                    allowed.update(x['url'] for x in review.get('actions',[]))
                    allowed.update(i['url'] for r in reference_candidates.snapshot()['references'] for i in r['items'])
                    try:open_link(data['url'],allowed)
                    except OSError as error:return self.send(503,{'error':str(error)})
                elif self.path == '/api/profile' and set(data) == {'profile'}:
                    store.profile(data['profile'])
                elif self.path == '/api/decision' and set(data) == {'id','decision'}:
                    if not all(isinstance(v,str) for v in data.values()): raise ValueError('invalid decision')
                    store.decide(data['id'], data['decision'])
                elif self.path == '/api/resolve-references' and set(data) == {'retry'}:
                    if type(data['retry']) is not bool:raise ValueError('retry must be boolean')
                    if not resolving.acquire(blocking=False):return self.send(409, {'error':'참고자료 확인이 진행 중입니다.'})
                    retry=data['retry']
                    def resolve_references():
                        try:
                            reference_candidates.resolve(retry=retry)
                        except (ValueError, TypeError, KeyError, OSError):
                            store.record_run('failed', '참고자료 후보 연결 실패. 다른 작업 실행 여부와 저장소 접근을 확인하세요.')
                        finally:resolving.release()
                    threading.Thread(target=resolve_references,daemon=True).start()
                elif self.path == '/api/discover' and set(data) == {'query'}:
                    query = data['query']
                    if not isinstance(query,str) or not query.strip() or len(query)>256: raise ValueError('invalid query')
                    if not collecting.acquire(blocking=False): return self.send(409, {'error':'수집이 이미 진행 중입니다.'})
                    store.query(query)
                    def run():
                        try: discover(store, query)
                        finally: collecting.release()
                    threading.Thread(target=run, daemon=True).start()
                else:
                    raise ValueError('unknown operation')
                return self.send(200, {'ok':True})
            except (ValueError, TypeError, KeyError):
                return self.send(400, {'error':'입력이 잘못되었거나 자료가 바뀐 요청입니다. 새로고침 후 확인하세요.'})

    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    return server
