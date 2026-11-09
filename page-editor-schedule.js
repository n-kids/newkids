/* Schedule UI only. The database fixes snapshots and authorizes each mutation. */
(() => {
 'use strict';
 function localValue(date){const pad=n=>String(n).padStart(2,'0');return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+'T'+pad(date.getHours())+':'+pad(date.getMinutes());}
 function windowUTC(start,end,now=Date.now()){
  function parse(text){if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text))throw new Error('시작·종료 시각을 분 단위로 입력하세요.');const date=new Date(text);if(!Number.isFinite(date.getTime())||localValue(date)!==text)throw new Error('존재하지 않는 날짜 또는 지역 시각입니다.');return date;}
  const a=parse(start),b=parse(end);if(a.getTime()<=now)throw new Error('시작 시각은 현재보다 뒤여야 합니다.');if(b<=a)throw new Error('종료 시각은 시작보다 뒤여야 합니다.');if(a.getTime()>now+366*86400000)throw new Error('시작은 366일 이내로 지정하세요.');return {starts_at:a.toISOString(),ends_at:b.toISOString()};
 }
 if(typeof module==='object'&&module.exports){module.exports={localValue,windowUTC};return;}
 const $=id=>document.getElementById(id);if(!$('workspace'))return;
 const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const card=make('section');card.id='nk-schedule-panel';card.className='editor-card';card.append(make('h2','예약 공개·종료'));
 card.append(make('p','승인된 저장본을 예약합니다. 종료 시 예약 등록 당시 공개본을 복원합니다. 이후 수동 공개가 있으면 덮어쓰지 않고 충돌로 남깁니다.'));
 const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'기기 시간대';card.append(make('p','입력 시간대: '+zone+' · 서버에는 UTC로 저장합니다. 서버 예약 실행은 약 1분 간격이며 Cron 활성화가 필요합니다.'));
 const select=make('select');select.id='nk-schedule-review';const start=make('input'),end=make('input');start.type=end.type='datetime-local';start.id='nk-schedule-start';end.id='nk-schedule-end';
 for(const [name,input] of [['검토·승인본',select],['공개 시작',start],['공개 종료',end]]){const label=make('label',name);label.append(input);card.append(label);}
 const preview=make('pre');preview.id='nk-schedule-snapshot';preview.style.cssText='max-height:180px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere';card.append(preview);
 const feedback=make('p');feedback.id='nk-schedule-status';feedback.setAttribute('role','status');card.append(feedback);
 const controls=make('div');controls.className='actions';card.append(controls);const list=make('ul');list.id='nk-schedule-list';card.append(list);document.querySelector('.settings').append(card);
 let client,loading=false,ready=false,pageKey='',reviews=[];
 const context=()=>!$('workspace').hidden&&!$('save').disabled&&Boolean($('page').value);
 function db(){if(client)return client;const key='sb-'+new URL(CONFIG.SUPABASE_URL).hostname.split('.')[0]+'-auth-token';let storage=sessionStorage;try{if(!sessionStorage.getItem(key)&&localStorage.getItem(key))storage=localStorage;}catch(_){}return client=supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_KEY,{auth:{persistSession:true,storage}});}
 async function call(action,payload){let timer;try{const result=await Promise.race([db().rpc('page_editor_workflow',{p_action:action,p_payload:payload}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('조회·처리 시간 초과. 목록을 새로고침해 결과를 확인하고 중복 등록하지 마세요.')),10000);})]);if(result.error)throw result.error;return result.data;}finally{clearTimeout(timer);}}
 const chosen=()=>reviews.find(row=>row.id===select.value);
 function show(){const row=chosen();preview.textContent=row?JSON.stringify({version:row.draft_version,status:row.status,document:row.snapshot},null,2):'승인된 검토가 없으면 초안을 저장하고 검토를 요청하세요.';sync();}
 const buttons=[];
 function sync(){const active=context()&&!loading&&pageKey===$('page').value;let valid=false;try{windowUTC(start.value,end.value);valid=true;}catch(_){}for(const button of buttons)button.disabled=button===reload?!context()||loading:!active||!ready;for(const button of list.querySelectorAll('button'))button.disabled=!active||!ready;request.disabled=!active||!ready;approve.disabled=!active||!ready||chosen()?.status!=='pending';book.disabled=!active||!ready||chosen()?.status!=='approved'||!valid;select.disabled=start.disabled=end.disabled=!active||!ready;}
 function button(id,label,action){const node=make('button',label);node.type='button';node.id=id;buttons.push(node);controls.append(node);node.addEventListener('click',()=>run(action));return node;}
 async function run(action){if(loading||!context())return;loading=true;sync();try{await action();}catch(error){feedback.textContent='작업 실패: '+error.message;}finally{loading=false;sync();}}
 async function load(){const key=$('page').value;const data=await call('state',{page_key:key});if(!context()||$('page').value!==key)return;pageKey=key;ready=true;const selected=select.value;reviews=(data.items||[]).filter(row=>row.kind==='review'&&row.page_key===key&&['pending','approved'].includes(row.status));select.replaceChildren();for(const row of reviews){const option=make('option',(row.status==='approved'?'승인됨':'검토 대기')+' · 초안 v'+row.draft_version+' · '+row.id.slice(0,8));option.value=row.id;select.append(option);}if(reviews.some(row=>row.id===selected))select.value=selected;
  list.replaceChildren();const schedules=(data.items||[]).filter(row=>row.kind==='schedule'&&row.page_key===key);const names={scheduled:'예약 대기',active:'공개 중',finished:'종료·복원 완료',cancelled:'취소',conflict:'충돌·변경 안 함',missed:'기간 경과·미실행',failed:'실패'};
  if(!schedules.length)list.append(make('li','등록된 예약이 없습니다.'));
  for(const row of schedules){const item=make('li',(names[row.status]||row.status)+' · '+new Date(row.starts_at).toLocaleString()+' → '+new Date(row.ends_at).toLocaleString()+' · 초안 v'+row.draft_version+(row.error?' · '+row.error:''));if(['scheduled','active'].includes(row.status)){const cancel=make('button',row.status==='active'?'종료·복원 요청':'예약 취소');cancel.type='button';cancel.addEventListener('click',()=>run(async()=>{if(!confirm(row.status==='active'?'다음 서버 예약 실행에서 이전 공개본 복원을 요청할까요? 수동 변경이 있으면 충돌로 처리됩니다.':'이 예약을 취소할까요?'))return;await call('cancel',{id:row.id});await load();feedback.textContent='취소 요청을 처리했습니다. 공개 중이던 예약의 복원 결과는 다음 서버 실행 후 목록에서 확인하세요.';}));cancel.disabled=loading;item.append(cancel);}list.append(item);}show();}
 const reload=button('nk-schedule-refresh','예약·승인 목록 새로고침',async()=>{ready=false;await load();feedback.textContent='예약·승인 목록을 조회했습니다. Cron 실행 여부는 운영 설정에서 별도 확인해야 합니다.';});
 const request=button('nk-schedule-request','초안 저장 후 검토 요청',async()=>{
  const key=$('page').value;$('save').click();const deadline=Date.now()+10000;let version;
  while(Date.now()<deadline){const status=$('status').textContent;if(/^저장 실패:/.test(status))throw new Error(status);const match=status.match(/^초안 v(\d+) 저장 완료/);if(!$('save').disabled&&match){version=Number(match[1]);break;}await new Promise(resolve=>setTimeout(resolve,25));}
  if(version===undefined||$('page').value!==key)throw new Error('저장 결과 또는 편집 대상을 다시 확인하세요.');
  await call('request',{page_key:key,version});await load();feedback.textContent='저장한 초안의 검토를 요청했습니다. 다른 관리자가 내용을 확인하고 승인해야 예약할 수 있습니다.';
 });
 const approve=button('nk-schedule-approve','선택 저장본 승인',async()=>{const row=chosen();if(!row||row.status!=='pending')throw new Error('대기 중인 검토를 선택하세요.');if(!confirm('표시된 초안 v'+row.draft_version+'의 내용을 승인할까요? 요청자 본인은 승인할 수 없습니다.'))return;await call('decide',{id:row.id,approve:true});await load();feedback.textContent='선택한 저장본을 승인했습니다.';});
 const book=button('nk-schedule-create','선택 승인본 예약',async()=>{const row=chosen();if(!row||row.status!=='approved'||row.page_key!==$('page').value)throw new Error('현재 페이지의 승인본을 선택하세요.');const range=windowUTC(start.value,end.value);if(!confirm('초안 v'+row.draft_version+'을 '+new Date(range.starts_at).toLocaleString()+'부터 '+new Date(range.ends_at).toLocaleString()+'까지 공개하도록 예약할까요? 현재 입력이 아닌 선택한 승인본을 사용합니다.'))return;await call('schedule',{id:row.id,...range});await load();feedback.textContent='예약 등록을 확인했습니다. 실제 실행에는 DB 마이그레이션과 Cron 활성화가 필요합니다.';});
 select.addEventListener('change',show);start.addEventListener('input',sync);end.addEventListener('input',sync);
 let sequence=0;
 async function pageChanged(){sequence++;pageKey='';ready=false;reviews=[];select.replaceChildren();list.replaceChildren();preview.textContent='';feedback.textContent='현재 페이지의 예약 목록을 확인하세요.';sync();if(!context()||loading)return;const token=sequence;loading=true;sync();try{await load();if(token===sequence)feedback.textContent='승인본을 선택하고 시작·종료 시각을 지정하세요.';}catch(error){if(token===sequence){ready=false;feedback.textContent='예약 DB 연결 불가: '+error.message;}}finally{loading=false;sync();if(token!==sequence&&context())pageChanged();}}
 $('page').addEventListener('change',pageChanged);new MutationObserver(()=>{sync();if(context()&&pageKey!==$('page').value&&!loading)pageChanged();}).observe($('save'),{attributes:true,attributeFilter:['disabled']});sync();if(context())pageChanged();
})();
