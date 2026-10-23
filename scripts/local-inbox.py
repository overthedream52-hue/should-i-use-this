#!/usr/bin/env python3
"""Shared local inbox. Agents may read/propose; approvals belong to the dashboard."""
import argparse
import json
from pathlib import Path
import sys
from inbox.store import Store
from inbox.discovery import discover, DEFAULT_QUERY
from inbox.server import make_server
from inbox.overview import overview
from inbox.creator_contract import validate_overview
from inbox.digest import digest
from inbox.digest_contract import validate_digest
from inbox.reference_candidates import ReferenceCandidates

DEFAULT_DB = Path.home() / 'Library/Application Support/Should I Use This/inbox.sqlite3'

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db',type=Path,default=DEFAULT_DB)
    sub=parser.add_subparsers(dest='command',required=True)
    server=sub.add_parser('serve');server.add_argument('--port',type=int,default=3127)
    collect=sub.add_parser('discover');collect.add_argument('--query')
    for name in ['jobs','snapshot','approved','submit','propose','overview']:sub.add_parser(name)
    sub.add_parser('reference-candidates')
    resolve=sub.add_parser('resolve-references');resolve.add_argument('--retry',action='store_true')
    detail=sub.add_parser('digest');detail.add_argument('--no-reason',action='store_true')
    args=parser.parse_args()
    try:
        if args.command == 'overview':
            print(json.dumps(validate_overview(overview(args.db)), ensure_ascii=False, indent=2))
            return 0
        if args.command == 'digest':
            print(json.dumps(validate_digest(digest(args.db, include_reason=not args.no_reason)), ensure_ascii=False, indent=2))
            return 0
        store=Store(args.db)
        if args.command=='serve':
            server=make_server(store,args.port)
            print(f'http://127.0.0.1:{server.server_address[1]}/',flush=True)
            try:server.serve_forever()
            except KeyboardInterrupt:pass
            finally:server.server_close()
            return 0
        if args.command=='reference-candidates':result=ReferenceCandidates(store).snapshot()
        elif args.command=='resolve-references':result=ReferenceCandidates(store).resolve(retry=args.retry)
        elif args.command=='discover':result=discover(store,args.query)
        elif args.command in {'jobs','snapshot','approved'}:result=getattr(store,args.command)()
        else:
            raw=sys.stdin.read(200001)
            if len(raw)>200000:raise ValueError('input too large')
            data=json.loads(raw)
            if args.command=='submit':
                if set(data)!={'jobId','reply','proposal'}:raise ValueError('jobId, reply, proposal required')
                result=store.submit(data['jobId'],data['reply'],data['proposal'])
            else:
                if set(data)!={'jobId','proposal'}:raise ValueError('jobId, proposal required')
                result={'proposalId':store.propose(data['jobId'],data['proposal'])}
        print(json.dumps(result,ensure_ascii=False,indent=2))
        return 0
    except (ValueError,TypeError,KeyError,OSError) as error:
        print('Inbox error: '+str(error),file=sys.stderr);return 2

if __name__=='__main__':raise SystemExit(main())
