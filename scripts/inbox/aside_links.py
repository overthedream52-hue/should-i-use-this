"""Open a displayed public reference in the installed Aside application."""
import subprocess
from .web_references import packet_contract


def open_link(url,allowed,*,run=subprocess.run):
    if not isinstance(url,str) or any(ord(c)<32 or ord(c)==127 for c in url) or url not in allowed:
        raise ValueError('only a displayed source URL can be opened')
    packet_contract.public_url(url)
    try:
        run(['/usr/bin/open','-b','at.studio.AsideBrowser',url],check=True,timeout=10,capture_output=True)
    except (subprocess.SubprocessError,OSError) as exc:
        raise OSError('Aside 앱을 열지 못했습니다. 앱 설치·실행 상태를 확인하세요.') from exc
