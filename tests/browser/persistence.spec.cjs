const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const mock=fs.readFileSync(path.join(__dirname,'fixtures/supabase-mock.js'),'utf8');
const origin='http://127.0.0.1:8765';
const apiHost='jmdyqdckclgfyimqpqce.supabase.co';
const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET, OPTIONS','access-control-allow-headers':'apikey, authorization'};

// Only the test process owns the database. Browser state is never copied.
function backend(){
 const sandbox={window:{},location:{search:''},URLSearchParams};
 vm.runInNewContext(mock,sandbox,{timeout:1000});
 return {client:sandbox.window.supabase.createClient(),state:sandbox.window.__NK_EDITOR_TEST,reads:[],violations:[]};
}

function browserSDK(){
 const call=(operation,payload={})=>window.__nkTestBackend({operation,...payload});
 function from(table){
  const steps=[];const chain={};
  for(const method of ['select','eq','neq','in','order','limit','range','or','ilike','single','maybeSingle']){
   chain[method]=(...args)=>{steps.push({method,args});return chain;};
  }
  chain.then=(resolve,reject)=>call('query',{table,steps}).then(resolve,reject);
  return chain;
 }
 const client={from,rpc:(name,args={})=>call('rpc',{name,args}),auth:{
  getSession:()=>call('getSession'),
  signInWithPassword:()=>call('signIn'),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
 }};
 window.supabase={createClient:()=>client};
}

async function fresh(browser,db){
 const context=await browser.newContext({baseURL:origin,serviceWorkers:'block'});
 try{
  expect(await context.storageState()).toEqual({cookies:[],origins:[]});
  let signedIn=false;
  const session=()=>signedIn?{user:{id:'test-admin',email:'editor@example.invalid'}}:null;
  await context.exposeBinding('__nkTestBackend',async(_source,request)=>{
   if(request.operation==='getSession')return {data:{session:session()},error:null};
   if(request.operation==='signIn'){signedIn=true;return {data:{session:session()},error:null};}
   if(request.operation==='rpc'){
    if(request.name==='page_editor_is_admin')return {data:signedIn,error:null};
    if(!signedIn)return {data:null,error:{message:'Test administrator login required'}};
    return JSON.parse(JSON.stringify(await db.client.rpc(request.name,request.args)));
   }
   if(request.operation==='query'){
    if(!signedIn&&['page_editor_drafts','page_editor_revisions'].includes(request.table)){
     db.violations.push('Visitor attempted to read '+request.table);
     return {data:null,error:{message:'Test-only access denied'}};
    }
    let query=db.client.from(request.table);
    const methods=['select','eq','neq','in','order','limit','range','or','ilike','single','maybeSingle'];
    for(const step of request.steps){
     if(!methods.includes(step.method))throw new Error('Unsupported test query method');
     query=query[step.method](...step.args);
    }
    const result=JSON.parse(JSON.stringify(await query));
    db.reads.push({signedIn,table:request.table});
    return result;
   }
   throw new Error('Unsupported test backend operation');
  });
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===origin)return route.continue();
   if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js')){
    return route.fulfill({status:200,contentType:'application/javascript',body:'('+browserSDK.toString()+')();'});
   }
   if(url.hostname===apiHost&&url.pathname==='/rest/v1/page_editor_publications'){
    const method=route.request().method();
    if(method==='OPTIONS')return route.fulfill({status:204,headers:cors});
    if(method==='GET'){
     const key=(url.searchParams.get('page_key')||'').replace(/^eq\./,'');
     const row=db.state.publications[key];
     return route.fulfill({status:200,headers:cors,contentType:'application/json',body:JSON.stringify(row?[{page_key:key,version:row.version}]:[])});
    }
   }
   if(url.hostname.endsWith('supabase.co'))db.violations.push(route.request().method()+' '+url.pathname);
   return route.abort();
  });
  const page=await context.newPage();
  page.on('dialog',dialog=>dialog.accept());
  return {context,page};
 }catch(error){await context.close();throw error;}
}

async function login(page){
 await page.goto('/page-editor.html');
 await expect(page.locator('#login')).toBeVisible();
 await page.locator('#email').fill('editor@example.invalid');
 await page.locator('#password').fill('test-only-password');
 await page.locator('#login button').click();
 await expect(page.locator('#workspace')).toBeVisible();
 await expect(page.locator('#save')).toBeEnabled();
}

