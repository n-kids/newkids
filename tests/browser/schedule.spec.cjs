const {test,expect}=require('@playwright/test');
const {windowUTC,localValue}=require('../../page-editor-schedule.js');
const fs=require('node:fs'),path=require('node:path');
test('schedule timestamps reject invalid past and reversed windows',()=>{
 const now=new Date(2030,0,1).getTime();
 expect(windowUTC('2030-01-01T01:00','2030-01-01T02:00',now)).toEqual({starts_at:new Date(2030,0,1,1).toISOString(),ends_at:new Date(2030,0,1,2).toISOString()});
 for(const [a,b] of [['2029-12-31T23:00','2030-01-01T02:00'],['2030-01-01T02:00','2030-01-01T01:00'],['2030-02-30T01:00','2030-03-03T01:00'],['invalid','2030-01-01T02:00']])expect(()=>windowUTC(a,b,now)).toThrow();
 expect(localValue(new Date(2030,0,2,3,4))).toBe('2030-01-02T03:04');
});
const mock=fs.readFileSync(path.join(__dirname,'fixtures/supabase-mock.js'),'utf8');
async function prepare(context,available){
 const extra=`\n(()=>{const client=window.supabase.createClient(),original=client.rpc.bind(client);const state=window.__NK_EDITOR_TEST;state.work=[{id:'approved-test',kind:'review',page_key:'main',status:'approved',draft_version:7,snapshot:{title:'예약 고정 제목'}}];state.workflowCalls=[];client.rpc=async(name,args)=>{if(name!=='page_editor_workflow')return original(name,args);if(!${available})return {data:null,error:{message:'Workflow migration missing'}};state.workflowCalls.push(JSON.parse(JSON.stringify(args)));const p=args.p_payload;if(args.p_action==='state')return {data:{items:JSON.parse(JSON.stringify(state.work.filter(x=>x.page_key===p.page_key)))},error:null};if(args.p_action==='schedule'){const r=state.work.find(x=>x.id===p.id);state.work.push({...p,id:'schedule-test',kind:'schedule',page_key:r.page_key,status:'scheduled',draft_version:r.draft_version,snapshot:JSON.parse(JSON.stringify(r.snapshot))});r.status='scheduled';return {data:{ok:true},error:null};}if(args.p_action==='cancel'){state.work.find(x=>x.id===p.id).status='cancelled';return {data:{ok:true},error:null};}return {data:null,error:{message:'Unexpected test action'}};};})();`;
 await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin==='http://127.0.0.1:8765')return route.continue();if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('@supabase/supabase-js'))return route.fulfill({status:200,contentType:'application/javascript',body:mock+extra});if(url.hostname==='jmdyqdckclgfyimqpqce.supabase.co'&&url.pathname==='/rest/v1/page_editor_publications'&&['GET','OPTIONS'].includes(route.request().method()))return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'apikey, authorization','access-control-allow-methods':'GET, OPTIONS'},contentType:'application/json',body:'[]'});return route.abort();});
}
test('booking pins an approved snapshot and cancel does not publish',async({page,context})=>{
 await prepare(context,true);page.on('dialog',dialog=>dialog.accept());await page.goto('/page-editor.html');
 await expect(page.locator('#nk-schedule-review')).toHaveValue('approved-test');
 const range=await page.evaluate(()=>{const local=d=>{const pad=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes());};return {start:local(new Date(Date.now()+3600000)),end:local(new Date(Date.now()+7200000))};});
 await expect(page.locator('#nk-schedule-create')).toBeDisabled();await page.locator('#nk-schedule-start').fill(range.start);await page.locator('#nk-schedule-end').fill(range.end);
 const expected=await page.evaluate(({start,end})=>({starts_at:new Date(start).toISOString(),ends_at:new Date(end).toISOString()}),range);
 await page.locator('#nk-schedule-create').click();await expect(page.locator('#nk-schedule-status')).toContainText('예약 등록을 확인했습니다');
 expect(await page.evaluate(()=>window.__NK_EDITOR_TEST.workflowCalls.find(x=>x.p_action==='schedule').p_payload)).toEqual({id:'approved-test',...expected});
 await page.evaluate(()=>{window.__NK_EDITOR_TEST.work[0].snapshot.title='나중에 바뀐 제목';});
 expect(await page.evaluate(()=>window.__NK_EDITOR_TEST.work.find(x=>x.kind==='schedule').snapshot.title)).toBe('예약 고정 제목');
 await expect(page.locator('#nk-schedule-list')).toContainText('예약 대기');await page.locator('#nk-schedule-list button').click();await expect(page.locator('#nk-schedule-list')).toContainText('취소');
 expect(await page.evaluate(()=>Object.keys(window.__NK_EDITOR_TEST.publications))).toEqual([]);
});
test('missing workflow migration leaves booking disabled without breaking draft editing',async({page,context})=>{
 await prepare(context,false);await page.goto('/page-editor.html');await expect(page.locator('#nk-schedule-status')).toContainText('예약 DB 연결 불가');await expect(page.locator('#nk-schedule-create')).toBeDisabled();await expect(page.locator('#save')).toBeEnabled();
});
