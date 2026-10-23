"""Read-only detail export (siut-digest-v1) for Creator OS's remote digest.

Shares the read-only connection discipline of overview.py. Beyond the
overview fields it exposes the stored adoption-v4 judgment per candidate:
verdict, a capped reason, product-scoped claims with their public evidence
URLs, unknown statements, next check and cost kind. It never reads
settings.profile, jobs.input, observations.text or proposals.body.
"""

import datetime as dt
import json
from contextlib import closing
from pathlib import Path
import sqlite3
from urllib.parse import quote

FORMAT = 'siut-digest-v1'
REASON_LIMIT = 300
ITEM_LIMIT = 20


def _claims(assessment):
    out = []
    for claim in assessment.get('claims', []):
        refs = [{'url': e['url'], 'title': e['title']} for e in claim.get('evidence', [])
                if isinstance(e, dict) and 'url' in e and 'title' in e]
        out.append({'statement': claim['statement'], 'scope': claim['scope'], 'refs': refs[:8]})
    return out[:12]


def digest(path, include_reason=True):
    path = Path(path).expanduser().resolve()
    if not path.is_file():
        return {'format': FORMAT, 'available': False,
                'message': 'Mac 후보함 기록이 없습니다.', 'items': []}
    uri = 'file:' + quote(str(path), safe='/') + '?mode=ro'
    with closing(sqlite3.connect(uri, uri=True, timeout=2)) as db:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        version = db.execute('SELECT version FROM settings WHERE id=1').fetchone()['version']
        observations = db.execute('''SELECT o.id,o.url,o.name,o.at FROM observations o
            WHERE o.id=(SELECT MAX(id) FROM observations WHERE url=o.url)
            ORDER BY o.id DESC''').fetchall()
        jobs = {row['observation']: row for row in db.execute(
            'SELECT id,observation,answer,at FROM jobs WHERE version=?', (version,)).fetchall()}
        proposals = {}
        for row in db.execute('SELECT job,status,at FROM proposals ORDER BY at').fetchall():
            proposals.setdefault(row['job'], []).append((row['status'], row['at']))
        run = db.execute('SELECT status,at FROM runs ORDER BY id DESC LIMIT 1').fetchone()

    items = []
    counts = {'candidates': 0, 'analyzed': 0, 'pendingAnalysis': 0, 'pendingApproval': 0, 'approved': 0}
    for observation in observations:
        job = jobs.get(observation['id'])
        if job is None:
            continue
        answer = json.loads(job['answer']) if job['answer'] else None
        assessment = (answer or {}).get('view', {}).get('assessments', [{}])[0]
        statuses = proposals.get(job['id'], [])
        pending = [at for status, at in statuses if status == 'pending'] if answer else []
        approved = [at for status, at in statuses if status == 'approved'] if answer else []
        counts['candidates'] += 1
        counts['analyzed' if answer else 'pendingAnalysis'] += 1
        counts['pendingApproval'] += int(bool(pending))
        counts['approved'] += int(bool(approved))
        if approved:
            proposal_status, proposal_at = 'approved', approved[-1]
        elif pending:
            proposal_status, proposal_at = 'pending', pending[-1]
        else:
            proposal_status, proposal_at = 'none', None
        reason = assessment.get('reason') if answer and include_reason else None
        items.append({
            'url': observation['url'], 'name': observation['name'], 'observedAt': observation['at'],
            'analysis': 'analyzed' if answer else 'pending',
            'verdict': assessment.get('verdict') if answer else None,
            'reason': reason[:REASON_LIMIT] if isinstance(reason, str) else None,
            'claims': _claims(assessment) if answer else [],
            'unknowns': [u['statement'] for u in assessment.get('unknowns', [])][:12] if answer else [],
            'nextCheck': assessment.get('nextCheck') if answer else None,
            'costKind': (assessment.get('cost') or {}).get('kind') if answer else None,
            'proposalStatus': proposal_status, 'proposalUpdatedAt': proposal_at,
            'jobIdPrefix': job['id'][:8],
        })
    return {'format': FORMAT, 'available': True,
            'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
            'counts': counts, 'lastRun': dict(run) if run else None,
            'items': items[:ITEM_LIMIT], 'truncated': len(items) > ITEM_LIMIT,
            'message': '읽기 전용 상세 요약입니다. 원문·사용자 상황·제안 본문·승인은 Mac 후보함에만 있습니다.'}
