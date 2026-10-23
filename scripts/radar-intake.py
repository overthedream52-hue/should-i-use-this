#!/usr/bin/env python3
"""Reuse Dain Radar public metadata collection; never install packages or use cookies."""
import argparse
import dataclasses
import datetime as dt
import json
from pathlib import Path
import subprocess
import sys
from inbox.web_references import Archive,from_radar,import_radar,packet_contract,collection_failure

DEFAULT_ARCHIVE=Path.home()/'Library/Application Support/Should I Use This/web-collections'

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive',type=Path,default=DEFAULT_ARCHIVE)
    sub=p.add_subparsers(dest='command',required=True)
    sub.add_parser('list')
    imp=sub.add_parser('import-radar');imp.add_argument('--db',type=Path,required=True)
    pkt=sub.add_parser('import-packet');pkt.add_argument('file',type=Path)
    fetch=sub.add_parser('collect');fetch.add_argument('--radar-root',type=Path,required=True);fetch.add_argument('--url',required=True)
    worker=sub.add_parser('_worker');worker.add_argument('--radar-root',type=Path,required=True);worker.add_argument('--url',required=True)
    a=p.parse_args()
    try:
        archive=Archive(a.archive)
        if a.command=='_worker':
            root=a.radar_root.resolve()
            sys.path.insert(0,str(root/'src'))
            from dain_radar.acquisition.web import fetch_reference,WebReferenceError
            packet_contract.public_url(a.url)
            try:
                ref=fetch_reference(a.url,fetched_at=dt.datetime.now(dt.timezone.utc))
                row=dataclasses.asdict(ref);row['fetched_at']=ref.fetched_at.isoformat()
                result=from_radar(row)
            except WebReferenceError as error:
                result=collection_failure(a.url,error)
            print(json.dumps(result,ensure_ascii=False));return 0
        if a.command=='list':result=archive.read()
        elif a.command=='import-radar':result=import_radar(a.db,archive)
        elif a.command=='import-packet':
            if a.file.stat().st_size>180000:raise ValueError('packet too large')
            result=dict(id=archive.save(json.loads(a.file.read_text())))
        else:
            packet_contract.public_url(a.url)
            python=a.radar_root.resolve()/'.venv/bin/python'
            if not python.is_file():raise ValueError('existing Radar Python unavailable')
            child=subprocess.run([str(python),str(Path(__file__).resolve()),'_worker','--radar-root',str(a.radar_root.resolve()),'--url',a.url],capture_output=True,text=True,timeout=90)
            if child.returncode:raise ValueError('existing Radar collector unavailable; no installation attempted')
            packet=packet_contract.validate(json.loads(child.stdout));identifier=archive.save(packet)
            result=dict(id=identifier,status=packet['status'],url=packet['url'],limitations=packet['limitations'])
        print(json.dumps(result,ensure_ascii=False,indent=2));return 0
    except (ValueError,TypeError,KeyError,OSError,subprocess.TimeoutExpired):
        print('Reference intake failed; check the source, packet, or existing Radar environment.',file=sys.stderr);return 2

if __name__=='__main__':raise SystemExit(main())
