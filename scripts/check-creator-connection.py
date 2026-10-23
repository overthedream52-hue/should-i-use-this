#!/usr/bin/env python3
"""Verify the inbox producer contract, without claiming Creator OS deployment."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
from inbox.creator_contract import validate_overview


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path)
    args = parser.parse_args()
    command = [sys.executable, str(Path(__file__).with_name('local-inbox.py'))]
    if args.db is not None: command.extend(['--db',str(args.db)])
    command.append('overview')
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=10)
        if result.returncode: raise ValueError('overview producer failed')
        if len(result.stdout) > 100000: raise ValueError('overview response too large')
        payload = validate_overview(json.loads(result.stdout))
        print(json.dumps(dict(format='siut-connection-check-v1',contract='siut-overview-v1',compatible=True,available=payload['available'],counts=payload.get('counts'),scope='inbox producer only; Creator OS consumer and deployment are separate checks'),ensure_ascii=False,indent=2))
        return 0 if payload['available'] else 3
    except (ValueError,TypeError,OSError,subprocess.TimeoutExpired):
        print(json.dumps(dict(format='siut-connection-check-v1',compatible=False,error='Producer unavailable or contract mismatch; do not display cached data as live.')))
        return 2

if __name__ == '__main__':raise SystemExit(main())
