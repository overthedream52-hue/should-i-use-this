"""Durable local collaboration ledger; no model calls or command execution."""
import contextlib
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.agents/skills/should-i-use-this/scripts'))
import adoption_contract as adoption


def dumps(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def bounded(value, maximum, field):
    if not isinstance(value, str) or not value.strip() or len(value.encode('utf-16-le')) // 2 > maximum:
        raise ValueError('invalid ' + field)
    return value


def excerpt(text, maximum=12000):
    return text.encode('utf-16-le')[:maximum * 2].decode('utf-16-le', errors='ignore')


class Store:
    def __init__(self, path):
        self.path = Path(path).expanduser().resolve()
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER, profile TEXT);
            INSERT OR IGNORE INTO settings(id,version,profile) VALUES (1,1,'');
            CREATE TABLE IF NOT EXISTS observations (id INTEGER PRIMARY KEY, url TEXT, name TEXT, text TEXT, digest TEXT, at TEXT);
            CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, observation INTEGER, version INTEGER, input TEXT, answer TEXT, at TEXT, UNIQUE(observation,version));
            CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, job TEXT, body TEXT, status TEXT, at TEXT);
            CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, proposal TEXT, decision TEXT, at TEXT);
            CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, status TEXT, detail TEXT, at TEXT);
            ''')
            db.execute('BEGIN IMMEDIATE')
            if 'query' not in {r[1] for r in db.execute('PRAGMA table_info(settings)')}:
                db.execute("ALTER TABLE settings ADD COLUMN query TEXT NOT NULL DEFAULT 'topic:mcp-server archived:false stars:>100'")
        os.chmod(self.path, 0o600)

    @contextlib.contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def _make_job(self, db, observation):
        setting = db.execute('SELECT * FROM settings').fetchone()
        fields = dict(name=observation['name'], url=observation['url'], situation=setting['profile'], suppliedText='')
        base = adoption.prepare(fields)['input']
        source = dict(candidateUrl=observation['url'], name=observation['name'], kind='software',
                      url=observation['url'], title='Repository README excerpt (publisher claims)', text=observation['text'])
        inp = dict(base=base, sources=[source], provenance='provided')
        adoption.judge(inp)
        db.execute('INSERT OR IGNORE INTO jobs VALUES (?,?,?,?,NULL,?)',
                   (str(uuid.uuid4()), observation['id'], setting['version'], dumps(inp), now()))

    def observe(self, source):
        url = bounded(source['url'], 2048, 'url')
        if not re.fullmatch(r'https://github\.com/[\w.-]+/[\w.-]+', url, re.ASCII):
            raise ValueError('GitHub repository URL required')
        url = url.lower()
        name = bounded(source['name'], 200, 'name')
        text = bounded(source['text'], 12000, 'text')
        digest = hashlib.sha256(dumps([name, text]).encode()).hexdigest()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT * FROM observations WHERE url=? ORDER BY id DESC LIMIT 1', (url,)).fetchone()
            if prior is not None and prior['digest'] == digest:
                self._make_job(db, prior)
                return prior['id']
            cursor = db.execute('INSERT INTO observations(url,name,text,digest,at) VALUES (?,?,?,?,?)',
                                (url, name, text, digest, now()))
            row = db.execute('SELECT * FROM observations WHERE id=?', (cursor.lastrowid,)).fetchone()
            self._make_job(db, row)
            return row['id']

    def query(self, text):
        bounded(text, 256, 'query')
        with self.connect() as db:
            db.execute('UPDATE settings SET query=?', (text,))

    def profile(self, text):
        if not isinstance(text, str) or len(text.encode('utf-16-le')) // 2 > 4000:
            raise ValueError('profile too long')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old = db.execute('SELECT profile FROM settings').fetchone()[0]
            if old == text:
                return
            db.execute('UPDATE settings SET profile=?,version=version+1', (text,))
            for row in db.execute('SELECT * FROM observations WHERE id IN (SELECT MAX(id) FROM observations GROUP BY url)').fetchall():
                self._make_job(db, row)

    def _current(self, db, job_id):
        row = db.execute('''SELECT j.* FROM jobs j JOIN observations o ON o.id=j.observation
            WHERE j.id=? AND j.version=(SELECT version FROM settings)
            AND o.id=(SELECT MAX(id) FROM observations WHERE url=o.url)''', (job_id,)).fetchone()
        if row is None:
            raise ValueError('unknown or stale job; reload current evidence')
        return row

    def jobs(self):
        with self.connect() as db:
            result = []
            for row in db.execute('SELECT * FROM jobs WHERE answer IS NULL ORDER BY at').fetchall():
                try:
                    self._current(db, row['id'])
                except ValueError:
                    continue
                result.append(dict(id=row['id'], **adoption.judge(json.loads(row['input']))))
            return result

    def submit(self, job_id, reply, proposal=None):
        try:
            return self._submit(job_id, reply, proposal)
        except (ValueError, TypeError, KeyError):
            self.record_run('analysis_failed', '분석 제출 거절: 고정 입력, 근거 번호, 필수 조건 또는 작업 버전을 확인하세요. 기존 결과는 보존됩니다.')
            raise

    def _submit(self, job_id, reply, proposal):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = self._current(db, job_id)
            if row['answer'] is not None:
                raise ValueError('analysis already submitted; history is immutable')
            view = adoption.validate(json.loads(row['input']), reply)
            db.execute('UPDATE jobs SET answer=? WHERE id=?', (dumps(dict(reply=reply, **view)), job_id))
            if proposal is not None:
                self._propose(db, job_id, proposal)
            return view

    def _propose(self, db, job_id, body):
        self._current(db, job_id)
        if not isinstance(body, dict) or set(body) != {'scope','benefit','risk','check','rollback'}:
            raise ValueError('proposal needs scope, benefit, risk, check, rollback')
        for key, value in body.items():
            bounded(value, 2000, key)
        existing = db.execute('SELECT id FROM proposals WHERE job=? AND body=?', (job_id, dumps(body))).fetchone()
        if existing:
            return existing[0]
        identifier = str(uuid.uuid4())
        db.execute('INSERT INTO proposals VALUES (?,?,?,?,?)', (identifier, job_id, dumps(body), 'pending', now()))
        return identifier

    def propose(self, job_id, body):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            return self._propose(db, job_id, body)

    def decide(self, identifier, decision):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            p = db.execute('SELECT * FROM proposals WHERE id=?', (identifier,)).fetchone()
            if p is None:
                raise ValueError('unknown proposal')
            if decision in {'approve','reject'} and p['status'] == 'pending':
                job = self._current(db, p['job'])
                if decision == 'approve' and job['answer'] is None:
                    raise ValueError('analysis required before approval')
                state = 'approved' if decision == 'approve' else 'rejected'
            elif decision == 'revoke' and p['status'] == 'approved':
                state = 'revoked'
            else:
                raise ValueError('invalid decision transition')
            db.execute('UPDATE proposals SET status=? WHERE id=?', (state, identifier))
            db.execute('INSERT INTO events(proposal,decision,at) VALUES (?,?,?)', (identifier, decision, now()))

    def approved(self):
        return [p for p in self.snapshot()['proposals'] if p['status'] == 'approved' and p['current'] and p['analysisReady']]

    def record_run(self, status, detail):
        with self.connect() as db:
            db.execute('INSERT INTO runs(status,detail,at) VALUES (?,?,?)', (status, detail[:1000], now()))

    def snapshot(self):
        with self.connect() as db:
            # A coherent read across independently writing local agents.
            db.execute('BEGIN')
            output = dict(format='siut-inbox-v1', generatedAt=now(), settings=dict(db.execute('SELECT * FROM settings').fetchone()))
            for table in ['observations','jobs','proposals','events','runs']:
                output[table] = [dict(row) for row in db.execute('SELECT * FROM ' + table).fetchall()]
            for job in output['jobs']:
                job['input'] = json.loads(job['input'])
                job['answer'] = json.loads(job['answer']) if job['answer'] else None
                try:
                    self._current(db, job['id']); job['current'] = True
                except ValueError:
                    job['current'] = False
            analyzed = {j['id'] for j in output['jobs'] if j['answer'] is not None}
            current = {j['id'] for j in output['jobs'] if j['current']}
            for p in output['proposals']:
                p['body'] = json.loads(p['body']); p['current'] = p['job'] in current
                p['analysisReady'] = p['job'] in analyzed
            return output
