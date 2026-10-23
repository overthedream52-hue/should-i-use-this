import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from inbox.store import Store
from inbox.server import make_server

class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=Store(Path(self.tmp.name)/'db')
        self.server=make_server(self.store,0); self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.url='http://127.0.0.1:'+str(self.server.server_address[1])
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()
    def test_foreign_origin_and_wrong_host_rejected(self):
        for headers in [{'Origin':'https://evil.example'},{'Host':'evil.example'}]:
            with self.assertRaises(HTTPError) as e:urlopen(Request(self.url+'/api/state',headers=headers))
            self.assertEqual(e.exception.code,403);e.exception.close()
    def test_profile_requires_origin_and_csrf(self):
        req=Request(self.url+'/api/profile',data=b'{"profile":"test"}',headers={'Content-Type':'application/json','Origin':self.url})
        with self.assertRaises(HTTPError) as e:urlopen(req)
        self.assertEqual(e.exception.code,403);e.exception.close()
        state=json.load(urlopen(self.url+'/api/state'))
        req.add_header('X-Inbox-CSRF',state['csrf'])
        self.assertEqual(urlopen(req).status,200)
        self.assertEqual(self.store.snapshot()['settings']['profile'],'test')

class ReferenceApiTests(ServerTests):
    def test_reference_failure_visible_without_becoming_candidate(self):
        from inbox.web_references import Archive
        Archive(self.store.path.parent/'web-collections').save(dict(format='web-collection-v1',url='https://www.instagram.com/p/ABCDE123/',collectedAt='2026-10-06T00:00:00Z',collector='scrapling',status='blocked',text='',media=[],limitations=['로그인 없이 확인하지 못함']))
        state=json.load(urlopen(self.url+'/api/state'))
        self.assertEqual(state['webReferences']['references'][0]['status'],'blocked')
        self.assertEqual(state['jobs'],[])

    def test_reference_resolution_requires_csrf_and_returns_unresolved_without_job(self):
        from inbox.web_references import Archive
        Archive(self.store.path.parent/'web-collections').save(dict(format='web-collection-v1',url='https://example.com/article',collectedAt='2026-10-06T00:00:00Z',collector='scrapling',status='partial',text='Paid product name only',media=[],limitations=['일부만 확보']))
        state=json.load(urlopen(self.url+'/api/state'))
        self.assertIn('referenceCandidates',state)
        req=Request(self.url+'/api/resolve-references',data=b'{"retry":false}',headers={'Content-Type':'application/json','Origin':self.url})
        with self.assertRaises(HTTPError) as e:urlopen(req)
        self.assertEqual(e.exception.code,403);e.exception.close()
        req.add_header('X-Inbox-CSRF',state['csrf'])
        self.assertEqual(urlopen(req).status,200)
        import time
        for _ in range(30):
            state=json.load(urlopen(self.url+'/api/state'))
            if not state['resolving']:break
            time.sleep(.02)
        self.assertTrue(state['referenceCandidates']['references'][0]['needsResearch'])
        self.assertEqual(state['jobs'],[])

    def test_aside_open_uses_csrf_and_only_displayed_urls(self):
        from unittest.mock import patch
        state=json.load(urlopen(self.url+'/api/state'))
        def request(url,token=True):
            headers={'Content-Type':'application/json','Origin':self.url}
            if token:headers['X-Inbox-CSRF']=state['csrf']
            return Request(self.url+'/api/open-aside',data=json.dumps({'url':url}).encode(),headers=headers)
        with patch('inbox.server.open_link') as launch:
            with self.assertRaises(HTTPError) as e:urlopen(request('https://trycassette.online/',False))
            self.assertEqual(e.exception.code,403);e.exception.close();launch.assert_not_called()
            self.assertEqual(urlopen(request('https://trycassette.online/signup/')).status,200)
            self.assertIn('https://trycassette.online/signup/',launch.call_args.args[1])
        with self.assertRaises(HTTPError) as e:urlopen(request('https://evil.example/'))
        self.assertEqual(e.exception.code,400);e.exception.close()
        with patch('inbox.server.open_link',side_effect=OSError('Aside unavailable')):
            with self.assertRaises(HTTPError) as e:urlopen(request('https://trycassette.online/'))
            self.assertEqual(e.exception.code,503);e.exception.close()
