"""Fail-closed consumer contract for Creator OS's read-only inbox summary."""
import datetime as dt
import re


def require(condition, message):
    if not condition:
        raise ValueError(message)


def keys(value, expected):
    require(isinstance(value, dict) and set(value) == set(expected.split()), 'unexpected or missing fields')


def timestamp(value):
    require(isinstance(value, str), 'timestamp required')
    try:
        parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        raise ValueError('invalid timestamp') from None
    require(parsed.tzinfo is not None, 'timezone required')


def validate_overview(payload):
    require(isinstance(payload, dict), 'object required')
    require(payload.get('format') == 'siut-overview-v1', 'unsupported overview version')
    require(type(payload.get('available')) is bool, 'availability required')
    base = 'format available message candidates'
    keys(payload, base + (' generatedAt counts lastRun truncated' if payload['available'] else ''))
    require(isinstance(payload['message'], str) and 0 < len(payload['message']) <= 1000, 'invalid message')
    rows = payload['candidates']
    require(isinstance(rows, list) and len(rows) <= 20, 'candidate limit')
    if not payload['available']:
        require(rows == [], 'unavailable store cannot supply candidates')
        return payload
    timestamp(payload['generatedAt'])
    counts = payload['counts']
    keys(counts, 'candidates analyzed pendingAnalysis pendingApproval approved')
    require(all(type(n) is int and n >= 0 for n in counts.values()), 'invalid counts')
    require(counts['candidates'] == counts['analyzed'] + counts['pendingAnalysis'], 'analysis totals disagree')
    require(max(counts['pendingApproval'], counts['approved']) <= counts['analyzed'], 'approval exceeds analyzed candidates')
    require(type(payload['truncated']) is bool, 'truncation flag required')
    require(len(rows) == min(20, counts['candidates']), 'candidate total disagrees')
    require(payload['truncated'] == (counts['candidates'] > 20), 'truncation total disagrees')
    run = payload['lastRun']
    if run is not None:
        keys(run, 'status at')
        require(run['status'] in {'running','collected','partial','empty','failed','analysis_failed'}, 'unknown run status')
        timestamp(run['at'])
    urls = set()
    visible = dict(analyzed=0,pendingAnalysis=0,pendingApproval=0,approved=0)
    for row in rows:
        keys(row, 'name url observedAt analysis verdict proposal')
        require(isinstance(row['name'], str) and 0 < len(row['name']) <= 200, 'invalid name')
        require(isinstance(row['url'], str) and re.fullmatch(r'https://github\.com/[\w.-]+/[\w.-]+', row['url'], re.ASCII), 'unsupported candidate URL')
        require(row['url'].lower() not in urls, 'duplicate candidate')
        urls.add(row['url'].lower())
        timestamp(row['observedAt'])
        require(row['analysis'] in ('pending','analyzed'), 'unknown analysis state')
        require(row['proposal'] in (None,'pending','approved'), 'unknown proposal state')
        if row['analysis'] == 'pending':
            require(row['verdict'] is None and row['proposal'] is None, 'unanalyzed candidate cannot carry judgment or approval')
            visible['pendingAnalysis'] += 1
        else:
            require(row['verdict'] in ('consider','keep_current','needs_info'), 'unknown verdict')
            visible['analyzed'] += 1
        if row['proposal'] == 'pending': visible['pendingApproval'] += 1
        if row['proposal'] == 'approved': visible['approved'] += 1
    require(all(visible[k] <= counts[k] for k in visible), 'visible state exceeds totals')
    if not payload['truncated']:
        require(visible['analyzed'] == counts['analyzed'] and visible['approved'] == counts['approved'], 'visible state disagrees with totals')
    # A candidate can have both pending and approved proposals. The visible label
    # prioritizes approved, so pendingApproval need not equal visible pending rows.
    return payload
