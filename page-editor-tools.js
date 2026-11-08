/* Editor extensions: draft-only copy, publication summary, advisory quality checks. */
(() => {
 'use strict';
 const heroKeys=['preset','desktopHeight','mobileHeight','desktopPadding','mobilePadding','titleColor','descriptionColor','background','decoration'];
 const labels={title:'제목',description:'설명',inherit:'공통 설정 사용','button.text':'버튼 문구','button.url':'버튼 주소',sections:'섹션 표시·순서'};
 for(const key of heroKeys)labels['hero.'+key]=({preset:'프리셋',desktopHeight:'PC 높이',mobileHeight:'모바일 높이',desktopPadding:'PC 여백',mobilePadding:'모바일 여백',titleColor:'제목 색',descriptionColor:'설명 색',background:'배경색',decoration:'장식 표시'})[key];
 const value=(object,key)=>key.split('.').reduce((result,part)=>result?.[part],object);
 function changes(before,after){return Object.entries(labels).filter(([key])=>JSON.stringify(value(before,key))!==JSON.stringify(value(after,key))).map(([key,label])=>({label,before:value(before,key),after:value(after,key)}));}
 function contrast(a,b){
  const luminance=hex=>{if(!/^#[0-9a-f]{6}$/i.test(hex||''))return NaN;const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
  const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
 }
 function quality(doc){
  const warnings=[];const title=String(doc.title||'').trim();
  if(!title)warnings.push('제목이 비어 있습니다.');
  if(title.length>50)warnings.push('제목이 깁니다. 모바일 줄바꿈을 확인하세요.');
  if(String(doc.description||'').length>300)warnings.push('설명이 깁니다. 모바일 화면에서 확인하세요.');
  if(doc.inherit)warnings.push('상속된 색상·높이는 공통 공개본에서 별도로 확인하세요.');
  else {const h=doc.hero||{};for(const [key,label,min] of [['titleColor','제목',3],['descriptionColor','설명',4.5]]){const ratio=contrast(h[key],h.background);if(Number.isFinite(ratio)&&ratio<min)warnings.push(label+' 색 대비가 낮습니다 ('+ratio.toFixed(2)+':1). 실제 글자 크기와 배경을 확인하세요.');}}
  return warnings;
 }
 const api={changes,contrast,quality};
 if(typeof module==='object'&&module.exports){module.exports=api;return;}
 window.NKEditorTools=api;
 const $=id=>document.getElementById(id);
 if(!$('workspace')||!$('nk-preflight-dialog'))return;
 const numeric=new Set(['desktopHeight','mobileHeight','desktopPadding','mobilePadding']);
 function current(){const hero={};for(const key of heroKeys)hero[key]=key==='decoration'?$(key).checked:numeric.has(key)?Number($(key).value):$(key).value;return {title:$('title').value,description:$('description').value,inherit:$('inherit').checked,hero,button:{text:$('buttonText').value,url:$('buttonUrl').value},sections:[...$('sections').children].map(row=>({label:row.querySelector('label')?.textContent,visible:row.querySelector('input')?.checked}))};}
 const fingerprint=()=>JSON.stringify({key:$('page').value,document:current()});
 let client;
 function db(){
  if(client)return client;
  const token='sb-'+new URL(CONFIG.SUPABASE_URL).hostname.split('.')[0]+'-auth-token';let storage=sessionStorage;
  try{if(!sessionStorage.getItem(token)&&localStorage.getItem(token))storage=localStorage;}catch(_){}
  return client=supabase.createClient(CONFIG.SUPABASE_URL,CONFIG.SUPABASE_KEY,{auth:{persistSession:true,storage}});
 }
 async function timed(operation){let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('조회 시간 초과. 다시 시도하세요.')),8000);})]);}finally{clearTimeout(timer);}}
 async function read(table,key){const result=await timed(db().from(table).select('page_key,document').eq('page_key',key).maybeSingle());if(result.error)throw result.error;return result.data?.document||null;}
 function element(tag,text){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;}
 function list(target,items){target.replaceChildren();for(const text of items)target.append(element('li',text));}
 function show(v){if(v===undefined||v===null)return '없음';if(typeof v==='boolean')return v?'사용':'미사용';return typeof v==='object'?JSON.stringify(v):String(v);}
 function displaySections(doc){if(!doc)return {};const names={'quick-links':'바로가기·주문 앱 안내',events:'행사 프로그램',curriculum:'교육 프로그램',contact:'상담 안내'};return {...doc,sections:(doc.sections||[]).map(s=>({label:names[s.id]||s.label||s.id,visible:s.visible!==false}))};}
 function imageWarnings(){try{const frame=$('preview').contentDocument;if(!frame)return ['미리보기 로드 후 이미지 설명을 다시 확인하세요.'];const count=[...frame.images].filter(img=>!img.hasAttribute('alt')).length;return count?['대체 설명 속성이 없는 이미지 '+count+'개. 장식용 이미지 여부도 확인하세요.']:[];}catch(_){return ['이미지 설명을 자동 확인하지 못했습니다.'];}}
 const card=element('section');card.className='editor-card';card.id='nk-editor-tools';
 card.append(element('h2','복사·품질 점검'),element('p','복사는 현재 초안만 수정합니다. 저장·공개는 별도로 진행하세요.'));
 const sourceLabel=element('label','복사할 원본 페이지');const source=element('select');source.id='nk-copy-source';sourceLabel.append(source);card.append(sourceLabel);
 const textLabel=element('label');const includeText=element('input');includeText.type='checkbox';includeText.id='nk-copy-text';textLabel.append(includeText,document.createTextNode(' 제목·설명도 복사'));card.append(textLabel);
 const copy=element('button','디자인을 현재 초안으로 복사');copy.type='button';copy.id='nk-copy-design';
 const check=element('button','콘텐츠 품질 점검');check.type='button';check.id='nk-quality-check';
 const feedback=element('p');feedback.id='nk-tools-status';feedback.setAttribute('role','status');const warnings=element('ul');warnings.id='nk-quality-results';card.append(copy,check,feedback,warnings);document.querySelector('.settings').append(card);
 let copying=false;
 function sync(){const selected=source.value;source.replaceChildren();for(const option of $('page').options){if(option.value===$('page').value)continue;const item=element('option',option.textContent);item.value=option.value;source.append(item);}if([...source.options].some(option=>option.value===selected))source.value=selected;copy.disabled=copying||$('fields').disabled||!source.options.length;source.disabled=copying||$('fields').disabled;includeText.disabled=copying||$('fields').disabled;check.disabled=$('fields').disabled;}
 new MutationObserver(sync).observe($('page'),{childList:true,attributes:true,attributeFilter:['disabled']});
 new MutationObserver(sync).observe($('fields'),{attributes:true,attributeFilter:['disabled']});$('page').addEventListener('change',sync);sync();
 copy.addEventListener('click',async()=>{
  if(copy.disabled||!confirm('선택한 페이지의 디자인으로 현재 초안을 수정할까요? 저장·공개는 하지 않습니다.'))return;
  const before=fingerprint(),key=source.value,withText=includeText.checked;copying=true;sync();feedback.textContent='원본 조회 중...';
  try{
   const draft=await read('page_editor_drafts',key);let document=draft||await read('page_editor_publications',key);
   if(document?.inherit){const common=await read('page_editor_publications','page:defaults');if(!common?.hero)throw new Error('공통 공개 디자인이 없습니다.');document={...document,hero:common.hero};}
   if(!document?.hero)throw new Error('저장된 디자인이 없습니다. 원본 페이지의 초안을 먼저 저장하세요.');
   if(before!==fingerprint()||$('fields').disabled)throw new Error('현재 페이지나 입력이 바뀌었습니다. 다시 복사하세요.');
   const updates=[['inherit',false],...heroKeys.filter(key=>document.hero[key]!==undefined).map(key=>[key,document.hero[key]])];
   if(withText)updates.push(['title',document.title||''],['description',document.description||'']);
   for(const [id,value] of updates){const input=$(id);if(input.type==='checkbox')input.checked=Boolean(value);else input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));}
   feedback.textContent='현재 초안에 복사했습니다. 아직 저장하거나 공개하지 않았습니다.';
  }catch(error){feedback.textContent='복사 실패: '+error.message;}finally{copying=false;sync();}
 });
 check.addEventListener('click',()=>{list(warnings,[...quality(current()),...imageWarnings()]);feedback.textContent=warnings.children.length?'주의 항목을 확인하세요. 자동 점검은 접근성·화면 검증을 대체하지 않습니다.':'자동 점검에서 주의 항목이 없습니다. 실제 PC·모바일 화면도 확인하세요.';});
 const dialog=$('nk-preflight-dialog'),confirmButton=$('nk-preflight-confirm');const summary=element('section');summary.id='nk-change-summary';const heading=element('h3','공개 전 변경 요약');const note=element('p');const details=element('ul');summary.append(heading,note,details);dialog.insertBefore(summary,$('nk-preflight-summary'));
 let generation=0,pending=false,summaryFingerprint='';
 async function summarize(){
  const request=++generation;if(!dialog.open){pending=false;return;}
  const initiallyDisabled=confirmButton.disabled;confirmButton.disabled=true;pending=true;summaryFingerprint='';note.textContent='현재 공개본 조회 중...';details.replaceChildren();const stamp=fingerprint(),key=$('page').value,document=current();
  try{
   const published=await read('page_editor_publications',key);
   let impact=[];
   if(key==='page:defaults'){const result=await timed(db().from('page_editor_publications').select('page_key,document'));if(result.error)throw result.error;impact=(result.data||[]).filter(row=>row.document?.inherit===true).map(row=>row.page_key);}
   if(request!==generation||!dialog.open)return;
   if(stamp!==fingerprint())throw new Error('입력이 바뀌었습니다. 점검창을 닫고 다시 공개를 눌러 주세요.');
   const items=changes(displaySections(published),document).map(change=>change.label+': '+show(change.before)+' → '+show(change.after));
   items.push(...quality(document).map(text=>'주의: '+text));
   if(key==='page:defaults')items.push('공통 설정을 사용하는 현재 공개 페이지: '+(impact.join(', ')||'없음'));
   list(details,items.length?items:['새 편집기 공개본과 비교해 변경된 항목이 없습니다.']);
   note.textContent=published?'현재 새 편집기 공개본과 비교했습니다.':'새 편집기 공개본이 없습니다. 기존 홈페이지 설정과의 완전한 비교는 아닙니다.';
   summaryFingerprint=stamp;confirmButton.disabled=initiallyDisabled;
  }catch(error){if(request===generation&&dialog.open){note.textContent='변경 요약 확인 실패: '+error.message;confirmButton.disabled=true;}}
  finally{if(request===generation)pending=false;}
 }
 new MutationObserver(summarize).observe(dialog,{attributes:true,attributeFilter:['open']});
 window.addEventListener('click',event=>{if(!event.target.closest?.('#nk-preflight-confirm')||!dialog.open)return;if(pending||summaryFingerprint!==fingerprint()){event.preventDefault();event.stopImmediatePropagation();if(!pending)summarize();}},true);
})();
