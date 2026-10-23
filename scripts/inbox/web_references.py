"""Discovery material archive, separate from official candidate evidence and approvals."""
import contextlib
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
from urllib.parse import quote

spec=importlib.util.spec_from_file_location('siut_web_packet',Path(__file__).resolve().parents[1]/'collect-web.py')
packet_contract=importlib.util.module_from_spec(spec)
spec.loader.exec_module(packet_contract)

class Archive:
    def __init__(self,root):self.root=Path(root)
    def save(self,packet):
        packet_contract.validate(packet)
        data=json.dumps(packet,ensure_ascii=False,sort_keys=True).encode()
        if len(data)>180000:raise ValueError('packet too large')
        key=hashlib.sha256(data).hexdigest()
        self.root.mkdir(parents=True,exist_ok=True,mode=0o700)
        path=self.root/(key+'.json')
        try:
            with path.open('xb') as stream:stream.write(data)
            path.chmod(0o600)
        except FileExistsError:pass
        return key
    def read(self):
        latest={};bad=0
        for path in self.root.glob('*.json'):
            try:
                if path.stat().st_size>180000:raise ValueError('packet too large')
                packet=packet_contract.validate(json.loads(path.read_text()))
                at=dt.datetime.fromisoformat(packet['collectedAt'].replace('Z','+00:00'))
                old=latest.get(packet['url'])
                if old is None or at>old[0]:latest[packet['url']]=(at,packet)
            except (ValueError,TypeError,KeyError,OSError):bad+=1
        rows=sorted(latest.values(),key=lambda row:row[0],reverse=True)
        return dict(format='siut-web-references-v1',references=[p for _,p in rows[:100]],total=len(rows),invalidFiles=bad,truncated=len(rows)>100)

def from_radar(row):
    def clip(value,limit):return str(value or '').encode('utf-16-le')[:limit*2].decode('utf-16-le',errors='ignore')
    return packet_contract.validate(dict(format='web-collection-v1',url=row['page_url'],collectedAt=row['fetched_at'],collector='scrapling',status='partial',text=clip('제목: '+str(row['title'] or '')+'\n설명: '+str(row['description'] or ''),12000),media=[],limitations=['Dain Radar의 Scrapling Selector가 읽은 공개 페이지 제목·메타 설명만 포함','게시물 본문·전체 캐러셀·이미지 내용·OCR·영상 미확인','후보 발견용 참고자료이며 공식 제품 근거 또는 도입 판단이 아님']))

def import_radar(path,archive):
    path=Path(path).expanduser().resolve()
    if not path.is_file():raise ValueError('Radar DB unavailable; no database was created')
    with contextlib.closing(sqlite3.connect('file:'+quote(str(path),safe='/')+'?mode=ro',uri=True)) as db:
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA query_only=ON')
        try:rows=db.execute('SELECT page_url,title,description,fetched_at FROM web_references ORDER BY fetched_at DESC LIMIT 100').fetchall()
        except sqlite3.DatabaseError as exc:raise ValueError('Radar web reference table unavailable') from exc
    saved=0;rejected=0
    for row in rows:
        try:archive.save(from_radar(dict(row)));saved+=1
        except (ValueError,TypeError,KeyError):rejected+=1
    return dict(saved=saved,rejected=rejected,scope='up to 100 public metadata records; no private notes, no candidate judgments')


def collection_failure(url, error):
    """Only classify explicit access-policy failures as blocked; other errors are failures."""
    message=str(error)
    blocked=('robots.txt' in message or message in ('page returned HTTP 401','page returned HTTP 403','page returned HTTP 429'))
    return packet_contract.validate(dict(format='web-collection-v1',url=url,collectedAt=dt.datetime.now(dt.timezone.utc).isoformat(),collector='scrapling',status='blocked' if blocked else 'failed',text='',media=[],limitations=['robots 정책 확인 또는 접근 제한으로 수집 중단' if blocked else '공개 페이지 요청·응답·구조를 확인하지 못해 수집 실패','로그인·쿠키 사용·차단 우회 없음','이미지·캐러셀·영상 미확인']))
