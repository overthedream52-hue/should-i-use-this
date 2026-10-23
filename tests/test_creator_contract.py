import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from inbox.creator_contract import validate_overview

def fixture():
    return dict(format='siut-overview-v1',available=True,generatedAt='2026-10-06T00:00:00+00:00',counts=dict(candidates=1,analyzed=1,pendingAnalysis=0,pendingApproval=1,approved=0),lastRun=dict(status='collected',at='2026-10-06T00:00:00+00:00'),candidates=[dict(name='example/tool',url='https://github.com/example/tool',observedAt='2026-10-06T00:00:00+00:00',analysis='analyzed',verdict='needs_info',proposal='pending')],truncated=False,message='읽기 전용')
class ContractTests(unittest.TestCase):
    def test_accepts_current_summary(self):
        self.assertEqual(validate_overview(fixture())['counts']['candidates'],1)
    def test_rejects_private_fields_at_each_level(self):
        for location in ('root','candidate','counts','run'):
            p=fixture();target={'root':p,'candidate':p['candidates'][0],'counts':p['counts'],'run':p['lastRun']}[location];target['profile']='private'
            with self.assertRaises(ValueError):validate_overview(p)
    def test_rejects_inconsistent_and_unsafe_summaries(self):
        cases=[]
        p=fixture();p['format']='siut-overview-v2';cases.append(p)
        p=fixture();p['counts']['candidates']=2;cases.append(p)
        p=fixture();p['counts']['analyzed']=True;cases.append(p)
        p=fixture();p['candidates'][0]['url']='javascript:alert(1)';cases.append(p)
        p=fixture();p['candidates'][0]['analysis']='pending';cases.append(p)
        p=fixture();p['generatedAt']='not a date';cases.append(p)
        for p in cases:
            with self.subTest(p=p):
                with self.assertRaises(ValueError):validate_overview(p)
    def test_missing_store_is_unavailable_not_success(self):
        p=dict(format='siut-overview-v1',available=False,message='없음',candidates=[])
        self.assertFalse(validate_overview(p)['available'])
        p['candidates']=[fixture()['candidates'][0]]
        with self.assertRaises(ValueError):validate_overview(p)
    def test_truncated_summary_preserves_total(self):
        p=fixture();p['candidates']=[dict(p['candidates'][0],name=f'example/t{i}',url=f'https://github.com/example/t{i}') for i in range(20)];p['counts'].update(candidates=21,analyzed=21,pendingApproval=21);p['truncated']=True
        self.assertEqual(validate_overview(p)['counts']['candidates'],21)

class ConnectionCliTests(unittest.TestCase):
    def test_missing_store_is_reported_without_creation(self):
        import tempfile,subprocess,json
        with tempfile.TemporaryDirectory() as folder:
            db=Path(folder)/'absent.sqlite3'
            p=subprocess.run([sys.executable,'scripts/check-creator-connection.py','--db',str(db)],capture_output=True,text=True)
            self.assertEqual(p.returncode,3)
            self.assertFalse(json.loads(p.stdout)['available'])
            self.assertFalse(db.exists())
    def test_corrupt_store_fails_without_leaking_contents(self):
        import tempfile,subprocess,json
        with tempfile.TemporaryDirectory() as folder:
            db=Path(folder)/'bad.sqlite3';db.write_text('PRIVATE DATA')
            p=subprocess.run([sys.executable,'scripts/check-creator-connection.py','--db',str(db)],capture_output=True,text=True)
            self.assertEqual(p.returncode,2)
            self.assertFalse(json.loads(p.stdout)['compatible'])
            self.assertNotIn('PRIVATE DATA',p.stdout)
