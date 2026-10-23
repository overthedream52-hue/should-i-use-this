import sys,tempfile,unittest,sqlite3,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from inbox.web_references import Archive, from_radar, import_radar, collection_failure

def packet(status='partial'):
 return dict(format='web-collection-v1',url='https://www.instagram.com/p/ABCDE123/',collectedAt='2026-10-06T03:00:00+00:00',collector='scrapling',status=status,text='공개 소개',media=[],limitations=['본문 일부, 이미지 미판독'])
class ReferenceTests(unittest.TestCase):
 def setUp(self):
  self.t=tempfile.TemporaryDirectory();self.addCleanup(self.t.cleanup);self.root=Path(self.t.name)
 def test_archive_preserves_failure_deduplicates_and_does_not_create_jobs(self):
  a=Archive(self.root/'refs');p=packet('blocked');a.save(p);a.save(p)
  self.assertEqual(len(list((self.root/'refs').glob('*.json'))),1)
  self.assertEqual(a.read()['references'][0]['status'],'blocked')
  self.assertFalse((self.root/'inbox.sqlite3').exists())
 def test_invalid_and_corrupt_packets_fail_closed(self):
  a=Archive(self.root/'refs');p=packet();p['profile']='private'
  with self.assertRaises(ValueError):a.save(p)
  self.assertFalse(a.root.exists())
  a.save(packet());(a.root/'bad.json').write_text('{}')
  self.assertEqual(a.read()['invalidFiles'],1)
 def test_radar_metadata_excludes_private_note_and_video_is_not_image(self):
  p=from_radar(dict(page_url='https://example.com/public',title='Public',description='Excerpt',fetched_at='2026-10-06T00:00:00Z',note='PRIVATE',video_urls_json='["https://youtu.be/abcdefghijk"]'))
  self.assertNotIn('PRIVATE',json.dumps(p));self.assertEqual(p['media'],[]);self.assertEqual(p['status'],'partial')
 def test_missing_db_is_not_created(self):
  p=self.root/'missing.db'
  with self.assertRaises(ValueError):import_radar(p,Archive(self.root/'refs'))
  self.assertFalse(p.exists())
 def test_readonly_import_and_repeat_are_idempotent(self):
  p=self.root/'radar.db'
  with sqlite3.connect(p) as db:
   db.execute('CREATE TABLE web_references(page_url,title,description,fetched_at,note)')
   db.execute('INSERT INTO web_references VALUES(?,?,?,?,?)',('https://example.com/a','Title','Description','2026-10-06T00:00:00Z','PRIVATE'))
  before=p.read_bytes();a=Archive(self.root/'refs');import_radar(p,a);import_radar(p,a)
  self.assertEqual(p.read_bytes(),before);self.assertEqual(len(list(a.root.glob('*.json'))),1)

 def test_network_failure_is_not_access_block(self):
  self.assertEqual(collection_failure('https://example.com/a','page request failed: Timeout')['status'],'failed')
  self.assertEqual(collection_failure('https://example.com/a','robots.txt does not permit this page or could not be checked')['status'],'blocked')
