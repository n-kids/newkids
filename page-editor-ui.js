/* Presentation adapters. Saving and publishing stay in page-editor.js. */
(() => {
 'use strict';
 const page=document.getElementById('page'),frame=document.getElementById('preview');
 const preset=document.getElementById('preset'),inherit=document.getElementById('inherit');
 if(!page||!frame||!preset||!inherit)return;
 const tabs=[...document.querySelectorAll('[data-page-kind]')];
 const pills=[...document.querySelectorAll('[data-preset]')];
 const widths=[...document.querySelectorAll('[data-width]')];
 const viewBtns=[...document.querySelectorAll('[data-editor-view]')];
 let lastSub='',currentView='banner';
 function syncView(mode){
  const changedView=mode&&mode!==currentView;
  currentView=mode||currentView;
  viewBtns.forEach(btn=>{const on=btn.dataset.editorView===currentView;btn.classList.toggle('active',on);btn.setAttribute('aria-pressed',String(on));});
  document.querySelectorAll('[data-view-group]').forEach(el=>{
   const groups=String(el.dataset.viewGroup||'').split(/\s+/);
   el.classList.toggle('nk-tab-hidden',currentView!=='all'&&!groups.includes(currentView));
  });
  if(changedView){const s=document.querySelector('.settings');if(s&&s.getBoundingClientRect().top<0)s.scrollIntoView({block:'start'});}
 }
 viewBtns.forEach(btn=>btn.addEventListener('click',()=>syncView(btn.dataset.editorView)));
 window.__nkSetEditorView=syncView;
 function sync(){
  const main=page.value==='main';
  if(page.value&&!main)lastSub=page.value;
  tabs.forEach(button=>{const active=(button.dataset.pageKind==='main')===main;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.disabled=page.disabled||!page.options.length;});
  pills.forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.preset===preset.value));button.disabled=preset.disabled||document.getElementById('fields').disabled;});
  document.getElementById('theme-status').textContent=page.value==='page:defaults'?'공통 배너 기본값 편집 중':inherit.checked?'공통 테마 사용 중':'개별 테마 설정';
  document.getElementById('compare-panel').disabled=document.getElementById('compare').disabled;
 }
 tabs.forEach(button=>button.addEventListener('click',()=>{
  const options=[...page.options];
  const value=button.dataset.pageKind==='main'?'main':options.find(option=>option.value===lastSub)?.value||options.find(option=>option.value==='page:reference')?.value||options.find(option=>option.value!=='main')?.value;
  if(!value||value===page.value)return;page.value=value;page.dispatchEvent(new Event('change',{bubbles:true}));sync();
 }));
 pills.forEach(button=>button.addEventListener('click',()=>{if(button.disabled)return;preset.value=button.dataset.preset;preset.dispatchEvent(new Event('input',{bubbles:true}));sync();}));
 document.getElementById('compare-panel').addEventListener('click',()=>document.getElementById('compare').click());
 const diff=document.getElementById('diff');
 new MutationObserver(()=>{document.getElementById('inline-diff').textContent=diff.textContent||'변경 비교를 누르면 상세 변경 내역이 표시됩니다.';}).observe(diff,{childList:true,subtree:true,characterData:true});
 const status=document.getElementById('status');
 function syncBadge(){
  const text=status.textContent,badge=document.getElementById('publication-status');
  if(!badge)return;
  if(text.includes('새 공개본 없음'))badge.textContent='미공개';
  else if(text.includes('새 편집기 공개본 있음'))badge.textContent='공개본 있음';
  else if(text.startsWith('공개본 v'))badge.textContent=text.split(' 저장')[0];
  else if(text.startsWith('불러오기 실패'))badge.textContent='확인 불가';
  sync();
 }
 new MutationObserver(syncBadge).observe(status,{childList:true,subtree:true,characterData:true});
 syncBadge();
 new MutationObserver(sync).observe(page,{childList:true,attributes:true,attributeFilter:['disabled']});
 new MutationObserver(sync).observe(preset,{attributes:true,attributeFilter:['disabled']});
 page.addEventListener('change',sync);inherit.addEventListener('input',sync);preset.addEventListener('input',sync);
 const viewport=frame.parentElement;
 const previewBox=document.querySelector('.preview');
 const toolbar=document.querySelector('.preview-toolbar');
 const sizeCaps={compact:260,normal:420,large:0};
 let previewSize='normal',selectedWidth=1280;
 try{const s=localStorage.getItem('nk_editor_preview_size');if(s&&s in sizeCaps)previewSize=s;}catch(_){}
 const isOpen=()=>document.body.classList.contains('nk-preview-open');
 const isDual=()=>document.body.classList.contains('nk-dual-preview');
 function fit(){
  if(!viewport.clientWidth)return;
  const open=isOpen(),dual=open&&isDual();
  const baseW=selectedWidth||parseInt(frame.style.width,10)||1280;
  const availW=Math.max(240,viewport.clientWidth-24);
  if(open&&!dual){
   frame.style.marginRight='';
   if(baseW>=1280&&availW>1280){
    frame.style.width=availW+'px';frame.style.margin='0';
    frame.style.transform='none';
    frame.style.height=Math.max(600,viewport.clientHeight-24)+'px';
    return;
   }
   frame.style.width=baseW+'px';
   const scale=Math.min(1,Math.max(.1,availW/baseW));
   frame.style.transform=scale===1?'none':'scale('+scale+')';
   frame.style.margin=scale===1&&baseW<availW?'0 auto':'0';
   frame.style.height=Math.max(600,Math.ceil((viewport.clientHeight-24)/scale))+'px';
   return;
  }
  if(dual){
   const pcAvail=Math.max(320,viewport.clientWidth-390-44);
   frame.style.margin='0';
   if(pcAvail>=1280){
    frame.style.width=pcAvail+'px';frame.style.transform='none';frame.style.marginRight='';
    frame.style.height=Math.max(600,viewport.clientHeight-24)+'px';
   }else{
    const scale=Math.max(.1,pcAvail/1280);
    frame.style.width='1280px';frame.style.transform='scale('+scale+')';
    frame.style.marginRight=-(1280-Math.round(1280*scale))+'px';
    frame.style.height=Math.max(600,Math.ceil((viewport.clientHeight-24)/scale))+'px';
   }
   return;
  }
  frame.style.width=baseW+'px';frame.style.margin='0';frame.style.marginRight='';
  let scale=Math.min(1,Math.max(.1,availW/baseW));
  const stacked=window.innerWidth<=850;
  const cap=sizeCaps[previewSize];
  if(stacked&&cap)scale=Math.min(scale,Math.max(.1,(cap-24)/760));
  const transform='scale('+scale+')';if(frame.style.transform!==transform)frame.style.transform=transform;
  if(frame.style.height)frame.style.height='';
  const height=Math.max(200,Math.ceil(760*scale)+24)+'px';if(viewport.style.height!==height)viewport.style.height=height;
 }
 /* Preview size presets (작게 / 보통 / 크게) */
 const sizeGroup=document.createElement('div');sizeGroup.className='nk-preview-size';sizeGroup.setAttribute('role','group');sizeGroup.setAttribute('aria-label','미리보기 크기');
 const sizeLabel=document.createElement('span');sizeLabel.textContent='크기';sizeGroup.append(sizeLabel);
 const sizeBtns=[['compact','작게'],['normal','보통'],['large','크게']].map(([v,t])=>{const b=document.createElement('button');b.type='button';b.dataset.previewSize=v;b.textContent=t;b.addEventListener('click',()=>{previewSize=v;try{localStorage.setItem('nk_editor_preview_size',v);}catch(_){}syncSize();fit();requestAnimationFrame(fit);});sizeGroup.append(b);return b;});
 function syncSize(){document.body.dataset.nkPreviewSize=previewSize;sizeBtns.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.previewSize===previewSize)));}
 const closeBtn=document.createElement('button');closeBtn.type='button';closeBtn.id='nk-preview-close';closeBtn.className='nk-preview-close primary';closeBtn.textContent='점검 닫기 (Esc)';
 if(toolbar){const label=toolbar.querySelector(':scope>span');toolbar.insertBefore(sizeGroup,label||null);toolbar.append(closeBtn);}
 syncSize();
 /* Mid-check overlay: enlarges the same iframe (no reload) above the editor */
 const backdrop=document.createElement('div');backdrop.id='nk-preview-backdrop';backdrop.hidden=true;document.body.append(backdrop);
 const fab=document.createElement('button');fab.type='button';fab.id='nk-check-fab';fab.textContent='🔍 중간 점검 (미리보기 크게 보기)';fab.setAttribute('aria-label','현재 수정 내용을 큰 미리보기로 중간 점검');document.body.append(fab);
 function setOpen(on){
  document.body.classList.toggle('nk-preview-open',on);backdrop.hidden=!on;
  if(previewBox){if(on){previewBox.setAttribute('role','dialog');previewBox.setAttribute('aria-modal','true');previewBox.setAttribute('aria-label','중간 점검 미리보기');}else{previewBox.removeAttribute('role');previewBox.removeAttribute('aria-modal');previewBox.removeAttribute('aria-label');}}
  requestAnimationFrame(fit);if(on)closeBtn.focus();else fab.focus();
 }
 window.__nkSetPreviewOpen=setOpen;
 fab.addEventListener('click',()=>setOpen(true));
 closeBtn.addEventListener('click',()=>setOpen(false));
 backdrop.addEventListener('click',()=>setOpen(false));
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&isOpen()&&!document.querySelector('dialog[open]'))setOpen(false);});
 const workspace=document.getElementById('workspace');
 const syncFab=()=>{fab.hidden=!workspace||workspace.hidden;};
 if(workspace)new MutationObserver(syncFab).observe(workspace,{attributes:true,attributeFilter:['hidden']});
 syncFab();
 /* Quick collapse / expand of every detailed settings block */
 const picker=document.querySelector('.page-picker');
 if(picker){
  const tools=document.createElement('div');tools.className='nk-quick-tools';
  const collapse=document.createElement('button');collapse.type='button';collapse.id='nk-collapse-all';collapse.textContent='상세 설정 모두 접기';
  const expand=document.createElement('button');expand.type='button';expand.id='nk-expand-all';expand.textContent='모두 펼치기';
  collapse.addEventListener('click',()=>document.querySelectorAll('.settings details').forEach(d=>{d.open=false;}));
  expand.addEventListener('click',()=>document.querySelectorAll('.settings details').forEach(d=>{d.open=true;}));
  tools.append(collapse,expand);picker.append(tools);
 }
 /* Scroll the preview to the section that is being edited */
 function targetFor(el){
  const id=el.id||'';
  if(/^ql/.test(id))return '#quick-links';if(/^ev/.test(id))return '#events';if(/^cu/.test(id))return '#curriculum';if(/^ct/.test(id))return '#contact';
  if(/^layFooter/.test(id))return 'footer';
  if(el.closest('#subpage-design-card'))return '@body';
  return '@top';
 }
 function scrollPreview(target){
  try{
   const w=frame.contentWindow,d=frame.contentDocument;if(!w||!d||!d.body)return;
   let top=0;
   if(target==='@body'){const h=d.querySelector('#view-hero,#page-hero,.hero,.ai-hero');top=h?h.offsetTop+h.offsetHeight-40:0;}
   else if(target!=='@top'){const el=d.querySelector(target);if(!el)return;top=el.getBoundingClientRect().top+w.scrollY-20;}
   w.scrollTo({top:Math.max(0,top),behavior:'smooth'});
  }catch(_){}
 }
 const fieldsEl=document.getElementById('fields');
 if(fieldsEl)fieldsEl.addEventListener('focusin',e=>{if(e.target.matches('input,textarea,select'))scrollPreview(targetFor(e.target));});
 widths.forEach(button=>button.addEventListener('click',()=>{selectedWidth=parseInt(button.dataset.width,10)||1280;widths.forEach(other=>{other.classList.toggle('active',other===button);other.setAttribute('aria-pressed',String(other===button));});fit();}));
 if(window.ResizeObserver)new ResizeObserver(fit).observe(viewport);
 window.addEventListener('resize',fit);
 frame.addEventListener('load',fit);sync();syncView('banner');fit();
})();

