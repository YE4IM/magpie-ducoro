import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {syncBuiltinESMExports} from 'node:module';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DEFAULTS} from '../defaults.mjs';
test('cold preview and persistent draft round trip use authenticated service',async()=>{
 const original=http.createServer;let handler,service;
 const dir=await mkdtemp(join(tmpdir(),'ducoro045-service-'));
 try {
 http.createServer=fn=>{handler=fn;const server=new EventEmitter();server.listen=()=>queueMicrotask(()=>server.emit('listening'));server.unref=()=>{};server.close=cb=>cb();server.closeAllConnections=()=>{};return server;};syncBuiltinESMExports();
 const {createPageService}=await import('../page-service.mjs');
 const paths={library:join(dir,'library.json'),bridge:join(dir,'gateway.json'),mcp:join(dir,'mcp.json')};
 await writeFile(paths.library,JSON.stringify({mcp:[],skills:[]}));await writeFile(paths.bridge,'{}');await writeFile(paths.mcp,'{}');
 service=await createPageService({options:DEFAULTS,paths,stateDir:dir,run:async()=>({ok:true,json:[]}),trigger:()=>{},getReport:()=>({}),getModelCatalog:async()=>({})});
 const token=(await readFile(join(dir,'page-token'),'utf8')).trim();
 const call=async(path,body,auth=token)=>{const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);req.url='/api/'+path;req.method=body===undefined?'GET':'POST';req.headers={host:'127.0.0.1:3487','x-ducoro-token':auth};let result;const res=new EventEmitter();res.setHeader=()=>{};res.writeHead=code=>{result={status:code};};res.end=data=>{res.writableEnded=true;result.body=JSON.parse(data);};await handler(req,res);return result;};
 assert.equal((await call('preview',DEFAULTS)).status,200);
 assert.equal((await call('draft',undefined,'wrong')).status,403);
 const options={...DEFAULTS,connectionSlug:'draft-test'};
 assert.equal((await call('draft',{base:DEFAULTS,options:{...options,secret:'must not persist'}})).status,200);
 const saved=(await call('draft')).body;assert.equal(saved.options.connectionSlug,'draft-test');assert.equal(saved.options.secret,undefined);
 await call('draft',{clear:true});assert.deepEqual((await call('draft')).body,{});
 } finally {await service?.close();http.createServer=original;syncBuiltinESMExports();await rm(dir,{recursive:true,force:true});}
});
