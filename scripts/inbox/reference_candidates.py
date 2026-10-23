"""Link explicit repository mentions to publisher README evidence, never to approval."""
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import sqlite3
from urllib.parse import urlsplit
from .discovery import github_json
from .store import excerpt, now
from .web_references import Archive

NOTE = '수집 범위: 공개 GitHub README 일부. GitHub 공개 여부는 오픈소스 라이선스를 보증하지 않음. 제공자 주장으로, 실제 효과·가격·안전성은 별도 확인 필요.\n\n'


def repository_url(value):
    if not isinstance(value,str):return None
    try:
        u=urlsplit(value)
        if u.scheme!='https' or u.netloc.lower()!='github.com' or u.query or u.fragment:
            return None
        if not re.fullmatch(r'/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?',u.path):return None
        name=u.path.strip('/').removesuffix('.git')
        if any(part in {'.','..',''} for part in name.split('/')):return None
        return 'https://github.com/'+name.lower()
    except ValueError:return None


def mentions(packet):
    if packet['status']!='partial':return []
    values=[packet['url']]+[v.rstrip('.,;:!?)]}）。，') for v in re.findall(r'https?://[^\s<>"\x27]+',packet['text'])]
    return list(dict.fromkeys(url for value in values if (url:=repository_url(value))))


def packet_key(packet):
    return hashlib.sha256(json.dumps(packet,ensure_ascii=False,sort_keys=True).encode()).hexdigest()


def source_for(url,get):
    name=url.removeprefix('https://github.com/')
    identity=get('https://api.github.com/repos/'+name)
    if (not isinstance(identity,dict) or identity.get('private') is not False or
        not isinstance(identity.get('full_name'),str) or identity['full_name'].lower()!=name or
        repository_url(identity.get('html_url',''))!=url):raise ValueError('repository identity mismatch')
    readme=get('https://api.github.com/repos/'+name+'/readme')
    if not isinstance(readme,dict) or readme.get('encoding')!='base64':raise ValueError('README encoding')
    content=readme['content']
    if not isinstance(content,str) or len(content)>2_000_000:raise ValueError('README size')
    text=base64.b64decode(''.join(content.split()),validate=True).decode('utf-8')
    if not text.strip():raise ValueError('empty README')
    sha=readme.get('sha')
    if not isinstance(sha,str) or not re.fullmatch('[0-9a-f]{40}',sha):raise ValueError('README revision missing')
    return dict(url=url,name=identity['full_name'],text=excerpt(NOTE+text)),sha


class ReferenceCandidates:
    def __init__(self,store):
        self.store=store
        self.archive=Archive(store.path.parent/'web-collections')
        self.root=store.path.parent/'reference-checks'

    def _row(self,packet):
        urls=mentions(packet)
        row=dict(format='siut-reference-check-v1',packetId=packet_key(packet),sourceUrl=packet['url'],sourceCollectedAt=packet['collectedAt'],checkedAt=None,
                 needsResearch=not bool(urls),message='저장소 언급은 제품 동일성·업무 적합성 확인이 아닙니다.' if urls else '제품 이름·공식 주소 추가 조사 필요. 수집 실패 자료나 이미지에서 제품을 추측하지 않습니다.',
                 items=[dict(url=url,status='pending',observation=None,readmeSha=None) for url in urls],recordError=False)
        path=self.root/(row['packetId']+'.json')
        if not path.exists():return row
        try:
            if path.stat().st_size>100000:raise ValueError('record size')
            saved=json.loads(path.read_text())
            if not isinstance(saved,dict) or set(saved)!=set(row):raise ValueError('record keys')
            if any(saved[k]!=row[k] for k in ('format','packetId','sourceUrl','sourceCollectedAt','message')):raise ValueError('record mismatch')
            if len(saved['items'])!=len(urls):raise ValueError('record items')
            for item,url in zip(saved['items'],urls):
                if set(item)!={'url','status','observation','readmeSha'} or item['url']!=url or item['status'] not in {'pending','queued','failed'}:raise ValueError('record item')
                if item['status']=='queued':
                    if type(item['observation']) is not int or item['observation']<1 or not isinstance(item['readmeSha'],str) or not re.fullmatch('[0-9a-f]{40}',item['readmeSha']):raise ValueError('record evidence')
                elif item['observation'] is not None or item['readmeSha'] is not None:raise ValueError('unexpected evidence')
            row['items']=saved['items']
            row['checkedAt']=saved['checkedAt'] if isinstance(saved['checkedAt'],str) else None
        except (ValueError,TypeError,KeyError,OSError):row['recordError']=True
        row['needsResearch']=not bool(urls) or any(i['status']=='failed' for i in row['items'])
        return row

    def snapshot(self):
        refs=self.archive.read()
        return dict(format='siut-reference-candidates-v1',references=[self._row(p) for p in refs['references']],invalidFiles=refs['invalidFiles'],truncated=refs['truncated'])

    def _save(self,row):
        self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        fd,path=tempfile.mkstemp(dir=self.root,prefix='.check-')
        try:
            with os.fdopen(fd,'w') as out:
                json.dump(row,out,ensure_ascii=False,sort_keys=True);out.flush();os.fsync(out.fileno())
            os.replace(path,self.root/(row['packetId']+'.json'))
        finally:
            if os.path.exists(path):os.unlink(path)

    def resolve(self,*,retry=False,get=github_json):
        self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        with (self.root/'.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            attempted=0
            for packet in self.archive.read()['references']:
                row=self._row(packet)
                if row['recordError']:continue  # Preserve damaged audit records for inspection.
                for item in row['items']:
                    if attempted>=5:break
                    if item['status']!='pending' and not (retry and item['status']=='failed'):continue
                    attempted+=1
                    try:
                        source,sha=source_for(item['url'],get)
                        observation=self.store.observe(source)
                        item.update(status='queued',observation=observation,readmeSha=sha)
                    except (ValueError,KeyError,TypeError,OSError,sqlite3.Error):
                        item.update(status='failed',observation=None,readmeSha=None)
                row['checkedAt']=now()
                row['needsResearch']=not bool(row['items']) or any(i['status']=='failed' for i in row['items'])
                self._save(row)
            return self.snapshot()
