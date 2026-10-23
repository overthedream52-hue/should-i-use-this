import {it,expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {collectionToFields,parseCollection} from '../../lib/web-collection';
const sample=()=>({format:'web-collection-v1',url:'https://www.instagram.com/p/DeGjnGIjeZb/?img_index=3',collectedAt:'2026-10-05T12:00:00Z',collector:'scrapling',status:'partial',text:'게시물 소개',media:[{url:'https://cdn.example.com/img.jpg',alt:'설명'}],limitations:['OCR 미실행']});
const py=(x:unknown)=>spawnSync('python3',['scripts/collect-web.py','--validate'],{input:JSON.stringify(x),encoding:'utf8'});
it('keeps discovery content and media unread instead of promoting to evidence',()=>{
 const x=sample();expect(py(x).status).toBe(0);const f=collectionToFields(x);expect(f.name).toBe('');expect(f.suppliedText).toContain('공식 제품 근거가 아닙니다');expect(f.suppliedText).toContain('이미지 내용·OCR 미확인');expect(f.suppliedText).toContain('게시물 소개');
});
it('rejects malformed, excessive, unsafe or falsely complete packets in both runtimes',()=>{
 for(const change of [{status:'complete'},{url:'http://localhost/'},{text:'x'.repeat(13001)},{media:[{url:'javascript:alert(1)',alt:''}]},{format:'source-bundle-v1'},{extra:true}]){
 const x={...sample(),...change};expect(()=>parseCollection(x)).toThrow();expect(py(x).status).not.toBe(0);
 }
});
it('blocks empty/login/error imports and refuses silently truncated transfers',()=>{
 for(const status of ['blocked','failed'])expect(()=>collectionToFields({...sample(),status})).toThrow();
 expect(()=>collectionToFields({...sample(),text:'',media:[]})).toThrow();
 const x={...sample(),text:'x'.repeat(13000),media:Array.from({length:20},(_,i)=>({url:`https://example.com/${i}`,alt:'z'.repeat(500)}))};expect(()=>collectionToFields(x)).toThrow();
});

it('rejects endpoint and credential URLs and naive dates consistently',()=>{for(const change of [{url:'https://127.1/'},{url:'https://8.8.8.8/'},{url:'https://example.com:8443/'},{url:'https://example.com/?token=secret'},{collectedAt:'2026-10-05'},{collectedAt:'2026-10-05T12:00:00'}]){const x={...sample(),...change};expect(()=>parseCollection(x)).toThrow();expect(py(x).status).not.toBe(0);}});