/* Publication preflight. This module never calls a database API. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const publish=$('publish');
 if(!publish||$('nk-preflight-dialog'))return;
 const dialog=document.createElement('dialog');dialog.id='nk-preflight-dialog';dialog.setAttribute('aria-labelledby','nk-preflight-title');
 const title=document.createElement('h2');title.id='nk-preflight-title';title.textContent='공개 전 확인';
 const intro=document.createElement('p');intro.textContent='점검표 확인 후에도 기존 공개 확인 절차를 거칩니다. 이 창을 여는 것만으로 저장하거나 공개하지 않습니다.';
 const results=document.createElement('ul');results.id='nk-preflight-results';
 const summary=document.createElement('p');summary.id='nk-preflight-summary';summary.setAttribute('role','status');
 const actions=document.createElement('div');actions.className='actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.id='nk-preflight-cancel';cancel.textContent='계속 편집';
 const confirm=document.createElement('button');confirm.type='button';confirm.id='nk-preflight-confirm';confirm.className='primary';confirm.textContent='점검 내용 확인 후 공개 진행';
 actions.append(cancel,confirm);dialog.append(title,intro,results,summary,actions);document.body.append(dialog);
 const style=document.createElement('style');style.textContent='#nk-preflight-dialog{max-height:85vh;overflow:auto}#nk-preflight-dialog p{font-size:13px}#nk-preflight-results{padding:0;list-style:none}#nk-preflight-results li{padding:10px 12px;margin:6px 0;background:#f4f6fa;border-radius:8px;font-size:13px;overflow-wrap:anywhere}#nk-preflight-results .preflight-error{background:#fff0ee;color:#a52820}#nk-preflight-results .preflight-warning{background:#faf4e9;color:#6b5123}#nk-preflight-summary{font-weight:700}';document.head.append(style);
 let approvedClick=false, snapshot='';
 function fingerprint(){return JSON.stringify({page:$('page').value,fields:[...document.querySelectorAll('#fields input,#fields textarea,#fields select')].map(el=>[el.id,el.value,el.checked])});}
 function check(){
  results.replaceChildren();let errors=0;
  const item=(label,text,kind='')=>{const li=document.createElement('li');if(kind)li.className='preflight-'+kind;li.textContent=label+' · '+text;results.append(li);if(kind==='error')errors++;};
  const key=$('page').value;const label=$('page').selectedOptions[0]?.textContent||key;
  item('공개 대상',label+' ('+key+')');
  if(!/^(main|page:[a-zA-Z0-9_-]+)$/.test(key))item('페이지','유효한 편집 대상을 선택하세요.','error');
  const heading=$('title').value.trim();
  if(!heading)item('제목','공백만 있는 제목은 공개할 수 없습니다.','error');
  else if(heading.length>200)item('제목','200자 이하로 입력하세요.','error');
  else item('제목',heading);
  const description=$('description').value;
  if(description.length>1000)item('설명','1000자 이하로 입력하세요.','error');
  else item('설명',description.trim()?description.length+'자':'설명 없이 공개됩니다.',description.trim()?'':'warning');
  const inherited=$('inherit').checked;
  if(inherited)item('배너 설정','공통 공개본의 값을 사용합니다. 이 화면의 비활성화된 개별 수치는 적용되지 않습니다.','warning');
  else {
   const labels={desktopHeight:'PC 최소 높이',mobileHeight:'모바일 최소 높이',desktopPadding:'PC 상하 여백',mobilePadding:'모바일 상하 여백'};
   Object.entries(labels).forEach(([id,name])=>{const input=$(id),value=input.valueAsNumber;const valid=Number.isInteger(value)&&value>=Number(input.min)&&value<=Number(input.max);item(name,valid?value+'px':input.min+'~'+input.max+' 범위의 정수를 입력하세요.',valid?'':'error');});
  }
  if(key==='page:defaults')item('영향 범위','공통 설정 사용을 켜고 새 편집기로 공개한 모든 페이지에 영향을 줍니다.','warning');
  if(key==='main'){
   if(!$('buttonText').value.trim())item('메인 버튼','버튼 문구를 입력하세요.','error');
   const raw=$('buttonUrl').value.trim();let valid=false;
   try{const url=new URL(raw,location.href);valid=Boolean(raw)&&['http:','https:','tel:','mailto:'].includes(url.protocol);}catch(_){}
   item('버튼 연결 주소',valid?raw:'허용된 웹주소·상대경로·전화·이메일 주소를 입력하세요.',valid?'':'error');
   if(valid)item('링크 확인','주소 형식만 검사했습니다. 연결된 페이지의 실제 응답은 확인하지 않았습니다.','warning');
  }
  item('모바일 확인','높이 범위 검사는 화면 잘림 검증이 아닙니다. 모바일 미리보기도 확인하세요.','warning');
  summary.textContent=errors?'오류 '+errors+'건을 수정한 뒤 다시 시도하세요.':'입력 점검 통과. 대상과 영향 범위를 확인한 뒤 진행하세요.';
  confirm.disabled=errors>0;return errors===0;
 }
 document.addEventListener('click',event=>{
  if(!event.target.closest('#publish')||approvedClick||publish.disabled)return;
  event.preventDefault();event.stopImmediatePropagation();
  snapshot=fingerprint();check();if(!dialog.open)dialog.showModal();cancel.focus();
 },true);
 cancel.addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
 dialog.addEventListener('close',()=>publish.focus());
 confirm.addEventListener('click',()=>{
  if(publish.disabled){summary.textContent='다른 작업이 진행 중입니다. 작업이 끝난 뒤 다시 시도하세요.';return;}
  if(snapshot!==fingerprint()){snapshot=fingerprint();check();summary.textContent='점검 중 입력이 바뀌었습니다. 갱신된 내용을 다시 확인하세요.';return;}
  if(!check())return;dialog.close();approvedClick=true;
  try{publish.click();}finally{approvedClick=false;}
 });
})();
