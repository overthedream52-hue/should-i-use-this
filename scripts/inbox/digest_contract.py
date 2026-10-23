"""Fail-closed contract for siut-digest-v1 (Creator OS remote digest input)."""
import re

from .creator_contract import keys, require, timestamp

VERDICTS = ('consider', 'keep_current', 'needs_info')
NEXT_CHECKS = ('compare_terms', 'keep_current', 'public_sources', 'ask_user')
COST_KINDS = ('free', 'paid', 'unknown')
SCOPES = ('offer', 'product', 'unknown')
ITEM_FIELDS = 'url name observedAt analysis verdict reason claims unknowns nextCheck costKind proposalStatus proposalUpdatedAt jobIdPrefix'


def text(value, limit, label):
    require(isinstance(value, str) and 0 < len(value) <= limit, f'invalid {label}')
    require(not re.search(r'[\x00-\x1f\x7f]', value), f'control character in {label}')


def validate_digest(payload):
    require(isinstance(payload, dict), 'object required')
    require(payload.get('format') == 'siut-digest-v1', 'unsupported digest version')
    require(type(payload.get('available')) is bool, 'availability required')
    base = 'format available message items'
    keys(payload, base + (' generatedAt counts lastRun truncated' if payload['available'] else ''))
    text(payload['message'], 1000, 'message')
    rows = payload['items']
    require(isinstance(rows, list) and len(rows) <= 20, 'item limit')
    if not payload['available']:
        require(rows == [], 'unavailable store cannot supply items')
        return payload
    timestamp(payload['generatedAt'])
    counts = payload['counts']
    keys(counts, 'candidates analyzed pendingAnalysis pendingApproval approved')
    require(all(type(n) is int and n >= 0 for n in counts.values()), 'invalid counts')
    require(counts['candidates'] == counts['analyzed'] + counts['pendingAnalysis'], 'analysis totals disagree')
    require(type(payload['truncated']) is bool, 'truncation flag required')
    require(len(rows) == min(20, counts['candidates']), 'item total disagrees')
    run = payload['lastRun']
    if run is not None:
        keys(run, 'status at')
        require(run['status'] in {'running', 'collected', 'partial', 'empty', 'failed', 'analysis_failed'}, 'unknown run status')
        timestamp(run['at'])
    urls = set()
    for row in rows:
        keys(row, ITEM_FIELDS)
        text(row['name'], 200, 'name')
        require(isinstance(row['url'], str) and re.fullmatch(r'https://github\.com/[\w.-]+/[\w.-]+', row['url'], re.ASCII), 'unsupported candidate URL')
        require(row['url'].lower() not in urls, 'duplicate candidate')
        urls.add(row['url'].lower())
        timestamp(row['observedAt'])
        require(row['analysis'] in ('pending', 'analyzed'), 'unknown analysis state')
        require(row['proposalStatus'] in ('none', 'pending', 'approved'), 'unknown proposal state')
        if row['proposalUpdatedAt'] is not None:
            timestamp(row['proposalUpdatedAt'])
        require(isinstance(row['jobIdPrefix'], str) and re.fullmatch(r'[0-9a-f]{8}', row['jobIdPrefix']), 'invalid job prefix')
        if row['analysis'] == 'pending':
            for field in ('verdict', 'reason', 'nextCheck', 'costKind'):
                require(row[field] is None, 'unanalyzed candidate cannot carry judgment')
            require(row['claims'] == [] and row['unknowns'] == [] and row['proposalStatus'] == 'none', 'unanalyzed candidate cannot carry judgment or approval')
            continue
        require(row['verdict'] in VERDICTS, 'unknown verdict')
        require(row['nextCheck'] in NEXT_CHECKS, 'unknown next check')
        require(row['costKind'] in COST_KINDS, 'unknown cost kind')
        if row['reason'] is not None:
            text(row['reason'], 300, 'reason')
        require(isinstance(row['claims'], list) and len(row['claims']) <= 12, 'claim limit')
        for claim in row['claims']:
            keys(claim, 'statement scope refs')
            text(claim['statement'], 500, 'claim')
            require(claim['scope'] in SCOPES, 'unknown claim scope')
            require(isinstance(claim['refs'], list) and len(claim['refs']) <= 8, 'ref limit')
            for ref in claim['refs']:
                keys(ref, 'url title')
                require(isinstance(ref['url'], str) and ref['url'].startswith('https://') and len(ref['url']) <= 2048, 'unsupported evidence URL')
                text(ref['title'], 300, 'evidence title')
        require(isinstance(row['unknowns'], list) and len(row['unknowns']) <= 12, 'unknown limit')
        for statement in row['unknowns']:
            text(statement, 500, 'unknown')
    return payload
