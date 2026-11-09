// Test-process model only: these checks are not a substitute for SQL/RLS tests.
const clone=value=>JSON.parse(JSON.stringify(value));
function createReviewServer(){
 const state={drafts:{},publications:{},reviews:[],calls:[]};
 const equal=(a,b)=>{const sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v;return JSON.stringify(sort(a))===JSON.stringify(sort(b));};
 async function handle(actor,request){try{const admin=['writer','reviewer'].includes(actor);
  if(request.op==='query'){if(request.table==='page_editor_drafts'&&!admin)throw Error('Administrator access required');let data=Object.values(request.table==='page_editor_drafts'?state.drafts:state.publications),single=false;for(const step of request.steps){if(step.name==='eq')data=data.filter(row=>row[step.args[0]]===step.args[1]);if(step.name==='in')data=data.filter(row=>step.args[1].includes(row[step.args[0]]));if(['single','maybeSingle'].includes(step.name))single=true;}return {data:clone(single?(data[0]||null):data),error:null};}
  const {name,args={}}=request;state.calls.push({actor,name,args:clone(args)});if(name==='page_editor_is_admin')return {data:admin,error:null};if(!admin)throw Error('Administrator access required');
  if(name==='page_editor_save_draft'){const old=state.drafts[args.p_page_key];if((old?.version||0)!==args.p_expected_version)throw Error('Draft changed');const row={page_key:args.p_page_key,version:(old?.version||0)+1,document:clone(args.p_document)};state.drafts[row.page_key]=row;return {data:clone(row),error:null};}
  if(name==='page_editor_publish'){const d=state.drafts[args.p_page_key];if(d?.version!==args.p_expected_draft_version)throw Error('Draft changed');const r=state.reviews.find(r=>r.status==='approved'&&r.page_key===d.page_key&&equal(r.snapshot,d.document));if(!r)throw Error('Approval required');const row={page_key:d.page_key,version:(state.publications[d.page_key]?.version||0)+1,document:clone(d.document)};state.publications[d.page_key]=row;r.status='published';return {data:clone(row),error:null};}
  if(name!=='page_editor_workflow')throw Error('Unexpected RPC');const p=args.p_payload;
  if(args.p_action==='state')return {data:{items:clone(state.reviews.filter(r=>r.page_key===p.page_key))},error:null};
  if(args.p_action==='request'){const d=state.drafts[p.page_key];if(!d||d.version!==p.version)throw Error('Draft changed');const row={id:'review-'+(state.reviews.length+1),kind:'review',page_key:p.page_key,status:'pending',draft_version:d.version,snapshot:clone(d.document),created_by:actor,created_at:new Date().toISOString()};state.reviews.unshift(row);return {data:{id:row.id},error:null};}
  if(args.p_action==='decide'){const r=state.reviews.find(r=>r.id===p.id);if(!r||r.status!=='pending')throw Error('Review is not pending');if(p.approve){if(r.created_by===actor)throw Error('A different administrator must approve');const d=state.drafts[r.page_key];if(d.version!==r.draft_version||!equal(d.document,r.snapshot))throw Error('Review snapshot is stale');}r.status=p.approve?'approved':'rejected';r.decided_by=actor;return {data:{ok:true},error:null};}
  throw Error('Unexpected workflow action');
 }catch(error){return {data:null,error:{message:error.message}};}}
 return {state,handle};
}
module.exports={createReviewServer};
