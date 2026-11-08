(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const fields=['title','description','inherit','preset','desktopHeight','mobileHeight','desktopPadding','mobilePadding','titleColor','descriptionColor','background','decoration','buttonText','buttonUrl'];
 const numeric=['desktopHeight','mobileHeight','desktopPadding','mobilePadding'];
 const heroFields=['preset',...numeric,'titleColor','descriptionColor','background','decoration'];
 const sectionNames={'quick-links':'바로가기·주문 앱 안내',events:'행사 프로그램',curriculum:'교육 프로그램',contact:'상담 안내'};
 const presets={small:[220,180,40,32],normal:[320,240,64,44],large:[560,440,80,56]};
 const base=new URL('.',location.href);
 const tokenKey='sb-jmdyqdckclgfyimqpqce-auth-token';
 let storage=sessionStorage;try{if(!sessionStorage.getItem(tokenKey)&&localStorage.getItem(tokenKey))storage=localStorage;}catch(_){}
 const sb=supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_KEY,{auth:{persistSession:true,storage}});
 let options=[],key='main',doc={},saved={},published={},common={},version=0,dirty=false,busy=false,allowed=false;
 const clone=value=>JSON.parse(JSON.stringify(value));
 const status=text=>{$('status').textContent=text;};
 function lock(value){busy=value;$('fields').disabled=value;$('page').disabled=value;['save','publish','compare','cancel'].forEach(id=>$(id).disabled=value||!allowed);document.querySelectorAll('#history button').forEach(b=>b.disabled=value);}
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
  (data||[]).forEach(item=>{const row=document.createElement('div');row.className='history-row';row.textContent='공개 v'+item.publication_version+' · '+new Date(item.created_at).toLocaleString('ko-KR');const b=document.createElement('button');b.textContent='초안으로 복구';b.addEventListener('click',async()=>{if(busy||!confirm('이 버전을 초안으로 가져올까요? 저장하지 않은 수정은 사라집니다. 공개본은 바뀌지 않습니다.'))return;lock(true);try{const {data,error}=await sb.rpc('page_editor_restore_draft',{p_revision_id:item.id,p_expected_draft_version:version});if(error)throw error;const r=Array.isArray(data)?data[0]:data;version=r.version;doc=r.document;saved=clone(doc);dirty=false;fill();preview();status('이전 버전을 초안으로 복구했습니다. 공개하려면 공개 반영을 누르세요.');}catch(error){status('복구 실패: '+error.message);}finally{lock(false);fill();}});row.append(b);$('history').append(row);});
 }
 function route(option){if(option.key==='main')return 'index.html';if(option.key==='page:defaults')return 'notice.html#reference';const r=option.row;if(r.type==='EDU')return 'child.html#'+encodeURIComponent(r.code);if(r.type==='EVENT')return 'program.html#'+encodeURIComponent(r.code);if(r.type==='BOARD')return 'notice.html#'+encodeURIComponent(r.code);return ['order','proposal'].includes(r.code)?r.code+'.html':'page.html?id='+encodeURIComponent(r.code);}
 async function select(){
  lock(true);try{
   key=$('page').value;const option=options.find(o=>o.key===key);
   const [draftResult,pubResult,commonResult]=await Promise.all([sb.from('page_editor_drafts').select('*').eq('page_key',key).maybeSingle(),sb.from('page_editor_publications').select('*').eq('page_key',key).maybeSingle(),sb.from('page_editor_publications').select('document').eq('page_key','page:defaults').maybeSingle()]);
   for(const result of [draftResult,pubResult,commonResult])if(result.error)throw result.error;
   common=commonResult.data?.document||{};published=pubResult.data?.document||baseline(option);
   if(key==='main'&&!pubResult.data){const result=await sb.from('site_config').select('main_hero_title,main_hero_desc').eq('id',1).maybeSingle();if(!result.error&&result.data){if(result.data.main_hero_title)published.title=result.data.main_hero_title;if(result.data.main_hero_desc)published.description=result.data.main_hero_desc;}}
   doc=clone(draftResult.data?.document||published);doc.hero={...baseline(option).hero,...doc.hero};doc.sections=doc.sections||baseline(option).sections;doc.button=doc.button||baseline(option).button;
   version=draftResult.data?.version||0;saved=clone(doc);dirty=false;fill();
   const url=new URL(route(option),base);$('open-page').href=url.href;url.searchParams.set('nkpreview','1');url.searchParams.set('editor_v','1');$('preview-status').textContent='미리보기 로딩 중';$('preview').src=url.href;
   await readHistory();status('초안 v'+version+' · '+(pubResult.data?'새 편집기 공개본 있음':'새 공개본 없음: 현재 홈페이지는 기존 설정 유지'));
  }catch(error){allowed=false;status('불러오기 실패: '+error.message);}finally{lock(false);fill();}
 }
 async function save(){
  const {data,error}=await sb.rpc('page_editor_save_draft',{p_page_key:key,p_document:doc,p_expected_version:version});if(error)throw error;const row=Array.isArray(data)?data[0]:data;version=row.version;saved=clone(doc);dirty=false;
 }
 fields.forEach(id=>$(id).addEventListener('input',()=>{
  if(busy)return;
  if(id==='title'||id==='description')doc[id]=$(id).value;
  else if(id==='inherit'){doc.inherit=$(id).checked;fill();}
  else if(id==='buttonText'||id==='buttonUrl'){doc.button=doc.button||{};doc.button[id==='buttonText'?'text':'url']=$(id).value;}
  else {doc.hero=doc.hero||{};doc.hero[id]=id==='decoration'?$(id).checked:numeric.includes(id)?Number($(id).value):$(id).value;if(id==='preset'){const p=presets[$(id).value];numeric.forEach((name,i)=>doc.hero[name]=p[i]);fill();}}
  changed();
 }));
 $('page').addEventListener('change',()=>{if(dirty&&!confirm('저장하지 않은 변경을 버리고 이동할까요?')){$('page').value=key;return;}select();});
 $('cancel').addEventListener('click',()=>{if(busy||!confirm('저장된 초안으로 되돌릴까요?'))return;doc=clone(saved);dirty=false;fill();preview();status('저장된 초안을 불러왔습니다.');});
 $('save').addEventListener('click',async()=>{lock(true);try{await save();status('초안 v'+version+' 저장 완료. 공개 사이트는 변경되지 않았습니다.');}catch(error){status('저장 실패: '+error.message);}finally{lock(false);fill();}});
 $('publish').addEventListener('click',async()=>{if(busy||!confirm('현재 수정본을 저장하고 공개 홈페이지에 반영할까요? 공통 설정은 이를 사용하는 모든 페이지에 영향을 줍니다.'))return;lock(true);try{await save();const {data,error}=await sb.rpc('page_editor_publish',{p_page_key:key,p_expected_draft_version:version});if(error)throw error;const row=Array.isArray(data)?data[0]:data;published=clone(row.document);if(key==='page:defaults')common=clone(row.document);await readHistory();status('공개본 v'+row.version+' 저장 완료. 공개 페이지를 새로 열어 결과를 확인하세요.');}catch(error){status('공개 처리 실패: '+error.message);}finally{lock(false);fill();}});
 $('compare').addEventListener('click',()=>{const changes=[];function walk(a,b,path){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){new Set([...Object.keys(a),...Object.keys(b)]).forEach(k=>walk(a[k],b[k],path?path+'.'+k:k));}else changes.push(path+': '+JSON.stringify(a)+' → '+JSON.stringify(b));}walk(published,doc,'');$('diff').textContent=changes.join('\n')||'공개본과 차이가 없습니다.';$('diff-dialog').showModal();});
 $('close-diff').addEventListener('click',()=>$('diff-dialog').close());
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
