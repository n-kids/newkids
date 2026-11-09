/* Version warnings only; optimistic database checks remain the write guard. */
(() => {
 'use strict';const INTERVAL=20000;
 function version(value){if(typeof value==='number'&&(!Number.isSafeInteger(value)||value<0))throw new Error('초안 버전 정밀도를 확인하세요.');const text=String(value);if(!/^(0|[1-9]\d*)$/.test(text))throw new Error('유효한 초안 버전이 아닙니다.');return text;}
 function compare(local,remote){const a=version(local),b=remote?version(remote.version):'0';return {state:!remote&&a!=='0'?'removed':a===b?'consistent':'changed',local:a,remote:b};}
 if(typeof module==='object'&&module.exports){module.exports={version,compare};return;}
 const $=id=>document.getElementById(id);if(!$('workspace'))return;const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const card=make('section');card.id='nk-concurrency-panel';card.className='editor-card';card.append(make('h2','동시 편집 · 서버 버전 확인'),make('p','보이는 탭에서 약 20초마다 확인합니다. 다른 세션의 저장을 감지하며 편집 중인 사람의 접속 여부를 확인하는 기능은 아닙니다. 현재 입력은 자동으로 버리거나 덮어쓰지 않습니다.'));
 const status=make('p','편집기 준비 대기 중');status.id='nk-concurrency-status';status.setAttribute('role','status');const alert=make('p');alert.id='nk-concurrency-warning';alert.setAttribute('role','alert');const info=make('p');info.id='nk-concurrency-info';const hint=make('p');hint.id='nk-concurrency-hint';
 const check=make('button','지금 버전 확인'),reload=make('button','입력 폐기 후 페이지 새로고침');check.type=reload.type='button';check.id='nk-concurrency-check';reload.id='nk-concurrency-reload';card.append(status,alert,info,hint,check,reload);document.querySelector('.settings').append(card);
 let current=null,timer=null,epoch=0,ended=false;
 const state=()=>window.NKEditorState?.read();
 const ready=()=>{const s=state();return s&&!s.busy&&!$('workspace').hidden&&!$('save').disabled&&s.key===$('page').value;};
 const awake=()=>!ended&&!document.hidden&&navigator.onLine!==false;
 function say(kind,text){status.dataset.state=kind;status.textContent=text;}
 function sync(){check.disabled=!ready()||!awake()||Boolean(current);reload.disabled=!ready()||Boolean(current);hint.textContent=state()?.dirty?'저장하지 않은 입력이 있습니다. 다시 불러오기 전에 필요한 내용을 복사하세요.':'현재 화면은 자동으로 다시 불러오지 않습니다.';}
 function invalidate(){epoch++;clearTimeout(timer);timer=null;if(current)current.controller.abort();current=null;sync();}
 function later(delay=INTERVAL){clearTimeout(timer);timer=null;if(ready()&&awake())timer=setTimeout(()=>{timer=null;inspect().catch(error=>{say('error','버전 확인 실패: '+error.message);sync();later();});},delay);}
 async function inspect(){if(!ready()||!awake()||current){sync();return;}const initial=state(),op={controller:new AbortController(),epoch,key:initial.key,version:version(initial.version)};current=op;sync();say('checking','서버 초안 버전 확인 중...');let listener,timeout;
  try{const aborted=new Promise((_,reject)=>{listener=()=>reject(new Error(timeout?'버전 조회 8초 시간 초과':'버전 조회 취소'));op.controller.signal.addEventListener('abort',listener,{once:true});});const limit=setTimeout(()=>{timeout=true;op.controller.abort();},8000);let remote;try{remote=await Promise.race([window.NKEditorState.readRemote(op.key,op.controller.signal),aborted]);}finally{clearTimeout(limit);}
   const latest=state();if(current!==op||op.epoch!==epoch||!ready()||!latest||latest.key!==op.key||version(latest.version)!==op.version)return;
   const result=compare(latest.version,remote);say(result.state,result.state==='consistent'?'현재 기준 버전과 서버 버전이 같습니다. 저장 전 다른 변경이 생길 가능성은 있습니다.':result.state==='removed'?'서버 초안이 없어졌습니다. 현재 입력을 유지했습니다.':'서버 초안 버전이 달라졌습니다. 현재 입력을 유지했습니다.');
   alert.textContent=result.state==='consistent'?'':'화면 기준 v'+result.local+' / 서버 '+(remote?'v'+result.remote:'초안 없음')+' · 필요한 입력을 복사한 뒤 명시적으로 다시 불러오세요. 기존 DB 버전 검사가 오래된 저장을 차단합니다.';
   const date=remote?.updated_at?new Date(remote.updated_at):null;info.textContent='확인 시각 '+new Date().toLocaleTimeString()+(date&&Number.isFinite(date.getTime())?' · 서버 수정 '+date.toLocaleString():'')+(typeof remote?.updated_by==='string'?' · 서버 작업자 ID '+remote.updated_by.slice(0,160):'');
  }catch(error){if(current===op&&op.epoch===epoch){say('error','서버 상태 확인 불가: '+error.message);alert.textContent='동일 버전이라고 판정하지 않았습니다. 현재 입력은 유지했습니다.';}}
  finally{op.controller.signal.removeEventListener('abort',listener);if(current===op){current=null;sync();later();}}
 }
 function wake(){invalidate();if(!state()){say('unavailable','편집기 상태 API가 준비되지 않았습니다. 빌드된 편집기를 확인하세요.');return;}if(!awake()||!ready()){say('paused','탭·연결·편집기 작업 상태 때문에 버전 확인을 보류합니다.');return;}later(0);}
 check.addEventListener('click',()=>inspect().catch(error=>{say('error','버전 확인 실패: '+error.message);}));reload.addEventListener('click',()=>{if(ready()&&confirm('현재 입력을 버리고 페이지를 다시 불러올까요? 필요한 내용을 먼저 복사하세요. 브라우저가 추가 확인을 요청할 수 있습니다.'))location.reload();});
 new MutationObserver(wake).observe($('save'),{attributes:true,attributeFilter:['disabled']});$('page').addEventListener('change',()=>{alert.textContent='';info.textContent='';wake();});
 $('fields').addEventListener('input',sync);$('fields').addEventListener('change',sync);$('cancel').addEventListener('click',sync);
 document.addEventListener('visibilitychange',wake);window.addEventListener('focus',wake);window.addEventListener('online',wake);window.addEventListener('offline',wake);
 window.addEventListener('pagehide',()=>{ended=true;invalidate();});window.addEventListener('pageshow',event=>{if(event.persisted){ended=false;wake();}});wake();
})();
