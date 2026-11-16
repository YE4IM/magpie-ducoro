import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,mkdir,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {saveDraft,readDraft,withDraftLock} from '../draft-store.mjs';
import {DEFAULTS} from '../defaults.mjs';
import {buildSyncPreview} from '../sync-preview.mjs';
import {createPageService} from '../page-service.mjs';
import {createStateBackup,readManagedState,restoreStateBackup} from '../state-store.mjs';
const temp=()=>mkdtemp(join(tmpdir(),'ducoro-047-fixed-'));
const absent=async path=>assert.rejects(readFile(path),e=>e.code==='ENOENT');
const editor=(modes={mcp:'inherit',skills:'none'})=>({selected:'p',dirty:true,targets:['agt-a'],values:['Plan','model/test','docs','writer','Instructions'],modes,modelMode:'inherit'});

test('all editor modes survive draft save/read, including hidden values',async()=>{
 const dir=await temp();try{
  const file=join(dir,'page-draft.json');let revision;
  for(const mode of ['inherit','custom','none'])for(const modelMode of ['inherit','custom']){
   const snapshot={...editor({mcp:mode,skills:mode}),modelMode};
   ({revision}=await saveDraft(file,{revision,base:DEFAULTS,options:DEFAULTS,editor:snapshot}));
   assert.deepEqual((await readDraft(file)).editor,snapshot);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('invalid editor modes are rejected without replacing the valid draft',async()=>{
 const dir=await temp();try{
  const file=join(dir,'page-draft.json');const {revision}=await saveDraft(file,{base:DEFAULTS,options:DEFAULTS,editor:editor()});const before=await readFile(file,'utf8');
  for(const snapshot of [{...editor(),modes:{mcp:'invalid',skills:'inherit'}},{...editor(),modelMode:'none'},{...editor(),modes:null},{...editor(),modes:{mcp:'inherit'}},{...editor(),targets:['not-a-bot']}]){
   await assert.rejects(saveDraft(file,{revision,options:DEFAULTS,base:DEFAULTS,editor:snapshot}),e=>e.publicCode==='INVALID_DRAFT');
   assert.equal(await readFile(file,'utf8'),before);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('legacy drafts infer empty new editors as inherit and retain saved plan modes',async()=>{
 const dir=await temp();try{
  const file=join(dir,'page-draft.json'),legacy={selected:'',dirty:true,targets:null,values:['New','','','','']};
  await writeFile(file,JSON.stringify({revision:'a'.repeat(32),base:DEFAULTS,options:DEFAULTS,editor:legacy,at:Date.now()}));
  assert.deepEqual((await readDraft(file)).editor.modes,{mcp:'inherit',skills:'inherit'});
  const options={...DEFAULTS,botPlansCatalog:{p:{name:'Existing',mcp:[],skills:['writer']}}};
  await writeFile(file,JSON.stringify({revision:'b'.repeat(32),base:DEFAULTS,options,editor:{...legacy,selected:'p'},at:Date.now()}));
  assert.deepEqual((await readDraft(file)).editor.modes,{mcp:'none',skills:'custom'});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('draft revisions still reject stale multi-page writes and clears',async()=>{
 const dir=await temp();try{
  const file=join(dir,'page-draft.json');const first=await saveDraft(file,{base:DEFAULTS,options:DEFAULTS});
  await assert.rejects(saveDraft(file,{base:DEFAULTS,options:DEFAULTS}),e=>e.publicCode==='DRAFT_CONFLICT');
  const next=await saveDraft(file,{revision:first.revision,clear:true});assert.deepEqual(await readDraft(file),{revision:next.revision});
  await assert.rejects(saveDraft(file,{revision:first.revision,clear:true}),e=>e.publicCode==='DRAFT_CONFLICT');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('target narrowing discloses revocations once in both languages without changing policy',async()=>{
 const dir=await temp();try{
  const paths={library:join(dir,'library.json'),mcp:join(dir,'mcp.json')};
  await writeFile(paths.library,JSON.stringify({mcp:[{name:'docs',agents:['ducoro']}],skills:[]}));await writeFile(paths.mcp,'{}');
  await writeFile(join(dir,'state.json'),JSON.stringify({v:2,mcp:{'agt-b:magpie-docs':{scope:'agt-b',slug:'magpie-docs',hash:'old',sourceName:'docs'}},skills:{'agt-b:writer':{scope:'agt-b',name:'writer',sourceName:'writer',hash:'old'}}}));
  const current={...structuredClone(DEFAULTS),mcpScope:'agents',skillsScope:'agents'};
  const data={bots:['agt-a','agt-b'].map(id=>({id,runtime:'pi-agent',connectionSlug:DEFAULTS.connectionSlug,model:'x'})),library:{mcp:[{name:'docs'}],skills:[{name:'writer'}]},models:[],warnings:[]};
  for(const language of ['en','zh']){
   const result=await buildSyncPreview({options:{...current,targetAgents:['agt-a']},currentOptions:current,data,stateDir:dir,paths,capabilities:{},run:async()=>({ok:true,json:[]}),language});
   const removals=result.rows.find(r=>r.id==='agt-b').resources.filter(r=>r.action==='remove');
   assert.ok(removals.some(r=>r.kind==='mcp'));assert.ok(removals.some(r=>r.kind==='skills'));
   const warnings=result.warnings.filter(s=>language==='en'?s.includes('target range was narrowed'):s.includes('目标范围已缩小'));
   assert.equal(warnings.length,1);if(language==='en')assert.doesNotMatch(warnings[0],/[\u3400-\u9fff]/);
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});

const lockModule=new URL('../draft-store.mjs',import.meta.url).href;
async function workerFile(dir){
 const file=join(dir,'worker.mjs');
 await writeFile(file,`import {withDraftLock} from ${JSON.stringify(lockModule)};import {mkdir,rm} from 'node:fs/promises';import {join} from 'node:path';
 await withDraftLock(process.argv[2],async()=>{await mkdir(join(process.argv[2],'critical'));console.log('entered');if(process.argv[3]==='hold'){setInterval(()=>{},1000);await new Promise(()=>{});}else await new Promise(r=>setTimeout(r,25));await rm(join(process.argv[2],'critical'),{recursive:true});});`);
 return file;
}
function start(file,dir,mode='once'){
 const child=spawn(process.execPath,[file,dir,mode],{stdio:['ignore','pipe','pipe']});let output='';child.stderr.on('data',d=>output+=d);
 const exited=once(child,'exit').then(([code,signal])=>({code,signal,output}));return {child,exited};
}
test('draft lock excludes concurrent requests within the same process',async()=>{
 const dir=await temp();try{
  let active=0,count=0;
  await Promise.all(Array.from({length:12},()=>withDraftLock(dir,async()=>{assert.equal(++active,1);await new Promise(r=>setTimeout(r,5));active--;count++;})));
  assert.equal(count,12);assert.deepEqual(await readdir(join(dir,'page-draft-locks')),[]);await absent(join(dir,'page-draft.lock'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('draft lock recovers a killed owner and serializes concurrent process recovery',async()=>{
 const dir=await temp();let held;try{
  const file=await workerFile(dir);held=start(file,dir,'hold');
  await once(held.child.stdout,'data');
  await assert.rejects(withDraftLock(dir,()=>assert.fail('must not steal live lock')),e=>e.publicCode==='DRAFT_BUSY');
  held.child.kill('SIGKILL');await held.exited;await rm(join(dir,'critical'),{recursive:true});
  const workers=Array.from({length:6},()=>start(file,dir));
  for(const result of await Promise.all(workers.map(w=>w.exited)))assert.equal(result.code,0,result.output);
  assert.deepEqual(await readdir(join(dir,'page-draft-locks')),[]);await absent(join(dir,'page-draft.lock'));
 }finally{held?.child.kill('SIGKILL');await rm(dir,{recursive:true,force:true});}
});
test('ownerless legacy draft locks fail closed with recovery instructions',async()=>{
 const dir=await temp();try{
  await mkdir(join(dir,'page-draft.lock'));
  await assert.rejects(withDraftLock(dir,()=>assert.fail('unverified owner')),e=>e.publicCode==='DRAFT_LOCK_UNKNOWN'&&e.message.includes('page-draft.lock'));
  assert.deepEqual(await readdir(join(dir,'page-draft-locks')),[]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('releasing a draft request does not delete a replacement lock',async()=>{
 const dir=await temp();try{
  await withDraftLock(dir,async()=>{await rm(join(dir,'page-draft.lock'),{force:true});await mkdir(join(dir,'page-draft.lock'));await writeFile(join(dir,'page-draft.lock','owner.json'),JSON.stringify({pid:process.pid,token:'successor'}));});
  assert.equal(JSON.parse(await readFile(join(dir,'page-draft.lock','owner.json'),'utf8')).token,'successor');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('restore preflight failures do not pause or modify state; existing pause survives',async()=>{
 const dir=await temp();let service;try{
  const options={...structuredClone(DEFAULTS),servicePort:48769};const file=join(dir,'state.json'),review=join(dir,'restore-review.json');const original=JSON.stringify({v:2,mcp:{},skills:{}});await writeFile(file,original);
  service=await createPageService({options,paths:{},stateDir:dir,run:async()=>({ok:true,json:[]}),trigger:()=>{},getReport:()=>({}),getModelCatalog:async()=>({})});
  const token=(await readFile(join(dir,'page-token'),'utf8')).trim();
  const api=async(body)=>{const response=await fetch('http://127.0.0.1:48769/api/state-backups/restore',{method:'POST',headers:{'x-ducoro-token':token,'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
  const id='a'.repeat(64);
  assert.equal((await api({id,checksum:id})).status,404);await absent(review);assert.equal(await readFile(file,'utf8'),original);
  const backup=await createStateBackup(file);
  assert.equal((await api({id:backup.id,checksum:id})).status,409);await absent(review);
  await writeFile(join(dir,'state-backups',backup.id+'.json'),'corrupt');assert.equal((await api({id:backup.id,checksum:backup.id})).status,422);await absent(review);
  const oldPause=JSON.stringify({pending:true,at:'old'});await writeFile(review,oldPause);await api({id,checksum:id});assert.equal(await readFile(review,'utf8'),oldPause);
  const valid=await createStateBackup(file);assert.equal((await api({id:valid.id,checksum:valid.id})).status,200);assert.equal(JSON.parse(await readFile(review,'utf8')).pending,true);
  assert.equal((await readManagedState(file)).state.v,2);
 }finally{await service?.close();await rm(dir,{recursive:true,force:true});}
});
test('restore pauses before mutation and retains pause if the commit fails',async()=>{
 const dir=await temp();try{
  const file=join(dir,'state.json'),review=join(dir,'restore-review.json');await writeFile(file,JSON.stringify({v:2,mcp:{},skills:{}}));const backup=await createStateBackup(file);
  await assert.rejects(restoreStateBackup(file,backup.id,backup.id,{beforeRestore:async()=>{await writeFile(review,'paused');await rm(file);await mkdir(file);}}));
  assert.equal(await readFile(review,'utf8'),'paused');
 }finally{await rm(dir,{recursive:true,force:true});}
});
