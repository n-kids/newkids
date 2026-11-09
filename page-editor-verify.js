/* Read-only rendered-publication checks. Never sends preview documents or writes. */
(() => {
 'use strict';
 const labels={viewportWidth:'프레임 너비',title:'제목',description:'설명',minHeight:'배너 최소 높이',buttonText:'버튼 문구',buttonUrl:'버튼 주소'};
 const normalize=value=>String(value??'').replace(/<br\s*\/?>(\r?\n)?/gi,'\n').replace(/\r\n/g,'\n');
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const signature=rows=>JSON.stringify(canonical([...rows].sort((a,b)=>a.page_key.localeCompare(b.page_key))));
 function publicURL(href,baseHref,key,nonce){
  if(!/^(main|page:[a-zA-Z0-9_-]+)$/.test(key)||key==='page:defaults')throw new Error('독립된 공개 페이지를 선택하세요.');
  const base=new URL('.',baseHref),url=new URL(href,base);if(url.origin!==base.origin||url.username||url.password||!url.pathname.startsWith(base.pathname))throw new Error('같은 사이트의 공개 주소만 검사합니다.');
  const relative=url.pathname.slice(base.pathname.length),code=key.slice(5);let matches=false;
  if(key==='main')matches=['','index.html'].includes(relative);
  else if(['notice.html','child.html','program.html'].includes(relative))matches=decodeURIComponent(url.hash.slice(1))===code;
  else if(relative==='page.html')matches=url.searchParams.get('id')===code;
  else matches=['order','proposal'].includes(code)&&relative===code+'.html';
  if(!matches)throw new Error('편집 대상과 공개 주소가 일치하지 않습니다.');
  const id=relative==='page.html'?url.searchParams.get('id'):null;url.search='';if(id)url.searchParams.set('id',id);url.searchParams.set('nk_verify',String(nonce));return url;
 }
 function expected(row,common,key,width,baseHref){
  const doc=row?.document;if(!doc||typeof doc.title!=='string'||typeof doc.description!=='string')throw new Error('공개본 문서 형식을 확인하세요.');
  const mobile=width<=768,hero=doc.inherit?(common?.hero||{}):(doc.hero||{}),raw=Number(hero[mobile?'mobileHeight':'desktopHeight']);
  const minHeight=Number.isFinite(raw)?Math.max(mobile?100:120,Math.min(mobile?700:900,raw)):(key==='main'?(mobile?440:560):(mobile?180:220));
  const result={viewportWidth:width,title:normalize(doc.title),description:normalize(doc.description),minHeight};
  if(key==='main'&&doc.button){const url=new URL(doc.button.url,new URL('.',baseHref));if(!['http:','https:','tel:','mailto:'].includes(url.protocol))throw new Error('공개본 버튼 주소 형식이 안전하지 않습니다.');result.buttonText=normalize(doc.button.text);result.buttonUrl=url.href;}
  return result;
 }
 function compare(wanted,actual){return Object.keys(wanted).filter(key=>wanted[key]!==actual[key]).map(key=>({field:key,label:labels[key]||key,expected:wanted[key],actual:actual[key]}));}
 if(typeof module==='object'&&module.exports){module.exports={normalize,signature,publicURL,expected,compare};return;}
 const $=id=>document.getElementById(id),page=$('page'),host=document.querySelector('.preview-column');if(!page||!host)return;
 const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const card=make('section');card.id='nk-render-check';card.className='editor-card';card.append(make('h2','공개 후 실제 화면 확인'),make('p','DB 공개본을 기준으로 PC 1280px·모바일 390px의 제목·설명·배너 최소 높이·메인 버튼을 비교합니다. HTTP 성공과 별개입니다. 로그인 저장소를 공유하는 동일 브라우저 검사이며 비로그인·전체 접근성·화면 잘림 검증은 아닙니다.'));
 const runButton=make('button','공개 화면 확인'),cancel=make('button','검사 취소');runButton.type=cancel.type='button';runButton.id='nk-render-run';cancel.id='nk-render-cancel';card.append(runButton,cancel);
 const autoLabel=make('label'),auto=make('input');auto.type='checkbox';auto.id='nk-render-auto';autoLabel.append(auto,document.createTextNode(' 공개 성공 후 자동 확인'));card.append(autoLabel);
 const status=make('p','아직 검사하지 않았습니다.');status.id='nk-render-status';status.setAttribute('role','status');const metadata=make('p');metadata.id='nk-render-version';const results=make('ul');results.id='nk-render-results';card.append(status,metadata,results);host.prepend(card);
 const base=new URL('.',location.href);let running=null;
 const available=()=>!$('workspace').hidden&&!$('save').disabled&&Boolean(page.value);
 function sync(){runButton.disabled=!available()||Boolean(running);cancel.disabled=!running;}
 function say(state,text){status.dataset.state=state;status.textContent=text;}
 function dispose(op){for(const frame of op.frames)frame.remove();op.frames.clear();}
 function stop(text){if(running){running.controller.abort();dispose(running);running=null;}say('cancelled',text);sync();}
 async function rows(key,signal){
  const url=new URL('/rest/v1/page_editor_publications',CONFIG.SUPABASE_URL);url.searchParams.set('select','page_key,document,version,published_at');url.searchParams.set('page_key','in.("'+key+'","page:defaults")');
  const controller=new AbortController(),forward=()=>controller.abort();signal.addEventListener('abort',forward,{once:true});let expired=false;const timer=setTimeout(()=>{expired=true;controller.abort();},8000);
  try{if(signal.aborted)throw new Error('검사를 취소했습니다.');const response=await fetch(url,{method:'GET',cache:'no-store',credentials:'omit',redirect:'error',headers:{apikey:CONFIG.SUPABASE_KEY,Authorization:'Bearer '+CONFIG.SUPABASE_KEY},signal:controller.signal});if(!response.ok)throw new Error('공개본 조회 HTTP '+response.status);const data=await response.json();if(!Array.isArray(data))throw new Error('공개본 응답 형식 오류');const filtered=data.filter(row=>[key,'page:defaults'].includes(row.page_key));if(new Set(filtered.map(row=>row.page_key)).size!==filtered.length)throw new Error('중복 공개본 응답');return filtered;}catch(error){if(expired)throw new Error('공개본 조회 8초 시간 초과');throw error;}finally{clearTimeout(timer);signal.removeEventListener('abort',forward);}
 }
 async function inspect(op,url,width,wanted){
  const frame=make('iframe');frame.className='nk-live-check-frame';frame.title='공개 경로 '+width+'px 검사';frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-scripts allow-same-origin');frame.style.cssText='position:fixed;left:-20000px;top:0;width:'+width+'px!important;min-width:'+width+'px!important;max-width:none!important;height:960px!important;border:0!important;pointer-events:none';op.frames.add(frame);
  let mismatches=null;try{
   frame.src=url.href;document.body.append(frame);const deadline=Date.now()+10000;
   while(Date.now()<deadline){if(op.controller.signal.aborted)throw new Error('검사를 취소했습니다.');
    try{const doc=frame.contentDocument,hero=doc?.querySelector('#view-hero[data-nk-published-hero],.hero[data-nk-published-hero]');if(hero){publicURL(frame.contentWindow.location.href,base.href,op.key,0);const link=hero.querySelector('.hero-v2-actions .btn'),domText=node=>node?String(node.textContent).replace(/\r\n/g,'\n'):undefined;const actual={viewportWidth:frame.contentWindow.innerWidth,title:domText(hero.querySelector('h1')),description:domText(hero.querySelector('p')),minHeight:parseFloat(frame.contentWindow.getComputedStyle(hero).minHeight),buttonText:domText(link),buttonUrl:link?.href};mismatches=compare(wanted,actual);if(!mismatches.length)return {width,mismatches:[]};}}catch(error){throw new Error('공개 프레임 접근 실패: '+error.message);}
    await new Promise(resolve=>setTimeout(resolve,75));
   }
   return {width,mismatches:mismatches||[{label:'렌더러',expected:'공개본 적용',actual:'10초 내 확인하지 못함'}]};
  }finally{frame.remove();op.frames.delete(frame);}
 }
 async function run(){
  if(!available()||running)return;const key=page.value,href=$('open-page')?.getAttribute('href');results.replaceChildren();metadata.textContent='';
  if(key==='page:defaults'){say('unavailable','공통 설정에는 독립된 공개 URL이 없습니다. 적용 페이지를 선택하세요.');return;}
  if(!href){say('unavailable','공개 주소가 준비되지 않았습니다.');return;}
  const op={controller:new AbortController(),frames:new Set(),key};running=op;sync();say('running','DB 공개본과 실제 공개 경로를 비교하고 있습니다...');
  try{
   const url=publicURL(href,base.href,key,Date.now()),before=await rows(key,op.controller.signal);if(running!==op)return;
   const row=before.find(item=>item.page_key===key);if(!row){say('unavailable','새 편집기 공개본이 없습니다. 기존 홈페이지 적용 여부는 이 검사로 판정하지 않습니다.');return;}
   if(row.version===undefined||row.version===null)throw new Error('공개본 버전 정보가 없습니다.');metadata.textContent='검사 기준: '+key+' · 공개본 v'+row.version+' · 시작 '+new Date().toLocaleString();
   const common=before.find(item=>item.page_key==='page:defaults')?.document;
   const report=await Promise.all([1280,390].map(width=>inspect(op,url,width,expected(row,common,key,width,base.href))));if(running!==op)return;
   for(const result of report){const item=make('li',(result.width===1280?'PC':'모바일')+' '+result.width+'px · '+(result.mismatches.length?'불일치':'검사 항목 일치'));for(const mismatch of result.mismatches)item.append(make('p',mismatch.label+' — 기준: '+String(mismatch.expected)+' / 화면: '+String(mismatch.actual)));results.append(item);}
   const after=await rows(key,op.controller.signal);if(running!==op)return;
   if(signature(before)!==signature(after)){say('changed','검사 중 공개본 또는 공통 설정이 바뀌었습니다. 결과를 확정하지 않았습니다. 다시 확인하세요.');return;}
   const failures=report.reduce((sum,result)=>sum+result.mismatches.length,0);say(failures?'failed':'passed',failures?'공개 화면 불일치 '+failures+'건. 아래 항목을 확인하세요.':'공개본 v'+row.version+'의 검사 항목이 PC·모바일에서 일치합니다. 전체 화면 정상 동작을 보장하는 검사는 아닙니다.');
  }catch(error){if(running===op)say('error','확인 불가: '+error.message);}finally{op.controller.abort();dispose(op);if(running===op){running=null;sync();}}
 }
 runButton.addEventListener('click',run);cancel.addEventListener('click',()=>stop('검사를 취소했습니다. 완료 판정하지 않았습니다.'));
 page.addEventListener('change',()=>{stop('편집 대상이 바뀌었습니다. 공개 주소 준비 후 다시 검사하세요.');results.replaceChildren();metadata.textContent='';});
 new MutationObserver(sync).observe($('save'),{attributes:true,attributeFilter:['disabled']});
 new MutationObserver(()=>{if(auto.checked&&/^공개본 v.*저장 완료/.test($('status').textContent))setTimeout(()=>{if(auto.checked)run();},300);}).observe($('status'),{childList:true,subtree:true,characterData:true});
 window.addEventListener('pagehide',()=>{if(running)stop('페이지를 떠나 검사를 중단했습니다.');});sync();
})();
