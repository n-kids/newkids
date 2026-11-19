/* Test-only Supabase substitute. No network or production credentials are used. */
(() => {
 const copy = value => JSON.parse(JSON.stringify(value));
 const categories = [
  {code:'notice',name:'공지사항',type:'BOARD',hero_title:'공지사항',hero_desc:'',is_visible:true,order_num:0},
  {code:'reference',name:'자료실',type:'BOARD',hero_title:'자료실',hero_desc:'연간계획안 및 OT자료를 내려받으세요',is_visible:true,order_num:1},
  {code:'qna',name:'문의사항',type:'BOARD',hero_title:'문의사항',hero_desc:'',is_visible:true,order_num:2},
  {code:'korean',name:'한글',type:'EDU',hero_title:'한글',hero_desc:'교재 안내',is_visible:true,order_num:3},
  {code:'season',name:'시즌 행사',type:'EVENT',hero_title:'시즌 행사',hero_desc:'행사 안내',is_visible:true,order_num:4}
 ];
 const state = { drafts:{}, publications:{}, revisions:[], categories, siteConfig:[], popups:[], signedIn:!new URLSearchParams(location.search).has('test_logged_out') };
 window.__NK_EDITOR_TEST = state;
 function query(table) {
  const filters=[]; let single=false, start=0, end=Infinity, op='select', payload=null;
  const getSource=()=>table==='program_categories'?state.categories:table==='site_config'?state.siteConfig:table==='site_popups'?state.popups:table==='page_editor_drafts'?Object.values(state.drafts):table==='page_editor_publications'?Object.values(state.publications):table==='page_editor_revisions'?state.revisions:[];
  const chain={
   select(){return chain;},
   insert(rows){op='insert';payload=Array.isArray(rows)?rows:[rows];return chain;},
   update(patch){op='update';payload=patch;return chain;},
   upsert(rows){op='upsert';payload=Array.isArray(rows)?rows:[rows];return chain;},
   delete(){op='delete';return chain;},
   eq(key,value){filters.push(row=>row[key]===value);return chain;},
   neq(key,value){filters.push(row=>row[key]!==value);return chain;},
   in(key,values){filters.push(row=>values.map(String).includes(String(row[key])));return chain;},
   order(){return chain;}, limit(value){end=value-1;return chain;},
   range(from,to){start=from;end=to;return chain;}, or(){return chain;}, ilike(){return chain;},
   single(){single=true;return chain;}, maybeSingle(){single=true;return chain;},
   then(resolve,reject){
    const source=getSource();
    if(op==='insert'&&Array.isArray(source)){
     const added=(payload||[]).map((r,idx)=>({id:r.id??(source.length+idx+1),...copy(r)}));
     source.push(...added);
     return Promise.resolve({data:copy(single?(added[0]||null):added),error:null}).then(resolve,reject);
    }
    if(op==='upsert'&&Array.isArray(source)){
     const out=[];
     for(const r of (payload||[])){
      const keyField=table==='program_categories'?'code':'id';
      const existing=source.find(x=>x[keyField]!==undefined&&x[keyField]===r[keyField]);
      if(existing){Object.assign(existing,copy(r));out.push(existing);}
      else{const row={id:r.id??(source.length+1),...copy(r)};source.push(row);out.push(row);}
     }
     return Promise.resolve({data:copy(single?(out[0]||null):out),error:null}).then(resolve,reject);
    }
    if(op==='update'&&Array.isArray(source)){
     let matched=source.filter(row=>filters.every(filter=>filter(row)));
     if(!matched.length&&table==='site_config'){const row={id:1,...copy(payload||{})};source.push(row);matched=[row];}
     else matched.forEach(row=>Object.assign(row,copy(payload||{})));
     return Promise.resolve({data:copy(single?(matched[0]||null):matched),error:null}).then(resolve,reject);
    }
    if(op==='delete'&&Array.isArray(source)){
     const removed=[];
     for(let i=source.length-1;i>=0;i--){if(filters.every(filter=>filter(source[i])))removed.push(...source.splice(i,1));}
     return Promise.resolve({data:copy(removed),error:null}).then(resolve,reject);
    }
    const filtered=source.filter(row=>filters.every(filter=>filter(row)));
    const data=filtered.slice(start,Number.isFinite(end)?end+1:undefined);
    return Promise.resolve({data:copy(single?(data[0]||null):data),error:null,count:filtered.length}).then(resolve,reject);
   }
  };return chain;
 }
 const session=()=>state.signedIn?{user:{id:'test-admin',email:'editor@example.invalid'}}:null;
 const client={from:query,auth:{
  getSession:async()=>({data:{session:session()},error:null}),
  signInWithPassword:async()=>{state.signedIn=true;return {data:{session:session()},error:null};},
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
 },rpc:async(name,args={})=>{
  if(name==='page_editor_is_admin')return {data:state.signedIn,error:null};
  if(!state.signedIn)return {data:null,error:{message:'Administrator access required'}};
  if(name==='page_editor_save_draft'){
   const old=state.drafts[args.p_page_key];
   if((old?.version||0)!==args.p_expected_version)return {data:null,error:{message:'Draft changed: reload before saving'}};
   const row={page_key:args.p_page_key,document:copy(args.p_document),version:(old?.version||0)+1};
   state.drafts[args.p_page_key]=row;return {data:copy(row),error:null};
  }
  if(name==='page_editor_publish'){
   const draft=state.drafts[args.p_page_key];
   if(!draft||draft.version!==args.p_expected_draft_version)return {data:null,error:{message:'Draft changed'}};
   const row={page_key:args.p_page_key,document:copy(draft.document),version:(state.publications[args.p_page_key]?.version||0)+1};
   state.publications[args.p_page_key]=row;state.revisions.push({id:state.revisions.length+1,page_key:row.page_key,document:copy(row.document),publication_version:row.version,created_at:new Date().toISOString()});
   return {data:copy(row),error:null};
  }
  if(name==='page_editor_restore_draft'){
   const revision=state.revisions.find(row=>row.id===args.p_revision_id);
   if(!revision)return {data:null,error:{message:'Revision not found'}};
   return client.rpc('page_editor_save_draft',{p_page_key:revision.page_key,p_document:revision.document,p_expected_version:args.p_expected_draft_version});
  }
  return {data:null,error:{message:'Unexpected test RPC: '+name}};
 }};
 window.supabase={createClient:()=>client};
})();
