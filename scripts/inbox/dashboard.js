'use strict';
let state;
let cassetteReview;
const labels={pending:'승인 대기',approved:'승인됨',rejected:'거절됨',revoked:'승인 철회',running:'수집 중',collected:'수집 완료',partial:'일부 수집',empty:'검색 결과 없음',failed:'수집 실패',analysis_failed:'분석 제출 실패'};
const $ = id => document.getElementById(id);
function el(tag, text, parent) { const node=document.createElement(tag);node.textContent=text; if(parent)parent.append(node);return node; }
async function request(path, body) {
  const response=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json','X-Inbox-CSRF':state.csrf},body:JSON.stringify(body)}:{});
  const result=await response.json();if(!response.ok)throw Error(result.error||'요청 실패');return result;
}
async function action(path,body){try{await request(path,body);await load();$('message').textContent='저장했습니다.';return true;}catch(error){$('message').textContent=error.message;return false;}}
function renderCassette(review){
  const card=$('cassette-card');card.replaceChildren();
  const jobs=state.jobs.filter(j=>j.input.base.subject.url.toLowerCase()===review.url);
  card.hidden=!jobs.length;if(card.hidden)return;
  el('p','먼저 확인할 도구 · 공개 문서 재확인 '+review.checkedAt,card).className='eyebrow';
  el('h2',review.name,card);el('p',review.definition,card);
  const proposals=state.proposals.filter(p=>jobs.some(j=>j.id===p.job)&&p.body.scope===review.researchScope);
  const valid=proposals.some(p=>p.current&&p.status==='approved');
  const old=proposals.some(p=>!p.current&&p.status==='approved');
  el('p',valid?'공개 조사 승인됨 · 설치 승인 아님':old?'이전 승인 기록 · 현재 근거 재확인 필요':proposals.some(p=>p.current&&p.status==='pending')?'조사 승인 대기':'유효한 조사 승인 없음',card).className='tag';
  el('p',review.decision,card);el('p',review.cost,card);
  el('h3','내 업무와 어떤 관련인가',card);el('p',review.relevance,card);
  const usage=el('details','',card);el('summary','어떻게 사용하는가',usage);
  const steps=el('ol','',usage);for(const step of review.steps)el('li',step,steps);
  el('p',review.example,usage);
  const actions=el('div','',card);actions.className='row';
  for(const action of review.actions||[]){const link=el('a',action.label,actions);link.href=action.url;}
  el('h3','지금 할 일',card);el('p',review.next,card);
  const scope=el('a','승인 범위와 기록 보기',card);scope.href='#approval-records';
  const evidence=el('details','',card);el('summary','원문과 미확인 조건',evidence);
  for(const limit of review.limits)el('p',limit,evidence);
  for(const source of review.sources){const p=el('p','',evidence);const link=el('a',source.label,p);link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';}
  el('p','별도 조사 요약입니다. 기존 분석 답변·승인 이력을 변경하지 않았으며 실제 편집 실행은 검증하지 않았습니다.',evidence);
}
async function load(){
  try{
    state=await request('/api/state');
    try {cassetteReview??=await request('/cassette-review.json');renderCassette(cassetteReview);} catch {$('cassette-card').hidden=false;$('cassette-card').textContent='Cassette 조사 카드를 읽지 못했습니다. 기존 기록은 아래에서 확인하세요.';}
    if(document.activeElement!==$('profile')&&!$('profile').dataset.dirty)$('profile').value=state.settings.profile;
    if(document.activeElement!==$('query')&&!$('query').dataset.dirty)$('query').value=state.settings.query;
    $('storage').textContent='Mac 저장 위치: '+state.storage;
    $('discover').disabled=state.collecting;
    const run=state.runs.at(-1);$('run').textContent=state.collecting?'수집 중…':run?run.at+' · '+(labels[run.status]||run.status)+' · '+run.detail:'아직 수집하지 않았습니다.';
    $('history').textContent=state.runs.slice(-20).reverse().map(r=>r.at+' '+r.status+' '+r.detail).join('\n');
    $('resolve-references').disabled=state.resolving;
    $('retry-references').disabled=state.resolving;
    const refs=state.webReferences;
    $('references').replaceChildren();
    $('reference-counts').textContent=refs.total+'개 링크'+(refs.truncated?' · 최신 100개 표시':'')+(refs.invalidFiles?' · 읽지 못한 기록 '+refs.invalidFiles+'개':'');
    if(!refs.references.length)el('p','아직 웹 수집 참고자료가 없습니다.',$('references'));
    for(const ref of refs.references){
      const card=el('article','',$('references'));
      const link=el('a',ref.url,card);link.href=ref.url;link.target='_blank';link.rel='noopener noreferrer';
      el('p',ref.collectedAt+' · '+({partial:'일부 수집',blocked:'수집 차단 · 원문 미확인',failed:'수집 실패'}[ref.status]),card);
      for(const limitation of ref.limitations)el('p',limitation,card);
      const check=state.referenceCandidates.references.find(r=>r.sourceUrl===ref.url&&r.sourceCollectedAt===ref.collectedAt);
      if(check){
        el('p',check.message,card);
        if(check.recordError)el('p','후보 연결 기록을 읽지 못했습니다. 기존 기록 확인 필요.',card);
        if(check.needsResearch)el('p','추가 조사 필요 · 제품 식별 또는 원문 확인 미완료',card);
        for(const item of check.items){
          const line=el('p','',card);const repo=el('a',item.url,line);repo.href=item.url;repo.target='_blank';repo.rel='noopener noreferrer';
          const job=state.jobs.find(j=>j.current&&j.observation===item.observation);
          const label=item.status==='queued'?(job?(job.answer?'분석 완료 · 정확성 별도 검토':'README 확보 · 분석 대기'):'과거 근거 연결 · 현재 분석 기록 확인'):item.status==='failed'?'저장소·README 확인 실패':'저장소·README 확인 대기';
          el('span',' · '+label,line);
        }
      }
      const detail=el('details','',card);el('summary','수집된 텍스트 보기',detail);el('pre',ref.text||'확인한 텍스트 없음',detail);
    }
    const jobs=state.jobs.filter(j=>j.current);
    $('counts').textContent=jobs.length+'개 후보 · 분석 완료 '+jobs.filter(j=>j.answer).length+'개';
    $('candidates').replaceChildren();
    if(!jobs.length)el('p','수집한 후보가 여기에 쌓입니다.',$('candidates'));
    for(const job of jobs){
      const o=state.observations.find(o=>o.id===job.observation);const card=el('article','',$('candidates'));
      const link=el('a',o.name,card);link.href=o.url;link.target='_blank';link.rel='noopener noreferrer';
      el('p',o.at+' · '+(job.answer?'분석 완료 · 의미 정확성 별도 검토':'분석 대기 · 구독 에이전트가 처리합니다'),card);
      if(job.answer){for(const a of job.answer.view.assessments){el('h3',a.title,card);el('p',a.reason,card);el('p','비용: '+a.costLabel,card);for(const c of a.claims)el('p',c.statement+' [근거 '+c.refs.join(', ')+']',card);for(const u of a.unknowns)el('p','미확인: '+u.statement,card);el('p',a.nextLabel+(a.question?' · '+a.question:''),card);}}
      const detail=el('details','',card);el('summary','수집 원문과 분석 근거 보기',detail);el('pre',o.text,detail);
      if(job.answer)el('pre',JSON.stringify(job.answer.view,null,2),detail);
      const old=state.jobs.filter(j=>!j.current&&j.input.base.subject.url===job.input.base.subject.url);
      if(old.length){const history=el('details','',card);el('summary','이전 기록 '+old.length+'개',history);for(const j of old)el('pre',JSON.stringify({at:j.at,answer:j.answer},null,2),history);}
    }
    $('proposals').replaceChildren();
    if(!state.proposals.length)el('p','아직 개선 제안이 없습니다. 자료가 부족한 후보를 억지로 추천하지 않습니다.',$('proposals'));
    for(const p of state.proposals.slice().reverse()){
      const card=el('article','',$('proposals'));el('h3',p.body.scope,card);
      const job=state.jobs.find(j=>j.id===p.job);el('p',(job?job.input.base.subject.name+' · ':'')+(labels[p.status]||p.status)+(p.current?'':' · 자료 변경으로 만료')+(!job?.answer?' · 분석 미완료 제안':''),card);
      const dl=el('dl','',card);for(const [key,label] of Object.entries({benefit:'기대 효과',risk:'비용·위험',check:'검증 방법',rollback:'되돌리기'})){el('dt',label,dl);el('dd',p.body[key],dl);}
      const buttons=el('div','',card);buttons.className='row';
      const decisions=p.current&&p.status==='pending'?(p.analysisReady?[['approve','이 범위 승인'],['reject','거절']]:[['reject','거절']]):p.status==='approved'?[['revoke','승인 철회']]:[];
      for(const [decision,label] of decisions){const button=el('button',label,buttons);button.onclick=()=>{if(decision!=='approve'||window.confirm('이 제안 범위를 승인할까요? 추가 비용·권한·범위 변경에는 다시 승인이 필요합니다.'))action('/api/decision',{id:p.id,decision});};}
    }
  }catch(error){$('message').textContent='로컬 저장소 연결 실패: '+error.message;}
}
$('profile').oninput=()=>{$('profile').dataset.dirty='yes';};
$('save').onclick=async()=>{const draft=$('profile').value;const saved=await action('/api/profile',{profile:draft});if(saved&&$('profile').value===draft)delete $('profile').dataset.dirty;};
$('query').oninput=()=>{$('query').dataset.dirty='yes';};
$('discover').onclick=async()=>{const draft=$('query').value;const saved=await action('/api/discover',{query:draft});if(saved&&$('query').value===draft)delete $('query').dataset.dirty;};
$('resolve-references').onclick=()=>action('/api/resolve-references',{retry:false});
$('retry-references').onclick=()=>action('/api/resolve-references',{retry:true});
$('refresh').onclick=load;
load();setInterval(load,10000);

document.addEventListener('click',async event=>{
 const link=event.target.closest('a[href]');
 if(!link||!link.href.startsWith('https://'))return;
 event.preventDefault();
 $('message').textContent='Aside 앱에서 여는 중…';
 try {await request('/api/open-aside',{url:link.href});$('message').textContent='Aside 앱에 링크를 전달했습니다.';}
 catch(error){$('message').textContent=error.message;}
});
