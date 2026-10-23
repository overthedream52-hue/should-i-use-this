"""Small read-only status export for local project dashboards.

The full inbox snapshot contains the user's situation and source text. Keep those
inside the inbox; this contract exposes only candidate identity and workflow state.
"""

import datetime as dt
import json
from contextlib import closing
from pathlib import Path
import sqlite3
from urllib.parse import quote


def overview(path):
    path = Path(path).expanduser().resolve()
    if not path.is_file():
        return {'format': 'siut-overview-v1', 'available': False,
                'message': 'Mac 후보함 기록이 없습니다.', 'candidates': []}
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
            'SELECT id,observation,answer FROM jobs WHERE version=?', (version,)).fetchall()}
        proposals = {}
        for row in db.execute('SELECT job,status FROM proposals ORDER BY at').fetchall():
            proposals.setdefault(row['job'], []).append(row['status'])
        run = db.execute('SELECT status,at FROM runs ORDER BY id DESC LIMIT 1').fetchone()

    candidates = []
    counts = {'candidates': 0, 'analyzed': 0, 'pendingAnalysis': 0,
              'pendingApproval': 0, 'approved': 0}
    for observation in observations:
        job = jobs.get(observation['id'])
        if job is None:
            continue
        answer = json.loads(job['answer']) if job['answer'] else None
        assessment = (answer or {}).get('view', {}).get('assessments', [{}])[0]
        statuses = proposals.get(job['id'], [])
        pending = answer is not None and 'pending' in statuses
        approved = answer is not None and 'approved' in statuses
        counts['candidates'] += 1
        counts['analyzed' if answer else 'pendingAnalysis'] += 1
        counts['pendingApproval'] += int(pending)
        counts['approved'] += int(approved)
        candidates.append({'name': observation['name'], 'url': observation['url'],
                           'observedAt': observation['at'],
                           'analysis': 'analyzed' if answer else 'pending',
                           'verdict': assessment.get('verdict') if answer else None,
                           'proposal': 'approved' if approved else 'pending' if pending else None})
    return {'format': 'siut-overview-v1', 'available': True,
            'generatedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
            'counts': counts, 'lastRun': dict(run) if run else None,
            'candidates': candidates[:20], 'truncated': len(candidates) > 20,
            'message': '읽기 전용 요약입니다. 원문·판단 근거·승인은 Mac 후보함에서 확인하세요.'}
