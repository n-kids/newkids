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
 const diffLabels={title:'제목',description:'설명',inherit:'공통 설정 사용','hero.preset':'배너 프리셋','hero.desktopHeight':'PC 최소 높이','hero.mobileHeight':'모바일 최소 높이','hero.desktopPadding':'PC 상하 여백','hero.mobilePadding':'모바일 상하 여백','hero.titleColor':'제목 색','hero.descriptionColor':'설명 색','hero.background':'배경색','hero.decoration':'장식 표시','hero.heroAlign':'배너 텍스트 정렬','hero.titleScale':'배너 제목 크기 비율','hero.overlayColor':'배너 오버레이 색','hero.backgroundImage':'배너 배경 이미지','hero.overlayOpacity':'배너 오버레이 투명도','hero.btnBgColor':'메인 버튼 배경색','hero.btnTextColor':'메인 버튼 글자색','hero.ghostBtnColor':'보조 버튼 색','hero.showEyebrow':'상단 배지 표시','hero.eyebrowText':'상단 배지 문구','hero.badgeBgColor':'상단 배지 배경색','hero.badgeTextColor':'상단 배지 글자색','hero.showTags':'하단 태그 표시','hero.tagsText':'하단 태그 목록','hero.tagColor':'하단 태그 글자색','hero.showArt':'우측 일러스트 표시','hero.circleColor':'일러스트 원 배경색','button.text':'메인 버튼 문구','button.url':'메인 버튼 주소','ghostButton.visible':'보조 버튼 표시','ghostButton.text':'보조 버튼 문구','ghostButton.url':'보조 버튼 주소',sections:'메인 섹션 구성','mainSections.quickLinks.bgColor':'바로가기 섹션 배경색','mainSections.quickLinks.showApp':'주문 앱 배너 표시','mainSections.quickLinks.appBadge':'주문 앱 배너 라벨','mainSections.quickLinks.appTitle':'주문 앱 배너 제목','mainSections.quickLinks.appDesc':'주문 앱 배너 설명','mainSections.quickLinks.appCta':'주문 앱 배너 이동 문구','mainSections.quickLinks.appUrl':'주문 앱 배너 주소','mainSections.quickLinks.appBgColor':'주문 앱 배너 배경색','mainSections.quickLinks.appTextColor':'주문 앱 배너 글자색','mainSections.quickLinks.showRef':'자료실 배너 표시','mainSections.quickLinks.refTitle':'자료실 배너 제목','mainSections.quickLinks.refDesc':'자료실 배너 설명','mainSections.quickLinks.refCta':'자료실 배너 이동 문구','mainSections.quickLinks.sub1Text':'보조 바로가기 1 문구','mainSections.quickLinks.sub2Text':'보조 바로가기 2 문구','mainSections.quickLinks.refBgColor':'자료실 배너 배경색','mainSections.quickLinks.refTextColor':'자료실 배너 글자색','mainSections.events.eyebrow':'행사 섹션 라벨','mainSections.events.title':'행사 섹션 제목','mainSections.events.description':'행사 섹션 설명','mainSections.events.bgColor':'행사 섹션 배경색','mainSections.events.eyebrowColor':'행사 섹션 라벨색','mainSections.events.titleColor':'행사 섹션 제목색','mainSections.events.descColor':'행사 섹션 설명색','mainSections.events.cardBgColor':'행사 카드 배경색','mainSections.events.cardBorderColor':'행사 카드 테두리색','mainSections.events.cardTitleColor':'행사 카드 제목색','mainSections.events.cardDescColor':'행사 카드 설명색','mainSections.curriculum.eyebrow':'교육 섹션 라벨','mainSections.curriculum.title':'교육 섹션 제목','mainSections.curriculum.description':'교육 섹션 설명','mainSections.curriculum.bgColor':'교육 섹션 배경색','mainSections.curriculum.eyebrowColor':'교육 섹션 라벨색','mainSections.curriculum.titleColor':'교육 섹션 제목색','mainSections.curriculum.descColor':'교육 섹션 설명색','mainSections.curriculum.cardBgColor':'교육 카드 배경색','mainSections.curriculum.cardBorderColor':'교육 카드 테두리색','mainSections.curriculum.cardTitleColor':'교육 카드 제목색','mainSections.curriculum.cardDescColor':'교육 카드 설명색','mainSections.contact.title':'상담 섹션 제목','mainSections.contact.description':'상담 섹션 설명','mainSections.contact.phone1Label':'상담 1 라벨','mainSections.contact.phone1':'상담 1 전화번호','mainSections.contact.phone2Label':'상담 2 라벨','mainSections.contact.phone2':'상담 2 전화번호','mainSections.contact.bgColor':'상담 섹션 배경색','mainSections.contact.titleColor':'상담 섹션 제목색','mainSections.contact.descColor':'상담 섹션 설명색','mainSections.contact.cardBgColor':'상담 버튼 배경색','mainSections.contact.cardTextColor':'상담 버튼 글자색','subpage.bodyBgColor':'서브 본문 배경색','subpage.cardBgColor':'서브 카드 배경색','subpage.cardBorderColor':'서브 카드 테두리색','subpage.cardRadius':'서브 카드 모서리 둥글기','subpage.headingColor':'서브 본문 제목색','subpage.textColor':'서브 본문 설명색','subpage.accentBgColor':'서브 포인트 버튼 배경색','subpage.accentTextColor':'서브 포인트 버튼 글자색','subpage.section1Title':'서브 섹션 제목 1','subpage.section2Title':'서브 섹션 제목 2','subpage.section3Title':'서브 섹션 제목 3','subpage.submitText':'서브 주요 버튼 문구','subpage.placeholderText':'서브 입력창 안내 문구','subpage.showHelpPanel':'자료실 안내 박스 표시','layout.logoTitle':'상단 로고 제목','layout.logoSub':'상단 로고 부제','layout.headerBgColor':'상단 헤더 배경색','layout.headerTextColor':'상단 메뉴 글자색','layout.ctaBgColor':'강조 메뉴 배경색','layout.ctaTextColor':'강조 메뉴 글자색','layout.pageBgColor':'페이지 기본 배경색','layout.pageTextColor':'페이지 기본 글자색','layout.footerBgColor':'하단 푸터 배경색','layout.footerTextColor':'하단 푸터 글자색','layout.footerCopy':'푸터 저작권 문구','layout.primaryColor':'브랜드 메인 컬러','layout.accentColor':'브랜드 강조 컬러'};
 const nestedBindings=[
  ['heroAlign','hero',null,'heroAlign','text'],
  ['titleScale','hero',null,'titleScale','number'],
  ['overlayColor','hero',null,'overlayColor','color','#1a3c6e'],
  ['heroImageUrl','hero',null,'backgroundImage','text'],
  ['overlayOpacity','hero',null,'overlayOpacity','float'],
  ['btnBgColor','hero',null,'btnBgColor','color','#172451'],
  ['btnTextColor','hero',null,'btnTextColor','color','#ffffff'],
  ['ghostButtonVisible','ghostButton',null,'visible','check'],
  ['ghostButtonText','ghostButton',null,'text','text'],
  ['ghostButtonUrl','ghostButton',null,'url','text'],
  ['ghostBtnColor','hero',null,'ghostBtnColor','color','#172451'],
  ['showEyebrow','hero',null,'showEyebrow','check'],
  ['eyebrowText','hero',null,'eyebrowText','text'],
  ['badgeBgColor','hero',null,'badgeBgColor','color','#ffffff'],
  ['badgeTextColor','hero',null,'badgeTextColor','color','#9a6b3c'],
  ['showTags','hero',null,'showTags','check'],
  ['tagsText','hero',null,'tagsText','text'],
  ['tagColor','hero',null,'tagColor','color','#545b6e'],
  ['showArt','hero',null,'showArt','check'],
  ['circleColor','hero',null,'circleColor','color','#f3eadb'],
  ['qlBgColor','mainSections','quickLinks','bgColor','color','#f7f0e4'],
  ['qlShowApp','mainSections','quickLinks','showApp','check'],
  ['qlAppBadge','mainSections','quickLinks','appBadge','text'],
  ['qlAppCta','mainSections','quickLinks','appCta','text'],
  ['qlAppTitle','mainSections','quickLinks','appTitle','text'],
  ['qlAppDesc','mainSections','quickLinks','appDesc','text'],
  ['qlAppUrl','mainSections','quickLinks','appUrl','text'],
  ['qlAppBgColor','mainSections','quickLinks','appBgColor','color','#172451'],
  ['qlAppTextColor','mainSections','quickLinks','appTextColor','color','#ffffff'],
  ['qlShowRef','mainSections','quickLinks','showRef','check'],
  ['qlRefTitle','mainSections','quickLinks','refTitle','text'],
  ['qlRefCta','mainSections','quickLinks','refCta','text'],
  ['qlRefDesc','mainSections','quickLinks','refDesc','text'],
  ['qlSub1Text','mainSections','quickLinks','sub1Text','text'],
  ['qlSub2Text','mainSections','quickLinks','sub2Text','text'],
  ['qlRefBgColor','mainSections','quickLinks','refBgColor','color','#ffffff'],
  ['qlRefTextColor','mainSections','quickLinks','refTextColor','color','#172451'],
  ['evEyebrow','mainSections','events','eyebrow','text'],
  ['evTitle','mainSections','events','title','text'],
  ['evDesc','mainSections','events','description','text'],
  ['evBgColor','mainSections','events','bgColor','color','#ffffff'],
  ['evEyebrowColor','mainSections','events','eyebrowColor','color','#b85a17'],
  ['evTitleColor','mainSections','events','titleColor','color','#172451'],
  ['evDescColor','mainSections','events','descColor','color','#545b6e'],
  ['evCardBgColor','mainSections','events','cardBgColor','color','#ffffff'],
  ['evCardBorderColor','mainSections','events','cardBorderColor','color','#e6dfd3'],
  ['evCardTitleColor','mainSections','events','cardTitleColor','color','#172451'],
  ['evCardDescColor','mainSections','events','cardDescColor','color','#545b6e'],
  ['cuEyebrow','mainSections','curriculum','eyebrow','text'],
  ['cuTitle','mainSections','curriculum','title','text'],
  ['cuDesc','mainSections','curriculum','description','text'],
  ['cuBgColor','mainSections','curriculum','bgColor','color','#fbf6ee'],
  ['cuEyebrowColor','mainSections','curriculum','eyebrowColor','color','#9a6b3c'],
  ['cuTitleColor','mainSections','curriculum','titleColor','color','#172451'],
  ['cuDescColor','mainSections','curriculum','descColor','color','#545b6e'],
  ['cuCardBgColor','mainSections','curriculum','cardBgColor','color','#ffffff'],
  ['cuCardBorderColor','mainSections','curriculum','cardBorderColor','color','#e6dfd3'],
  ['cuCardTitleColor','mainSections','curriculum','cardTitleColor','color','#172451'],
  ['cuCardDescColor','mainSections','curriculum','cardDescColor','color','#545b6e'],
  ['ctTitle','mainSections','contact','title','text'],
  ['ctDesc','mainSections','contact','description','text'],
  ['ctPhone1Label','mainSections','contact','phone1Label','text'],
  ['ctPhone1','mainSections','contact','phone1','text'],
  ['ctPhone2Label','mainSections','contact','phone2Label','text'],
  ['ctPhone2','mainSections','contact','phone2','text'],
  ['ctBgColor','mainSections','contact','bgColor','color','#172451'],
  ['ctTitleColor','mainSections','contact','titleColor','color','#ffffff'],
  ['ctDescColor','mainSections','contact','descColor','color','#cbd5e1'],
  ['ctCardBgColor','mainSections','contact','cardBgColor','color','#ffffff'],
  ['ctCardTextColor','mainSections','contact','cardTextColor','color','#172451'],
  ['subBodyBgColor','subpage',null,'bodyBgColor','color','#f8f9fa'],
  ['subCardBgColor','subpage',null,'cardBgColor','color','#ffffff'],
  ['subCardBorderColor','subpage',null,'cardBorderColor','color','#e2e8f0'],
  ['subCardRadius','subpage',null,'cardRadius','number'],
  ['subHeadingColor','subpage',null,'headingColor','color','#172451'],
  ['subTextColor','subpage',null,'textColor','color','#475569'],
  ['subAccentBgColor','subpage',null,'accentBgColor','color','#1a3c6e'],
  ['subAccentTextColor','subpage',null,'accentTextColor','color','#ffffff'],
  ['subSection1Title','subpage',null,'section1Title','text'],
  ['subSection2Title','subpage',null,'section2Title','text'],
  ['subSection3Title','subpage',null,'section3Title','text'],
  ['subSubmitText','subpage',null,'submitText','text'],
  ['subPlaceholderText','subpage',null,'placeholderText','text'],
  ['subShowHelpPanel','subpage',null,'showHelpPanel','check'],
  ['layLogoTitle','layout',null,'logoTitle','text'],
  ['layLogoSub','layout',null,'logoSub','text'],
  ['layHeaderBgColor','layout',null,'headerBgColor','color','#ffffff'],
  ['layHeaderTextColor','layout',null,'headerTextColor','color','#172451'],
  ['layCtaBgColor','layout',null,'ctaBgColor','color','#172451'],
  ['layCtaTextColor','layout',null,'ctaTextColor','color','#ffffff'],
  ['layPageBgColor','layout',null,'pageBgColor','color','#ffffff'],
  ['layPageTextColor','layout',null,'pageTextColor','color','#172451'],
  ['layFooterBgColor','layout',null,'footerBgColor','color','#111827'],
  ['layFooterTextColor','layout',null,'footerTextColor','color','#d1d5db'],
  ['layFooterCopy','layout',null,'footerCopy','text'],
  ['layPrimaryColor','layout',null,'primaryColor','color','#1a3c6e'],
  ['layAccentColor','layout',null,'accentColor','color','#b85a17']
 ];
 const heroThemes={
  cream:{background:'#fbf6ee',titleColor:'#172451',descriptionColor:'#545b6e',badgeBgColor:'#ffffff',badgeTextColor:'#9a6b3c',btnBgColor:'#172451',btnTextColor:'#ffffff',ghostBtnColor:'#172451',tagColor:'#545b6e',circleColor:'#f3eadb'},
  sky:{background:'#eef6ff',titleColor:'#1e3a8a',descriptionColor:'#475569',badgeBgColor:'#ffffff',badgeTextColor:'#1d4ed8',btnBgColor:'#1e3a8a',btnTextColor:'#ffffff',ghostBtnColor:'#1e3a8a',tagColor:'#475569',circleColor:'#dbeafe'},
  mint:{background:'#ecfdf5',titleColor:'#065f46',descriptionColor:'#374151',badgeBgColor:'#ffffff',badgeTextColor:'#047857',btnBgColor:'#065f46',btnTextColor:'#ffffff',ghostBtnColor:'#065f46',tagColor:'#374151',circleColor:'#d1fae5'},
  peach:{background:'#fff1f2',titleColor:'#881337',descriptionColor:'#57534e',badgeBgColor:'#ffffff',badgeTextColor:'#be123c',btnBgColor:'#9f1239',btnTextColor:'#ffffff',ghostBtnColor:'#9f1239',tagColor:'#57534e',circleColor:'#ffe4e6'},
  navy:{background:'#172451',titleColor:'#ffffff',descriptionColor:'#e2e8f0',badgeBgColor:'#24356e',badgeTextColor:'#fbbf24',btnBgColor:'#fbbf24',btnTextColor:'#172451',ghostBtnColor:'#ffffff',tagColor:'#cbd5e1',circleColor:'#23346b'}
 };
 const subThemes={
  clean:{bodyBgColor:'#f8f9fa',cardBgColor:'#ffffff',cardBorderColor:'#e2e8f0',headingColor:'#172451',textColor:'#475569',accentBgColor:'#1a3c6e',accentTextColor:'#ffffff'},
  cream:{bodyBgColor:'#fbf6ee',cardBgColor:'#ffffff',cardBorderColor:'#e6dfd3',headingColor:'#172451',textColor:'#545b6e',accentBgColor:'#9a6b3c',accentTextColor:'#ffffff'},
  sky:{bodyBgColor:'#f0f7ff',cardBgColor:'#ffffff',cardBorderColor:'#bfdbfe',headingColor:'#1e3a8a',textColor:'#334155',accentBgColor:'#1d4ed8',accentTextColor:'#ffffff'},
  mint:{bodyBgColor:'#f0fdf4',cardBgColor:'#ffffff',cardBorderColor:'#bbf7d0',headingColor:'#065f46',textColor:'#374151',accentBgColor:'#047857',accentTextColor:'#ffffff'}
 };
 const fixedPages=[
  {code:'proposal',name:'제안서 · 견적 요청 페이지',type:'PAGE',hero_title:'제안서 및 견적 요청',hero_desc:'원하시는 교육 프로그램이나 행사의 제안서 및 견적을 요청해 주세요.',isFixed:true},
  {code:'order',name:'교재 발주 페이지',type:'PAGE',hero_title:'교재 발주 신청',hero_desc:'필요한 교재와 수량을 선택하여 간편하게 발주하세요.',isFixed:true},
  {code:'app-install',name:'주문 앱 설치 안내 페이지',type:'PAGE',hero_title:'뉴키즈 주문 앱 설치하기',hero_desc:'교재·물품 주문, 견적서 요청, A/S 신청을 휴대폰에서 바로 이용하세요.',isFixed:true}
 ];
 let options=[],catRows=[],popupRows=[],key='main',doc={},saved={},published={},common={},version=0,dirty=false,busy=false,allowed=false,pageLoaded=false;
 const clone=value=>JSON.parse(JSON.stringify(value));
 const status=text=>{$('status').textContent=text;};
 const deriveCircle=hex=>{const m=/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex||'').trim());if(!m)return '#f3eadb';const d=v=>Math.max(0,Math.min(255,Math.round(parseInt(v,16)*0.94))).toString(16).padStart(2,'0');return `#${d(m[1])}${d(m[2])}${d(m[3])}`;};
 const fileToDataUrl=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result||''));r.onerror=()=>reject(new Error('이미지 파일을 읽을 수 없습니다.'));r.readAsDataURL(file);});
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
  $('main-settings').hidden=key!=='main';
  if($('main-sections-design'))$('main-sections-design').hidden=key!=='main';
  if($('subpage-design-card'))$('subpage-design-card').hidden=key==='main';
  $('inherit').disabled=key==='main'||key==='page:defaults';
  heroFields.forEach(id=>$(id).disabled=doc.inherit===true);
  nestedBindings.forEach(([id,sec,sub,prop,type,defCol])=>{
   const el=$(id);if(!el)return;
   const target=sub?doc[sec]?.[sub]:doc[sec];
   const val=target?.[prop];
   if(type==='check')el.checked=val!==false;
   else if(type==='color')el.value=/^#[0-9a-f]{6}$/i.test(String(val||''))?val:defCol;
   else el.value=val??'';
   if(sec==='hero'&&!['btnBgColor','btnTextColor','ghostBtnColor','showEyebrow','eyebrowText','badgeBgColor','badgeTextColor','showTags','tagsText','tagColor','showArt','circleColor'].includes(id)){
    el.disabled=doc.inherit===true;
   }
  });
  if($('heroImageFile'))$('heroImageFile').disabled=doc.inherit===true;
  if($('heroImageClear'))$('heroImageClear').disabled=doc.inherit===true;
  renderSections();
 }
 function emitState(reason){
  try{window.dispatchEvent(new CustomEvent('nk-editor-state',{detail:{reason,key,dirty}}));}catch(_){}
 }
 function changed(){dirty=true;status('저장되지 않은 변경 사항이 있습니다. 공개 사이트에는 아직 반영되지 않았습니다.');preview();emitState('change');}
 function preview(){
  try{$('preview').contentWindow.postMessage({type:'nk-page-editor-preview',document:doc,common},location.origin);}catch(_){}
  try{if(typeof window.__nkSyncExtraPreview==='function')window.__nkSyncExtraPreview(doc,common);}catch(_){}
 }
 async function readHistory(){
  const {data,error}=await sb.from('page_editor_revisions').select('id,publication_version,created_at').eq('page_key',key).order('created_at',{ascending:false}).limit(30);
  if(error)throw error;$('history').replaceChildren();
  if(!data||!data.length){const empty=document.createElement('p');empty.className='muted';empty.textContent='아직 기록된 공개 이력이 없습니다.';$('history').append(empty);return;}
  data.forEach(item=>{const row=document.createElement('div');row.className='history-row';row.textContent='공개 v'+item.publication_version+' · '+new Date(item.created_at).toLocaleString('ko-KR');const b=document.createElement('button');b.textContent='초안으로 복구';b.addEventListener('click',async()=>{if(busy||!confirm('이 버전을 초안으로 가져올까요? 저장하지 않은 수정은 사라집니다. 공개본은 바뀌지 않습니다.'))return;lock(true);try{const {data,error}=await sb.rpc('page_editor_restore_draft',{p_revision_id:item.id,p_expected_draft_version:version});if(error)throw error;const r=Array.isArray(data)?data[0]:data;version=r.version;doc=r.document;saved=clone(doc);dirty=false;await window.__nkEditorFallback.recordAudit(sb,key,'page_editor_drafts:UPDATE',{version:Number(version)});fill();preview();emitState('restore');status('이전 버전을 초안으로 복구했습니다. 공개하려면 공개 반영을 누르세요.');}catch(error){status('복구 실패: '+error.message);}finally{lock(false);fill();}});row.append(b);$('history').append(row);});
 }
 function route(option){if(option.key==='main')return 'index.html';if(option.key==='page:defaults')return 'notice.html#reference';const r=option.row;if(r.type==='EDU')return 'child.html#'+encodeURIComponent(r.code);if(r.type==='EVENT')return 'program.html#'+encodeURIComponent(r.code);if(r.type==='BOARD')return 'notice.html#'+encodeURIComponent(r.code);return ['order','proposal','app-install'].includes(r.code)?r.code+'.html':'page.html?id='+encodeURIComponent(r.code);}
 async function select(){
  lock(true);try{
   key=$('page').value;const option=options.find(o=>o.key===key)||options[0];
   $('diff').textContent='';
   const [draftResult,pubResult,commonResult]=await Promise.all([sb.from('page_editor_drafts').select('*').eq('page_key',key).maybeSingle(),sb.from('page_editor_publications').select('*').eq('page_key',key).maybeSingle(),sb.from('page_editor_publications').select('document').eq('page_key','page:defaults').maybeSingle()]);
   for(const result of [draftResult,pubResult,commonResult])if(result.error)throw result.error;
   common=commonResult.data?.document||{};published=pubResult.data?.document||baseline(option);
   if(key==='main'&&!pubResult.data){const result=await sb.from('site_config').select('main_hero_title,main_hero_desc').eq('id',1).maybeSingle();if(!result.error&&result.data){if(result.data.main_hero_title)published.title=result.data.main_hero_title;if(result.data.main_hero_desc)published.description=result.data.main_hero_desc;}}
   doc=clone(draftResult.data?.document||published);doc.hero={...baseline(option).hero,...doc.hero};doc.sections=doc.sections||baseline(option).sections;doc.button=doc.button||baseline(option).button;
   version=draftResult.data?.version||0;saved=clone(doc);dirty=false;pageLoaded=true;fill();
   const url=new URL(route(option),base);$('open-page').href=url.href;url.searchParams.set('nkpreview','1');url.searchParams.set('editor_v','1');url.searchParams.set('nk_page',key);$('preview-status').textContent='미리보기 로딩 중';$('preview').src=url.href;
   await readHistory();status('초안 v'+version+' · '+(pubResult.data?'새 편집기 공개본 있음':'새 공개본 없음: 현재 홈페이지는 기존 설정 유지'));
   emitState('select');
  }catch(error){pageLoaded=false;status('불러오기 실패: '+error.message+' (다른 페이지를 선택하거나 새로고침해 다시 시도하세요.)');}finally{lock(false);fill();}
 }
 async function save(){
  const {data,error}=await sb.rpc('page_editor_save_draft',{p_page_key:key,p_document:doc,p_expected_version:version});if(error)throw error;const row=Array.isArray(data)?data[0]:data;version=row.version;saved=clone(doc);dirty=false;
  await window.__nkEditorFallback.recordAudit(sb,key,Number(version)===1?'page_editor_drafts:INSERT':'page_editor_drafts:UPDATE',{version:Number(version)});
  emitState('save');
 }
 async function syncMainPublicationToSiteConfig(d){
  try{
   const tbl=sb.from('site_config');
   if(!tbl||typeof tbl.update!=='function')return;
   const h=d?.hero||{};
   const extra=JSON.stringify({nkHeroStyleV1:true,badgeBg:h.badgeBgColor||'#ffffff',badgeText:h.badgeTextColor||'#9a6b3c',btnBg:h.btnBgColor||'#172451',btnText:h.btnTextColor||'#ffffff',ghostText:h.ghostBtnColor||h.btnBgColor||'#172451',tagText:h.tagColor||'#545b6e',circleColor:h.circleColor||deriveCircle(h.background||'#f7f0e4')});
   await tbl.update({main_hero_title:d.title||'',main_hero_desc:d.description||'',main_hero_bg_color:h.background||'#f7f0e4',main_hero_title_color:h.titleColor||'#172451',main_hero_desc_color:h.descriptionColor||'#545b6e',main_hero_image:h.backgroundImage||'',main_hero_overlay_color:h.overlayColor||'#1a3c6e',main_hero_overlay_opacity:h.overlayOpacity!==''&&h.overlayOpacity!==undefined?Number(h.overlayOpacity):0.4,popup_link:extra}).eq('id',1);
  }catch(_){}
 }
 fields.forEach(id=>$(id).addEventListener('input',()=>{
  if(busy)return;
  if(id==='title'||id==='description')doc[id]=$(id).value;
  else if(id==='inherit'){doc.inherit=$(id).checked;fill();}
  else if(id==='buttonText'||id==='buttonUrl'){doc.button=doc.button||{};doc.button[id==='buttonText'?'text':'url']=$(id).value;}
  else {doc.hero=doc.hero||{};doc.hero[id]=id==='decoration'?$(id).checked:numeric.includes(id)?($(id).value===''?'':Number($(id).value)):$(id).value;if(id==='preset'){const p=presets[$(id).value];if(p)numeric.forEach((name,i)=>doc.hero[name]=p[i]);fill();}}
  changed();
 }));
 nestedBindings.forEach(([id,sec,sub,prop,type])=>{
  const el=$(id);if(!el)return;
  const handler=()=>{
   if(busy)return;
   doc[sec]=doc[sec]||{};
   const target=sub?(doc[sec][sub]=doc[sec][sub]||{}):doc[sec];
   if(type==='check')target[prop]=el.checked;
   else if(type==='number'||type==='float')target[prop]=el.value===''?'':Number(el.value);
   else target[prop]=el.value;
   changed();
  };
  el.addEventListener('input',handler);
  if(el.tagName==='SELECT'||type==='check')el.addEventListener('change',handler);
 });
 document.querySelectorAll('[data-hero-theme]').forEach(btn=>btn.addEventListener('click',()=>{
  if(busy)return;
  const theme=heroThemes[btn.dataset.heroTheme];if(!theme)return;
  doc.inherit=false;doc.hero=doc.hero||{};
  doc.hero.background=theme.background;doc.hero.titleColor=theme.titleColor;doc.hero.descriptionColor=theme.descriptionColor;
  if(key==='main'){
   ['badgeBgColor','badgeTextColor','btnBgColor','btnTextColor','ghostBtnColor','tagColor','circleColor'].forEach(k=>{doc.hero[k]=theme[k];});
  }
  fill();changed();
 }));
 document.querySelectorAll('[data-sub-theme]').forEach(btn=>btn.addEventListener('click',()=>{
  if(busy)return;
  const theme=subThemes[btn.dataset.subTheme];if(!theme)return;
  doc.subpage={...(doc.subpage||{}),...theme};
  fill();changed();
 }));
 if($('syncCircleColor'))$('syncCircleColor').addEventListener('click',()=>{
  if(busy)return;
  doc.hero=doc.hero||{};doc.hero.circleColor=deriveCircle(doc.hero.background||'#f7f0e4');
  fill();changed();
 });
 if($('heroImageFile'))$('heroImageFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file||busy)return;
  try{
   const dataUrl=await fileToDataUrl(file);
   doc.hero=doc.hero||{};doc.hero.backgroundImage=dataUrl;
   fill();changed();
  }catch(err){status(err.message);}
 });
 if($('heroImageClear'))$('heroImageClear').addEventListener('click',()=>{
  if(busy)return;
  if($('heroImageFile'))$('heroImageFile').value='';
  doc.hero=doc.hero||{};delete doc.hero.backgroundImage;
  fill();changed();
 });
 function buildOptions(rows){
  catRows=Array.isArray(rows)?rows.slice():[];
  const list=[{key:'main',name:'메인 페이지'},{key:'page:defaults',name:'공통 배너 설정'},...catRows.map(row=>({key:'page:'+row.code,name:row.name,row}))];
  fixedPages.forEach(fp=>{if(!list.some(o=>o.key==='page:'+fp.code))list.push({key:'page:'+fp.code,name:fp.name,row:fp});});
  options=list;
  const prev=$('page').value||key;
  $('page').replaceChildren();
  options.forEach(item=>{const o=document.createElement('option');o.value=item.key;o.textContent=item.name;$('page').append(o);});
  if(options.some(o=>o.key===prev))$('page').value=prev;
 }
 function setCatStatus(msg){if($('nk-cat-status'))$('nk-cat-status').textContent=msg;}
 function setEnvStatus(msg){if($('nk-env-status'))$('nk-env-status').textContent=msg;}
 function switchToPageDesign(targetKey){
  if(!$('page')||!options.some(o=>o.key===targetKey))return;
  if(dirty&&!confirm('저장하지 않은 변경을 버리고 선택한 페이지 디자인 편집으로 이동할까요?'))return;
  dirty=false;$('page').value=targetKey;$('page').dispatchEvent(new Event('change',{bubbles:true}));
  if(typeof window.__nkSetEditorView==='function')window.__nkSetEditorView('body');
 }
 function renderSubpageManager(){
  const box=$('nk-cat-list');if(!box)return;
  box.replaceChildren();
  const allItems=[...catRows.map((r,idx)=>({...r,_idx:idx,_editable:true})),...fixedPages.filter(fp=>!catRows.some(c=>c.code===fp.code)).map(fp=>({...fp,_editable:false}))];
  allItems.forEach(row=>{
   const card=document.createElement('div');card.className='nk-managed-item';card.dataset.catCode=row.code;
   const head=document.createElement('div');head.className='nk-managed-head';
   const titleWrap=document.createElement('div');
   const badge=document.createElement('span');badge.className='nk-badge';badge.textContent=row._editable?row.type:'FIXED';
   const strong=document.createElement('strong');strong.textContent=' '+row.name+' ';
   const codeEl=document.createElement('small');codeEl.className='muted';codeEl.textContent='(page:'+row.code+')';
   titleWrap.append(badge,strong,codeEl);
   const act=document.createElement('div');act.className='nk-managed-actions';
   const editDesignBtn=document.createElement('button');editDesignBtn.type='button';editDesignBtn.className='primary';editDesignBtn.dataset.catDesign='page:'+row.code;editDesignBtn.textContent='디자인 편집';
   editDesignBtn.addEventListener('click',()=>switchToPageDesign('page:'+row.code));
   act.append(editDesignBtn);
   if(row._editable){
    const upBtn=document.createElement('button');upBtn.type='button';upBtn.textContent='위';upBtn.disabled=row._idx===0;
    const downBtn=document.createElement('button');downBtn.type='button';downBtn.textContent='아래';downBtn.disabled=row._idx===catRows.length-1;
    const saveBtn=document.createElement('button');saveBtn.type='button';saveBtn.dataset.catSave=row.code;saveBtn.textContent='정보 저장';
    const delBtn=document.createElement('button');delBtn.type='button';delBtn.dataset.catDelete=row.code;delBtn.textContent='삭제';
    const move=async dir=>{
     const other=catRows[row._idx+dir];if(!other)return;
     try{
      const tbl=sb.from('program_categories');if(!tbl||typeof tbl.update!=='function')return;
      const o1=row.order_num||(row._idx+1),o2=other.order_num||(row._idx+dir+1);
      await Promise.all([tbl.update({order_num:o2}).eq('code',row.code),tbl.update({order_num:o1}).eq('code',other.code)]);
      await reloadCategories();setCatStatus(row.name+' 순서를 변경했습니다.');
     }catch(err){setCatStatus('순서 변경 실패: '+err.message);}
    };
    upBtn.addEventListener('click',()=>move(-1));
    downBtn.addEventListener('click',()=>move(1));
    act.append(upBtn,downBtn,saveBtn,delBtn);
    head.append(titleWrap,act);card.append(head);
    const grid=document.createElement('div');grid.className='pair';
    const nameLbl=document.createElement('label');nameLbl.textContent='메뉴 이름';const nameInp=document.createElement('input');nameInp.className='nk-cat-edit-name';nameInp.value=row.name||'';nameLbl.append(nameInp);
    const typeLbl=document.createElement('label');typeLbl.textContent='유형';const typeSel=document.createElement('select');typeSel.className='nk-cat-edit-type';
    [['EDU','교육 (EDU)'],['EVENT','행사 (EVENT)'],['BOARD','게시판 (BOARD)'],['PAGE','고정 페이지 (PAGE)']].forEach(([v,t])=>{const op=document.createElement('option');op.value=v;op.textContent=t;if(row.type===v)op.selected=true;typeSel.append(op);});
    typeLbl.append(typeSel);grid.append(nameLbl,typeLbl);
    const grid2=document.createElement('div');grid2.className='pair';
    const colLbl=document.createElement('label');colLbl.textContent='메뉴 글자색';const colInp=document.createElement('input');colInp.type='color';colInp.className='nk-cat-edit-color';colInp.value=/^#[0-9a-f]{6}$/i.test(String(row.color||''))?row.color:'#172451';colLbl.append(colInp);
    const descLbl=document.createElement('label');descLbl.textContent='기본 배너 설명';const descInp=document.createElement('input');descInp.className='nk-cat-edit-desc';descInp.value=row.hero_desc||'';descLbl.append(descInp);
    grid2.append(colLbl,descLbl);
    const visLbl=document.createElement('label');visLbl.className='check';const visInp=document.createElement('input');visInp.type='checkbox';visInp.className='nk-cat-edit-visible';visInp.checked=row.is_visible!==false;visLbl.append(visInp,document.createTextNode('상단 네비게이션 메뉴에 노출'));
    card.append(grid,grid2,visLbl);
    saveBtn.addEventListener('click',async()=>{
     try{
      const tbl=sb.from('program_categories');if(!tbl||typeof tbl.update!=='function')return;
      const newName=nameInp.value.trim()||row.name;
      const patch={name:newName,type:typeSel.value,color:colInp.value,hero_title:newName,hero_desc:descInp.value.trim(),is_visible:visInp.checked};
      const res=await tbl.update(patch).eq('code',row.code);if(res?.error)throw res.error;
      await reloadCategories();setCatStatus(newName+' 서브 페이지 정보가 저장되었습니다.');
     }catch(err){setCatStatus('저장 실패: '+err.message);}
    });
    delBtn.addEventListener('click',async()=>{
     if(!confirm(row.name+' 서브 페이지를 삭제할까요?'))return;
     try{
      const tbl=sb.from('program_categories');if(!tbl||typeof tbl.delete!=='function')return;
      const res=await tbl.delete().eq('code',row.code);if(res?.error)throw res.error;
      await reloadCategories();setCatStatus(row.name+' 서브 페이지를 삭제했습니다.');
     }catch(err){setCatStatus('삭제 실패: '+err.message);}
    });
   }else{
    head.append(titleWrap,act);card.append(head);
   }
   box.append(card);
  });
 }
 async function reloadCategories(selectCode){
  try{
   const result=await sb.from('program_categories').select('*').order('order_num');
   if(result.error)throw result.error;
   buildOptions(result.data||[]);
   renderSubpageManager();
   if(selectCode&&options.some(o=>o.key==='page:'+selectCode)){
    $('page').value='page:'+selectCode;await select();
   }
  }catch(err){setCatStatus('목록 조회 실패: '+err.message);}
 }
 if($('nk-cat-add-btn'))$('nk-cat-add-btn').addEventListener('click',async()=>{
  const code=($('nk-cat-new-code')?.value||'').trim().toLowerCase();
  const name=($('nk-cat-new-name')?.value||'').trim();
  const type=$('nk-cat-new-type')?.value||'EDU';
  const color=$('nk-cat-new-color')?.value||'#172451';
  const hero_desc=($('nk-cat-new-desc')?.value||'').trim();
  if(!/^[a-z0-9_-]+$/.test(code)){setCatStatus('영문 코드는 영문 소문자, 숫자, 하이픈(-), 언더바(_)만 입력하세요.');return;}
  if(!name){setCatStatus('메뉴 이름을 입력하세요.');return;}
  try{
   const tbl=sb.from('program_categories');if(!tbl||typeof tbl.insert!=='function'){setCatStatus('현재 환경에서는 카테고리 추가를 지원하지 않습니다.');return;}
   const res=await tbl.insert({code,name,type,color,hero_title:name,hero_desc,is_visible:true,order_num:catRows.length+1});
   if(res?.error)throw res.error;
   $('nk-cat-new-code').value='';$('nk-cat-new-name').value='';$('nk-cat-new-desc').value='';
   await reloadCategories();
   setCatStatus('새 서브 페이지('+name+')가 생성되었습니다. [디자인 편집]을 눌러 바로 꾸밀 수 있습니다.');
  }catch(err){setCatStatus('생성 실패: '+err.message);}
 });
 if($('nk-cat-refresh-btn'))$('nk-cat-refresh-btn').addEventListener('click',()=>reloadCategories());
 function renderPopupList(){
  const box=$('nk-popup-list');if(!box)return;
  box.replaceChildren();
  if(!popupRows.length){const p=document.createElement('p');p.className='muted';p.textContent='등록된 공지 팝업이 없습니다.';box.append(p);return;}
  popupRows.forEach(item=>{
   const row=document.createElement('div');row.className='nk-managed-item';row.dataset.popupId=String(item.id);
   const head=document.createElement('div');head.className='nk-managed-head';
   const info=document.createElement('div');
   const st=document.createElement('strong');st.textContent=item.alt_text||'공지 팝업';
   const sm=document.createElement('small');sm.className='muted';sm.textContent=' · '+(item.link_url||'링크 없음');
   info.append(st,sm);
   const act=document.createElement('div');act.className='nk-managed-actions';
   const chkLbl=document.createElement('label');chkLbl.className='check';chkLbl.style.margin='0';
   const chk=document.createElement('input');chk.type='checkbox';chk.checked=item.is_active!==false;
   chk.addEventListener('change',async()=>{
    try{
     const tbl=sb.from('site_popups');if(!tbl||typeof tbl.update!=='function')return;
     await tbl.update({is_active:chk.checked}).eq('id',item.id);
     item.is_active=chk.checked;setEnvStatus('팝업 노출 상태가 변경되었습니다.');
    }catch(err){setEnvStatus('팝업 수정 실패: '+err.message);}
   });
   chkLbl.append(chk,document.createTextNode('노출'));
   const del=document.createElement('button');del.type='button';del.textContent='삭제';
   del.addEventListener('click',async()=>{
    if(!confirm('이 팝업을 삭제할까요?'))return;
    try{
     const tbl=sb.from('site_popups');if(!tbl||typeof tbl.delete!=='function')return;
     await tbl.delete().eq('id',item.id);
     await loadEnvSettings();setEnvStatus('팝업을 삭제했습니다.');
    }catch(err){setEnvStatus('팝업 삭제 실패: '+err.message);}
   });
   act.append(chkLbl,del);head.append(info,act);row.append(head);box.append(row);
  });
 }
 async function loadEnvSettings(){
  try{
   const cfgRes=await sb.from('site_config').select('*').eq('id',1).maybeSingle();
   if(!cfgRes.error&&cfgRes.data){
    const c=cfgRes.data;
    if($('nk-env-company'))$('nk-env-company').value=c.company_name||'';
    if($('nk-env-ceo'))$('nk-env-ceo').value=c.ceo_name||'';
    if($('nk-env-address'))$('nk-env-address').value=c.address||'';
    if($('nk-env-phone'))$('nk-env-phone').value=c.phone||'';
    if($('nk-env-primary')&&/^#[0-9a-f]{6}$/i.test(String(c.primary_color||'')))$('nk-env-primary').value=c.primary_color;
    if($('nk-env-accent')&&/^#[0-9a-f]{6}$/i.test(String(c.accent_color||'')))$('nk-env-accent').value=c.accent_color;
   }
  }catch(_){}
  try{
   const popRes=await sb.from('site_popups').select('*').order('order_num');
   if(!popRes.error&&Array.isArray(popRes.data)){popupRows=popRes.data;renderPopupList();}
  }catch(_){}
 }
 if($('nk-env-save-btn'))$('nk-env-save-btn').addEventListener('click',async()=>{
  try{
   const tbl=sb.from('site_config');if(!tbl||typeof tbl.upsert!=='function'){setEnvStatus('현재 환경에서는 환경 설정 저장을 지원하지 않습니다.');return;}
   const payload={id:1,company_name:($('nk-env-company')?.value||'').trim(),ceo_name:($('nk-env-ceo')?.value||'').trim(),address:($('nk-env-address')?.value||'').trim(),phone:($('nk-env-phone')?.value||'').trim(),primary_color:$('nk-env-primary')?.value||'#1a3c6e',accent_color:$('nk-env-accent')?.value||'#b85a17'};
   if(key==='main'){
    const h=doc.hero||{};
    Object.assign(payload,{main_hero_title:doc.title||'',main_hero_desc:doc.description||'',main_hero_bg_color:h.background||'#f7f0e4',main_hero_title_color:h.titleColor||'#172451',main_hero_desc_color:h.descriptionColor||'#545b6e'});
   }
   const res=await tbl.upsert(payload);if(res?.error)throw res.error;
   doc.layout=doc.layout||{};doc.layout.primaryColor=payload.primary_color;doc.layout.accentColor=payload.accent_color;
   fill();changed();
   setEnvStatus('환경 설정(회사 정보 · 브랜드 컬러 · 메인 배너 DB)이 저장되었습니다.');
  }catch(err){setEnvStatus('환경 설정 저장 실패: '+err.message);}
 });
 if($('nk-env-reset-brand'))$('nk-env-reset-brand').addEventListener('click',()=>{
  if($('nk-env-primary'))$('nk-env-primary').value='#1a3c6e';
  if($('nk-env-accent'))$('nk-env-accent').value='#b85a17';
  doc.layout=doc.layout||{};doc.layout.primaryColor='#1a3c6e';doc.layout.accentColor='#b85a17';
  fill();changed();setEnvStatus('기본 브랜드 컬러(#1a3c6e / #b85a17)로 복원했습니다.');
 });
 if($('nk-popup-file'))$('nk-popup-file').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{const dataUrl=await fileToDataUrl(file);if($('nk-popup-url'))$('nk-popup-url').value=dataUrl;setEnvStatus('팝업 이미지 파일이 준비되었습니다. [새 팝업 추가]를 누르세요.');}catch(err){setEnvStatus(err.message);}
 });
 if($('nk-popup-add-btn'))$('nk-popup-add-btn').addEventListener('click',async()=>{
  const image_url=($('nk-popup-url')?.value||'').trim();
  const link_url=($('nk-popup-link')?.value||'').trim();
  const alt_text=($('nk-popup-alt')?.value||'').trim()||'공지 팝업';
  if(!image_url){setEnvStatus('팝업 이미지 주소(URL)를 입력하거나 파일을 선택하세요.');return;}
  try{
   const tbl=sb.from('site_popups');if(!tbl||typeof tbl.insert!=='function')return;
   const res=await tbl.insert({image_url,link_url,alt_text,is_active:true,order_num:popupRows.length+1});
   if(res?.error)throw res.error;
   if($('nk-popup-url'))$('nk-popup-url').value='';
   if($('nk-popup-link'))$('nk-popup-link').value='';
   if($('nk-popup-alt'))$('nk-popup-alt').value='';
   if($('nk-popup-file'))$('nk-popup-file').value='';
   await loadEnvSettings();setEnvStatus('새 공지 팝업이 추가되었습니다.');
  }catch(err){setEnvStatus('팝업 추가 실패: '+err.message);}
 });
 if($('nk-popup-reset-today'))$('nk-popup-reset-today').addEventListener('click',()=>{
  try{localStorage.removeItem('hide_main_popup_date');}catch(_){}
  setEnvStatus("이 브라우저의 '오늘 하루 열지 않기' 설정이 해제되었습니다.");
 });
 $('page').addEventListener('change',()=>{if(dirty&&!confirm('저장하지 않은 변경을 버리고 이동할까요?')){$('page').value=key;return;}select();});
 $('cancel').addEventListener('click',()=>{if(busy||!confirm('저장된 초안으로 되돌릴까요?'))return;doc=clone(saved);dirty=false;fill();preview();emitState('cancel');status('저장된 초안을 불러왔습니다.');});
 $('save').addEventListener('click',async()=>{lock(true);try{await save();status('초안 v'+version+' 저장 완료. 공개 사이트는 변경되지 않았습니다.');}catch(error){status('저장 실패: '+error.message);}finally{lock(false);fill();}});
 $('publish').addEventListener('click',async()=>{if(busy||!confirm('현재 수정본을 저장하고 공개 홈페이지에 반영할까요? 공통 설정은 이를 사용하는 모든 페이지에 영향을 줍니다.'))return;lock(true);try{await save();const {data,error}=await sb.rpc('page_editor_publish',{p_page_key:key,p_expected_draft_version:version});if(error)throw error;const row=Array.isArray(data)?data[0]:data;published=clone(row.document);if(key==='page:defaults')common=clone(row.document);if(key==='main')await syncMainPublicationToSiteConfig(row.document);await window.__nkEditorFallback.markPublished(sb,key,row.document,row.version);await readHistory();emitState('publish');status('공개본 v'+row.version+' 저장 완료. 공개 페이지를 새로 열어 결과를 확인하세요.');}catch(error){status('공개 처리 실패: '+error.message);}finally{lock(false);fill();}});
 $('compare').addEventListener('click',()=>{const changes=[];const fmt=v=>v===undefined||v===null?'없음':typeof v==='boolean'?(v?'사용':'미사용'):typeof v==='string'?v:JSON.stringify(v);function walk(a,b,path){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){new Set([...Object.keys(a),...Object.keys(b)]).forEach(k=>walk(a[k],b[k],path?path+'.'+k:k));}else changes.push((diffLabels[path]||path)+': '+fmt(a)+' → '+fmt(b));}walk(published,doc,'');$('diff').textContent=changes.join('\n')||'공개본과 차이가 없습니다.';$('diff-dialog').showModal();});
 $('close-diff').addEventListener('click',()=>$('diff-dialog').close());
 $('diff-dialog').addEventListener('click',event=>{if(event.target===$('diff-dialog'))$('diff-dialog').close();});
 document.querySelectorAll('[data-width]').forEach(button=>button.addEventListener('click',()=>{$('preview').style.width=button.dataset.width+'px';}));
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
 window.addEventListener('message',event=>{if(event.source!==$('preview').contentWindow||event.origin!==location.origin)return;if(event.data?.type==='nk-page-editor-preview-ready')preview();if(event.data?.type==='nk-page-editor-preview-applied')$('preview-status').textContent='초안 미리보기 반영됨 · 읽기 전용';});
 $('preview').addEventListener('load',()=>{try{const win=$('preview').contentWindow;const frameDoc=$('preview').contentDocument;frameDoc.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();try{if(typeof window.__nkOnPreviewClick==='function')window.__nkOnPreviewClick(e.target);}catch(_){}},true);frameDoc.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);if(win.NKPageDesign)preview();else{const script=frameDoc.createElement('script');script.src=new URL('page-design.js?v=1',base).href;script.onload=preview;frameDoc.head.appendChild(script);}}catch(_){$('preview-status').textContent='미리보기 연결 실패: 같은 주소의 페이지인지 확인하세요.';}});
 window.__nkEditorBridge={
  getState(){
   const option=options.find(o=>o.key===key)||options[0]||{key,row:{}};
   return {key,doc:clone(doc),saved:clone(saved),published:clone(published),common:clone(common),dirty,busy,allowed,pageLoaded,baseline:baseline(option),catRows:clone(catRows),popupRows:clone(popupRows)};
  },
  applyDoc(nextDoc,opts={}){
   if(busy||!nextDoc||typeof nextDoc!=='object')return false;
   const option=options.find(o=>o.key===key)||options[0]||{key,row:{}};
   const b=baseline(option);
   doc=clone(nextDoc);
   doc.hero={...b.hero,...(doc.hero||{})};
   doc.sections=doc.sections||b.sections;
   doc.button=doc.button||b.button;
   dirty=opts.dirty!==false;
   fill();preview();
   if(opts.status)status(opts.status);
   else if(dirty)status('저장되지 않은 변경 사항이 있습니다. 공개 사이트에는 아직 반영되지 않았습니다.');
   emitState(opts.reason||'apply');
   return true;
  },
  getPreviewUrl(){return $('preview')?.src||'';},
  preview
 };
 async function enter(){
  const {data,error}=await sb.rpc('page_editor_is_admin');if(error)throw error;if(data!==true)throw new Error('지정된 관리자 계정만 사용할 수 있습니다.');
  const result=await sb.from('program_categories').select('*').order('order_num');if(result.error)throw result.error;
  buildOptions(result.data||[]);
  renderSubpageManager();
  await loadEnvSettings();
  allowed=true;$('login').hidden=true;$('workspace').hidden=false;await select();
 }
 $('login').addEventListener('submit',async event=>{event.preventDefault();const button=$('login').querySelector('button');button.disabled=true;try{const result=await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});$('password').value='';if(result.error)throw result.error;await enter();}catch(error){status(error.message);}finally{button.disabled=false;}});
 (async()=>{try{const {data,error}=await sb.auth.getSession();if(error)throw error;if(data.session)await enter();else{$('login').hidden=false;status('지정된 관리자 계정으로 로그인해 주세요.');}}catch(error){$('login').hidden=false;status(error.message);}})();
})();
