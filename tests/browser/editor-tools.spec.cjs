const {test,expect}=require('@playwright/test');
const {changes,contrast,quality}=require('../../page-editor-tools.js');
test('change summary compares values, order, buttons and inheritance without mutation',()=>{
 const before={title:'기존',hero:{desktopHeight:220},button:{url:'old.html'},sections:[{id:'contact',visible:true}]};
 const after={title:'변경',inherit:true,hero:{desktopHeight:320},button:{url:'new.html'},sections:[{id:'contact',visible:false}]};
 const snapshot=JSON.stringify(before);
 expect(changes(before,after).map(item=>item.label)).toEqual(expect.arrayContaining(['제목','공통 설정 사용','PC 높이','버튼 주소','섹션 표시·순서']));
 expect(JSON.stringify(before)).toBe(snapshot);expect(changes(after,after)).toEqual([]);
});
test('quality warnings handle known contrast values and inherited settings',()=>{
 expect(contrast('#000000','#ffffff')).toBeCloseTo(21);expect(contrast('#ffffff','#ffffff')).toBe(1);
 expect(Number.isNaN(contrast('invalid','#ffffff'))).toBe(true);
 expect(quality({title:'제목',hero:{titleColor:'#ffffff',descriptionColor:'#ffffff',background:'#ffffff'}})).toHaveLength(2);
 expect(quality({title:'제목',inherit:true,hero:{titleColor:'#ffffff',background:'#ffffff'}})).toHaveLength(1);
 expect(quality({title:'  '})).toContain('제목이 비어 있습니다.');
});

test('copy changes only the current draft and the preflight shows a summary',async({page,context})=>{
 const fs=require('node:fs'),path=require('node:path');
 const mock=fs.readFileSync(path.join(__dirname,'fixtures/supabase-mock.js'),'utf8');
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin==='http://127.0.0.1:8765')return route.continue();
  if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js'))return route.fulfill({status:200,contentType:'application/javascript',body:mock});
  if(url.hostname==='jmdyqdckclgfyimqpqce.supabase.co'&&url.pathname==='/rest/v1/page_editor_publications'&&['GET','OPTIONS'].includes(route.request().method()))return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'apikey, authorization'},contentType:'application/json',body:'[]'});
  return route.abort();
 });
 page.on('dialog',dialog=>dialog.accept());
 await page.goto('/page-editor.html');
 await expect(page.locator('#save')).toBeEnabled();
 await page.locator('#page').selectOption('page:reference');
 await expect(page.locator('#save')).toBeEnabled();
 await page.locator('#title').fill('복사 원본 제목');
 await page.locator('[data-preset=normal]').click();
 await page.locator('#save').click();
 await expect(page.locator('#status')).toContainText('초안 v1 저장 완료');
 await page.locator('#page').selectOption('main');
 await expect(page.locator('#save')).toBeEnabled();
 await page.locator('#title').fill('복사 대상 제목');
 await page.locator('#nk-copy-source').selectOption('page:reference');
 await page.locator('#nk-copy-design').click();
 await expect(page.locator('#nk-tools-status')).toContainText('현재 초안에 복사했습니다');
 await expect(page.locator('#title')).toHaveValue('복사 대상 제목');
 await expect(page.locator('#desktopHeight')).toHaveValue('320');
 await expect(page.locator('#mobileHeight')).toHaveValue('240');
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.drafts))).toEqual(['page:reference']);
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.publications))).toEqual([]);
 await page.locator('#nk-copy-text').check();
 await page.locator('#nk-copy-design').click();
 await expect(page.locator('#title')).toHaveValue('복사 원본 제목');
 await page.locator('#publish').click();
 await expect(page.locator('#nk-change-summary')).toContainText('복사 원본 제목');
 await expect(page.locator('#nk-preflight-confirm')).toBeEnabled();
 await page.locator('#nk-preflight-cancel').click();
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.publications))).toEqual([]);
});
