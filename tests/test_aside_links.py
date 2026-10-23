import sys,unittest,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from inbox.aside_links import open_link
class AsideLinkTests(unittest.TestCase):
 def test_only_saved_https_link_passed_as_argument_to_fixed_app(self):
  seen=[]
  url='https://trycassette.online/signup/'
  open_link(url,{url},run=lambda argv,**kw:seen.append((argv,kw)))
  self.assertEqual(seen[0][0],['/usr/bin/open','-b','at.studio.AsideBrowser',url])
  self.assertNotIn('shell',seen[0][1])
 def test_arbitrary_url_and_local_commands_rejected_before_launch(self):
  for url in ['file:///etc/passwd','https://evil.example/','https://trycassette.online/\n','http://127.0.0.1:3127/']:
   with self.assertRaises(ValueError):open_link(url,{'https://trycassette.online/'},run=lambda *a,**k:self.fail('must not launch'))
 def test_app_failure_is_visible(self):
  def fail(*a,**k):raise subprocess.CalledProcessError(1,a[0])
  with self.assertRaises(OSError):open_link('https://trycassette.online/',{'https://trycassette.online/'},run=fail)
