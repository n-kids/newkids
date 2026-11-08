/* Presentation adapters. Saving and publishing stay in page-editor.js. */
(() => {
 'use strict';
 const page=document.getElementById('page'),frame=document.getElementById('preview');
 const preset=document.getElementById('preset'),inherit=document.getElementById('inherit');
 if(!page||!frame||!preset||!inherit)return;
 const tabs=[...document.querySelectorAll('[data-page-kind]')];
 const pills=[...document.querySelectorAll('[data-preset]')];
 const widths=[...document.querySelectorAll('[data-width]')];
 let lastSub='';
 function sync(){
  const main=page.value==='main';
  if(page.value&&!main)lastSub=page.value;
  tabs.forEach(button=>{const active=(button.dataset.pageKind==='main')===main;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.disabled=page.disabled||!page.options.length;});
  pills.forEach(button=>{button.setAttribute('aria-pressed',String(button.dataset.preset===preset.value));button.disabled=preset.disabled||document.getElementById('fields').disabled;});
  document.getElementById('theme-status').textContent=inherit.checked?'공통 테마 사용 중':'개별 테마 설정';
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
 new MutationObserver(()=>{document.getElementById('inline-diff').textContent=diff.textContent;}).observe(diff,{childList:true,subtree:true,characterData:true});
 const status=document.getElementById('status');
 new MutationObserver(()=>{
  const text=status.textContent;const badge=document.getElementById('publication-status');
  if(text.includes('새 공개본 없음'))badge.textContent='미공개';
  else if(text.includes('새 편집기 공개본 있음'))badge.textContent='공개본 있음';
  else if(text.startsWith('공개본 v'))badge.textContent=text.split(' 저장')[0];
  sync();
 }).observe(status,{childList:true,subtree:true,characterData:true});
 new MutationObserver(sync).observe(page,{childList:true,attributes:true,attributeFilter:['disabled']});
 new MutationObserver(sync).observe(preset,{attributes:true,attributeFilter:['disabled']});
 page.addEventListener('change',sync);inherit.addEventListener('input',sync);preset.addEventListener('input',sync);
 const viewport=frame.parentElement;
 function fit(){
  if(!viewport.clientWidth)return;const width=parseInt(frame.style.width,10)||1280;const scale=Math.min(1,Math.max(.1,(viewport.clientWidth-24)/width));
  const transform='scale('+scale+')';if(frame.style.transform!==transform)frame.style.transform=transform;
  const height=Math.max(260,Math.ceil(760*scale)+24)+'px';if(viewport.style.height!==height)viewport.style.height=height;
 }
 widths.forEach(button=>button.addEventListener('click',()=>{widths.forEach(other=>{other.classList.toggle('active',other===button);other.setAttribute('aria-pressed',String(other===button));});fit();}));
 if(window.ResizeObserver)new ResizeObserver(fit).observe(viewport);
 else window.addEventListener('resize',fit);
 frame.addEventListener('load',fit);sync();fit();
})();
