import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPageService} from '../page-service.mjs';
import {DEFAULTS} from '../defaults.mjs';
import {validateOptions} from '../options.mjs';
import {saveManagedState} from '../state-store.mjs';

test('plan inheritance distinguishes inherit, custom and none',()=>{
 const options=structuredClone(DEFAULTS);options.botPlansCatalog={p:{name:'中文方案',mcp:[],skills:['写作']}};options.botPlans={'agt-test':'p'};
 assert.deepEqual(validateOptions(options),[]);
 const next=DucoroPlans.resolve(options);assert.deepEqual(next.resourceAssignments['agt-test'],{mcp:[],skills:['写作']});
 delete options.botPlansCatalog.p.mcp;assert.equal(DucoroPlans.resolve(options).resourceAssignments['agt-test'].mcp,undefined);
 options.resourceAssignments={'agt-test':{skills:[]}};assert.deepEqual(DucoroPlans.resolve(options).resourceAssignments['agt-test'].skills,[]);
});

test('restore requires preview; read-only status and retry cannot resume; stale preview rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ducoro-046-'));let service;
 const options={...structuredClone(DEFAULTS),servicePort:48768,syncConnection:false,syncAgentModels:false,syncMcp:false,syncSkills:false,syncInstructions:false,syncSubagents:false};
 const paths={library:join(dir,'library.json'),bridge:join(dir,'bridge.json')};
 const triggers=[];
 try{
  await writeFile(paths.library,JSON.stringify({mcp:[],skills:[]}));await writeFile(paths.bridge,JSON.stringify({gateway:{}}));await writeFile(join(dir,'state.json'),JSON.stringify({v:2,mcp:{},skills:{}}));
  const run=async args=>({ok:true,json:args[0]==='agent'?{agents:[]}:args[0]==='connections'?{connections:[]}:{entries:[]}});
  service=await createPageService({options,paths,stateDir:dir,run,trigger:(...x)=>triggers.push(x),getReport:async()=>({}),getModelCatalog:async()=>({})});assert.ok(service.listening);
  const token=(await readFile(join(dir,'page-token'),'utf8')).trim();
  const api=async(path,body)=>{const response=await fetch(`http://127.0.0.1:48768/api/${path}`,{method:body===undefined?'GET':'POST',headers:{'x-ducoro-token':token,'x-ducoro-language':'zh-CN','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
  const review={pending:true,at:new Date().toISOString()};await writeFile(join(dir,'restore-review.json'),JSON.stringify(review));
  assert.equal((await api('state-status')).body.pending,true);assert.deepEqual(JSON.parse(await readFile(join(dir,'restore-review.json'),'utf8')),review);assert.deepEqual(triggers,[]);
  assert.equal((await api('retry',{})).status,409);assert.deepEqual(triggers,[]);
  assert.equal((await api('resume-reviewed',{token:'missing'})).status,409);
  let preview=await api('preview',options);assert.equal(preview.status,200);assert.ok(preview.body.resumeToken);
  options.syncSkills=true;assert.equal((await api('resume-reviewed',{token:preview.body.resumeToken})).status,409,'settings updates invalidate review');options.syncSkills=false;
  await saveManagedState(join(dir,'state.json'),{v:2,mcp:{},skills:{},testMarker:'changed'});
  assert.equal((await api('resume-reviewed',{token:preview.body.resumeToken})).status,409,'journal updates invalidate review');
  preview=await api('preview',options);assert.equal(preview.status,200);assert.ok(preview.body.resumeToken);
  assert.equal((await api('resume-reviewed',{token:preview.body.resumeToken})).status,200);assert.equal(JSON.parse(await readFile(join(dir,'restore-review.json'),'utf8')).approved,true);assert.equal(triggers.at(-1)[0],'page-resume-reviewed');
  assert.equal((await api('resume-reviewed',{token:preview.body.resumeToken})).status,409,'tokens are single use');
  await writeFile(join(dir,'state.json'),'bad json');const blocked=await api('preview',options);assert.equal(blocked.status,200);assert.equal(blocked.body.blocked,true);assert.equal(blocked.body.resumeToken,undefined);
  const status=await api('state-status');assert.equal(status.body.readable,false);assert.equal(status.body.pending,true);
 }finally{await service?.close();await rm(dir,{recursive:true,force:true});}
});
