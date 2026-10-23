"""Public GitHub discovery, with bounded reads and no credentials or redirects."""
import base64
import json
import os
import re
import ssl
import sys
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler, HTTPSHandler
from .store import excerpt

DEFAULT_QUERY = 'topic:mcp-server archived:false stars:>100'

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise ValueError('redirect refused')


def https_context():
    """Use macOS roots only when Python has none and no custom trust is set."""
    context = ssl.create_default_context()
    if (sys.platform == 'darwin'
            and not any(key in os.environ for key in ('SSL_CERT_FILE', 'SSL_CERT_DIR'))
            and context.cert_store_stats()['x509_ca'] == 0
            and Path('/etc/ssl/cert.pem').is_file()):
        context.load_verify_locations(cafile='/etc/ssl/cert.pem')
    return context


def github_json(url):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.netloc != 'api.github.com':
        raise ValueError('unexpected API host')
    request = Request(url, headers={'Accept':'application/vnd.github+json', 'User-Agent':'should-i-use-this-local-inbox', 'X-GitHub-Api-Version':'2022-11-28'})
    with build_opener(NoRedirect, HTTPSHandler(context=https_context())).open(request, timeout=20) as response:
        data = response.read(2_000_001)
    if len(data) > 2_000_000:
        raise ValueError('response too large')
    return json.loads(data)


def discover(store, query=None, get=github_json):
    if query is None: query = store.snapshot()['settings']['query']
    if not isinstance(query, str) or not query.strip() or len(query) > 256:
        raise ValueError('query must be 1–256 characters')
    store.query(query)
    count, errors = 0, 0
    store.record_run('running', 'GitHub 공개 후보 검색: ' + query)
    try:
        data = get('https://api.github.com/search/repositories?' + urlencode(dict(q=query, sort='updated', per_page=5)))
        items = data['items']
        if not isinstance(items, list): raise ValueError('invalid search results')
        for item in items[:5]:
            try:
                name = item['full_name']
                if not re.fullmatch(r'[\w.-]+/[\w.-]+', name, re.ASCII): raise ValueError('invalid repository')
                readme = get('https://api.github.com/repos/' + name + '/readme')
                if readme.get('encoding') != 'base64': raise ValueError('unsupported README encoding')
                text = base64.b64decode(readme['content'], validate=False).decode('utf-8', errors='replace')
                if not text.strip(): raise ValueError('empty README')
                note = '수집 범위: 공개 GitHub README 일부. GitHub 공개 여부는 오픈소스 라이선스를 보증하지 않음. 제공자 주장으로, 실제 효과·가격·안전성은 별도 확인 필요.\n\n'
                store.observe(dict(url='https://github.com/' + name, name=name, text=excerpt(note + text)))
                count += 1
            except (ValueError, KeyError, TypeError, OSError):
                errors += 1
        incomplete = bool(data.get('incomplete_results'))
        status = 'partial' if errors or incomplete else 'collected' if count else 'empty'
        store.record_run(status, f'원문 {count}개 수집, 실패 {errors}개. 검색 전체/전체 README 수집 아님. 중복은 기존 작업 유지.')
    except (ValueError, KeyError, TypeError, OSError):
        store.record_run('failed', 'GitHub 수집 실패. 네트워크·요청 한도·검색어를 확인하세요. 기존 기록은 유지됩니다.')
    return store.snapshot()['runs'][-1]
