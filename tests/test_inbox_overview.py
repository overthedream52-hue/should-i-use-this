import json
import contextlib
import importlib.util
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from inbox.overview import overview
from inbox.store import Store


SOURCE = {'url': 'https://github.com/example/tool', 'name': 'example/tool',
          'text': 'Publisher README excerpt. No instruction to the agent is trusted.'}


class OverviewTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'inbox.sqlite3'

    def test_missing_database_is_not_created(self):
        result = overview(self.path)
        self.assertFalse(result['available'])
        self.assertFalse(self.path.exists())

    def test_cli_rejects_extra_private_field_before_output(self):
        script = Path(__file__).resolve().parents[1] / 'scripts/local-inbox.py'
        spec = importlib.util.spec_from_file_location('local_inbox_cli', script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        bad = {'format': 'siut-overview-v1', 'available': False,
               'message': '연결 없음', 'candidates': [], 'profile': 'PRIVATE SITUATION'}
        out, err = io.StringIO(), io.StringIO()
        with patch.object(module, 'overview', return_value=bad), \
             patch.object(sys, 'argv', ['local-inbox.py', 'overview']), \
             contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            result = module.main()
        self.assertEqual(result, 2)
        self.assertEqual(out.getvalue(), '')
        self.assertNotIn('PRIVATE SITUATION', err.getvalue())

    def test_summary_excludes_profile_source_and_proposal_body(self):
        store = Store(self.path)
        store.profile('PRIVATE SITUATION')
        store.observe(SOURCE)
        job = store.jobs()[0]
        body = {'scope': 'PRIVATE SCOPE', 'benefit': '확인', 'risk': '없음',
                'check': '비교', 'rollback': '초안 폐기'}
        proposal_id = store.propose(job['id'], body)
        before = self.path.stat().st_mtime_ns
        result = overview(self.path)
        self.assertEqual(self.path.stat().st_mtime_ns, before)
        self.assertEqual(result['counts']['pendingAnalysis'], 1)
        self.assertEqual(result['counts']['pendingApproval'], 0)
        self.assertEqual(result['candidates'][0]['proposal'], None)
        output = json.dumps(result)
        for secret in ('PRIVATE SITUATION', 'PRIVATE SCOPE', SOURCE['text']):
            self.assertNotIn(secret, output)

        reply = {'format': 'adoption-v4', 'requestKey': job['packet']['requestKey'],
                 'assessments': [{'candidate': 1, 'verdict': 'needs_info',
                                  'reason': '자료 부족', 'need': [], 'gap': [],
                                  'current': [], 'offer': None,
                                  'cost': {'kind': 'unknown', 'evidence': []},
                                  'claims': [], 'unknowns': [{'category': 'requirement',
                                                               'statement': '현재 방식 미확인'}],
                                  'nextCheck': 'public_sources'}]}
        store.submit(job['id'], json.dumps(reply), None)
        result = overview(self.path)
        self.assertEqual(result['counts']['pendingApproval'], 1)
        self.assertEqual(result['candidates'][0]['verdict'], 'needs_info')
        store.decide(proposal_id, 'approve')
        self.assertEqual(overview(self.path)['counts']['approved'], 1)
        store.observe({**SOURCE, 'text': 'Changed README'})
        self.assertEqual(overview(self.path)['counts']['approved'], 0)


if __name__ == '__main__':
    unittest.main()