async function preview(page,title){
 await expect(page.frameLocator('#preview').locator('.hero h1')).toHaveText(title);
 await expect(page.locator('#preview-status')).toContainText('초안 미리보기 반영됨');
}

test('saved draft survives a fresh context but unsaved changes and login do not',async({browser})=>{
 const db=backend();const contexts=[];
 const open=async()=>{const result=await fresh(browser,db);contexts.push(result.context);return result;};
 const savedTitle='새 브라우저에서 재조회할 저장된 초안';
 const unsavedTitle='저장하지 않아 사라져야 하는 변경';
 try{
  const first=await open();await login(first.page);
  await first.page.locator('#title').fill(savedTitle);
  await first.page.locator('#save').click();
  await expect(first.page.locator('#status')).toContainText('초안 v1 저장 완료');
  expect(db.state.drafts.main.document.title).toBe(savedTitle);
  expect(Object.keys(db.state.publications)).toHaveLength(0);
  await first.page.locator('#title').fill(unsavedTitle);
  await preview(first.page,unsavedTitle);
  await first.context.close();

  const second=await open();await login(second.page);
  await expect(second.page.locator('#title')).toHaveValue(savedTitle);
  await expect(second.page.locator('#status')).toContainText('초안 v1');
  await preview(second.page,savedTitle);
  expect(db.state.drafts.main.version).toBe(1);
  await second.context.close();

  const visitor=await open();
  await visitor.page.goto('/index.html');
  await expect.poll(()=>db.reads.filter(read=>!read.signedIn&&read.table==='page_editor_publications').length).toBeGreaterThan(0);
  await expect(visitor.page.locator('.hero h1')).toBeVisible();
  await expect(visitor.page.locator('.hero h1')).not.toHaveText(savedTitle);
  await expect(visitor.page.locator('.hero h1')).not.toHaveText(unsavedTitle);
  expect(Object.keys(db.state.publications)).toHaveLength(0);
  expect(db.violations).toEqual([]);
 }finally{await Promise.all(contexts.map(context=>context.close()));}
});

test('a fresh administrator sees the latest draft while a fresh visitor sees only the publication',async({browser})=>{
 const db=backend();const contexts=[];
 const open=async()=>{const result=await fresh(browser,db);contexts.push(result.context);return result;};
 const publicTitle='새 방문자에게 유지되는 공개 제목';
 const privateTitle='공개하지 않은 다음 초안 제목';
 try{
  const first=await open();await login(first.page);
  await first.page.locator('#title').fill(publicTitle);
  await first.page.locator('#publish').click();
  await expect(first.page.locator('#nk-preflight-dialog')).toBeVisible();
  await expect(first.page.locator('#nk-preflight-confirm')).toBeEnabled();
  await first.page.locator('#nk-preflight-confirm').click();
  await expect(first.page.locator('#status')).toContainText('공개본 v1 저장 완료');
  await first.page.locator('#title').fill(privateTitle);
  await first.page.locator('#save').click();
  await expect(first.page.locator('#status')).toContainText('초안 v2 저장 완료');
  await first.context.close();

  const second=await open();await login(second.page);
  await expect(second.page.locator('#title')).toHaveValue(privateTitle);
  await expect(second.page.locator('#status')).toContainText('초안 v2');
  await preview(second.page,privateTitle);
  await second.context.close();

  const visitor=await open();await visitor.page.goto('/index.html');
  await expect(visitor.page.locator('.hero[data-nk-published-hero] h1')).toHaveText(publicTitle);
  await expect(visitor.page.locator('.hero h1')).not.toHaveText(privateTitle);
  await visitor.page.reload();
  await expect(visitor.page.locator('.hero[data-nk-published-hero] h1')).toHaveText(publicTitle);
  expect(db.state.publications.main.version).toBe(1);
  expect(db.state.publications.main.document.title).toBe(publicTitle);
  expect(db.state.drafts.main.version).toBe(2);
  expect(db.state.drafts.main.document.title).toBe(privateTitle);
  expect(db.violations).toEqual([]);
 }finally{await Promise.all(contexts.map(context=>context.close()));}
});
