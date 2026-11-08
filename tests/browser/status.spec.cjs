const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const mock=fs.readFileSync(path.join(__dirname,'fixtures/supabase-mock.js'),'utf8');
const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'apikey, authorization'};

async function prepare(context,releaseAvailable){
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1'&&url.pathname==='/release.json')return route.fulfill({status:releaseAvailable?200:404,contentType:'application/json',body:releaseAvailable?JSON.stringify({commit:'a'.repeat(40)}):'{}'});
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js'))return route.fulfill({status:200,contentType:'application/javascript',body:mock});
  if(url.hostname==='jmdyqdckclgfyimqpqce.supabase.co'&&url.pathname==='/rest/v1/page_editor_publications'){
   const method=route.request().method();
   if(method==='OPTIONS')return route.fulfill({status:204,headers:cors});
   expect(method).toBe('GET');
   const key=(url.searchParams.get('page_key')||'').replace(/^eq\./,'');
   return route.fulfill({status:200,headers:cors,contentType:'application/json',body:JSON.stringify(releaseAvailable?[{page_key:key,version:4,published_at:'2026-11-01T00:00:00Z'}]:[])});
  }
  if(url.hostname.endsWith('supabase.co'))throw new Error('Unexpected production API request: '+url.pathname);
  return route.abort();
 });
}

test('deployment publication and HTTP response are shown separately',async({page,context})=>{
 await prepare(context,true);await page.goto('/page-editor.html');
 await expect(page.locator('#nk-deployment-panel')).toBeVisible();
 await expect(page.locator('#nk-deployment-code')).toContainText('aaaaaaaaaaaa');
 await expect(page.locator('#nk-deployment-publication')).toContainText('공개본 v4');
 await expect(page.locator('#nk-deployment-response')).toContainText('HTTP 200');
 await expect(page.locator('#nk-deployment-response')).toContainText('검증은 미실시');
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.publications).length)).toBe(0);
});

test('missing release metadata is not reported as a successful deployment',async({page,context})=>{
 await prepare(context,false);await page.goto('/page-editor.html');
 await expect(page.locator('#nk-deployment-code')).toContainText('확인 불가');
 await expect(page.locator('#nk-deployment-code')).toContainText('HTTP 404');
 await expect(page.locator('#nk-deployment-publication')).toContainText('공개본 없음');
 await expect(page.locator('#nk-deploy-refresh')).toBeEnabled();
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.drafts).length)).toBe(0);
});
