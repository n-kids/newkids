/* Power-user editor enhancements: undo/redo, drag split resize, click-to-edit,
   section resets, WCAG contrast checker, custom themes, dual PC+Mobile preview,
   autosave recovery, keyboard shortcuts, tab dirty badges, and JSON backup/restore. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const bridge=()=>window.__nkEditorBridge;
 if(!$('workspace')||!$('preview'))return;

 /* ── 1. Undo / Redo Stack ─────────────────────────────────────────── */
 const stacks=new Map();
 let undoTimer=null,lastSnapJson='';
 function getStack(k){if(!stacks.has(k))stacks.set(k,{undo:[],redo:[]});return stacks.get(k);}
 function syncUndoButtons(){
  const b=bridge();if(!b)return;
  const st=b.getState(),s=getStack(st.key);
  const u=$('nk-undo'),r=$('nk-redo');
  if(u)u.disabled=!st.pageLoaded||s.undo.length<=1;
  if(r)r.disabled=!st.pageLoaded||s.redo.length===0;
 }
 function pushSnapshot(immediate){
  const b=bridge();if(!b)return;
  const st=b.getState();if(!st.pageLoaded)return;
  const json=JSON.stringify(st.doc);
  if(json===lastSnapJson)return;
  const commit=()=>{
   const cur=b.getState(),j=JSON.stringify(cur.doc),s=getStack(cur.key);
   if(!s.undo.length)s.undo.push(cur.saved);
   if(s.undo.length&&JSON.stringify(s.undo[s.undo.length-1])===j){syncUndoButtons();return;}
   s.undo.push(JSON.parse(j));
   if(s.undo.length>40)s.undo.shift();
   s.redo=[];lastSnapJson=j;syncUndoButtons();
  };
  clearTimeout(undoTimer);
  if(immediate)commit();else undoTimer=setTimeout(commit,300);
 }
 function resetStack(){
  const b=bridge();if(!b)return;
  const st=b.getState(),s=getStack(st.key);
  s.undo=[st.doc];s.redo=[];lastSnapJson=JSON.stringify(st.doc);
  syncUndoButtons();
 }
 function doUndo(){
  const b=bridge();if(!b)return;
  clearTimeout(undoTimer);
  const st=b.getState(),s=getStack(st.key);
  if(s.undo.length<=1)return;
  const curJson=JSON.stringify(st.doc);
  if(JSON.stringify(s.undo[s.undo.length-1])!==curJson){s.redo.push(st.doc);}
  else{s.redo.push(s.undo.pop());}
  const prev=s.undo[s.undo.length-1];
  lastSnapJson=JSON.stringify(prev);
  b.applyDoc(prev,{reason:'undo',dirty:JSON.stringify(prev)!==JSON.stringify(st.saved),status:'방금 전 변경을 실행 취소했습니다.'});
  syncUndoButtons();
 }
 function doRedo(){
  const b=bridge();if(!b)return;
  const st=b.getState(),s=getStack(st.key);
  if(!s.redo.length)return;
  const next=s.redo.pop();
  s.undo.push(next);lastSnapJson=JSON.stringify(next);
  b.applyDoc(next,{reason:'redo',dirty:JSON.stringify(next)!==JSON.stringify(st.saved),status:'취소했던 변경을 다시 실행했습니다.'});
  syncUndoButtons();
 }
 const quickTools=document.querySelector('.nk-quick-tools');
 if(quickTools&&!$('nk-undo')){
  const u=document.createElement('button');u.type='button';u.id='nk-undo';u.textContent='↩ 실행 취소';u.disabled=true;u.title='실행 취소 (Ctrl+Z)';
  const r=document.createElement('button');r.type='button';r.id='nk-redo';r.textContent='↪ 다시 실행';r.disabled=true;r.title='다시 실행 (Ctrl+Y)';
  u.addEventListener('click',doUndo);r.addEventListener('click',doRedo);
  quickTools.prepend(u,r);
 }

 /* ── 2. Drag Split Resizer ────────────────────────────────────────── */
 const workspace=$('workspace'),settingsCol=document.querySelector('.settings'),previewCol=document.querySelector('.preview-column');
 if(workspace&&settingsCol&&previewCol&&!$('nk-split-handle')){
  const handle=document.createElement('div');
  handle.id='nk-split-handle';handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');
  handle.setAttribute('aria-label','좌우 영역 너비 조절 드래그 핸들');handle.title='좌우로 드래그해 편집/미리보기 비율 조절 (더블클릭 초기화)';
  workspace.insertBefore(handle,previewCol);
  try{
   const savedW=parseInt(localStorage.getItem('nk_editor_custom_right_w')||'',10);
   if(savedW>=320&&savedW<=1000&&document.body.dataset.nkPreviewSize==='custom'){
    document.documentElement.style.setProperty('--nk-right-w',savedW+'px');
   }
  }catch(_){}
  let dragging=false,startX=0,startW=0;
  const onMove=e=>{
   if(!dragging)return;
   const dx=startX-e.clientX;
   const maxW=Math.min(1020,Math.floor(workspace.getBoundingClientRect().width*0.72));
   const nextW=Math.max(320,Math.min(maxW,Math.round(startW+dx)));
   document.documentElement.style.setProperty('--nk-right-w',nextW+'px');
   document.body.dataset.nkPreviewSize='custom';
   document.querySelectorAll('[data-preview-size]').forEach(btn=>btn.setAttribute('aria-pressed','false'));
   window.dispatchEvent(new Event('resize'));
  };
  const onUp=()=>{
   if(!dragging)return;dragging=false;
   document.body.classList.remove('nk-resizing');
   try{const cur=parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nk-right-w'),10);if(cur)localStorage.setItem('nk_editor_custom_right_w',String(cur));}catch(_){}
   window.removeEventListener('pointermove',onMove);window.removeEventListener('pointerup',onUp);
  };
  handle.addEventListener('pointerdown',e=>{
   if(window.innerWidth<=850)return;
   dragging=true;startX=e.clientX;startW=previewCol.getBoundingClientRect().width;
   document.body.classList.add('nk-resizing');
   window.addEventListener('pointermove',onMove);window.addEventListener('pointerup',onUp);
  });
  handle.addEventListener('dblclick',()=>{
   document.documentElement.style.removeProperty('--nk-right-w');
   try{localStorage.removeItem('nk_editor_custom_right_w');}catch(_){}
   const normalBtn=document.querySelector('button[data-preview-size="normal"]');
   if(normalBtn)normalBtn.click();
  });
 }

 /* ── 3. Click-to-Edit in Preview ──────────────────────────────────── */
 function focusField(view,id,detailsIdx){
  if(typeof window.__nkSetEditorView==='function')window.__nkSetEditorView(view);
  if(typeof window.__nkSetPreviewOpen==='function'&&document.body.classList.contains('nk-preview-open')){
   window.__nkSetPreviewOpen(false);
  }
  const el=$(id);if(!el)return;
  const det=el.closest('details');if(det)det.open=true;
  if(typeof detailsIdx==='number'){
   const list=document.querySelectorAll('#main-sections-design details');
   if(list[detailsIdx])list[detailsIdx].open=true;
  }
  setTimeout(()=>{
   el.scrollIntoView({behavior:'smooth',block:'center'});
   el.focus({preventScroll:true});
   el.classList.remove('nk-focus-flash');void el.offsetWidth;el.classList.add('nk-focus-flash');
   const ps=$('preview-status');if(ps)ps.textContent='선택한 영역의 편집 항목으로 이동했습니다.';
  },40);
 }
 window.__nkOnPreviewClick=target=>{
  if(!target||typeof target.closest!=='function')return;
  if(target.closest('header .logo-text, header .logo'))return focusField('layout','layLogoTitle');
  if(target.closest('header .cta-menu'))return focusField('layout','layCtaBgColor');
  if(target.closest('header'))return focusField('layout','layHeaderBgColor');
  if(target.closest('footer'))return focusField('layout','layFooterBgColor');
  if(target.closest('.hero .btn-ghost'))return focusField('banner','ghostButtonText');
  if(target.closest('.hero .btn'))return focusField('banner','buttonText');
  if(target.closest('.hero .hero-eyebrow, .m-hero .m-hero-body > span'))return focusField('banner','eyebrowText');
  if(target.closest('.hero .hero-v2-tags'))return focusField('banner','tagsText');
  if(target.closest('#view-hero h1,#page-hero h1,.hero h1,.m-hero h1,.ai-hero h1'))return focusField('banner','title');
  if(target.closest('#view-hero p,#page-hero p,.hero p,.m-hero p,.ai-hero p'))return focusField('banner','description');
  if(target.closest('.m-hero img'))return focusField('banner','heroImageUrl');
  if(target.closest('#view-hero,#page-hero,.hero,.m-hero,.ai-hero'))return focusField('banner','background');
  if(target.closest('#quick-links,#m-quick-sec,.m-app'))return focusField('body','qlAppTitle',0);
  if(target.closest('#events,#m-events-sec,#m-events'))return focusField('body','evTitle',1);
  if(target.closest('#m-edu-quote-link'))return focusField('body','cuQuoteText',2);
  if(target.closest('#m-edu-more-link'))return focusField('body','cuMoreText',2);
  if(target.closest('#m-edu-cards'))return focusField('body','cuPreviewCount',2);
  if(target.closest('#m-edu-preview'))return focusField('body','cuPreviewBgColor',2);
  if(target.closest('#m-edu button'))return focusField('body','cuDefaultCode',2);
  if(target.closest('#curriculum,#m-edu-sec,#m-edu'))return focusField('body','cuTitle',2);
  if(target.closest('#contact'))return focusField('body','ctTitle',3);
  if(target.closest('#m-notice-sec,#m-notices'))return focusField('body','noTitle',4);
  if(target.closest('.m-tabbar'))return focusField('layout','layPrimaryColor');
  if(target.closest('.catalog-search-input,#search-input'))return focusField('body','subPlaceholderText');
  if(target.closest('.catalog-chip,.nk-sticky-summary,.nk-file-dl-btn'))return focusField('body','subAccentBgColor');
  if(target.closest('.card,.catalog-card,.catalog-controls,.nk-qty-stepper,.nk-file-row,.proposal-box,.board-item,.ai-step,.ai-feat'))return focusField('body','subCardBgColor');
 };

 /* ── 4. Per-Section Reset Buttons ─────────────────────────────────── */
 const resetTargets=[
  ['.banner-card','banner','배너 영역만 기본값으로 초기화'],
  ['#main-sections-design','mainSections','본문 섹션 설정만 기본값으로 초기화'],
  ['#subpage-design-card','subpage','서브 페이지 본문 디자인만 기본값으로 초기화'],
  ['#global-layout-card','layout','헤더·푸터 설정만 기본값으로 초기화']
 ];
 resetTargets.forEach(([sel,sec,label])=>{
  const host=document.querySelector(sel);if(!host||host.querySelector('[data-reset-section]'))return;
  const wrap=document.createElement('div');wrap.className='nk-section-reset-row';
  const btn=document.createElement('button');btn.type='button';btn.className='nk-reset-btn';btn.dataset.resetSection=sec;btn.textContent='↺ '+label;
  btn.addEventListener('click',()=>{
   const b=bridge();if(!b)return;
   if(!confirm(label+'할까요? (실행 취소로 되돌릴 수 있습니다)'))return;
   const st=b.getState(),next=JSON.parse(JSON.stringify(st.doc));
   if(sec==='banner'){next.title=st.baseline.title;next.description=st.baseline.description;next.hero=st.baseline.hero;next.inherit=false;}
   else if(sec==='mainSections'){delete next.mainSections;}
   else if(sec==='subpage'){delete next.subpage;}
   else if(sec==='layout'){delete next.layout;}
   pushSnapshot(true);
   b.applyDoc(next,{reason:'reset',status:label+' 완료. 저장 또는 공개 전까지 실제 사이트에는 반영되지 않습니다.'});
   pushSnapshot(true);
  });
  wrap.append(btn);host.append(wrap);
 });

 /* ── 5. WCAG Color Contrast Checker & Auto-Fix ────────────────────── */
 function hexLum(hex){
  const m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex||'').trim());
  if(!m)return null;
  const c=[m[1],m[2],m[3]].map(h=>{const v=parseInt(h,16)/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];
 }
 function contrastRatio(h1,h2){
  const l1=hexLum(h1),l2=hexLum(h2);
  if(l1===null||l2===null)return null;
  return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);
 }
 function bestTextFor(bgHex){
  const dark=contrastRatio(bgHex,'#172451')||0,light=contrastRatio(bgHex,'#ffffff')||0;
  return dark>=light?'#172451':'#ffffff';
 }
 const bannerCard=document.querySelector('.banner-card');
 let contrastBox=$('nk-contrast-alert');
 if(bannerCard&&!contrastBox){
  contrastBox=document.createElement('div');contrastBox.id='nk-contrast-alert';contrastBox.className='nk-contrast-box';contrastBox.setAttribute('role','status');
  bannerCard.append(contrastBox);
 }
 function checkContrast(){
  if(!contrastBox)return;
  const b=bridge();if(!b)return;
  const st=b.getState(),h=st.doc.hero||{};
  if(st.doc.inherit){contrastBox.className='nk-contrast-box ok';contrastBox.textContent='✓ 공통 배너 설정을 사용 중입니다.';return;}
  const bg=h.background||'#f7f0e4',tc=h.titleColor||'#172451',dc=h.descriptionColor||'#545b6e';
  const issues=[];
  const rTitle=contrastRatio(bg,tc);
  if(rTitle!==null&&rTitle<3.0)issues.push({label:'배너 제목',ratio:rTitle,field:'titleColor',bg});
  const rDesc=contrastRatio(bg,dc);
  if(rDesc!==null&&rDesc<4.5)issues.push({label:'배너 설명',ratio:rDesc,field:'descriptionColor',bg});
  if(st.key==='main'&&h.btnBgColor&&h.btnTextColor){
   const rBtn=contrastRatio(h.btnBgColor,h.btnTextColor);
   if(rBtn!==null&&rBtn<4.5)issues.push({label:'메인 버튼',ratio:rBtn,field:'btnTextColor',bg:h.btnBgColor});
  }
  contrastBox.replaceChildren();
  if(!issues.length){
   contrastBox.className='nk-contrast-box ok';
   contrastBox.textContent='✓ 색상 가독성 양호 (제목·설명 명암비 기준 충족)';
   return;
  }
  contrastBox.className='nk-contrast-box warn';
  const msg=document.createElement('span');
  msg.textContent='⚠ 가독성 주의: '+issues.map(i=>`${i.label} 명암비 ${i.ratio.toFixed(1)}:1`).join(' · ');
  const fix=document.createElement('button');fix.type='button';fix.id='nk-contrast-fix';fix.textContent='권장 글자색 자동 맞춤';
  fix.addEventListener('click',()=>{
   const cur=b.getState(),next=JSON.parse(JSON.stringify(cur.doc));next.hero=next.hero||{};
   issues.forEach(i=>{next.hero[i.field]=bestTextFor(i.bg);});
   pushSnapshot(true);b.applyDoc(next,{reason:'contrast-fix',status:'가독성이 높은 권장 글자색으로 자동 조정했습니다.'});pushSnapshot(true);
  });
  contrastBox.append(msg,fix);
 }

 /* ── 6. Custom Themes Save / Apply / Delete ───────────────────────── */
 const THEME_KEY='nk_editor_custom_themes_v1';
 function loadCustomThemes(){try{const arr=JSON.parse(localStorage.getItem(THEME_KEY)||'[]');return Array.isArray(arr)?arr:[];}catch(_){return [];}}
 function saveCustomThemes(list){try{localStorage.setItem(THEME_KEY,JSON.stringify(list));}catch(_){}}
 const themeBar=document.querySelector('.banner-card .nk-theme-bar');
 if(themeBar&&!$('nk-custom-themes')){
  const box=document.createElement('div');box.id='nk-custom-themes';box.className='nk-custom-themes';
  const row=document.createElement('div');row.className='nk-custom-theme-form';
  const inp=document.createElement('input');inp.id='nk-theme-name';inp.type='text';inp.maxLength=30;inp.placeholder='나만의 테마 이름 (예: 2026 신학기)';
  const add=document.createElement('button');add.type='button';add.id='nk-theme-save';add.textContent='테마 저장';
  const chips=document.createElement('div');chips.id='nk-custom-theme-list';chips.className='nk-theme-bar';
  row.append(inp,add);box.append(row,chips);
  themeBar.insertAdjacentElement('afterend',box);
  function renderCustomThemes(){
   chips.replaceChildren();
   const list=loadCustomThemes();
   list.forEach(item=>{
    const wrap=document.createElement('span');wrap.className='nk-custom-chip-wrap';
    const btn=document.createElement('button');btn.type='button';btn.className='nk-theme-chip';btn.dataset.customThemeId=item.id;
    const sw=document.createElement('span');sw.className='nk-swatch';sw.style.background=`linear-gradient(135deg,${item.hero?.background||'#fbf6ee'} 50%,${item.hero?.titleColor||'#172451'} 50%)`;
    btn.append(sw,document.createTextNode(item.name));
    btn.addEventListener('click',()=>{
     const b=bridge();if(!b)return;
     const st=b.getState(),next=JSON.parse(JSON.stringify(st.doc));
     next.inherit=false;
     next.hero={...(next.hero||{}),...(item.hero||{})};
     if(item.subpage)next.subpage={...(next.subpage||{}),...item.subpage};
     if(item.layout)next.layout={...(next.layout||{}),...item.layout};
     pushSnapshot(true);b.applyDoc(next,{reason:'custom-theme',status:`나만의 테마 '${item.name}'을 적용했습니다.`});pushSnapshot(true);
    });
    const del=document.createElement('button');del.type='button';del.className='nk-chip-del';del.setAttribute('aria-label',item.name+' 테마 삭제');del.textContent='×';
    del.addEventListener('click',()=>{saveCustomThemes(loadCustomThemes().filter(t=>t.id!==item.id));renderCustomThemes();});
    wrap.append(btn,del);chips.append(wrap);
   });
  }
  add.addEventListener('click',()=>{
   const b=bridge();if(!b)return;
   const name=inp.value.trim();if(!name){inp.focus();return;}
   const st=b.getState(),h=st.doc.hero||{};
   const heroPick={};
   ['background','titleColor','descriptionColor','badgeBgColor','badgeTextColor','btnBgColor','btnTextColor','ghostBtnColor','tagColor','circleColor'].forEach(k=>{if(h[k])heroPick[k]=h[k];});
   const list=loadCustomThemes();
   list.unshift({id:'ct-'+Date.now(),name,hero:heroPick,subpage:st.doc.subpage||null,layout:st.doc.layout||null});
   saveCustomThemes(list.slice(0,20));inp.value='';renderCustomThemes();
   const ps=$('status');if(ps)ps.textContent=`나만의 테마 '${name}'이 저장되었습니다.`;
  });
  renderCustomThemes();
  window.__nkRenderCustomThemes=renderCustomThemes;
 }

 /* ── 7. Dual PC + Mobile Side-by-Side Preview in Mid-Check Overlay ── */
 const toolbar=document.querySelector('.preview-toolbar'),frameScroll=document.querySelector('.frame-scroll');
 let mobileFrame=null;
 function syncMobilePreview(docObj,commonObj){
  if(!mobileFrame||!mobileFrame.contentWindow)return;
  try{mobileFrame.contentWindow.postMessage({type:'nk-page-editor-preview',document:docObj,common:commonObj},location.origin);}catch(_){}
 }
 window.__nkSyncExtraPreview=syncMobilePreview;
 if(toolbar&&frameScroll&&!$('nk-split-preview-btn')){
  const dualBtn=document.createElement('button');dualBtn.type='button';dualBtn.id='nk-split-preview-btn';dualBtn.className='nk-dual-btn';dualBtn.textContent='📱 PC+모바일 동시 점검';dualBtn.setAttribute('aria-pressed','false');
  const closeBtn=$('nk-preview-close');
  toolbar.insertBefore(dualBtn,closeBtn||null);
  function setDual(on){
   document.body.classList.toggle('nk-dual-preview',on);
   dualBtn.setAttribute('aria-pressed',String(on));
   if(on){
    if(typeof window.__nkSetPreviewOpen==='function'&&!document.body.classList.contains('nk-preview-open')){
     window.__nkSetPreviewOpen(true);
    }
    if(!mobileFrame){
     mobileFrame=document.createElement('iframe');
     mobileFrame.id='preview-mobile';mobileFrame.className='nk-dual-mobile-frame';mobileFrame.title='모바일 동시 미리보기';
     mobileFrame.addEventListener('load',()=>{
      try{
       const fd=mobileFrame.contentDocument;
       fd.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
       fd.addEventListener('submit',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
      }catch(_){}
      const b=bridge();if(b){const st=b.getState();syncMobilePreview(st.doc,st.common);}
     });
     frameScroll.append(mobileFrame);
    }
    const url=bridge()?.getPreviewUrl();
    if(url&&mobileFrame.src!==url)mobileFrame.src=url;
    else{const b=bridge();if(b){const st=b.getState();syncMobilePreview(st.doc,st.common);}}
    window.dispatchEvent(new Event('resize'));
   }else{
    if(mobileFrame){mobileFrame.remove();mobileFrame=null;}
    window.dispatchEvent(new Event('resize'));
   }
  }
  dualBtn.addEventListener('click',()=>setDual(!document.body.classList.contains('nk-dual-preview')));
  new MutationObserver(()=>{if(!document.body.classList.contains('nk-preview-open')&&document.body.classList.contains('nk-dual-preview'))setDual(false);}).observe(document.body,{attributes:true,attributeFilter:['class']});
 }

 /* ── 8. Local Autosave & Recovery Banner ──────────────────────────── */
 const AUTOSAVE_PREFIX='nk_editor_autosave_v1:';
 const statusEl=$('status');
 let autoBanner=$('nk-autosave-banner');
 if(statusEl&&!autoBanner){
  autoBanner=document.createElement('div');autoBanner.id='nk-autosave-banner';autoBanner.className='nk-autosave-banner';autoBanner.hidden=true;
  statusEl.insertAdjacentElement('afterend',autoBanner);
 }
 function saveAutosave(k,docObj){try{localStorage.setItem(AUTOSAVE_PREFIX+k,JSON.stringify({savedAt:Date.now(),doc:docObj}));}catch(_){}}
 function clearAutosave(k){try{localStorage.removeItem(AUTOSAVE_PREFIX+k);}catch(_){}}
 function checkAutosave(st){
  if(!autoBanner)return;
  autoBanner.hidden=true;autoBanner.replaceChildren();
  try{
   const raw=localStorage.getItem(AUTOSAVE_PREFIX+st.key);if(!raw)return;
   const parsed=JSON.parse(raw);if(!parsed||!parsed.doc)return;
   if(JSON.stringify(parsed.doc)===JSON.stringify(st.doc)){clearAutosave(st.key);return;}
   const timeStr=new Date(parsed.savedAt||Date.now()).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
   const msg=document.createElement('span');msg.textContent=`💾 저장하지 않은 임시 편집본(${timeStr})이 있습니다.`;
   const act=document.createElement('div');act.className='nk-autosave-actions';
   const restore=document.createElement('button');restore.type='button';restore.id='nk-autosave-restore';restore.className='primary';restore.textContent='임시본 복구';
   const dismiss=document.createElement('button');dismiss.type='button';dismiss.id='nk-autosave-dismiss';dismiss.textContent='무시';
   restore.addEventListener('click',()=>{
    const b=bridge();if(!b)return;
    pushSnapshot(true);b.applyDoc(parsed.doc,{reason:'autosave-restore',status:'임시 저장본을 복구했습니다. 공개하려면 초안 저장 또는 공개 반영을 누르세요.'});pushSnapshot(true);
    autoBanner.hidden=true;
   });
   dismiss.addEventListener('click',()=>{clearAutosave(st.key);autoBanner.hidden=true;});
   act.append(restore,dismiss);autoBanner.append(msg,act);autoBanner.hidden=false;
  }catch(_){}
 }

 /* ── 9. Keyboard Shortcuts & Per-Tab Dirty Dot Badges ─────────────── */
 function updateTabBadges(){
  const b=bridge();if(!b)return;
  const st=b.getState(),d=st.doc||{},s=st.saved||{};
  const bannerDirty=JSON.stringify([d.title,d.description,d.inherit,d.hero,d.button,d.ghostButton,d.sections])!==JSON.stringify([s.title,s.description,s.inherit,s.hero,s.button,s.ghostButton,s.sections]);
  const bodyDirty=JSON.stringify([d.mainSections,d.subpage])!==JSON.stringify([s.mainSections,s.subpage]);
  const layoutDirty=JSON.stringify(d.layout)!==JSON.stringify(s.layout);
  const map={banner:bannerDirty,body:bodyDirty,layout:layoutDirty};
  Object.entries(map).forEach(([tab,isDirty])=>{
   const btn=document.querySelector(`[data-editor-view="${tab}"]`);if(!btn)return;
   let dot=btn.querySelector('.nk-tab-dot');
   if(isDirty&&!dot){dot=document.createElement('span');dot.className='nk-tab-dot';dot.setAttribute('aria-label','변경됨');btn.append(dot);}
   else if(!isDirty&&dot)dot.remove();
  });
 }
 document.addEventListener('keydown',e=>{
  const mod=e.ctrlKey||e.metaKey;if(!mod)return;
  const k=e.key.toLowerCase();
  if(k==='s'){
   e.preventDefault();const saveBtn=$('save');if(saveBtn&&!saveBtn.disabled)saveBtn.click();
  }else if(k==='p'){
   e.preventDefault();if(typeof window.__nkSetPreviewOpen==='function')window.__nkSetPreviewOpen(!document.body.classList.contains('nk-preview-open'));
  }else if(k==='z'&&!e.target.matches('input,textarea')){
   e.preventDefault();if(e.shiftKey)doRedo();else doUndo();
  }else if(k==='y'&&!e.target.matches('input,textarea')){
   e.preventDefault();doRedo();
  }
 });

 /* ── 10. Full Settings JSON Backup / Restore ──────────────────────── */
 const envCard=$('nk-env-settings-card');
 if(envCard&&!$('nk-backup-export')){
  const det=document.createElement('details');det.className='advanced';
  const sum=document.createElement('summary');sum.textContent='전체 설정 백업 · 복원 (JSON)';
  const help=document.createElement('p');help.className='muted';help.textContent='현재 페이지 디자인과 나만의 테마, 환경 설정 스냅샷을 JSON 파일로 저장하거나 다시 불러옵니다.';
  const stEl=document.createElement('p');stEl.id='nk-backup-status';stEl.setAttribute('role','status');
  const row=document.createElement('div');row.className='actions';
  const expBtn=document.createElement('button');expBtn.type='button';expBtn.id='nk-backup-export';expBtn.textContent='백업 파일 다운로드 (JSON)';
  const fileInp=document.createElement('input');fileInp.type='file';fileInp.id='nk-backup-import-file';fileInp.accept='application/json,.json';
  const impBtn=document.createElement('button');impBtn.type='button';impBtn.id='nk-backup-import-btn';impBtn.textContent='선택한 백업 파일 복원';
  expBtn.addEventListener('click',()=>{
   const b=bridge();if(!b)return;
   const st=b.getState();
   const payload={nkEditorBackupV1:true,exportedAt:new Date().toISOString(),pageKey:st.key,document:st.doc,customThemes:loadCustomThemes(),env:{company:$('nk-env-company')?.value||'',ceo:$('nk-env-ceo')?.value||'',address:$('nk-env-address')?.value||'',phone:$('nk-env-phone')?.value||'',primary:$('nk-env-primary')?.value||'',accent:$('nk-env-accent')?.value||''}};
   const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
   const url=URL.createObjectURL(blob);const a=document.createElement('a');
   const stamp=new Date().toISOString().slice(0,10).replace(/-/g,'');
   a.href=url;a.download=`newkids-editor-backup-${st.key.replace(/[^a-z0-9_-]/gi,'_')}-${stamp}.json`;
   document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
   stEl.textContent='백업 JSON 파일을 다운로드했습니다.';
  });
  impBtn.addEventListener('click',async()=>{
   const file=fileInp.files?.[0];if(!file){stEl.textContent='먼저 복원할 백업 JSON 파일을 선택하세요.';return;}
   try{
    const parsed=JSON.parse(await file.text());
    if(!parsed||!parsed.nkEditorBackupV1||!parsed.document||typeof parsed.document!=='object')throw new Error('유효한 뉴키즈 편집기 백업 파일이 아닙니다.');
    const b=bridge();if(!b)return;
    pushSnapshot(true);
    b.applyDoc(parsed.document,{reason:'backup-import',status:'백업 파일에서 디자인 설정을 불러왔습니다. 저장 또는 공개 반영을 누르세요.'});
    pushSnapshot(true);
    if(Array.isArray(parsed.customThemes)&&parsed.customThemes.length){
     const merged=[...parsed.customThemes,...loadCustomThemes()].filter((v,i,a)=>a.findIndex(x=>x.id===v.id)===i).slice(0,20);
     saveCustomThemes(merged);if(typeof window.__nkRenderCustomThemes==='function')window.__nkRenderCustomThemes();
    }
    if(parsed.env){
     if($('nk-env-company')&&parsed.env.company)$('nk-env-company').value=parsed.env.company;
     if($('nk-env-ceo')&&parsed.env.ceo)$('nk-env-ceo').value=parsed.env.ceo;
     if($('nk-env-address')&&parsed.env.address)$('nk-env-address').value=parsed.env.address;
     if($('nk-env-phone')&&parsed.env.phone)$('nk-env-phone').value=parsed.env.phone;
     if($('nk-env-primary')&&/^#[0-9a-f]{6}$/i.test(parsed.env.primary))$('nk-env-primary').value=parsed.env.primary;
     if($('nk-env-accent')&&/^#[0-9a-f]{6}$/i.test(parsed.env.accent))$('nk-env-accent').value=parsed.env.accent;
    }
    fileInp.value='';stEl.textContent='백업 파일 복원이 완료되었습니다.';
   }catch(err){stEl.textContent='복원 실패: '+err.message;}
  });
  row.append(expBtn,impBtn);det.append(sum,help,fileInp,row,stEl);envCard.append(det);
 }

 /* ── State Event Wiring ───────────────────────────────────────────── */
 window.addEventListener('nk-editor-state',e=>{
  const reason=e.detail?.reason||'';
  const b=bridge();if(!b)return;
  const st=b.getState();
  if(reason==='select'){resetStack();checkAutosave(st);}
  else if(reason==='save'||reason==='publish'||reason==='cancel'||reason==='restore'){
   clearAutosave(st.key);if(autoBanner)autoBanner.hidden=true;resetStack();
  }else if(reason==='change'){
   pushSnapshot(false);saveAutosave(st.key,st.doc);
  }else if(reason!=='undo'&&reason!=='redo'){
   saveAutosave(st.key,st.doc);
  }
  checkContrast();updateTabBadges();syncUndoButtons();
  if(mobileFrame&&document.body.classList.contains('nk-dual-preview')){
   const url=b.getPreviewUrl();
   if(reason==='select'&&url&&mobileFrame.src!==url)mobileFrame.src=url;
   else syncMobilePreview(st.doc,st.common);
  }
 });
 const initB=bridge();
 if(initB&&initB.getState().pageLoaded){
  const st=initB.getState();resetStack();checkAutosave(st);checkContrast();updateTabBadges();syncUndoButtons();
 }
})();
