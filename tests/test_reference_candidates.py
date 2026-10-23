"""Discovery material must never become product evidence without a fresh source read."""
import base64
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from inbox.store import Store
from inbox.web_references import Archive
from inbox.reference_candidates import ReferenceCandidates


def packet(text='',status='partial',at='2026-10-06T00:00:00Z'):
    return dict(format='web-collection-v1',url='https://example.com/post',collectedAt=at,collector='scrapling',status=status,text=text,media=[],limitations=['본문 일부만 확보'])


def api(url):
    name=url.removeprefix('https://api.github.com/repos/').removesuffix('/readme')
    if url.endswith('/readme'):
        return dict(encoding='base64',content=base64.b64encode(b'Publisher README only.').decode(),sha='a'*40)
    return dict(full_name=name,html_url='https://github.com/'+name,private=False)


class ReferenceCandidateTests(unittest.TestCase):
    def setUp(self):
        self.t=tempfile.TemporaryDirectory();self.addCleanup(self.t.cleanup)
        self.store=Store(Path(self.t.name)/'inbox.db')
        self.archive=Archive(self.store.path.parent/'web-collections')
        self.pipe=ReferenceCandidates(self.store)

    def test_fresh_readme_not_promotional_text_enters_analysis_and_keeps_origin(self):
        self.archive.save(packet('700 times faster! https://github.com/Example/Tool'))
        self.pipe.resolve(get=api)
        s=self.store.snapshot();self.assertEqual(len(s['jobs']),1)
        text=s['jobs'][0]['input']['sources'][0]['text']
        self.assertIn('Publisher README only.',text);self.assertNotIn('700 times',text)
        row=self.pipe.snapshot()['references'][0]
        self.assertEqual(row['sourceUrl'],'https://example.com/post')
        self.assertEqual(row['items'][0]['status'],'queued')
        self.assertEqual(row['items'][0]['observation'],s['observations'][0]['id'])
        self.assertEqual(s['proposals'],[]);self.assertEqual(s['events'],[])

    def test_repeat_does_not_duplicate_or_retry_success(self):
        self.archive.save(packet('https://github.com/example/tool'))
        self.pipe.resolve(get=api)
        self.pipe.resolve(get=lambda _:self.fail('unchanged success must not be fetched again'))
        self.assertEqual(len(self.store.snapshot()['jobs']),1)

    def test_blocked_and_names_only_need_research_not_guess(self):
        self.archive.save(packet('Scrapling and paid service Fornerds'))
        self.pipe.resolve(get=lambda _:self.fail('no explicit repo'))
        self.assertTrue(self.pipe.snapshot()['references'][0]['needsResearch'])
        self.archive.save(packet('https://github.com/example/tool','blocked',at='2026-10-06T01:00:00Z'))
        self.pipe.resolve(get=lambda _:self.fail('blocked text must not be used'))
        self.assertEqual(self.store.jobs(),[])

    def test_spoofed_private_subpath_and_media_links_do_not_become_candidates(self):
        p=packet('https://github.com.evil.com/o/r https://github.com@evil.com/o/r https://github.com/o/r/issues https://github.com/o/r?token=SECRET http://github.com/o/r')
        p['media']=[dict(url='https://github.com/o/r',alt='https://github.com/o/r')]
        self.archive.save(p);self.pipe.resolve(get=lambda _:self.fail('untrusted URL shape'))
        self.assertEqual(self.store.jobs(),[])

    def test_failed_readme_no_job_and_explicit_retry_can_recover(self):
        self.archive.save(packet('https://github.com/example/tool'))
        self.pipe.resolve(get=lambda _:(_ for _ in ()).throw(OSError('offline')))
        self.assertEqual(self.store.jobs(),[])
        self.assertEqual(self.pipe.snapshot()['references'][0]['items'][0]['status'],'failed')
        self.pipe.resolve(retry=True,get=api)
        self.assertEqual(len(self.store.jobs()),1)

    def test_mismatched_identity_and_empty_readme_are_not_official_evidence(self):
        self.archive.save(packet('https://github.com/example/tool'))
        self.pipe.resolve(get=lambda _:dict(full_name='other/tool',html_url='https://github.com/other/tool',private=False))
        self.assertEqual(self.store.jobs(),[])
        self.pipe.resolve(retry=True,get=lambda u:dict(encoding='base64',content='',sha='a'*40) if u.endswith('/readme') else api(u))
        self.assertEqual(self.store.jobs(),[])

    def test_changed_packet_keeps_old_record_but_requires_new_check(self):
        self.archive.save(packet('https://github.com/example/tool'));self.pipe.resolve(get=api)
        self.archive.save(packet('https://github.com/example/other',at='2026-10-06T01:00:00Z'))
        self.assertEqual(self.pipe.snapshot()['references'][0]['items'][0]['status'],'pending')
        self.pipe.resolve(get=api)
        self.assertEqual(len(self.store.jobs()),2)
        self.assertEqual(len(list((self.store.path.parent/'reference-checks').glob('*.json'))),2)

    def test_at_most_five_repositories_per_run_and_remaining_are_visible(self):
        self.archive.save(packet(' '.join('https://github.com/example/tool'+str(i) for i in range(7))))
        self.pipe.resolve(get=api)
        self.assertEqual(len(self.store.jobs()),5)
        self.assertEqual(sum(i['status']=='pending' for i in self.pipe.snapshot()['references'][0]['items']),2)
        self.pipe.resolve(get=api);self.assertEqual(len(self.store.jobs()),7)

    def test_corrupt_audit_record_is_reported_and_preserved(self):
        self.archive.save(packet('https://github.com/example/tool'));self.pipe.resolve(get=api)
        path=next((self.store.path.parent/'reference-checks').glob('*.json'))
        path.write_text('{broken')
        self.assertTrue(self.pipe.snapshot()['references'][0]['recordError'])
        self.pipe.resolve(get=lambda _:self.fail('corrupt record must be inspected'))
        self.assertEqual(path.read_text(),'{broken')

    def test_concurrent_processor_lock_does_not_silently_duplicate_work(self):
        import fcntl
        self.archive.save(packet('https://github.com/example/tool'))
        self.pipe.root.mkdir()
        with (self.pipe.root/'.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with self.assertRaises(BlockingIOError):self.pipe.resolve(get=api)
        self.assertEqual(self.store.jobs(),[])

    def test_changed_readme_creates_new_fixed_input_and_preserves_old_input(self):
        self.archive.save(packet('https://github.com/example/tool'));self.pipe.resolve(get=api)
        old=self.store.jobs()[0]['id']
        self.archive.save(packet('https://github.com/example/tool',at='2026-10-06T01:00:00Z'))
        def changed(u):
            result=api(u)
            if u.endswith('/readme'):result.update(content=base64.b64encode(b'New publisher conditions').decode(),sha='b'*40)
            return result
        self.pipe.resolve(get=changed)
        self.assertNotEqual(self.store.jobs()[0]['id'],old)
        snapshot=self.store.snapshot()
        self.assertEqual(len(snapshot['jobs']),2)
        self.assertFalse(next(j for j in snapshot['jobs'] if j['id']==old)['current'])
