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
 const supported=['','index.html','notice.html','child.html','program.html','page.html','order.html','proposal.html','app-install.html'];
 if(!supported.includes(relative))return;
 const isMain=relative===''||relative==='index.html';
 const preview=window.parent!==window && new URLSearchParams(location.search).get('nkpreview')==='1';
 const selectors={'quick-links':'#quick-links',events:'#events',curriculum:'#curriculum',contact:'#contact'};
 let client=null, current=null, shared=null, ticket=0, observer=null;
 const originalText=new WeakMap();
 const num=(v,f,min,max)=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):f;
 const color=(v,f)=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v):f;
 const optColor=v=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v):'';
 /* 메인 교육 프로그램 미리보기 패널 동작 설정 → index.html(loadMobileHome)로 전달 */
 function publishEduPreviewConfig(sc){
  const s=sc||{};const count=Number(s.previewCount);
  const cfg={
   showPreview:s.showPreview!==false,
   defaultCode:/^[a-z0-9_-]+$/i.test(String(s.defaultCode||''))?String(s.defaultCode):'',
   previewCount:[2,4,6,8].includes(count)?count:4,
   quoteVisible:s.quoteVisible!==false,
   quoteText:String(s.quoteText||'').trim().slice(0,30),
   moreText:String(s.moreText||'').trim().slice(0,40)
  };
  const prev=window.__nkEduPreviewConfig;
  if(prev&&JSON.stringify(prev)===JSON.stringify(cfg))return;
  window.__nkEduPreviewConfig=cfg;
  try{window.dispatchEvent(new CustomEvent('nk-edu-preview-config',{detail:cfg}));}catch(_){}
 }
 const safeImg=v=>{const s=String(v||'').trim();if(!s||/^data:image\/(gif|svg\+xml)/i.test(s)||/via\.placeholder\.com/i.test(s))return '';return /^(https?:\/\/|\/|\.\/|data:image\/)/i.test(s)?s:'';};
 const toRgba=(hex,op)=>{const c=color(hex,'#1a3c6e').slice(1);const r=parseInt(c.slice(0,2),16),g=parseInt(c.slice(2,4),16),b=parseInt(c.slice(4,6),16);return `rgba(${r}, ${g}, ${b}, ${num(op,0.4,0,1)})`;};
 function hero(){return document.getElementById('view-hero')||document.getElementById('page-hero')||document.querySelector('.hero')||document.querySelector('.ai-hero');}
 function setText(el,value){if(!el||typeof value!=='string')return;if(!originalText.has(el))originalText.set(el,el.innerHTML);const text=value.replace(/<br\s*\/?>(\r?\n)?/gi,'\n');if(el.textContent!==text||el.querySelector('br'))el.textContent=text;}
 function setLinkTextKeepIcon(el,value,arrowSuffix){
  if(!el||typeof value!=='string'||!value.trim())return;
  const icon=el.querySelector('[data-icon], .quick-sub-icon, .contact-icon');
  if(icon){
   const clone=icon.cloneNode(true);
   el.replaceChildren(clone,document.createTextNode(value.trim()));
  }else if(arrowSuffix){
   const arr=document.createElement('span');arr.setAttribute('aria-hidden','true');arr.textContent=' →';
   el.replaceChildren(document.createTextNode(value.trim()+' '),arr);
  }else setText(el,value.trim());
 }
 function apply(doc, common){
  if(!doc||typeof doc!=='object')return;
  current=doc;shared=common||{};
  const h=hero();if(!h)return;
  const h1=h.querySelector('h1'),p=h.querySelector('p');
  const useSiteCfg=isMain&&!preview&&!new URLSearchParams(location.search).has('nk_verify')&&window.__nkSiteConfig;
  const cfg=useSiteCfg?window.__nkSiteConfig:null;
  setText(h1,(cfg&&cfg.main_hero_title)||doc.title);setText(p,(cfg&&cfg.main_hero_desc)||doc.description);
  const settings=doc.inherit?{...(doc.hero||{}),...(shared.hero||{})}:{...(shared.hero||{}),...(doc.hero||{})};
  const dh=num(settings.desktopHeight,isMain?560:220,120,900),mh=num(settings.mobileHeight,isMain?440:180,100,700);
  const dp=num(settings.desktopPadding,40,0,160),mp=num(settings.mobilePadding,32,0,120);
  let bg=color(settings.background,'#f7f0e4'),tc=color(settings.titleColor,'#172451'),dc=color(settings.descriptionColor,'#545b6e');
  let bgCss=bg;
  const heroImg=safeImg(settings.backgroundImage);
  if(heroImg){
   const rgba=toRgba(settings.overlayColor||'#1a3c6e',settings.overlayOpacity!==undefined?settings.overlayOpacity:0.4);
   bgCss=`linear-gradient(${rgba}, ${rgba}), url('${heroImg}') center / cover no-repeat`;
  }
  if(cfg){
   const extra=typeof window.parseNkHeroExtraStyle==='function'?window.parseNkHeroExtraStyle(cfg.popup_link):{};
   const hasImg=typeof window.isValidHeroImageUrl==='function'&&window.isValidHeroImageUrl(cfg.main_hero_image);
   const cBg=String(cfg.main_hero_bg_color||'').trim().toLowerCase();
   const cTc=String(cfg.main_hero_title_color||'').trim().toLowerCase();
   const cDc=String(cfg.main_hero_desc_color||'').trim().toLowerCase();
   const isLegacyV1=!hasImg&&!extra.nkHeroStyleV1&&(!cBg||cBg==='#1a3c6e')&&(!cTc||cTc==='#ffffff')&&(!cDc||cDc==='#ffffff');
   if(!isLegacyV1){
    bg=color(cBg,bg);tc=color(cTc,tc);dc=color(cDc,dc);bgCss=bg;
    if(hasImg&&typeof hexToRgba==='function'){
     const oc=cfg.main_hero_overlay_color||'#1a3c6e';
     const op=cfg.main_hero_overlay_opacity!==undefined?cfg.main_hero_overlay_opacity:0.4;
     const rgba=hexToRgba(oc,op);
     bgCss=`linear-gradient(${rgba}, ${rgba}), url('${cfg.main_hero_image}') center / cover no-repeat`;
    }
   }
  }
  h.setAttribute('data-nk-published-hero','');
  h.classList.add('loaded');
  let style=document.getElementById('nk-published-design');if(!style){style=document.createElement('style');style.id='nk-published-design';document.head.appendChild(style);}
  const root='html body [data-nk-published-hero][data-nk-published-hero][data-nk-published-hero]';
  const alignCss=settings.heroAlign==='center'?`${root},${root} .hero-v2-text,${root} .container,${root} .container-wide{text-align:center!important;align-items:center!important}${root} .hero-v2-actions,${root} .hero-v2-tags{justify-content:center!important}`:settings.heroAlign==='left'?`${root},${root} .hero-v2-text,${root} .container,${root} .container-wide{text-align:left!important;align-items:flex-start!important}`:'';
  const scaleVal=num(settings.titleScale,100,70,150);
  const scaleCss=scaleVal!==100?`${root} h1{zoom:${(scaleVal/100).toFixed(2)}}`:'';
  const extraRules=[];
  const layout={...(shared.layout||{}),...(doc.layout||{})};
  if(optColor(layout.primaryColor)){document.documentElement.style.setProperty('--primary-color',layout.primaryColor);document.documentElement.style.setProperty('--brand-navy',layout.primaryColor);extraRules.push(`html body .m-tabbar a[aria-current="page"]{color:${layout.primaryColor}!important}`);}
  if(optColor(layout.accentColor)){document.documentElement.style.setProperty('--accent-color',layout.accentColor);document.documentElement.style.setProperty('--brand-coral',layout.accentColor);}
  if(optColor(layout.pageBgColor))extraRules.push(`html body{background-color:${layout.pageBgColor}!important}`);
  if(optColor(layout.pageTextColor))extraRules.push(`html body{color:${layout.pageTextColor}!important}`);
  if(optColor(layout.headerBgColor))extraRules.push(`html body header{background:${layout.headerBgColor}!important}@media(max-width:768px){html body header .nav-menu.active{background:${layout.headerBgColor}!important}}`);
  if(optColor(layout.headerTextColor))extraRules.push(`html body header .logo-text strong,html body header .logo-text small,html body header .nav-menu>li>a:not(.cta-menu),html body header .mobile-btn{color:${layout.headerTextColor}!important}`);
  if(optColor(layout.ctaBgColor))extraRules.push(`html body header .nav-menu a.cta-menu{background:${layout.ctaBgColor}!important;border-color:${layout.ctaBgColor}!important}`);
  if(optColor(layout.ctaTextColor))extraRules.push(`html body header .nav-menu a.cta-menu{color:${layout.ctaTextColor}!important}`);
  if(optColor(layout.footerBgColor))extraRules.push(`html body footer{background:${layout.footerBgColor}!important}`);
  if(optColor(layout.footerTextColor))extraRules.push(`html body footer,html body footer p,html body footer span,html body footer a{color:${layout.footerTextColor}!important}`);
  if(layout.logoTitle){const el=document.querySelector('header .logo-text strong');if(el)setText(el,layout.logoTitle);}
  if(layout.logoSub){const el=document.querySelector('header .logo-text small');if(el)setText(el,layout.logoSub);}
  if(layout.footerCopy){const el=document.querySelector('footer a[href*="admin.html"]');if(el)setText(el,layout.footerCopy);}

  if(isMain&&doc.mainSections){
   const ms=doc.mainSections;
   if(ms.quickLinks){
    const ql=ms.quickLinks;
    if(optColor(ql.bgColor))extraRules.push(`html body #quick-links{background:${ql.bgColor}!important}`);
    if(optColor(ql.appBgColor))extraRules.push(`html body #quick-links .app-banner,html body #m-home .m-app{background:${ql.appBgColor}!important}`);
    if(optColor(ql.appTextColor))extraRules.push(`html body #quick-links .app-banner,html body #quick-links .app-banner strong,html body #quick-links .app-banner span,html body #quick-links .app-banner small,html body #m-home .m-app,html body #m-home .m-app strong,html body #m-home .m-app small{color:${ql.appTextColor}!important}`);
    if(optColor(ql.refBgColor))extraRules.push(`html body #quick-links .quick-banner,html body #quick-links .quick-main,html body #m-quick-sec .m-quick a{background:${ql.refBgColor}!important}`);
    if(optColor(ql.refTextColor))extraRules.push(`html body #quick-links .quick-banner,html body #quick-links .quick-banner strong,html body #quick-links .quick-banner small,html body #quick-links .quick-banner .quick-go,html body #quick-links .quick-subs .quick-sub,html body #m-quick-sec .m-quick a{color:${ql.refTextColor}!important}`);
    const appEl=document.querySelector('#quick-links .app-banner');
    if(appEl){
     appEl.style.display=ql.showApp===false?'none':'';
     if(ql.appBadge)setText(appEl.querySelector('.app-banner-text small'),ql.appBadge);
     if(ql.appTitle)setText(appEl.querySelector('.app-banner-text strong'),ql.appTitle);
     const spans=appEl.querySelectorAll('.app-banner-text > span:not(.app-banner-go)');
     if(ql.appDesc&&spans[0])setText(spans[0],ql.appDesc);
     if(ql.appCta)setLinkTextKeepIcon(appEl.querySelector('.app-banner-go'),ql.appCta,true);
     if(ql.appUrl){try{const u=new URL(ql.appUrl,base);if(['http:','https:'].includes(u.protocol))appEl.href=u.href;}catch(_){}}
    }
    const mApp=document.querySelector('#m-home .m-app');
    if(mApp){
     mApp.style.display=ql.showApp===false?'none':'';
     if(ql.appTitle)setText(mApp.querySelector('.m-app-text strong'),ql.appTitle);
     if(ql.appDesc)setText(mApp.querySelector('.m-app-text small'),ql.appDesc);
     if(ql.appUrl){try{const u=new URL(ql.appUrl,base);if(['http:','https:'].includes(u.protocol))mApp.href=u.href;}catch(_){}}
    }
    const refEl=document.querySelector('#quick-links .quick-banner');
    if(refEl){
     refEl.style.display=ql.showRef===false?'none':'';
     if(ql.refTitle)setText(refEl.querySelector('.quick-text strong'),ql.refTitle);
     if(ql.refDesc)setText(refEl.querySelector('.quick-text small'),ql.refDesc);
     if(ql.refCta)setLinkTextKeepIcon(refEl.querySelector('.quick-go'),ql.refCta,true);
     const subs=refEl.querySelectorAll('.quick-subs .quick-sub');
     if(ql.sub1Text&&subs[0])setLinkTextKeepIcon(subs[0],ql.sub1Text,false);
     if(ql.sub2Text&&subs[1])setLinkTextKeepIcon(subs[1],ql.sub2Text,false);
    }
    const mQuick=document.getElementById('m-quick-sec');
    if(mQuick){mQuick.style.display=ql.showRef===false?'none':'';}
   }
   for(const [secKey,secSel] of [['events','#events'],['curriculum','#curriculum']]){
    const sc=ms[secKey];if(!sc)continue;
    const secEl=document.querySelector(secSel);
    if(secEl){
     if(sc.eyebrow)setText(secEl.querySelector('.section-eyebrow'),sc.eyebrow);
     if(sc.title)setText(secEl.querySelector('h2'),sc.title);
     if(sc.description)setText(secEl.querySelector('.section-desc'),sc.description);
    }
    if(optColor(sc.bgColor))extraRules.push(`html body ${secSel}{background:${sc.bgColor}!important}`);
    if(optColor(sc.eyebrowColor))extraRules.push(`html body ${secSel} .section-eyebrow{color:${sc.eyebrowColor}!important}`);
    if(optColor(sc.titleColor))extraRules.push(`html body ${secSel} h2{color:${sc.titleColor}!important}`);
    if(optColor(sc.descColor))extraRules.push(`html body ${secSel} .section-desc{color:${sc.descColor}!important}`);
    if(optColor(sc.cardBgColor))extraRules.push(`html body ${secSel} .home-card{background:${sc.cardBgColor}!important}`);
    if(optColor(sc.cardBorderColor))extraRules.push(`html body ${secSel} .home-card{border-color:${sc.cardBorderColor}!important}`);
    if(optColor(sc.cardTitleColor))extraRules.push(`html body ${secSel} .home-card h3,html body ${secSel} .home-card-arrow{color:${sc.cardTitleColor}!important}`);
    if(optColor(sc.cardDescColor))extraRules.push(`html body ${secSel} .home-card p{color:${sc.cardDescColor}!important}`);
    /* 메인 A안(#m-home) 행사·교육 섹션 동기화 */
    const mSecSel=secKey==='events'?'#m-events-sec':'#m-edu-sec';
    const mSecEl=document.querySelector(mSecSel);
    if(mSecEl&&sc.title)setText(mSecEl.querySelector('h2'),sc.title);
    if(optColor(sc.bgColor))extraRules.push(`html body ${mSecSel}{background:${sc.bgColor}!important;padding:16px!important;border-radius:16px!important}`);
    if(optColor(sc.titleColor))extraRules.push(`html body ${mSecSel} h2{color:${sc.titleColor}!important}`);
    if(secKey==='events'){
     if(optColor(sc.cardBgColor))extraRules.push(`html body #m-events .m-ev{background:${sc.cardBgColor}!important}`);
     if(optColor(sc.cardBorderColor))extraRules.push(`html body #m-events .m-ev{border:1px solid ${sc.cardBorderColor}!important}`);
     if(optColor(sc.cardTitleColor))extraRules.push(`html body #m-events .m-ev-body strong{color:${sc.cardTitleColor}!important}`);
     if(optColor(sc.cardDescColor))extraRules.push(`html body #m-events .m-ev-body small{color:${sc.cardDescColor}!important}`);
    }else{
     /* 과목 칩(button[role=tab]) + 교재 미리보기 패널 */
     if(optColor(sc.cardBgColor))extraRules.push(`html body #m-edu button:not(.is-active),html body #m-edu-cards .m-edu-card{background:${sc.cardBgColor}!important}`);
     if(optColor(sc.cardBorderColor))extraRules.push(`html body #m-edu button:not(.is-active),html body #m-edu-cards .m-edu-card,html body #m-edu-preview{border-color:${sc.cardBorderColor}!important}`);
     if(optColor(sc.cardTitleColor))extraRules.push(`html body #m-edu button:not(.is-active),html body #m-edu-cards .m-edu-card-title,html body #m-edu-preview-title{color:${sc.cardTitleColor}!important}`);
     if(optColor(sc.cardDescColor))extraRules.push(`html body #m-edu-preview-desc,html body #m-edu-cards .m-edu-empty{color:${sc.cardDescColor}!important}`);
     if(optColor(sc.chipActiveBg))extraRules.push(`html body #m-edu button.is-active{background:${sc.chipActiveBg}!important;border-color:${sc.chipActiveBg}!important}`);
     if(optColor(sc.chipActiveText))extraRules.push(`html body #m-edu button.is-active{color:${sc.chipActiveText}!important}`);
     if(optColor(sc.previewBgColor))extraRules.push(`html body #m-edu-preview{background:${sc.previewBgColor}!important}`);
     if(optColor(sc.moreBtnBg))extraRules.push(`html body #m-edu-preview .m-edu-btn-primary{background:${sc.moreBtnBg}!important;border-color:${sc.moreBtnBg}!important}`);
    }
   }
   publishEduPreviewConfig(ms.curriculum||{});
   if(ms.notices){
    const no=ms.notices,noEl=document.getElementById('m-notice-sec');
    if(noEl){
     if(no.visible===false)noEl.style.display='none';
     else if(noEl.style.display==='none'&&noEl.querySelector('#m-notices a, #m-notices .m-empty'))noEl.style.display='';
     if(no.title)setText(noEl.querySelector('h2'),no.title);
    }
    if(optColor(no.bgColor))extraRules.push(`html body #m-notice-sec{background:${no.bgColor}!important;padding:16px!important;border-radius:16px!important}`);
    if(optColor(no.titleColor))extraRules.push(`html body #m-notice-sec h2{color:${no.titleColor}!important}`);
    if(optColor(no.cardBgColor))extraRules.push(`html body #m-notices{background:${no.cardBgColor}!important}`);
   }
   if(ms.contact){
    const ct=ms.contact,ctEl=document.querySelector('#contact');
    if(ctEl){
     if(ct.title)setText(ctEl.querySelector('.contact-title'),ct.title);
     if(ct.description)setText(ctEl.querySelector('.contact-desc'),ct.description);
     const links=ctEl.querySelectorAll('.contact-link');
     [[0,ct.phone1Label,ct.phone1],[1,ct.phone2Label,ct.phone2]].forEach(([idx,lbl,ph])=>{
      const a=links[idx];if(!a||(!lbl&&!ph))return;
      const phoneStr=String(ph||(a.querySelector('strong')?.textContent||'')).trim();
      const labelStr=String(lbl||(idx===0?'상담문의 1':'상담문의 2')).trim();
      const ic=document.createElement('span');ic.className='contact-icon';ic.textContent='📞';
      const st=document.createElement('strong');st.textContent=phoneStr;
      a.replaceChildren(ic,document.createTextNode(labelStr+': '),st);
      if(phoneStr)a.href='tel:'+phoneStr.replace(/[^0-9+-]/g,'');
     });
    }
    if(optColor(ct.bgColor))extraRules.push(`html body #contact{background:${ct.bgColor}!important}`);
    if(optColor(ct.titleColor))extraRules.push(`html body #contact .contact-title{color:${ct.titleColor}!important}`);
    if(optColor(ct.descColor))extraRules.push(`html body #contact .contact-desc{color:${ct.descColor}!important}`);
    if(optColor(ct.cardBgColor))extraRules.push(`html body #contact .contact-link{background:${ct.cardBgColor}!important}`);
    if(optColor(ct.cardTextColor))extraRules.push(`html body #contact .contact-link,html body #contact .contact-link strong{color:${ct.cardTextColor}!important}`);
   }
  }
  if(isMain){
   extraRules.push(`html body #m-home .m-hero[data-nk-published-hero][data-nk-published-hero][data-nk-published-hero]{padding:0!important}`);
   extraRules.push(`html body #m-home .m-hero h1,html body #m-home .m-hero p{white-space:pre-line!important}`);
   if(settings.heroAlign==='center')extraRules.push(`html body #m-home .m-hero-body,html body #m-home .m-hero-body h1{text-align:center!important;align-items:center!important}`);
   else if(settings.heroAlign==='left')extraRules.push(`html body #m-home .m-hero-body,html body #m-home .m-hero-body h1{text-align:left!important;align-items:flex-start!important}`);
   if(scaleVal!==100)extraRules.push(`html body #m-home .m-hero h1{zoom:${(scaleVal/100).toFixed(2)}}`);
  }
  if(!isMain){
   const sub=doc.inherit?{...(doc.subpage||{}),...(shared.subpage||{})}:{...(shared.subpage||{}),...(doc.subpage||{})};
   if(optColor(sub.bodyBgColor))extraRules.push(`html body,html body>section:not(#view-hero):not(#page-hero):not(.hero):not(.ai-hero),html body main.board-container{background-color:${sub.bodyBgColor}!important}`);
   if(optColor(sub.cardBgColor))extraRules.push(`html body .card,html body .catalog-card,html body .catalog-controls,html body .proposal-box,html body .board-list-head,html body .board-item,html body .reference-help-panel,html body .order-list-box,html body .ai-step,html body .ai-feat{background-color:${sub.cardBgColor}!important}`);
   if(optColor(sub.cardBorderColor))extraRules.push(`html body .card,html body .catalog-card,html body .catalog-controls,html body .catalog-chip:not(.is-active),html body .catalog-search-input,html body .nk-qty-stepper,html body .proposal-box,html body .board-list-head,html body .board-item,html body .reference-help-panel,html body .order-list-box,html body .form-input,html body .ai-step,html body .ai-feat{border-color:${sub.cardBorderColor}!important}`);
   if(sub.cardRadius!==''&&sub.cardRadius!==undefined&&sub.cardRadius!==null&&Number.isFinite(Number(sub.cardRadius))){
    const rad=num(sub.cardRadius,14,0,36);
    extraRules.push(`html body .card,html body .catalog-card,html body .catalog-controls,html body .proposal-box,html body .reference-help-panel,html body .ai-step,html body .ai-feat{border-radius:${rad}px!important}`);
   }
   if(optColor(sub.headingColor))extraRules.push(`html body .card h3,html body .catalog-card h3,html body .form-section-title,html body .proposal-box #page-title,html body .board-col-title,html body .board-item-title,html body .ai-step strong,html body .ai-feat strong{color:${sub.headingColor}!important}`);
   if(optColor(sub.textColor))extraRules.push(`html body .card p,html body .catalog-card p,html body .catalog-chip:not(.is-active),html body .form-label,html body .view-content,html body .board-item,html body .ai-step p,html body .ai-feat p{color:${sub.textColor}!important}`);
   if(optColor(sub.accentBgColor))extraRules.push(`html body .btn-action,html body .hashtag-btn.active,html body .hashtag-btn[aria-pressed="true"],html body .catalog-chip.is-active,html body .nk-sticky-summary,html body .nk-file-dl-btn,html body .ai-btn:not(.ghost){background-color:${sub.accentBgColor}!important;border-color:${sub.accentBgColor}!important}`);
   if(optColor(sub.accentTextColor))extraRules.push(`html body .btn-action,html body .hashtag-btn.active,html body .hashtag-btn[aria-pressed="true"],html body .catalog-chip.is-active,html body .nk-file-dl-btn,html body .ai-btn:not(.ghost){color:${sub.accentTextColor}!important}`);
   const titles=document.querySelectorAll('.form-section-title, .proposal-box #page-title');
   if(sub.section1Title&&titles[0])setText(titles[0],sub.section1Title);
   if(sub.section2Title&&titles[1])setText(titles[1],sub.section2Title);
   if(sub.section3Title&&titles[2])setText(titles[2],sub.section3Title);
   if(sub.submitText){const sb=document.querySelector('.proposal-box button[type="submit"], #board-search-form button[type="submit"], .ai-actions .ai-btn');if(sb)setText(sb,sub.submitText);}
   if(sub.placeholderText){document.querySelectorAll('#search-input, .catalog-search-input, .proposal-box textarea.form-input').forEach(inp=>inp.setAttribute('placeholder',sub.placeholderText));}
   if(sub.showHelpPanel!==undefined){const hp=document.getElementById('reference-help-panel');if(hp)hp.hidden=!sub.showHelpPanel;}
  }

  const css=`${root}{height:auto!important;min-height:${dh}px!important;padding:${dp}px 24px!important;background:${bgCss}!important;flex-shrink:0}${root} h1{color:${tc}!important;white-space:pre-line!important}${root} p{color:${dc}!important;white-space:pre-line!important}${settings.decoration===false?root+'::before,'+root+'::after{display:none!important}':''}${alignCss}${scaleCss}@media(max-width:768px){${root}{min-height:${mh}px!important;padding:${mp}px 20px!important}}${extraRules.join('')}`;
  if(style.textContent!==css)style.textContent=css;
  /* Inline important values also outrank legacy ID-based important declarations. */
  const mobile=matchMedia('(max-width:768px)').matches;
  const put=(el,key,value)=>{if(el && (el.style.getPropertyValue(key)!==value||el.style.getPropertyPriority(key)!=='important'))el.style.setProperty(key,value,'important');};
  if(h.id==='page-hero')put(h,'display','flex');
  put(h,'min-height',(mobile?mh:dh)+'px');put(h,'padding',(mobile?mp:dp)+'px '+(mobile?20:24)+'px');put(h,'height','auto');put(h,'background',bgCss);put(h1,'color',tc);put(p,'color',dc);
  if(isMain){
   const eyebrowEl=h.querySelector('.hero-eyebrow');
   if(eyebrowEl){
    eyebrowEl.style.display=settings.showEyebrow===false?'none':'';
    if(settings.eyebrowText)setText(eyebrowEl,settings.eyebrowText);
    if(optColor(settings.badgeBgColor))put(eyebrowEl,'background',settings.badgeBgColor);
    if(optColor(settings.badgeTextColor)){put(eyebrowEl,'color',settings.badgeTextColor);put(eyebrowEl,'border-color',toRgba(settings.badgeTextColor,0.28));}
   }
   const artEl=h.querySelector('.hero-v2-art');
   if(artEl)artEl.style.display=settings.showArt===false?'none':'';
   const circleEl=h.querySelector('.hero-v2-art svg circle');
   if(circleEl){
    const cFill=color(settings.circleColor,typeof window.deriveNkHeroCircleColor==='function'?window.deriveNkHeroCircleColor(bg):'#f3eadb');
    circleEl.setAttribute('fill',cFill);put(circleEl,'fill',cFill);
   }
   const button=h.querySelector('.hero-v2-actions .btn');
   if(button&&doc.button){
    setText(button,doc.button.text);
    try{const url=new URL(doc.button.url,base);if(['http:','https:','tel:','mailto:'].includes(url.protocol))button.href=url.href;}catch(_){}
    if(optColor(settings.btnBgColor)){put(button,'background',settings.btnBgColor);put(button,'border-color',settings.btnBgColor);}
    if(optColor(settings.btnTextColor))put(button,'color',settings.btnTextColor);
   }
   const ghostBtn=h.querySelector('.hero-v2-actions .btn-ghost');
   if(ghostBtn){
    const gb=doc.ghostButton||{};
    ghostBtn.style.display=gb.visible===false?'none':'';
    if(gb.text)setText(ghostBtn,gb.text);
    if(gb.url){
     if(String(gb.url).startsWith('#'))ghostBtn.setAttribute('href',gb.url);
     else{try{const u=new URL(gb.url,base);if(['http:','https:','tel:','mailto:'].includes(u.protocol))ghostBtn.href=u.href;}catch(_){}}
    }
    const gCol=optColor(settings.ghostBtnColor)||optColor(settings.btnBgColor);
    if(gCol){put(ghostBtn,'color',gCol);put(ghostBtn,'border-color',gCol);}
   }
   const tagsEl=h.querySelector('.hero-v2-tags');
   if(tagsEl){
    tagsEl.style.display=settings.showTags===false?'none':'';
    if(typeof settings.tagsText==='string'&&settings.tagsText.trim()){
     const items=settings.tagsText.split(',').map(s=>s.trim()).filter(Boolean);
     const cur=[...tagsEl.querySelectorAll('li')].map(li=>li.textContent);
     if(JSON.stringify(items)!==JSON.stringify(cur)){
      tagsEl.replaceChildren(...items.map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
     }
    }
    if(optColor(settings.tagColor)){put(tagsEl,'color',settings.tagColor);tagsEl.querySelectorAll('li').forEach(li=>put(li,'color',settings.tagColor));}
   }
   if(cfg&&typeof window.applyNkHeroVisuals==='function')window.applyNkHeroVisuals(h,cfg);
   /* 메인 A안(#m-home .m-hero) 히어로 카드 동기화 */
   const mHero=document.querySelector('#m-home .m-hero');
   if(mHero){
    mHero.setAttribute('data-nk-published-hero','');
    const mh1=mHero.querySelector('.m-hero-body h1');
    const mpEl=mHero.querySelector('.m-hero-body p');
    const mEyebrow=mHero.querySelector('.m-hero-body > span');
    const mBody=mHero.querySelector('.m-hero-body');
    const mImg=mHero.querySelector('img');
    setText(mh1,(cfg&&cfg.main_hero_title)||doc.title);
    setText(mpEl,(cfg&&cfg.main_hero_desc)||doc.description);
    put(mHero,'background',bg);
    put(mHero,'padding','0');
    put(mHero,'min-height',(mobile?mh:dh)+'px');
    put(mh1,'color',tc);
    put(mpEl,'color',dc);
    if(mBody)put(mBody,'padding',(mobile?mp:dp)+'px '+(mobile?18:40)+'px');
    if(mEyebrow){
     mEyebrow.style.display=settings.showEyebrow===false?'none':'';
     if(settings.eyebrowText)setText(mEyebrow,settings.eyebrowText);
     if(optColor(settings.badgeTextColor))put(mEyebrow,'color',settings.badgeTextColor);
     if(optColor(settings.badgeBgColor)){put(mEyebrow,'background',settings.badgeBgColor);put(mEyebrow,'padding','3px 10px');put(mEyebrow,'border-radius','99px');put(mEyebrow,'width','fit-content');}
    }
    if(mImg){
     mImg.style.display=settings.showArt===false?'none':'';
     if(!mImg.dataset.origSrc)mImg.dataset.origSrc=mImg.getAttribute('src')||'m-hero.jpg';
     const cfgImg=cfg&&typeof window.isValidHeroImageUrl==='function'&&window.isValidHeroImageUrl(cfg.main_hero_image)?cfg.main_hero_image:'';
     const nextSrc=cfgImg||heroImg||mImg.dataset.origSrc;
     if(nextSrc&&mImg.getAttribute('src')!==nextSrc)mImg.setAttribute('src',nextSrc);
    }
   }
   const sections=Array.isArray(doc.sections)?doc.sections:[];
   const unique=[...new Set(sections.map(s=>s.id).filter(id=>selectors[id]))];
   const elements=unique.map(id=>document.querySelector(selectors[id])).filter(Boolean);
   if(elements.length && elements.every(el=>el.parentNode===document.body)){const footer=document.querySelector('footer');const ordered=[...document.body.children].filter(el=>elements.includes(el));if(ordered.some((el,i)=>el!==elements[i]))elements.forEach(el=>document.body.insertBefore(el,footer));}
   sections.forEach(s=>{const el=selectors[s.id]&&document.querySelector(selectors[s.id]);if(el){const display=s.visible===false?'none':'';if(el.style.display!==display)el.style.display=display;}});
   const mSectionVis={events:'#m-events-sec',curriculum:'#m-edu-sec'};
   sections.forEach(s=>{
    if(s.id==='quick-links'){
     const qlHide=s.visible===false;
     const mApp=document.querySelector('#m-home .m-app');
     if(mApp){const d=(qlHide||doc.mainSections?.quickLinks?.showApp===false)?'none':'';if(mApp.style.display!==d)mApp.style.display=d;}
     const mQuick=document.getElementById('m-quick-sec');
     if(mQuick){const d=(qlHide||doc.mainSections?.quickLinks?.showRef===false)?'none':'';if(mQuick.style.display!==d)mQuick.style.display=d;}
    }else if(mSectionVis[s.id]){
     const mEl=document.querySelector(mSectionVis[s.id]);
     if(mEl){const d=s.visible===false?'none':'';if(mEl.style.display!==d)mEl.style.display=d;}
    }
   });
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
 function refreshFromSiteConfig(){
  if(!isMain||preview||new URLSearchParams(location.search).has('nk_verify'))return;
  const h=hero();if(!h)return;
  const options={childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['style']};
  if(observer)observer.disconnect();
  try{
   if(current)apply(current,shared);
   else if(window.__nkSiteConfig&&typeof window.applyNkHeroVisuals==='function')window.applyNkHeroVisuals(h,window.__nkSiteConfig);
  }finally{if(observer&&current)observer.observe(h,options);}
 }
 function key(){
  if(isMain)return 'main';
  const hash=location.hash.slice(1);let code=hash;
  if(relative==='child.html')code=hash||'korean';
  else if(relative==='notice.html')code=hash||(window.GLOBAL_CATEGORIES||[]).find(c=>c.type==='BOARD')?.code||'notice';
  else if(relative==='program.html')code=hash||(window.GLOBAL_CATEGORIES||[]).find(c=>c.type==='EVENT')?.code||'season';
  else if(relative==='page.html'){const params=new URLSearchParams(location.search);code=params.get('id')||params.get('c')||'';}
  else code=relative.replace('.html','');
  return /^[a-z0-9_-]+$/i.test(code)?'page:'+code:null;
 }
 async function refresh(){
  if(preview)return;const request=++ticket;
  const k=key();if(!k||!client)return;
  try{const {data,error}=await client.from('page_editor_publications').select('page_key,document').in('page_key',[k,'page:defaults']);if(error||request!==ticket)return;const doc=(data||[]).find(x=>x.page_key===k)?.document;if(doc)apply(doc,(data||[]).find(x=>x.page_key==='page:defaults')?.document||{});}catch(error){console.warn('페이지 디자인 조회 실패',error);}
 }
 window.NKPageDesign={apply,refreshFromSiteConfig};
 window.addEventListener('message',event=>{if(!preview||event.source!==window.parent||event.origin!==location.origin||event.data?.type!=='nk-page-editor-preview')return;apply(event.data.document,event.data.common);window.parent.postMessage({type:'nk-page-editor-preview-applied'},location.origin);});
 window.addEventListener('resize',()=>{if(current)apply(current,shared);});
 window.addEventListener('hashchange',()=>{ticket++;current=null;if(observer){observer.disconnect();observer=null;}const h=hero();if(h){['min-height','padding','height','background','display'].forEach(k=>h.style.removeProperty(k));h.querySelector('h1')?.style.removeProperty('color');h.querySelector('p')?.style.removeProperty('color');h.removeAttribute('data-nk-published-hero');}document.getElementById('nk-published-design')?.remove();if(preview){setTimeout(()=>window.parent.postMessage({type:'nk-page-editor-preview-ready'},location.origin),50);return;}setTimeout(refresh,100);});
 function start(){if(preview){window.parent.postMessage({type:'nk-page-editor-preview-ready'},location.origin);return;}let tries=0;const timer=setInterval(()=>{if(window.sb){client=window.sb;clearInterval(timer);setTimeout(refresh,300);}else if(++tries>=100)clearInterval(timer);},100);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
