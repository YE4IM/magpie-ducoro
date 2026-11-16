import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {acquireSyncLock} from '../sync-lock.mjs';
import {createModelSync} from '../model-sync.mjs';
import {syncAccountConnectors} from '../account-connectors.mjs';
import {createOperationStore} from '../operation-store.mjs';
import {DEFAULTS} from '../defaults.mjs';
test('simultaneous stale recovery grants one owner; duplicate release preserves successor',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ducoro045-lock-'));
 try {
 await mkdir(join(dir,'sync.lock'));await writeFile(join(dir,'sync.lock/owner.json'),JSON.stringify({pid:2147483647}));
 const releases=await Promise.all(Array.from({length:20},()=>acquireSyncLock(dir,{recover:true})));
 assert.equal(releases.filter(Boolean).length,1);
 const release=releases.find(Boolean);await release();
 const next=await acquireSyncLock(dir);assert.ok(next);await release();assert.equal(await acquireSyncLock(dir,{recover:true}),null);await next();
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('20 unchanged model targets write no journal; failed intent is reconciled',async()=>{
 const bots=Array.from({length:20},(_,i)=>({id:`b${i}`,modelPreference:{runtime:'pi-agent',connectionSlug:'magpie-ducoro',model:'demo'}}));
 const connection={slug:'magpie-ducoro',defaultModel:'demo',models:['demo'],baseUrl:'https://example.invalid',availableModelInfos:[{id:'demo'}]};
 const state={};let writes=0;
 const operations=createOperationStore({getState:()=>state,save:async()=>writes++});
 const run=async args=>{assert.notEqual(args[1],'update');return {ok:true,json:args[0]==='connections'?[connection]:args[1]==='list'?bots:bots.find(b=>b.id===args[2])};};
 const sync=createModelSync({operations,opts:DEFAULTS,run,getState:()=>state,save:async()=>writes++,requestRetry:()=>assert.fail('unexpected retry'),log:()=>{}});
 await sync.sync(connection);assert.equal(writes,0);
 const id=await operations.begin('gateway','b0','model',{connection,model:'demo',guard:undefined},['connection']);await operations.finish(id,false);writes=0;
 await sync.sync(connection);assert.equal(state.operations[id].status,'completed');assert.equal(writes,2);
});
test('20 unchanged account policies share catalog and write no journal',async()=>{
 const policy={allow:['read'],deny:[]};const bots=Array.from({length:20},(_,i)=>({id:`b${i}`,modelPreference:{runtime:'pi-agent'}}));
 const state={accountConnectors:Object.fromEntries(bots.map(b=>[b.id,{demo:{previous:null,applied:policy}}]))};
 let writes=0,catalog=0;const operations=createOperationStore({getState:()=>state,save:async()=>writes++});
 const run=async args=>{if(args[0]==='mcp'){catalog++;return {ok:true,json:args[2]==='status'?{status:'connected'}:[{slug:'read'}]};}assert.ok(['list'].includes(args[1])||args[2]==='list');return {ok:true,json:args[1]==='list'?bots:[{slug:'demo',...policy}]};};
 await syncAccountConnectors({options:{...DEFAULTS,accountConnectors:Object.fromEntries(bots.map(b=>[b.id,{demo:policy}]))},state,run,save:async()=>writes++,operations});
 assert.equal(writes,0);assert.equal(catalog,2);
});
