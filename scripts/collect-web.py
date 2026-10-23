#!/usr/bin/env python3
"""Use the current environment's Scrapling (including a local fork). No AI or installation."""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qs, urlencode
import ipaddress

def public_url(value):
    if not isinstance(value,str) or len(value)>2048:raise ValueError('URL size')
    u=urlsplit(value)
    if u.scheme!='https' or not u.hostname or u.username or u.password or u.port not in (None,443):raise ValueError('public HTTPS required')
    host=u.hostname.lower()
    if '.' not in host or host.endswith(('.local','.localhost','.internal','.test','.')):raise ValueError('local URL')
    if re.fullmatch(r'[0-9.]+',host):raise ValueError('IP URL unsupported')
    try:ipaddress.ip_address(host);raise ValueError('IP URL unsupported')
    except ValueError as e:
        if str(e)=='IP URL unsupported':raise
    if any(re.search(r'token|secret|password|passwd|auth|api[_-]?key|signature|credential',k,re.I) for k in parse_qs(u.query,keep_blank_values=True)):raise ValueError('sensitive query')
    return value

def validate(p):
    if not isinstance(p,dict) or set(p)!={'format','url','collectedAt','collector','status','text','media','limitations'}:raise ValueError('packet keys')
    if p['format']!='web-collection-v1' or p['collector']!='scrapling' or p['status'] not in ('partial','blocked','failed'):raise ValueError('packet type')
    public_url(p['url'])
    if not isinstance(p['collectedAt'],str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})',p['collectedAt']):raise ValueError('timestamp')
    datetime.fromisoformat(p['collectedAt'].replace('Z','+00:00'))
    def text(s,n):
        if not isinstance(s,str) or len(s.encode('utf-16-le'))//2>n:raise ValueError('text size')
    text(p['text'],13000)
    if not isinstance(p['media'],list) or len(p['media'])>20:raise ValueError('media size')
    for m in p['media']:
        if not isinstance(m,dict) or set(m)!={'url','alt'}:raise ValueError('media keys')
        public_url(m['url']);text(m['alt'],500)
    if not isinstance(p['limitations'],list) or not 1<=len(p['limitations'])<=12:raise ValueError('limitations')
    for s in p['limitations']:
        text(s,300)
        if not s:raise ValueError('empty limitation')
    return p

def target_url(value):
    public_url(value);u=urlsplit(value);host=u.hostname.lower()
    if host in ('instagram.com','www.instagram.com') and re.fullmatch(r'/(p|reel|reels)/[A-Za-z0-9_-]{5,64}/?',u.path):
        q=parse_qs(u.query);selected=q.get('img_index',[''])[0]
        return urlunsplit(('https','www.instagram.com',u.path,urlencode({'img_index':selected}) if selected.isdigit() else '', ''))
    if host=='github.com' and re.fullmatch(r'/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?',u.path):return urlunsplit(('https',host,u.path,'',''))
    raise ValueError('첫 버전은 Instagram 게시물/릴스와 GitHub 저장소 링크만 지원합니다.')

# Executed as data extraction in the loaded browser. No page-provided code is evaluated.
EXTRACT="""() => {
 const root=document.querySelector('article') || document.querySelector('main');
 if(!root)return {text:'',media:[],blocked:!!document.querySelector('input[type=password]')};
 const media=[...root.querySelectorAll('img')].filter(x=>x.getBoundingClientRect().width>=180 && x.getBoundingClientRect().height>=100).map(x=>({url:x.currentSrc||x.src,alt:x.alt||''}));
 return {text:root.innerText||'',media,blocked:!!document.querySelector('input[type=password]')};
}"""

def collect(url,fetcher):
    packet={'format':'web-collection-v1','url':target_url(url),'collectedAt':datetime.now(timezone.utc).isoformat(),'collector':'scrapling','status':'partial','text':'','media':[], 'limitations':['전체 본문·슬라이드 개수 미확인','이미지 내용·OCR 미확인','영상 미분석']}
    texts=[];seen=set()
    def action(page):
        # Scope Next to an Instagram article; never click login, submit or outside links.
        if urlsplit(page.url).hostname!=urlsplit(packet['url']).hostname or urlsplit(page.url).path.rstrip('/')!=urlsplit(packet['url']).path.rstrip('/'):
            packet['status']='blocked';packet['limitations'].append('다른 페이지로 이동됨; 원문 확인 필요');return
        for step in range(20):
            data=page.evaluate(EXTRACT)
            if data.get('blocked'):
                packet['status']='blocked';packet['limitations'].append('로그인 화면 감지');return
            t=data.get('text','').strip()
            if t and t not in texts:texts.append(t)
            for m in data.get('media',[]):
                try:public_url(m['url'])
                except (ValueError,TypeError):continue
                if m['url'] not in seen and len(packet['media'])<20:
                    seen.add(m['url']);packet['media'].append({'url':m['url'],'alt':m.get('alt','')[:500]})
            nxt=page.locator('article').get_by_role('button',name=re.compile(r'^(Next|다음)$'))
            if nxt.count()==1 and nxt.is_visible() and nxt.is_enabled():
                nxt.click(timeout=2000);page.wait_for_timeout(350)
            elif step<4:
                page.evaluate('window.scrollBy(0, Math.min(window.innerHeight, 900))');page.wait_for_timeout(350)
            else:break
        packet['limitations'].append('최대 20회 이동·20개 미디어 제한; 이미지 URL 중복 제거는 슬라이드 수 보장이 아님')
    try:
        fetcher.fetch(packet['url'],headless=True,timeout=45000,page_action=action,disable_resources=False)
        full='\n\n'.join(texts)
        # Preserve a bounded excerpt and state truncation; never claim full content.
        encoded=full.encode('utf-16-le')
        if len(encoded)>24000:packet['limitations'].append('본문은 앞 12000 UTF-16 단위만 수집됨')
        packet['text']=encoded[:24000].decode('utf-16-le',errors='ignore')
        if not packet['text'] and not packet['media'] and packet['status']!='blocked':
            packet['status']='failed';packet['limitations'].append('읽을 수 있는 게시물 본문을 찾지 못함')
    except Exception:
        packet['status']='failed';packet['limitations'].append('수집 실행 실패; 로그인·네트워크·사이트 구조를 확인하세요')
    return validate(packet)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('url',nargs='?');parser.add_argument('--out');parser.add_argument('--validate',action='store_true');parser.add_argument('--preflight',action='store_true');a=parser.parse_args()
    try:
        if a.validate:result=validate(json.load(sys.stdin))
        else:
            from scrapling.fetchers import DynamicFetcher
            if a.preflight:
                import scrapling
                print(json.dumps({'available':True,'module':str(Path(scrapling.__file__).resolve())}));return 0
            if not a.url or not a.out:raise ValueError('URL과 --out을 지정하세요')
            if Path(a.out).exists():raise ValueError('기존 파일을 덮어쓰지 않습니다. 새 --out 경로를 지정하세요.')
            result=collect(a.url,DynamicFetcher)
        data=json.dumps(result,ensure_ascii=False,indent=2)
        if a.out:
            with open(a.out,'x') as f:f.write(data+'\n')
            print('수집 패킷 저장: '+a.out+' · '+result['status'])
        else:print(data)
        return 0
    except ImportError:
        print('Scrapling을 찾지 못했습니다. 수정본이 설치된 Python 환경으로 이 스크립트를 실행하세요.',file=sys.stderr);return 2
    except (ValueError,TypeError,KeyError,OSError) as e:
        print('INVALID: '+str(e),file=sys.stderr);return 2
if __name__=='__main__':raise SystemExit(main())
