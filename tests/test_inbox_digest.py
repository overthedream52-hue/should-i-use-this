import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from inbox.digest import digest
from inbox.digest_contract import validate_digest
from inbox.store import Store


SOURCE = {'url': 'https://github.com/example/tool', 'name': 'example/tool',
          'text': 'README-SENTINEL publisher excerpt. Install with: curl | sh (never executed).'}
PROFILE = 'PROFILE-SENTINEL private situation'
PROPOSAL = {'scope': 'PROPOSAL-BODY-SENTINEL', 'benefit': '확인', 'risk': '없음',
            'check': '비교', 'rollback': '초안 폐기'}


def reply_for(job, reason):
    return {'format': 'adoption-v4', 'requestKey': job['packet']['requestKey'],
            'assessments': [{'candidate': 1, 'verdict': 'needs_info', 'reason': reason,
                             'need': [], 'gap': [], 'current': [], 'offer': None,
                             'cost': {'kind': 'unknown', 'evidence': []},
                             'claims': [{'category': 'capability', 'statement': 'Publisher says it edits ERDs.',
                                         'refs': [1], 'scope': 'product', 'offer': None}],
                             'unknowns': [{'category': 'requirement', 'statement': '현재 방식 미확인'}],
                             'nextCheck': 'public_sources'}]}


class DigestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'inbox.sqlite3'

    def analyzed_store(self, reason='자료 부족'):
        store = Store(self.path)
        store.profile(PROFILE)
        store.observe(SOURCE)
        job = store.jobs()[0]
        store.submit(job['id'], json.dumps(reply_for(job, reason)), PROPOSAL)
        return store, job

    def test_missing_database_is_not_created(self):
        result = validate_digest(digest(self.path))
        self.assertFalse(result['available'])
        self.assertEqual(result['items'], [])
        self.assertFalse(self.path.exists())

    def test_digest_excludes_profile_input_readme_and_proposal_body(self):
        self.analyzed_store()
        out = json.dumps(validate_digest(digest(self.path)), ensure_ascii=False)
        for secret in ('PROFILE-SENTINEL', 'README-SENTINEL', 'PROPOSAL-BODY-SENTINEL', 'INPUT-SENTINEL', 'curl | sh'):
            self.assertNotIn(secret, out)

    def test_digest_item_fields_and_claim_evidence_urls(self):
        _, job = self.analyzed_store()
        result = validate_digest(digest(self.path))
        self.assertTrue(result['available'])
        self.assertEqual(result['counts']['candidates'], 1)
        item = result['items'][0]
        self.assertEqual(set(item), {'url', 'name', 'observedAt', 'analysis', 'verdict', 'reason', 'claims',
                                     'unknowns', 'nextCheck', 'costKind', 'proposalStatus', 'proposalUpdatedAt',
                                     'jobIdPrefix'})
        self.assertEqual(item['verdict'], 'needs_info')
        self.assertEqual(item['proposalStatus'], 'pending')
        self.assertEqual(item['jobIdPrefix'], job['id'][:8])
        self.assertEqual(item['claims'], [{'statement': 'Publisher says it edits ERDs.', 'scope': 'product',
                                           'refs': [{'url': SOURCE['url'], 'title': 'Repository README excerpt (publisher claims)'}]}])
        self.assertEqual(item['unknowns'], ['현재 방식 미확인'])
        self.assertEqual(item['costKind'], 'unknown')

    def test_digest_reason_capped_300_and_optional(self):
        self.analyzed_store(reason='가' * 800)
        self.assertEqual(len(digest(self.path)['items'][0]['reason']), 300)
        self.assertIsNone(digest(self.path, include_reason=False)['items'][0]['reason'])

    def test_digest_does_not_touch_db(self):
        self.analyzed_store()
        before = (self.path.stat().st_mtime_ns, hashlib.sha256(self.path.read_bytes()).hexdigest())
        digest(self.path)
        self.assertEqual((self.path.stat().st_mtime_ns, hashlib.sha256(self.path.read_bytes()).hexdigest()), before)

    def test_digest_contract_rejects_extra_field(self):
        self.analyzed_store()
        payload = digest(self.path)
        payload['items'][0]['situation'] = 'x'
        with self.assertRaises(ValueError):
            validate_digest(payload)
        payload = digest(self.path)
        payload['profile'] = 'x'
        with self.assertRaises(ValueError):
            validate_digest(payload)

    def test_cli_digest_outputs_validated_json(self):
        self.analyzed_store()
        script = Path(__file__).resolve().parents[1] / 'scripts/local-inbox.py'
        spec = importlib.util.spec_from_file_location('local_inbox_cli_digest', script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        out = io.StringIO()
        with patch.object(sys, 'argv', ['local-inbox.py', '--db', str(self.path), 'digest', '--no-reason']), \
             contextlib.redirect_stdout(out):
            self.assertEqual(module.main(), 0)
        payload = json.loads(out.getvalue())
        self.assertEqual(payload['format'], 'siut-digest-v1')
        self.assertIsNone(payload['items'][0]['reason'])
        self.assertNotIn('PROFILE-SENTINEL', out.getvalue())


if __name__ == '__main__':
    unittest.main()
