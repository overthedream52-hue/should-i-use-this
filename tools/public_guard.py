#!/usr/bin/env python3
"""Pre-push guard for public repositories.

Blocks a push when the pushed tree or the new commits contain something that must stay
private: real home-directory paths, personal mail addresses, private keys, cache or env
folders, symlinks, files outside the repository's allowed paths, commits by an author the
repository does not allow, or any term from the local private term list.

The private term list never lives in the repository. It is read from
$PUBLIC_GUARD_TERMS or ~/.config/public-guard/terms.json (mode 600):
    {"terms": ["..."], "emails": ["..."], "paths": ["regex", ...]}
If it is missing or readable by others, every push is blocked (fail closed).

Per-repository rules live in .public-policy.json at the repository root:
    {"allowed_authors": ["..."],          # author and committer emails for new commits
     "allowed_paths": ["regex", ...],     # optional allowlist; every file must match one
     "denied_paths": ["regex", ...],      # optional denylist
     "allow_content": ["path", ...],      # files whose content is not scanned (fixtures)
     "allow_term_numbers": [n, ...]}      # private terms (1-based, by position) this repository may contain

Usage:
    public_guard.py check [--repo DIR] [--rev REV] [--base REV]
    public_guard.py install REPO          # copies this file to REPO/tools/, writes the hook
    public_guard.py hook                  # called by .githooks/pre-push
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import stat
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

ZERO = "0" * 40
MAX_BYTES = 5 * 1024 * 1024
POLICY_FILE = ".public-policy.json"
DEFAULT_TERMS = Path.home() / ".config" / "public-guard" / "terms.json"
WEB_COMMITTER = "noreply@github.com"

CACHE_PATH = re.compile(r"(^|/)(\.pytest_cache|__pycache__|\.venv|venv|\.mypy_cache|node_modules)(/|$)"
                        r"|(^|/)\.env(\.[^/]*)?$|(^|/)\.DS_Store$|\.pyc$")
CONTENT_RULES = (
    ("home-path", re.compile(r"/(?:Users|home)/(?!x/|example/|you/|<)[A-Za-z0-9._-]+/"),
     "replace the real home path with a placeholder such as /Users/x/"),
    ("personal-email", re.compile(r"[A-Za-z0-9._%+-]+@(?:gmail|naver|daum|hanmail|kakao|icloud|outlook|hotmail|yahoo)\.(?:com|net)", re.I),
     "remove the personal mail address"),
    ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
     "remove the key and rotate it"),
)


@dataclass
class Problem:
    rule: str
    path: str
    hint: str

    def message(self) -> str:
        return f"[{self.rule}] {self.path}: {self.hint}"


def _git(repo: Path, *args: str, binary: bool = False, check: bool = True):
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, check=False)
    if check and r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.decode('utf-8', 'replace').strip()}")
    return r.stdout if binary else r.stdout.decode("utf-8", "replace")


def _load_terms() -> tuple[list[str], list[re.Pattern], list[Problem]]:
    path = Path(os.environ.get("PUBLIC_GUARD_TERMS") or DEFAULT_TERMS).expanduser()
    if not path.is_file():
        return [], [], [Problem("terms-missing", str(path),
                            "create the private term list (mode 600) before pushing; see the header of public_guard.py")]
    if path.stat().st_mode & 0o077:
        return [], [], [Problem("terms-permissions", str(path), "run: chmod 600 on the private term list")]
    data = json.loads(path.read_text(encoding="utf-8"))
    terms = [str(t) for t in (data.get("terms") or []) + (data.get("emails") or []) if str(t).strip()]
    paths = [re.compile(p) for p in data.get("paths") or []]
    return terms, paths, []


def _load_policy(repo: Path, rev: str) -> dict | None:
    raw = _git(repo, "show", f"{rev}:{POLICY_FILE}", check=False)
    if not raw.strip():
        return None
    return json.loads(raw)


def _commits(repo: Path, rev: str, base: str | None) -> list[str]:
    if base is None:
        return [_git(repo, "rev-parse", rev).strip()]
    if base == "--remotes":
        out = _git(repo, "rev-list", rev, "--not", "--remotes")
    else:
        out = _git(repo, "rev-list", f"{base}..{rev}")
    return [c for c in out.split() if c]


def check_rev(repo: Path | str, rev: str = "HEAD", base: str | None = None) -> list[Problem]:
    """Problems in the tree at `rev` and in the commits after `base` (only `rev` itself when base is None)."""
    repo = Path(repo)
    terms, private_paths, problems = _load_terms()
    if problems:
        return problems
    try:
        policy = _load_policy(repo, rev)
    except ValueError:
        return [Problem("policy-invalid", POLICY_FILE, "fix the JSON in .public-policy.json")]
    if policy is None:
        return [Problem("policy-missing", POLICY_FILE, "add .public-policy.json at the repository root")]
    allowed = [re.compile(p) for p in policy.get("allowed_paths") or []]
    denied = [re.compile(p) for p in policy.get("denied_paths") or []]
    skip_content = set(policy.get("allow_content") or [])
    allowed_terms = set(policy.get("allow_term_numbers") or [])
    lowered = [(t.lower(), i) for i, t in enumerate(terms, start=1) if i not in allowed_terms]

    for entry in _git(repo, "ls-tree", "-r", "-z", "--full-tree", rev).split("\0"):
        if not entry:
            continue
        meta, path = entry.split("\t", 1)
        mode, kind, sha = meta.split()
        if mode == "120000":
            problems.append(Problem("symlink", path, "replace the symlink with the real file or remove it"))
            continue
        if kind != "blob":
            continue
        if CACHE_PATH.search(path):
            problems.append(Problem("cache-or-env", path, "remove the cache or environment file and add it to .gitignore"))
            continue
        if allowed and not any(a.search(path) for a in allowed):
            problems.append(Problem("path-not-allowed", path, f"this path is outside the allowed_paths in {POLICY_FILE}"))
            continue
        n = next((i for i, rx in enumerate(private_paths, start=1) if rx.search(path)), None)
        if n is not None:
            problems.append(Problem("private-path", path, f"matches private path rule #{n} from the local term list; keep this file out of the repository"))
            continue
        if any(d.search(path) for d in denied):
            problems.append(Problem("path-denied", path, f"this path matches denied_paths in {POLICY_FILE}"))
            continue
        if int(_git(repo, "cat-file", "-s", sha).strip()) > MAX_BYTES:
            problems.append(Problem("too-large", path, f"file is over {MAX_BYTES // (1024 * 1024)} MB"))
            continue
        if path in skip_content:
            continue
        text = _git(repo, "cat-file", "blob", sha, binary=True).decode("utf-8", "replace")
        hit = next(((name, hint) for name, pat, hint in CONTENT_RULES if pat.search(text)), None)
        if hit:
            problems.append(Problem(hit[0], path, hit[1]))
            continue
        low = text.lower()
        term = next((i for t, i in lowered if t in low), None)
        if term is not None:
            problems.append(Problem("private-term", path, f"contains private term #{term} from the local term list"))

    authors = set(policy.get("allowed_authors") or [])
    for c in _commits(repo, rev, base):
        author, committer = _git(repo, "show", "-s", "--format=%ae%n%ce", c).split("\n")[:2]
        msg = _git(repo, "show", "-s", "--format=%B", c)
        low_msg = msg.lower()
        if any(pat.search(msg) for _name, pat, _hint in CONTENT_RULES) or any(t in low_msg for t, _i in lowered):
            problems.append(Problem("commit-message", c[:8], "the commit message contains a private term, path or address; "
                                                             "reword it with git commit --amend"))
        bad = [e for e in (author, committer) if e not in authors and not (e == committer == WEB_COMMITTER)]
        if bad:
            problems.append(Problem("author", c[:8], "commit author or committer is not in allowed_authors; "
                                                     "set the repository-local user.email and recommit"))
    return problems


def install(repo: Path | str) -> None:
    """Copy this file into REPO/tools/, write .githooks/pre-push, point core.hooksPath at it."""
    repo = Path(repo)
    src = Path(__file__).resolve()
    dest = repo / "tools" / "public_guard.py"
    dest.parent.mkdir(parents=True, exist_ok=True)
    if not dest.exists() or dest.read_bytes() != src.read_bytes():
        shutil.copyfile(src, dest)
    hook = repo / ".githooks" / "pre-push"
    hook.parent.mkdir(parents=True, exist_ok=True)
    hook.write_text('#!/bin/sh\nexec python3 "$(git rev-parse --show-toplevel)/tools/public_guard.py" hook "$@"\n',
                    encoding="utf-8")
    hook.chmod(hook.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    _git(repo, "config", "core.hooksPath", ".githooks")


def _hook(stdin) -> int:
    repo = Path(_git(Path.cwd(), "rev-parse", "--show-toplevel").strip())
    problems: list[Problem] = []
    for line in stdin:
        parts = line.split()
        if len(parts) != 4:
            continue
        _local_ref, local_sha, _remote_ref, remote_sha = parts
        if local_sha == ZERO:
            continue
        known = remote_sha != ZERO and _git(repo, "cat-file", "-e", remote_sha, check=False) == ""
        base = remote_sha if known and remote_sha != ZERO else "--remotes"
        problems += check_rev(repo, local_sha, base=base)
    for p in problems:
        print("public_guard: " + p.message(), file=sys.stderr)
    if problems:
        print(f"public_guard: push blocked ({len(problems)} problem(s)). Fix them; do not bypass with --no-verify.",
              file=sys.stderr)
        return 1
    return 0


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(prog="public_guard.py")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("check")
    c.add_argument("--repo", default=".")
    c.add_argument("--rev", default="HEAD")
    c.add_argument("--base")
    i = sub.add_parser("install")
    i.add_argument("repo")
    h = sub.add_parser("hook")
    h.add_argument("git_args", nargs="*", help="remote name and URL that git passes to pre-push (unused)")
    a = ap.parse_args(argv)
    if a.cmd == "install":
        install(a.repo)
        print(f"installed: {Path(a.repo) / 'tools' / 'public_guard.py'} and .githooks/pre-push")
        return 0
    if a.cmd == "hook":
        return _hook(sys.stdin)
    problems = check_rev(Path(a.repo), a.rev, base=a.base)
    for p in problems:
        print(p.message())
    print(f"{len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
