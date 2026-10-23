import importlib.util
import unittest
from pathlib import Path
s=importlib.util.spec_from_file_location('collector',Path(__file__).resolve().parents[1]/'scripts/collect-web.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
URL='https://www.instagram.com/p/DeGjnGIjeZb/'
class Page:
    url=URL
    def __init__(self,blocked=False,endless=False):self.steps=0;self.blocked=blocked;self.endless=endless
    def evaluate(self,script):
        if script==m.EXTRACT:return {'blocked':self.blocked,'text':'text '+str(self.steps),'media':[{'url':'https://example.com/image.jpg','alt':'alt'}]}
    def locator(self,s):assert s=='article';return self
    def get_by_role(self,*args,**kwargs):return self
    def count(self):return int(self.endless or self.steps<2)
    def is_visible(self):return True
    def is_enabled(self):return True
    def click(self,**kwargs):self.steps+=1
    def wait_for_timeout(self,n):pass
class Tests(unittest.TestCase):
    def run_page(self,page):
        class Fetch:
            @staticmethod
            def fetch(url,**kwargs):kwargs['page_action'](page)
        return m.collect(URL,Fetch)
    def test_collect_bounded_unique_partial(self):
        p=Page(endless=True);r=self.run_page(p);self.assertEqual(p.steps,20);self.assertEqual(len(r['media']),1);self.assertEqual(r['status'],'partial');self.assertIn('OCR',str(r['limitations']))
    def test_login_and_redirect_do_not_become_evidence(self):
        self.assertEqual(self.run_page(Page(blocked=True))['status'],'blocked')
        p=Page();p.url='https://www.instagram.com/accounts/login/';self.assertEqual(self.run_page(p)['text'],'')
    def test_offline_is_explicit(self):
        class Fail:
            @staticmethod
            def fetch(*a,**kw):raise TimeoutError('do not expose cookies')
        r=m.collect(URL,Fail);self.assertEqual(r['status'],'failed');self.assertNotIn('cookies',str(r))
    def test_identity_preserved_tracking_removed(self):
        self.assertEqual(m.target_url(URL+'?img_index=3&stkn=abc'),URL+'?img_index=3')
        for u in ['https://evil.com/','https://github.com/owner/repo/issues','https://www.instagram.com/accounts/login/']:
            with self.assertRaises(ValueError):m.target_url(u)
if __name__=='__main__':unittest.main()
