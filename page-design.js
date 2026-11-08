/* Read-only publication renderer; drafts are accepted only from same-origin parent previews. */
(() => {
 'use strict';
 if (window.NKPageDesign) return;
 const base = new URL('.', document.currentScript.src);
 const relative = location.pathname.startsWith(base.pathname) ? location.pathname.slice(base.pathname.length) : null;
 if (relative === null || relative.includes('/')) return;
 if (relative === 'admin.html') {
  const add = () => { const side=document.querySelector('.sidebar'); if(side && !document.getElementById('nk-page-editor-link')){const a=document.createElement('a');a.id='nk-page-editor-link';a.className='nav-item';a.href=new URL('page-editor.html',base).href;a.textContent='페이지 편집';side.appendChild(a);} };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add,{once:true});else add();
  return;
 }
 const supported=['','index.html','notice.html','child.html','program.html','page.html','order.html','proposal.html'];
 if(!supported.includes(relative))return;
 const isMain=relative===''||relative==='index.html';
 const preview=window.parent!==window && new URLSearchParams(location.search).get('nkpreview')==='1';
 const selectors={'quick-links':'#quick-links',events:'#events',curriculum:'#curriculum',contact:'#contact'};
 let client=null, current=null, shared=null, ticket=0, observer=null;
 const originalText=new WeakMap();
 const num=(v,f,min,max)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):f;
 const color=(v,f)=>/^#[0-9a-f]{6}$/i.test(String(v))?v:f;
 function hero(){return document.getElementById('view-hero')||document.querySelector('.hero');}
 function setText(el,value){if(!el||typeof value!=='string')return;if(!originalText.has(el))originalText.set(el,el.innerHTML);const text=value.replace(/<br\s*\/?>(\r?\n)?/gi,'\n');if(el.textContent!==text)el.textContent=text;}
 function apply(doc, common){
  if(!doc||typeof doc!=='object')return;
  current=doc;shared=common||{};
  const h=hero();if(!h)return;
  const h1=h.querySelector('h1'),p=h.querySelector('p');
  setText(h1,doc.title);setText(p,doc.description);
  const settings=doc.inherit?(shared.hero||{}):(doc.hero||{});
  const dh=num(settings.desktopHeight,isMain?560:220,120,900),mh=num(settings.mobileHeight,isMain?440:180,100,700);
  const dp=num(settings.desktopPadding,40,0,160),mp=num(settings.mobilePadding,32,0,120);
  const bg=color(settings.background,'#f7f0e4'),tc=color(settings.titleColor,'#172451'),dc=color(settings.descriptionColor,'#545b6e');
  h.setAttribute('data-nk-published-hero','');
  let style=document.getElementById('nk-published-design');if(!style){style=document.createElement('style');style.id='nk-published-design';document.head.appendChild(style);}
  const root='html body [data-nk-published-hero][data-nk-published-hero][data-nk-published-hero]';
  const css=`${root}{height:auto!important;min-height:${dh}px!important;padding:${dp}px 24px!important;background:${bg}!important;flex-shrink:0}${root} h1{color:${tc}!important;white-space:pre-line!important}${root} p{color:${dc}!important;white-space:pre-line!important}${settings.decoration===false?root+'::before,'+root+'::after{display:none!important}':''}@media(max-width:768px){${root}{min-height:${mh}px!important;padding:${mp}px 20px!important}}`;
  if(style.textContent!==css)style.textContent=css;
  /* Inline important values also outrank legacy ID-based important declarations. */
  const mobile=matchMedia('(max-width:768px)').matches;
  const put=(el,key,value)=>{if(el && (el.style.getPropertyValue(key)!==value||el.style.getPropertyPriority(key)!=='important'))el.style.setProperty(key,value,'important');};
  put(h,'min-height',(mobile?mh:dh)+'px');put(h,'padding',(mobile?mp:dp)+'px '+(mobile?20:24)+'px');put(h,'height','auto');put(h,'background',bg);put(h1,'color',tc);put(p,'color',dc);
  if(isMain){
   const button=h.querySelector('.hero-v2-actions .btn');
   if(button&&doc.button){setText(button,doc.button.text);try{const url=new URL(doc.button.url,base);if(['http:','https:','tel:','mailto:'].includes(url.protocol))button.href=url.href;}catch(_){}}
   const sections=Array.isArray(doc.sections)?doc.sections:[];
   const unique=[...new Set(sections.map(s=>s.id).filter(id=>selectors[id]))];
   const elements=unique.map(id=>document.querySelector(selectors[id])).filter(Boolean);
   if(elements.length && elements.every(el=>el.parentNode===document.body)){const footer=document.querySelector('footer');const ordered=[...document.body.children].filter(el=>elements.includes(el));if(ordered.some((el,i)=>el!==elements[i]))elements.forEach(el=>document.body.insertBefore(el,footer));}
   sections.forEach(s=>{const el=selectors[s.id]&&document.querySelector(selectors[s.id]);if(el){const display=s.visible===false?'none':'';if(el.style.display!==display)el.style.display=display;}});
  }
  if(!observer){
   const options={childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['style']};
   observer=new MutationObserver(()=>{
    observer.disconnect();
    try{if(current)apply(current,shared);}finally{if(observer)observer.observe(h,options);}
   });
   observer.observe(h,options);
  }
 }
 function key(){
  if(isMain)return 'main';
  const hash=location.hash.slice(1);let code=hash;
  if(relative==='child.html')code=hash||'korean';
  else if(relative==='notice.html')code=hash||(window.GLOBAL_CATEGORIES||[]).find(c=>c.type==='BOARD')?.code||'notice';
  else if(relative==='program.html')code=hash||(window.GLOBAL_CATEGORIES||[]).find(c=>c.type==='EVENT')?.code||'season';
  else if(relative==='page.html')code=new URLSearchParams(location.search).get('id')||'';
  else code=relative.replace('.html','');
  return /^[a-z0-9_-]+$/i.test(code)?'page:'+code:null;
 }
 async function refresh(){
  if(preview)return;const request=++ticket;
  const k=key();if(!k||!client)return;
  try{const {data,error}=await client.from('page_editor_publications').select('page_key,document').in('page_key',[k,'page:defaults']);if(error||request!==ticket)return;const doc=(data||[]).find(x=>x.page_key===k)?.document;if(doc)apply(doc,(data||[]).find(x=>x.page_key==='page:defaults')?.document||{});}catch(error){console.warn('페이지 디자인 조회 실패',error);}
 }
 window.NKPageDesign={apply};
 window.addEventListener('message',event=>{if(!preview||event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='nk-page-editor-preview')return;apply(event.data.document,event.data.common);window.parent.postMessage({type:'nk-page-editor-preview-applied'},location.origin);});
 window.addEventListener('resize',()=>{if(current)apply(current,shared);});
 window.addEventListener('hashchange',()=>{ticket++;current=null;if(observer){observer.disconnect();observer=null;}const h=hero();if(h){['min-height','padding','height','background'].forEach(k=>h.style.removeProperty(k));h.removeAttribute('data-nk-published-hero');}document.getElementById('nk-published-design')?.remove();setTimeout(refresh,100);});
 function start(){if(preview){window.parent.postMessage({type:'nk-page-editor-preview-ready'},location.origin);return;}let tries=0;const timer=setInterval(()=>{if(window.sb){client=window.sb;clearInterval(timer);setTimeout(refresh,300);}else if(++tries>=100)clearInterval(timer);},100);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
