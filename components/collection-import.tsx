'use client';
import {useRef,useState} from 'react';
import {parseCollection,collectionToFields,type WebCollection} from '../lib/web-collection';
export default function CollectionImport({onApply}:{onApply:(fields:ReturnType<typeof collectionToFields>)=>void}){
 const [packet,setPacket]=useState<WebCollection|null>(null);const [error,setError]=useState('');const version=useRef(0);
 return <details className="transfer-card"><summary>Scrapling 수집 결과 가져오기</summary>
  <p>기존 Scrapling으로 만든 JSON을 확인 후 가져옵니다. 파일은 서버로 전송되지 않습니다.</p>
  <p className="transfer-note">로컬 실행 방법은 저장소의 docs/scraping.md를 참고하세요. 이 웹페이지는 수집기를 직접 실행하지 않습니다.</p>
  <label>수집 JSON 파일<input type="file" accept="application/json,.json" onChange={async e=>{
   const n=++version.current;setPacket(null);setError('');const file=e.target.files?.[0];if(!file)return;
   try{if(file.size>180000)throw Error('파일이 너무 큽니다.');const p=parseCollection(JSON.parse(await file.text()));if(n===version.current)setPacket(p);}
   catch{if(n===version.current)setError('수집 JSON 형식·크기·공개 주소를 확인해 주세요. 기존 입력은 유지했습니다.');}
  }}/></label>
  {packet&&<section aria-label="수집 미리보기">
   <p>출처: {packet.url}</p><p>수집 시각: {packet.collectedAt}</p>
   <strong>{packet.status==='partial'?'부분 수집 · 전체 확인 아님':'수집 실패 또는 접근 제한'}</strong>
   <p>미디어 주소 {packet.media.length}개 · 전체 개수 미확인 · 이미지 내용·OCR 미확인 · 영상 미분석</p>
   <ul>{packet.limitations.map((s,i)=><li key={i}>{s}</li>)}</ul>
   <details><summary>가져올 본문과 미디어 주소 확인</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{packet.text}</pre>{packet.media.map((m,i)=><p key={i}>{m.url}<br/>대체텍스트: {m.alt}</p>)}</details>
   <p>후보 발견용 자료입니다. 제품의 공식 기능·가격은 별도로 확인합니다. 적용하면 이전 후보 이름과 자료를 교체하고 판단 결과·전송 동의를 초기화합니다. 내 상황은 유지합니다.</p>
   <button type="button" className="transfer-secondary" disabled={packet.status!=='partial'||(!packet.text.trim()&&!packet.media.length)} onClick={()=>{try{onApply(collectionToFields(packet));setPacket(null);setError('');}catch(e){setError(e instanceof Error?e.message:'가져오기 실패');}}}>확인한 수집 자료 적용</button>
  </section>}
  {error&&<p role="alert">{error}</p>}
 </details>;
}
