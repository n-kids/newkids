/* Public GET-only diagnostics. No access tokens, draft reads or write operations. */
(() => {
 'use strict';
 if(document.getElementById('nk-deployment-panel'))return;
 const source=document.currentScript;const base=new URL('.',source.src);
 const expected=new URL(source.src).searchParams.get('v');
 const host=document.querySelector('.preview-column'),page=document.getElementById('page');
 if(!host||!page)return;
 const panel=document.createElement('details');panel.id='nk-deployment-panel';panel.className='editor-card';panel.open=true;
 const heading=document.createElement('summary');heading.textContent='배포·공개 상태';
 const note=document.createElement('p');note.className='muted';note.textContent='코드 배포, DB 공개본, 페이지 응답은 별도로 확인합니다. HTTP 응답만으로 화면 정상 동작을 보장하지 않습니다.';
 const grid=document.createElement('div');grid.className='nk-diagnostics-grid';
 function field(id,label){const row=document.createElement('div');const title=document.createElement('strong');title.textContent=label;const value=document.createElement('span');value.id=id;value.textContent='확인 전';row.append(title,value);grid.append(row);return value;}
 const releaseValue=field('nk-deployment-code','제공 중인 코드 버전');
 const publicationValue=field('nk-deployment-publication','선택 페이지 DB 공개본');
 const responseValue=field('nk-deployment-response','공개 페이지 응답');
 const footer=document.createElement('div');footer.className='nk-diagnostics-footer';
 const refresh=document.createElement('button');refresh.type='button';refresh.id='nk-deploy-refresh';refresh.textContent='상태 다시 확인';
 const time=document.createElement('span');time.id='nk-deploy-checked-at';
 const help=document.createElement('a');help.href='https://github.com/n-kids/newkids/actions';help.target='_blank';help.rel='noopener noreferrer';help.textContent='GitHub Actions 실행 결과';
 footer.append(refresh,time,help);panel.append(heading,note,grid,footer);host.prepend(panel);
 const style=document.createElement('style');style.textContent='#nk-deployment-panel{margin-bottom:14px}#nk-deployment-panel summary{font-size:14px;font-weight:700;cursor:pointer;margin-bottom:10px}.nk-diagnostics-grid{display:grid;gap:8px}.nk-diagnostics-grid>div{display:grid;grid-template-columns:155px minmax(0,1fr);gap:10px;font-size:12px;padding:8px 10px;background:#f5f7fb;border-radius:7px}.nk-diagnostics-grid span{overflow-wrap:anywhere}.nk-diagnostics-footer{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:11px;color:#647089}.nk-diagnostics-footer button{font-size:12px;padding:6px 10px;min-height:32px}.nk-diagnostics-footer a{color:#172451}@media(max-width:520px){.nk-diagnostics-grid>div{grid-template-columns:1fr;gap:2px}}';document.head.append(style);
 let generation=0;
 async function get(url,json,headers={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
  try{const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',redirect:'error',headers,signal:controller.signal});
   if(!response.ok)throw new Error('HTTP '+response.status);
   if(json)return await response.json();
   const type=response.headers.get('content-type')||'';const text=await response.text();
   if(!type.includes('text/html')||!/<html[\s>]/i.test(text))throw new Error('HTML 페이지가 아닌 응답');
   return response.status;
  }finally{clearTimeout(timer);}
 }
 const reason=error=>error.name==='AbortError'?'8초 내 응답 없음':String(error.message||'조회 실패').slice(0,100);
 function set(el,request,text){if(request===generation)el.textContent=text;}
 async function check(){
  const request=++generation;const key=page.value;refresh.disabled=true;
  [releaseValue,publicationValue,responseValue].forEach(el=>el.textContent='확인 중...');time.textContent='';
  const releaseURL=new URL('release.json',base);releaseURL.searchParams.set('check',String(Date.now()));
  const releaseTask=(async()=>{try{const data=await get(releaseURL,true);if(!/^[a-f0-9]{40}$/i.test(data?.commit||''))throw new Error('유효한 배포 커밋 정보 없음');const same=/^[a-f0-9]{40}$/i.test(expected||'')?data.commit===expected:null;set(releaseValue,request,data.commit.slice(0,12)+(same===true?' · 현재 편집기와 동일 버전':same===false?' · 현재 편집기와 버전 다름':' · 최신 main과의 비교는 미실시'));}catch(error){set(releaseValue,request,'확인 불가 · '+reason(error));}})();
  const publicationTask=(async()=>{
   if(!/^(main|page:[a-zA-Z0-9_-]+)$/.test(key)){set(publicationValue,request,'확인 불가 · 편집 대상을 선택하세요.');return;}
   try{
    const url=new URL('/rest/v1/page_editor_publications',CONFIG.SUPABASE_URL);url.searchParams.set('select','page_key,version,published_at');url.searchParams.set('page_key','eq.'+key);
    const data=await get(url,true,{apikey:CONFIG.SUPABASE_KEY,Authorization:'Bearer '+CONFIG.SUPABASE_KEY});
    if(!Array.isArray(data))throw new Error('공개본 응답 형식 오류');
    const row=data.find(item=>item.page_key===key);
    if(!row){set(publicationValue,request,'새 편집기 공개본 없음 · 기존 홈페이지 설정 사용');return;}
    const date=new Date(row.published_at);set(publicationValue,request,'공개본 v'+String(row.version)+(Number.isNaN(date.getTime())?'':' · '+date.toLocaleString('ko-KR'))+' · 실제 렌더링은 별도 확인 필요');
   }catch(error){set(publicationValue,request,'확인 불가 · '+reason(error));}
  })();
  const responseTask=(async()=>{
   if(key==='page:defaults'){set(responseValue,request,'공통 설정에는 독립된 공개 URL이 없습니다.');return;}
   const href=document.getElementById('open-page')?.getAttribute('href');
   if(!href){set(responseValue,request,'확인 불가 · 공개 주소 준비 전');return;}
   try{const url=new URL(href,base);if(url.origin!==location.origin||!url.pathname.startsWith(base.pathname))throw new Error('지원하지 않는 공개 주소');url.hash='';url.searchParams.set('nk_status_check',String(Date.now()));const code=await get(url,false);set(responseValue,request,'HTTP '+code+' · HTML 응답 확인, 화면·데이터 적용 검증은 미실시');}catch(error){set(responseValue,request,'확인 불가 · '+reason(error));}
  })();
  await Promise.all([releaseTask,publicationTask,responseTask]);
  if(request===generation){refresh.disabled=false;time.textContent='조회 시각: '+new Date().toLocaleTimeString('ko-KR');}
 }
 refresh.addEventListener('click',check);
 let pending;page.addEventListener('change',()=>{generation++;clearTimeout(pending);pending=setTimeout(check,300);});
 const status=document.getElementById('status');
 if(status)new MutationObserver(()=>{const text=status.textContent;if(text.startsWith('공개본 v')&&text.includes('저장 완료')){clearTimeout(pending);pending=setTimeout(check,300);}}).observe(status,{childList:true,subtree:true,characterData:true});
 let attempts=0;const timer=setInterval(()=>{if(page.value&&document.getElementById('open-page')?.getAttribute('href')){clearInterval(timer);check();}else if(++attempts>=100){clearInterval(timer);releaseValue.textContent='편집 대상 로드 후 상태 다시 확인을 눌러 주세요.';}},100);
})();
