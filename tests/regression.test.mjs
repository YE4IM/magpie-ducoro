import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defHash,totalTargets} from '../resource-fingerprint.mjs';
import {contentChanges} from '../content-preview.mjs';
import {createOperationStore} from '../operation-store.mjs';
import {validateState} from '../state-store.mjs';
import {acquireSyncLock} from '../sync-lock.mjs';
import {DEFAULTS} from '../defaults.mjs';
import {projectOptions} from '../control-center.mjs';
const temp=()=>mkdtemp(join(tmpdir(),'ducoro-044-test-'));
test('MCP preview agrees with persisted legacy digest; detects real changes',async()=>{
 const dir=await temp();try{
 const paths={library:join(dir,'library.json'),mcp:join(dir,'mcp.json')};
 await writeFile(paths.library,JSON.stringify({mcp:[{name:'demo'}]}));
 await writeFile(paths.mcp,JSON.stringify({mcpServers:{demo:{command:'echo',args:['hello'],env:{B:'2',A:'1'}}}}));
 const def={name:'demo',transport:'stdio',command:'echo',args:['hello'],url:null,headers:[],env:[['A','1'],['B','2']],disabledTools:[]};
 assert.equal(defHash(def).length,20);
 const input={paths,state:{mcp:{demo:{sourceName:'demo',hash:defHash(def)}}},options:{syncMcp:true},bots:[]};
 assert.deepEqual(await contentChanges(input),[]);
 await writeFile(paths.mcp,JSON.stringify({mcpServers:{demo:{command:'echo',args:['changed']}}}));
 assert.equal((await contentChanges(input))[0].action,'update');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('total targets honor binding and explicit selection in both Bot shapes',()=>{
 const bots=[{id:'a',connectionSlug:'magpie-ducoro'},{id:'b',modelPreference:{connectionSlug:'other'}}];
 assert.deepEqual(totalTargets(bots,DEFAULTS).map(x=>x.id),['a']);
 assert.deepEqual(totalTargets(bots,{...DEFAULTS,targetAgents:['b']}).map(x=>x.id),['b']);
});
test('20 unchanged resources cause zero durable writes; changed resources remain recoverable',async()=>{
 const state={operations:{}};let writes=0;const ops=createOperationStore({getState:()=>state,save:async()=>writes++});
 ops.reset();for(let i=0;i<20;i++)await ops.finish(await ops.begin('mcp','global',String(i),'hash',[],true));
 assert.equal(writes,0);
 const id=await ops.begin('mcp','global','demo','hash');assert.equal(state.operations[id].status,'running');await ops.finish(id);
 assert.equal(writes,2);validateState({v:2,...state});
 ops.reset(true);assert.ok(await ops.begin('mcp','global','demo','hash',[],false),'missing actual resource must be repaired even on retry');
});
test('malformed recovery metadata is rejected before import',()=>{
 const row={feature:'mcp',target:'global',resource:'demo',revision:'a'.repeat(64),status:'completed',attempts:1,dependencies:[],updatedAt:new Date().toISOString()};
 validateState({v:2,operations:{id:row}});
 for(const key of Object.keys(row)){const bad={...row};delete bad[key];assert.throws(()=>validateState({v:2,operations:{id:bad}}),key);}
});
test('shared writer lock excludes concurrent backup and sync mutations',async()=>{
 const dir=await temp();try{const release=await acquireSyncLock(dir);assert.equal(await acquireSyncLock(dir),null);assert.equal(await acquireSyncLock(dir,{recover:true}),null);await release();const next=await acquireSyncLock(dir);assert.ok(next);await next();}finally{await rm(dir,{recursive:true,force:true});}
});
test('checkpoint defaults use bridge defaults without sharing mutable values',()=>{
 const projected=projectOptions({});for(const key of Object.keys(projected))assert.deepEqual(projected[key],DEFAULTS[key]);projected.botModels.x='demo';assert.equal(DEFAULTS.botModels.x,undefined);
});
test('content change messages have English translations',()=>{
 for(const key of ['操作恢复记录损坏','同名连接器的配置或工具权限发生变化；敏感字段不展示','技能内容暂不可读取，保留现状并等待核实','全局指令'])assert.doesNotMatch(globalThis.DucoroI18n.translate(key,'en'),/[\u3400-\u9fff]/);
});
test('unchanged instructions verify current Bot without durable writes',async()=>{
 const {createTotalSync,mergeInstructions}=await import('../total.mjs');
 const dir=await temp();try{
 const instructions=join(dir,'instructions');await writeFile(instructions,'<!-- magpie:begin -->\nHello\n<!-- magpie:end -->');
 const next=mergeInstructions('User profile',null,'Hello');const state={total:{profiles:{'agt-test':{block:next.block}},files:{}}};let writes=0;
 const save=async()=>writes++;const operations=createOperationStore({getState:()=>state,save});
 const sync=createTotalSync({operations,opts:DEFAULTS,paths:{instructions},save,getState:()=>state,requestRetry:()=>assert.fail('unexpected retry'),log:()=>{},run:async args=>{
 if(args[0]==='agent'&&args[1]==='list')return {ok:true,json:[{id:'agt-test',modelPreference:{connectionSlug:DEFAULTS.connectionSlug}}]};
 if(args[0]==='agent'&&args[1]==='get')return {ok:true,json:{id:'agt-test',profile:next.profile}};
 assert.fail('unexpected mutation');
 }});
 assert.equal((await sync({instructions:{agents:['ducoro']}})).ok,true);assert.equal(writes,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('operation completion persists ownership in the same journal write',async()=>{
 const state={};const saved=[];const store=createOperationStore({getState:()=>state,save:async paths=>saved.push(paths)});
 const id=await store.begin('mcp','global','demo','hash');await store.finish(id,true,[['mcp','global:demo']]);
 assert.deepEqual(saved.at(-1),[['operations',id],['mcp','global:demo']]);
});
