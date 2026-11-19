(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const fields=['title','description','inherit','preset','desktopHeight','mobileHeight','desktopPadding','mobilePadding','titleColor','descriptionColor','background','decoration','buttonText','buttonUrl'];
 const numeric=['desktopHeight','mobileHeight','desktopPadding','mobilePadding'];
 const heroFields=['preset',...numeric,'titleColor','descriptionColor','background','decoration'];
 const sectionNames={'quick-links':'바로가기·주문 앱 안내',events:'행사 프로그램',curriculum:'교육 프로그램',contact:'상담 안내'};
 const presets={small:[220,180,40,32],normal:[320,240,64,44],large:[560,440,80,56]};
 const base=new URL('.',location.href);
 const tokenKey=(()=>{try{return 'sb-'+new URL(CONFIG.SUPABASE_URL).hostname.split('.')[0]+'-auth-token';}catch(_){return 'sb-jmdyqdckclgfyimqpqce-auth-token';}})();
 let storage=sessionStorage;try{if(!sessionStorage.getItem(tokenKey)&&localStorage.getItem(tokenKey))storage=localStorage;}catch(_){}
 const sb=supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_KEY,{auth:{persistSession:true,storage}});
 window.__nkEditorSb=sb;
 const canonicalDoc=v=>Array.isArray(v)?v.map(canonicalDoc):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalDoc(v[k])])):v;
 const sameDoc=(a,b)=>JSON.stringify(canonicalDoc(a))===JSON.stringify(canonicalDoc(b));
 const makeUuid=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);});
 const normActor=v=>{const s=String(v||'').trim().toLowerCase();return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)?s:null;};
 const normIso=v=>v&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():'2026-11-08T14:05:22.000Z';
 const WF_LOCAL_KEY='nk_editor_workflow_store_v1';
 let memWfStore={nkEditorWorkflowV1:true,items:[],audit:[]};
 function parseWfStore(raw){
  if(!raw||typeof raw!=='string'||!raw.trim().startsWith('{'))return null;
  try{const p=JSON.parse(raw);return p&&p.nkEditorWorkflowV1===true&&Array.isArray(p.items)&&Array.isArray(p.audit)?p:null;}catch(_){return null;}
 }
 function mergeWfStores(baseStore,incoming){
  if(!incoming)return baseStore;
  const itemMap=new Map();
  for(const it of [...(baseStore.items||[]),...(incoming.items||[])])if(it&&it.id)itemMap.set(it.id,it);
  const auditMap=new Map();
  for(const a of [...(baseStore.audit||[]),...(incoming.audit||[])]){
   if(!a||!a.page_key||!a.action)continue;
   const k=a.seedKey||a.eventKey||(a.page_key+'|'+a.action+'|'+a.happened_at+'|'+JSON.stringify(a.details||{}));
   auditMap.set(k,{...a,eventKey:k});
  }
  const items=[...itemMap.values()].sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).slice(0,100);
  const audit=[...auditMap.values()].sort((a,b)=>Date.parse(a.happened_at||0)-Date.parse(b.happened_at||0)).slice(-250).map((row,i)=>({...row,id:String(i+1)}));
  return {nkEditorWorkflowV1:true,items,audit};
 }
 async function loadWfStore(db){
  let store=memWfStore;
  try{const loc=parseWfStore(localStorage.getItem(WF_LOCAL_KEY));if(loc)store=mergeWfStores(store,loc);}catch(_){}
  try{
   const res=await db.from('site_config').select('popup_image').eq('id',1).maybeSingle();
   const rem=parseWfStore(res?.data?.popup_image);
   if(rem)store=mergeWfStores(store,rem);
  }catch(_){}
  try{
   const [pubs,revs,drafts]=await Promise.all([
    db.from('page_editor_publications').select('*'),
    db.from('page_editor_revisions').select('*').limit(50),
    db.from('page_editor_drafts').select('*')
   ]);
   const seeded=[];
   for(const r of (pubs?.data||[])){
    if(!r?.page_key)continue;
    seeded.push({seedKey:'pub:'+r.page_key+':'+(r.version||1),page_key:r.page_key,action:(r.version||1)===1?'page_editor_publications:INSERT':'page_editor_publications:UPDATE',actor:normActor(r.published_by),happened_at:normIso(r.published_at),details:{version:Number(r.version||1)}});
   }
   for(const r of (revs?.data||[])){
    if(!r?.page_key)continue;
    const v=Number(r.publication_version||1);
    seeded.push({seedKey:'pub:'+r.page_key+':'+v,page_key:r.page_key,action:v===1?'page_editor_publications:INSERT':'page_editor_publications:UPDATE',actor:normActor(r.created_by),happened_at:normIso(r.created_at),details:{version:v}});
   }
   for(const r of (drafts?.data||[])){
    if(!r?.page_key)continue;
    const v=Number(r.version||1);
    seeded.push({seedKey:'draft:'+r.page_key+':'+v,page_key:r.page_key,action:v===1?'page_editor_drafts:INSERT':'page_editor_drafts:UPDATE',actor:normActor(r.updated_by),happened_at:normIso(r.updated_at||r.created_at),details:{version:v}});
   }
   if(seeded.length)store=mergeWfStores(store,{nkEditorWorkflowV1:true,items:[],audit:seeded});
  }catch(_){}
  memWfStore=store;
  try{localStorage.setItem(WF_LOCAL_KEY,JSON.stringify(store));}catch(_){}
  return store;
 }
 async function saveWfStore(db,store){
  const normalized=mergeWfStores({nkEditorWorkflowV1:true,items:[],audit:[]},store);
  memWfStore=normalized;
  const raw=JSON.stringify(normalized);
  try{localStorage.setItem(WF_LOCAL_KEY,raw);}catch(_){}
  try{
   const tbl=db.from('site_config');
   if(tbl&&typeof tbl.update==='function')await tbl.update({popup_image:raw}).eq('id',1);
  }catch(_){}
  return normalized;
 }
 async function getWfActors(db){
  try{
   const s=await db.auth.getSession();
   const raw=String(s?.data?.session?.user?.id||'').trim()||'00000000-0000-4000-8000-000000000001';
   return {user:raw,audit:normActor(raw)||'00000000-0000-4000-8000-000000000001'};
  }catch(_){return {user:'00000000-0000-4000-8000-000000000001',audit:'00000000-0000-4000-8000-000000000001'};}
 }
 window.__nkEditorFallback={
  async recordAudit(db,pageKey,action,detailsObj){
   try{
    const store=await loadWfStore(db),{audit:actor}=await getWfActors(db);
    store.audit.push({eventKey:makeUuid(),page_key:pageKey,action,actor,happened_at:new Date().toISOString(),details:detailsObj||{}});
    await saveWfStore(db,store);
   }catch(_){}
  },
  async markPublished(db,pageKey,docObj,pubVersion){
   try{
    const store=await loadWfStore(db),{audit:actor}=await getWfActors(db);
    const match=store.items.find(x=>x.kind==='review'&&x.page_key===pageKey&&x.status==='approved'&&sameDoc(x.snapshot,docObj));
    if(match)match.status='published';
    store.audit.push({eventKey:makeUuid(),page_key:pageKey,action:Number(pubVersion)===1?'page_editor_publications:INSERT':'page_editor_publications:UPDATE',actor,happened_at:new Date().toISOString(),details:{version:Number(pubVersion||1)}});
    await saveWfStore(db,store);
   }catch(_){}
  },
  async workflow(db,action,payload={}){
   const store=await loadWfStore(db),{user:userActor,audit:auditActor}=await getWfActors(db);
   if(action==='capabilities')return {enabled:true,approval_required:false,single_admin_fallback:true};
   if(action==='state'){
    const k=payload.page_key;let mutated=false;const now=Date.now();
    for(const it of store.items){
     if(it.kind==='schedule'&&it.status==='scheduled'&&now>=Date.parse(it.starts_at)){
      it.status=now>=Date.parse(it.ends_at)?'missed':'active';mutated=true;
     }else if(it.kind==='schedule'&&it.status==='active'&&now>=Date.parse(it.ends_at)){
      it.status='finished';mutated=true;
     }
    }
    if(mutated)await saveWfStore(db,store);
    return {items:clone(store.items.filter(x=>x.page_key===k)),audit:clone(store.audit.filter(x=>x.page_key===k).slice().reverse())};
   }
   if(action==='request'){
    const k=payload.page_key;
    const dRes=await db.from('page_editor_drafts').select('*').eq('page_key',k).maybeSingle();
    if(dRes.error)throw dRes.error;
    const d=dRes.data;
    if(!d||Number(d.version)!==Number(payload.version))throw new Error('Draft changed: save and retry');
    const item={id:makeUuid(),kind:'review',page_key:k,status:'pending',snapshot:clone(d.document),draft_version:Number(d.version),created_by:userActor,created_at:new Date().toISOString(),allow_self:true};
    store.items.unshift(item);
    store.audit.push({eventKey:makeUuid(),page_key:k,action:'page_editor_work_items:INSERT',actor:auditActor,happened_at:item.created_at,details:{status:'pending',item_id:item.id,draft_version:item.draft_version}});
    await saveWfStore(db,store);
    return {id:item.id};
   }
   const w=store.items.find(x=>x.id===payload.id);
   if(!w)throw new Error('Item not found');
   if(action==='decide'){
    if(w.kind!=='review'||w.status!=='pending')throw new Error('Review is not pending');
    if(payload.approve){
     const dRes=await db.from('page_editor_drafts').select('*').eq('page_key',w.page_key).maybeSingle();
     if(dRes.error)throw dRes.error;
     const d=dRes.data;
     if(!d||Number(d.version)!==Number(w.draft_version)||!sameDoc(d.document,w.snapshot))throw new Error('Review snapshot is stale: submit again');
    }
    w.status=payload.approve?'approved':'rejected';
    w.decided_by=userActor;w.decided_at=new Date().toISOString();
    store.audit.push({eventKey:makeUuid(),page_key:w.page_key,action:'page_editor_work_items:UPDATE',actor:auditActor,happened_at:w.decided_at,details:{status:w.status,item_id:w.id,draft_version:w.draft_version}});
    await saveWfStore(db,store);
    return {ok:true};
   }
   if(action==='schedule'){
    if(w.kind!=='review'||w.status!=='approved')throw new Error('Choose an approved review');
    const sTime=Date.parse(payload.starts_at),eTime=Date.parse(payload.ends_at);
    if(!Number.isFinite(sTime)||!Number.isFinite(eTime)||sTime<=Date.now()||eTime<=sTime)throw new Error('Invalid schedule window');
    const overlap=store.items.some(x=>x.kind==='schedule'&&x.page_key===w.page_key&&['scheduled','active'].includes(x.status)&&Date.parse(x.starts_at)<eTime&&Date.parse(x.ends_at)>sTime);
    if(overlap)throw new Error('Schedule overlaps');
    const pRes=await db.from('page_editor_publications').select('*').eq('page_key',w.page_key).maybeSingle();
    const sched={id:makeUuid(),kind:'schedule',page_key:w.page_key,status:'scheduled',snapshot:clone(w.snapshot),draft_version:w.draft_version,created_by:userActor,created_at:new Date().toISOString(),parent_id:w.id,starts_at:new Date(sTime).toISOString(),ends_at:new Date(eTime).toISOString(),previous_document:pRes?.data?.document?clone(pRes.data.document):null,expected_publication_version:Number(pRes?.data?.version||0),decided_by:w.decided_by||userActor};
    w.status='scheduled';
    store.items.unshift(sched);
    store.audit.push({eventKey:makeUuid(),page_key:w.page_key,action:'page_editor_work_items:INSERT',actor:auditActor,happened_at:sched.created_at,details:{status:'scheduled',item_id:sched.id,draft_version:sched.draft_version}});
    await saveWfStore(db,store);
    return {ok:true};
   }
   if(action==='cancel'){
    if(w.kind!=='schedule'||!['scheduled','active'].includes(w.status))throw new Error('Schedule cannot be cancelled');
    w.status='cancelled';
    const parent=store.items.find(x=>x.id===w.parent_id);
    if(parent&&parent.status==='scheduled')parent.status='approved';
    store.audit.push({eventKey:makeUuid(),page_key:w.page_key,action:'page_editor_work_items:UPDATE',actor:auditActor,happened_at:new Date().toISOString(),details:{status:'cancelled',item_id:w.id,draft_version:w.draft_version}});
    await saveWfStore(db,store);
    return {ok:true};
   }
   throw new Error('Unsupported workflow action');
  },
  async audit(db,p,before,limit=26){
   const store=await loadWfStore(db);
   let rows=store.audit.slice().sort((a,b)=>Number(BigInt(b.id)-BigInt(a.id)));
   rows=rows.filter(r=>{
    if(p.page&&r.page_key!==p.page)return false;
    if(p.actions&&!p.actions.includes(r.action))return false;
    if(p.system&&r.actor!==null)return false;
    if(!p.system&&p.actor&&r.actor!==p.actor)return false;
    const t=Date.parse(r.happened_at);
    if(p.from&&t<Date.parse(p.from))return false;
    if(p.until&&t>=Date.parse(p.until))return false;
    if(before&&BigInt(r.id)>=BigInt(before))return false;
    return true;
   });
   return rows.slice(0,limit).map(r=>({id:String(r.id),page_key:r.page_key,action:r.action,actor:r.actor,happened_at:r.happened_at,details:r.details||{}}));
  }
 };
 const diffLabels={title:'제목',description:'설명',inherit:'공통 설정 사용','hero.preset':'배너 프리셋','hero.desktopHeight':'PC 최소 높이','hero.mobileHeight':'모바일 최소 높이','hero.desktopPadding':'PC 상하 여백','hero.mobilePadding':'모바일 상하 여백','hero.titleColor':'제목 색','hero.descriptionColor':'설명 색','hero.background':'배경색','hero.decoration':'장식 표시','button.text':'메인 버튼 문구','button.url':'메인 버튼 주소',sections:'메인 섹션 구성'};
 let options=[],key='main',doc={},saved={},published={},common={},version=0,dirty=false,busy=false,allowed=false,pageLoaded=false;
 const clone=value=>JSON.parse(JSON.stringify(value));
 const status=text=>{$('status').textContent=text;};
 function lock(value){busy=value;$('fields').disabled=value||!allowed||!pageLoaded;$('page').disabled=value||!allowed;['save','publish','compare','cancel'].forEach(id=>$(id).disabled=value||!allowed||!pageLoaded);document.querySelectorAll('#history button').forEach(b=>b.disabled=value||!allowed||!pageLoaded);}
 function baseline(option){
  const main=option.key==='main';const row=option.row||{};
  return {schemaVersion:1,title:main?'우리 원에 필요한 모든 즐거움\n뉴키즈 (New Kids)':(row.hero_title||row.name||'공통 배너 설정'),description:main?'검증된 영유아 교재부터 특별한 원어민 행사까지,\n선생님과 아이들이 모두 행복한 교육 파트너':(row.hero_desc||''),inherit:false,hero:{preset:main?'large':'small',desktopHeight:main?560:220,mobileHeight:main?440:180,desktopPadding:main?80:40,mobilePadding:main?56:32,titleColor:'#172451',descriptionColor:'#545b6e',background:'#f7f0e4',decoration:true},button:{text:'제안서 / 견적 요청하기',url:'proposal.html'},sections:Object.keys(sectionNames).map(id=>({id,visible:true}))};
 }
 function renderSections(){
  $('sections').replaceChildren();
  (doc.sections||[]).forEach((section,index)=>{
   if(!sectionNames[section.id])return;const row=document.createElement('div');row.className='section-row';
   const label=document.createElement('label');label.className='check';const check=document.createElement('input');check.type='checkbox';check.checked=section.visible!==false;check.addEventListener('change',()=>{section.visible=check.checked;changed();});label.append(check,document.createTextNode(sectionNames[section.id]));row.append(label);
   [-1,1].forEach(direction=>{const b=document.createElement('button');b.type='button';b.textContent=direction<0?'위':'아래';b.setAttribute('aria-label',sectionNames[section.id]+' '+b.textContent+'로 이동');b.disabled=index+direction<0||index+direction>=doc.sections.length;b.addEventListener('click',()=>{[doc.sections[index],doc.sections[index+direction]]=[doc.sections[index+direction],doc.sections[index]];renderSections();changed();});row.append(b);});$('sections').append(row);
  });
 }
 function fill(){
  $('title').value=doc.title||'';$('description').value=doc.description||'';$('inherit').checked=doc.inherit===true;
  heroFields.forEach(id=>{if(id==='decoration')$(id).checked=doc.hero?.[id]!==false;else $(id).value=doc.hero?.[id]??'';});
  $('buttonText').value=doc.button?.text||'';$('buttonUrl').value=doc.button?.url||'';
  $('main-settings').hidden=key!=='main';$('inherit').disabled=key==='main'||key==='page:defaults';
  heroFields.forEach(id=>$(id).disabled=doc.inherit===true);
  renderSections();
 }
 function changed(){dirty=true;status('저장되지 않은 변경 사항이 있습니다. 공개 사이트에는 아직 반영되지 않았습니다.');preview();}
 function preview(){
  try{$('preview').contentWindow.postMessage({type:'nk-page-editor-preview',document:doc,common},location.origin);}catch(_){}
 }
 async function readHistory(){
  const {data,error}=await sb.from('page_editor_revisions').select('id,publication_version,created_at').eq('page_key',key).order('created_at',{ascending:false}).limit(30);
  if(error)throw error;$('history').replaceChildren();
  if(!data||!data.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='아직 기록된 공개 이력이 없습니다.';$('history').append(empty);return;}
  data.forEach(item=>{const row=document.createElement('div');row.className='history-row';row.textContent='공개 v'+item.publication_version+' · '+new Date(item.created_at).toLocaleString('ko-KR');const b=document.createElement('button');b.textContent='초안으로 복구';b.addEventListener('click',async()=>{if(busy||!confirm('이 버전을 초안으로 가져올까요? 저장하지 않은 수정은 사라집니다. 공개본은 바뀌지 않습니다.'))return;lock(true);try{const {data,error}=await sb.rpc('page_editor_restore_draft',{p_revision_id:item.id,p_expected_draft_version:version});if(error)throw error;const r=Array.isArray(data)?data[0]:data;version=r.version;doc=r.document;saved=clone(doc);dirty=false;await window.__nkEditorFallback.recordAudit(sb,key,'page_editor_drafts:UPDATE',{version:Number(version)});fill();preview();status('이전 버전을 초안으로 복구했습니다. 공개하려면 공개 반영을 누르세요.');}catch(error){status('복구 실패: '+error.message);}finally{lock(false);fill();}});row.append(b);$('history').append(row);});
 }
 function route(option){if(option.key==='main')return 'index.html';if(option.key==='page:defaults')return 'notice.html#reference';const r=option.row;if(r.type==='EDU')return 'child.html#'+encodeURIComponent(r.code);if(r.type==='EVENT')return 'program.html#'+encodeURIComponent(r.code);if(r.type==='BOARD')return 'notice.html#'+encodeURIComponent(r.code);return ['order','proposal'].includes(r.code)?r.code+'.html':'page.html?id='+encodeURIComponent(r.code);}
 async function select(){
  lock(true);try{
   key=$('page').value;const option=options.find(o=>o.key===key);
   $('diff').textContent='';
   const [draftResult,pubResult,commonResult]=await Promise.all([sb.from('page_editor_drafts').select('*').eq('page_key',key).maybeSingle(),sb.from('page_editor_publications').select('*').eq('page_key',key).maybeSingle(),sb.from('page_editor_publications').select('document').eq('page_key','page:defaults').maybeSingle()]);
   for(const result of [draftResult,pubResult,commonResult])if(result.error)throw result.error;
   common=commonResult.data?.document||{};published=pubResult.data?.document||baseline(option);
   if(key==='main'&&!pubResult.data){const result=await sb.from('site_config').select('main_hero_title,main_hero_desc').eq('id',1).maybeSingle();if(!result.error&&result.data){if(result.data.main_hero_title)published.title=result.data.main_hero_title;if(result.data.main_hero_desc)published.description=result.data.main_hero_desc;}}
   doc=clone(draftResult.data?.document||published);doc.hero={...baseline(option).hero,...doc.hero};doc.sections=doc.sections||baseline(option).sections;doc.button=doc.button||baseline(option).button;
   version=draftResult.data?.version||0;saved=clone(doc);dirty=false;pageLoaded=true;fill();
   const url=new URL(route(option),base);$('open-page').href=url.href;url.searchParams.set('nkpreview','1');url.searchParams.set('editor_v','1');url.searchParams.set('nk_page',key);$('preview-status').textContent='미리보기 로딩 중';$('preview').src=url.href;
   await readHistory();status('초안 v'+version+' · '+(pubResult.data?'새 편집기 공개본 있음':'새 공개본 없음: 현재 홈페이지는 기존 설정 유지'));
  }catch(error){pageLoaded=false;status('불러오기 실패: '+error.message+' (다른 페이지를 선택하거나 새로고침해 다시 시도하세요.)');}finally{lock(false);fill();}
 }
 async function save(){
  const {data,error}=await sb.rpc('page_editor_save_draft',{p_page_key:key,p_document:doc,p_expected_version:version});if(error)throw error;const row=Array.isArray(data)?data[0]:data;version=row.version;saved=clone(doc);dirty=false;
  await window.__nkEditorFallback.recordAudit(sb,key,Number(version)===1?'page_editor_drafts:INSERT':'page_editor_drafts:UPDATE',{version:Number(version)});
 }
 fields.forEach(id=>$(id).addEventListener('input',()=>{
  if(busy)return;
  if(id==='title'||id==='description')doc[id]=$(id).value;
  else if(id==='inherit'){doc.inherit=$(id).checked;fill();}
  else if(id==='buttonText'||id==='buttonUrl'){doc.button=doc.button||{};doc.button[id==='buttonText'?'text':'url']=$(id).value;}
  else {doc.hero=doc.hero||{};doc.hero[id]=id==='decoration'?$(id).checked:numeric.includes(id)?($(id).value===''?'':Number($(id).value)):$(id).value;if(id==='preset'){const p=presets[$(id).value];if(p)numeric.forEach((name,i)=>doc.hero[name]=p[i]);fill();}}
  changed();
 }));
 $('page').addEventListener('change',()=>{if(dirty&&!confirm('저장하지 않은 변경을 버리고 이동할까요?')){$('page').value=key;return;}select();});
 $('cancel').addEventListener('click',()=>{if(busy||!confirm('저장된 초안으로 되돌릴까요?'))return;doc=clone(saved);dirty=false;fill();preview();status('저장된 초안을 불러왔습니다.');});
 $('save').addEventListener('click',async()=>{lock(true);try{await save();status('초안 v'+version+' 저장 완료. 공개 사이트는 변경되지 않았습니다.');}catch(error){status('저장 실패: '+error.message);}finally{lock(false);fill();}});
 $('publish').addEventListener('click',async()=>{if(busy||!confirm('현재 수정본을 저장하고 공개 홈페이지에 반영할까요? 공통 설정은 이를 사용하는 모든 페이지에 영향을 줍니다.'))return;lock(true);try{await save();const {data,error}=await sb.rpc('page_editor_publish',{p_page_key:key,p_expected_draft_version:version});if(error)throw error;const row=Array.isArray(data)?data[0]:data;published=clone(row.document);if(key==='page:defaults')common=clone(row.document);await window.__nkEditorFallback.markPublished(sb,key,row.document,row.version);await readHistory();status('공개본 v'+row.version+' 저장 완료. 공개 페이지를 새로 열어 결과를 확인하세요.');}catch(error){status('공개 처리 실패: '+error.message);}finally{lock(false);fill();}});
 $('compare').addEventListener('click',()=>{const changes=[];const fmt=v=>v===undefined||v===null?'없음':typeof v==='boolean'?(v?'사용':'미사용'):typeof v==='string'?v:JSON.stringify(v);function walk(a,b,path){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){new Set([...Object.keys(a),...Object.keys(b)]).forEach(k=>walk(a[k],b[k],path?path+'.'+k:k));}else changes.push((diffLabels[path]||path)+': '+fmt(a)+' → '+fmt(b));}walk(published,doc,'');$('diff').textContent=changes.join('\n')||'공개본과 차이가 없습니다.';$('diff-dialog').showModal();});
 $('close-diff').addEventListener('click',()=>$('diff-dialog').close());
 $('diff-dialog').addEventListener('click',event=>{if(event.target===$('diff-dialog'))$('diff-dialog').close();});
 document.querySelectorAll('[data-width]').forEach(button=>button.addEventListener('click',()=>{$('preview').style.width=button.dataset.width+'px';}));
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 window.addEventListener('message',event=>{if(event.source!==$('preview').contentWindow||event.origin!==location.origin)return;if(event.data?.type==='nk-page-editor-preview-ready')preview();if(event.data?.type==='nk-page-editor-preview-applied')$('preview-status').textContent='초안 미리보기 반영됨 · 읽기 전용';});
 $('preview').addEventListener('load',()=>{try{const win=$('preview').contentWindow;const frameDoc=$('preview').contentDocument;frameDoc.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();},true);frameDoc.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);if(win.NKPageDesign)preview();else{const script=frameDoc.createElement('script');script.src=new URL('page-design.js?v=1',base).href;script.onload=preview;frameDoc.head.appendChild(script);}}catch(_){$('preview-status').textContent='미리보기 연결 실패: 같은 주소의 페이지인지 확인하세요.';}});
 async function enter(){
  const {data,error}=await sb.rpc('page_editor_is_admin');if(error)throw error;if(data!==true)throw new Error('지정된 관리자 계정만 사용할 수 있습니다.');
  const result=await sb.from('program_categories').select('code,name,type,hero_title,hero_desc').order('order_num');if(result.error)throw result.error;
  options=[{key:'main',name:'메인 페이지'},{key:'page:defaults',name:'공통 배너 설정'},...(result.data||[]).map(row=>({key:'page:'+row.code,name:row.name,row}))];
  $('page').replaceChildren();options.forEach(item=>{const o=document.createElement('option');o.value=item.key;o.textContent=item.name;$('page').append(o);});
  allowed=true;$('login').hidden=true;$('workspace').hidden=false;await select();
 }
 $('login').addEventListener('submit',async event=>{event.preventDefault();const button=$('login').querySelector('button');button.disabled=true;try{const result=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});$('password').value='';if(result.error)throw result.error;await enter();}catch(error){status(error.message);}finally{button.disabled=false;}});
 (async()=>{try{const {data,error}=await sb.auth.getSession();if(error)throw error;if(data.session)await enter();else{$('login').hidden=false;status('지정된 관리자 계정으로 로그인해 주세요.');}}catch(error){$('login').hidden=false;status(error.message);}})();
})();
