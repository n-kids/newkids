const {test,expect}=require('@playwright/test');
const {publicURL,expected,compare,signature,normalize}=require('../../page-editor-verify.js');
const fs=require('node:fs'),path=require('node:path');
const base='http://127.0.0.1:8765/';
const publication={page_key:'main',version:3,document:{title:'실제 공개 제목',description:'공개 설명',inherit:false,hero:{desktopHeight:560,mobileHeight:440},button:{text:'공개 버튼',url:'proposal.html'}}};
test('public routes remove preview parameters and reject mismatched or external targets',()=>{
 const url=publicURL(base+'index.html?nkpreview=1&editor_v=1',base,'main',1);expect(url.searchParams.has('nkpreview')).toBe(false);expect(url.searchParams.has('editor_v')).toBe(false);
 expect(publicURL(base+'notice.html#reference',base,'page:reference',1).hash).toBe('#reference');
 for(const href of ['https://example.invalid/index.html',base+'admin.html',base+'notice.html#wrong'])expect(()=>publicURL(href,base,'page:reference',1)).toThrow();
});
test('expected values follow publication inheritance and renderer defaults',()=>{
 expect(expected(publication,null,'main',390,base).minHeight).toBe(440);
 expect(expected({...publication,document:{...publication.document,inherit:true}},{hero:{mobileHeight:240}},'main',390,base).minHeight).toBe(240);
 expect(expected({...publication,document:{...publication.document,hero:{desktopHeight:9999}}},null,'main',1280,base).minHeight).toBe(900);
 expect(normalize('a<br>b\r\nc')).toBe('a\nb\nc');expect(compare({title:'a'},{title:'b'})[0].label).toBe('제목');
 expect(signature([{page_key:'main',document:{a:1,b:2}}])).toBe(signature([{document:{b:2,a:1},page_key:'main'}]));
});
const mock=fs.readFileSync(path.join(__dirname,'fixtures/supabase-mock.js'),'utf8');
async function prepare(context,mode){let fullReads=0;
 const served=mode==='mismatch'?{...publication,document:{...publication.document,title:'낡은 공개 제목'}}:publication;
 const seed=mode==='empty'?'':`\nwindow.__NK_EDITOR_TEST.publications.main=${JSON.stringify(served)};`;
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===base.slice(0,-1))return route.continue();if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js'))return route.fulfill({status:200,contentType:'application/javascript',body:mock+seed});if(url.hostname==='jmdyqdckclgfyimqpqce.supabase.co'&&url.pathname==='/rest/v1/page_editor_publications'&&['GET','OPTIONS'].includes(route.request().method())){const full=(url.searchParams.get('select')||'').includes('document');if(full)fullReads++;const row=mode==='changed'&&fullReads>1?{...publication,version:4}:publication;return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'apikey, authorization'},contentType:'application/json',body:JSON.stringify(mode==='empty'?[]:[row])});}return route.abort();});
}
test('live checks use the public document rather than an edited preview and do not save',async({page,context})=>{
 await prepare(context,'ok');await page.goto('/page-editor.html');await expect(page.locator('#save')).toBeEnabled();await page.locator('#title').fill('미공개 초안');await page.locator('#nk-render-run').click();await expect(page.locator('#nk-render-status')).toHaveAttribute('data-state','passed',{timeout:20000});await expect(page.locator('#nk-render-results')).toContainText('1280px');await expect(page.locator('#nk-render-results')).toContainText('390px');expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.drafts))).toEqual([]);expect(await page.evaluate(()=>window.__NK_EDITOR_TEST.publications.main.document.title)).toBe('실제 공개 제목');expect(await page.locator('.nk-live-check-frame').count()).toBe(0);
});
for(const [mode,state] of [['empty','unavailable'],['mismatch','failed'],['changed','changed']])test('live check reports '+mode+' without a false success',async({page,context})=>{
 await prepare(context,mode);await page.goto('/page-editor.html');await expect(page.locator('#save')).toBeEnabled();await page.locator('#nk-render-run').click();await expect(page.locator('#nk-render-status')).toHaveAttribute('data-state',state,{timeout:20000});expect(await page.locator('.nk-live-check-frame').count()).toBe(0);
});
