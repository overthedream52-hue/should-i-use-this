import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from inbox.store import Store

SOURCE={'url':'https://github.com/example/tool','name':'example/tool','text':'A public README about local tools.'}
class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.path=Path(self.tmp.name)/'inbox.db'; self.s=Store(self.path)
    def tearDown(self): self.tmp.cleanup()
    def test_persist_dedup_and_changed_source(self):
        self.s.observe(SOURCE);self.s.observe(SOURCE)
        self.assertEqual(len(Store(self.path).jobs()),1)
        self.s.observe({**SOURCE,'text':'Changed README'})
        self.assertEqual(len(self.s.jobs()),1)
        self.assertEqual(len(self.s.snapshot()['observations']),2)
    def test_profile_change_invalidates_job(self):
        self.s.observe(SOURCE);old=self.s.jobs()[0]
        self.s.profile('나는 영상 제작을 한다.')
        self.assertNotEqual(self.s.jobs()[0]['id'],old['id'])
        with self.assertRaises(ValueError): self.s.submit(old['id'],'{}',None)
    def analyze(self, job):
        answer=dict(format='adoption-v4',requestKey=job['packet']['requestKey'],assessments=[dict(candidate=1,verdict='needs_info',reason='자료 부족',need=[],gap=[],current=[],offer=None,cost=dict(kind='unknown',evidence=[]),claims=[],unknowns=[dict(category='requirement',statement='현재 방식 미확인')],nextCheck='public_sources')])
        self.s.submit(job['id'],json.dumps(answer),None)
    def test_unanalyzed_proposal_cannot_be_approved(self):
        self.s.observe(SOURCE);job=self.s.jobs()[0]
        p=self.s.propose(job['id'],dict(scope='조사',benefit='확인',risk='없음',check='비교',rollback='초안 폐기'))
        with self.assertRaises(ValueError):self.s.decide(p,'approve')
        self.assertEqual(self.s.approved(),[])
    def test_unapproved_and_stale_not_executable(self):
        self.s.observe(SOURCE);job=self.s.jobs()[0]
        proposal=self.s.propose(job['id'],{'scope':'공개 설치 문서 비교','benefit':'설치 전 조건 확인','risk':'설치 및 비용 없음','check':'공식 문서와 비교','rollback':'문서 초안만 폐기'})
        self.assertEqual(self.s.approved(),[])
        self.analyze(job)
        self.s.decide(proposal,'approve')
        self.assertEqual(len(self.s.approved()),1)
        self.s.observe({**SOURCE,'text':'new version'})
        self.assertEqual(self.s.approved(),[])
        with self.assertRaises(ValueError):self.s.decide(proposal,'approve')
    def test_reject_revoke_and_history(self):
        self.s.observe(SOURCE);job=self.s.jobs()[0]
        p=self.s.propose(job['id'],dict(scope='문서 확인',benefit='확인',risk='없음',check='비교',rollback='초안 폐기'))
        self.s.decide(p,'reject');self.assertEqual(self.s.approved(),[])
        with self.assertRaises(ValueError):self.s.decide(p,'approve')
        self.assertEqual(len(self.s.snapshot()['events']),1)
    def test_wrong_analysis_rejected(self):
        self.s.observe(SOURCE)
        with self.assertRaises(ValueError):self.s.submit(self.s.jobs()[0]['id'],'{}',None)
        self.assertEqual(len(self.s.jobs()),1)
        self.assertEqual(self.s.snapshot()['runs'][-1]['status'],'analysis_failed')

if __name__=='__main__':unittest.main()

class DiscoveryTests(unittest.TestCase):
    setUp = StoreTests.setUp
    tearDown = StoreTests.tearDown
    def test_discovery_offline_recorded(self):
        from inbox.discovery import discover
        def offline(url): raise OSError('offline')
        discover(self.s, 'mcp', get=offline)
        self.assertEqual(self.s.snapshot()['runs'][-1]['status'],'failed')
        self.assertEqual(self.s.jobs(),[])
    def test_discovery_collects_without_manual_url(self):
        from inbox.discovery import discover
        import base64
        def public(url):
            if '/search/' in url:return {'items':[{'full_name':'example/tool'}], 'incomplete_results':False}
            return {'encoding':'base64','content':base64.b64encode(b'Official README').decode()}
        discover(self.s, 'mcp', get=public)
        self.assertEqual(len(self.s.jobs()),1)
        self.assertEqual(self.s.snapshot()['runs'][-1]['status'],'collected')
    def test_valid_analysis_saved_and_immutable(self):
        self.s.observe(SOURCE);j=self.s.jobs()[0]
        answer=dict(format='adoption-v4',requestKey=j['packet']['requestKey'],assessments=[dict(candidate=1,verdict='needs_info',reason='현재 방법의 부족을 확인하지 못했다.',need=[],gap=[],current=[],offer=None,cost=dict(kind='unknown',evidence=[]),claims=[],unknowns=[dict(category='requirement',statement='현재 업무 방식 미확인')],nextCheck='ask_user',question='현재 방식은 무엇인가요?')])
        self.s.submit(j['id'],json.dumps(answer),None)
        self.assertEqual(self.s.jobs(),[])
        self.assertEqual(self.s.snapshot()['jobs'][0]['answer']['view']['version'],'adoption-v4')
        with self.assertRaises(ValueError):self.s.submit(j['id'],json.dumps(answer),None)

class QueryTests(unittest.TestCase):
    setUp = StoreTests.setUp
    tearDown = StoreTests.tearDown
    def test_query_persists_without_invalidating_analysis(self):
        self.s.observe(SOURCE);old=self.s.jobs()[0]['id']
        self.s.query('mcp video in:name,description')
        self.assertEqual(Store(self.path).snapshot()['settings']['query'],'mcp video in:name,description')
        self.assertEqual(self.s.jobs()[0]['id'],old)
    def test_github_does_not_imply_open_source(self):
        self.s.observe(SOURCE)
        self.assertEqual(self.s.jobs()[0]['input']['sources'][0]['kind'],'software')
