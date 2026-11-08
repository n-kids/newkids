const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const mock = fs.readFileSync(path.join(__dirname,'fixtures/supabase-mock.js'),'utf8');
const cors = {'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'apikey, authorization'};

test.beforeEach(async ({ context, page }) => {
 await context.route('**/*', async route => {
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js'))return route.fulfill({status:200,contentType:'application/javascript',body:mock});
  if(url.hostname==='jmdyqdckclgfyimqpqce.supabase.co'&&url.pathname==='/rest/v1/page_editor_publications'){
   const method=route.request().method();
   if(method==='OPTIONS')return route.fulfill({status:204,headers:cors});
   expect(method).toBe('GET');
   return route.fulfill({status:200,headers:cors,contentType:'application/json',body:'[]'});
  }
  if(url.hostname.endsWith('supabase.co'))throw new Error('Production database request blocked: '+url.pathname);
  return route.abort();
 });
 page.on('dialog',dialog=>dialog.accept());
});

async function editor(page) {
 await page.goto('/page-editor.html');
 await expect(page.locator('#workspace')).toBeVisible();
 await expect(page.locator('#save')).toBeEnabled();
}

test('registered administrator login opens the editor', async ({page}) => {
 await page.goto('/page-editor.html?test_logged_out=1');
 await expect(page.locator('#login')).toBeVisible();
 await expect(page.locator('#save')).toBeDisabled();
 await page.locator('#email').fill('editor@example.invalid');
 await page.locator('#password').fill('test-only-password');
 await page.locator('#login button').click();
 await expect(page.locator('#workspace')).toBeVisible();
 await expect(page.locator('#save')).toBeEnabled();
});

test('draft preview and save do not publish; explicit publish and restore use separate operations', async ({page}) => {
 await editor(page);
 await page.locator('#title').fill('검증용 제목');
 await expect(page.frameLocator('#preview').locator('.hero h1')).toHaveText('검증용 제목');
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.publications).length)).toBe(0);
 await page.locator('#save').click();
 await expect(page.locator('#status')).toContainText('초안 v1 저장 완료');
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.publications).length)).toBe(0);
 await page.locator('#publish').click();
 await expect(page.locator('#nk-preflight-dialog')).toBeVisible();
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.publications).length)).toBe(0);
 await page.locator('#nk-preflight-confirm').click();
 await expect(page.locator('#status')).toContainText('공개본 v1 저장 완료');
 expect(await page.evaluate(()=>window.__NK_EDITOR_TEST.publications.main.document.title)).toBe('검증용 제목');
 await page.locator('#history button').first().click();
 await expect(page.locator('#status')).toContainText('초안으로 복구');
 expect(await page.evaluate(()=>window.__NK_EDITOR_TEST.publications.main.version)).toBe(1);
});

test('publication preflight blocks blank titles and unsafe button URLs', async ({page}) => {
 await editor(page);
 await page.locator('#title').fill('   ');
 await page.locator('#publish').click();
 await expect(page.locator('#nk-preflight-results')).toContainText('공백만 있는 제목');
 await expect(page.locator('#nk-preflight-confirm')).toBeDisabled();
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.publications).length)).toBe(0);
 await page.locator('#nk-preflight-cancel').click();
 await page.locator('#title').fill('정상 제목');
 await page.locator('#main-settings summary').click();
 await expect(page.locator('#buttonUrl')).toBeVisible();
 await page.locator('#buttonUrl').fill('javascript:alert(1)');
 await page.locator('#publish').click();
 await expect(page.locator('#nk-preflight-results .preflight-error')).toContainText('버튼 연결 주소');
 await expect(page.locator('#nk-preflight-confirm')).toBeDisabled();
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.publications).length)).toBe(0);
});

test('public diagnostics use a mocked GET without changing editor state', async ({page}) => {
 await editor(page);
 await expect(page.locator('#nk-deployment-publication')).toContainText('공개본 없음');
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.drafts).length)).toBe(0);
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.publications).length)).toBe(0);
});

test('subpage tabs presets and device widths are connected', async ({page}) => {
 await editor(page);
 await page.locator('[data-page-kind=sub]').click();
 await expect(page.locator('#page')).toHaveValue('page:reference');
 await expect(page.locator('#save')).toBeEnabled();
 await page.locator('[data-preset=normal]').click();
 await expect(page.locator('#desktopHeight')).toHaveValue('320');
 await expect(page.locator('#mobileHeight')).toHaveValue('240');
 await page.locator('[data-width="390"]').click();
 expect(await page.locator('#preview').evaluate(el=>parseInt(el.style.width,10))).toBe(390);
});

test('desktop and mobile editor layouts provide screenshots without horizontal page overflow', async ({page},testInfo) => {
 await editor(page);
 await page.screenshot({path:testInfo.outputPath('editor-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#publish')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('editor-mobile.png'),fullPage:true});
});

test('board metadata heading stays on one line and compact banners share a minimum height', async ({page},testInfo) => {
 const heights=[];
 for(const code of ['notice','reference','qna']){
  await page.goto('/notice.html#'+code);
  await expect(page.locator('#board-list-wrapper')).toContainText('등록되거나 조건에 맞는 글이 없습니다.');
  expect(await page.locator('.board-list-head .board-col-meta').evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('nowrap');
  heights.push(await page.locator('#view-hero').evaluate(el=>getComputedStyle(el).minHeight));
 }
 expect(new Set(heights).size).toBe(1);
 await page.screenshot({path:testInfo.outputPath('board-desktop.png'),fullPage:true});
});
