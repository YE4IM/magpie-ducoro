// Runs against the installed daemon. Uses isolated plugin state and never writes Bot configuration.
import {createServer} from 'node:http';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createPageService} from '../page-service.mjs';
import {createCommandRunner} from '../command-runner.mjs';
import {DEFAULTS} from '../defaults.mjs';
const dir=await mkdtemp(join(tmpdir(),'ducoro-044-live-'));
const paths=Object.fromEntries(['library','bridge','mcp','instructions','skills','librarySkills','providers','pluginProviders'].map(k=>[k,join(dir,k)]));
await writeFile(paths.library,JSON.stringify({mcp:[],skills:[]}));await writeFile(paths.bridge,JSON.stringify({}));
const calls=[];
const runner=createCommandRunner({opts:DEFAULTS,dryRun:false,rememberSecret:()=>{},log:()=>{},getGatewaySignal:()=>null,gatewayAbortError:()=>Error('cancelled')});
const run=async(args,options)=>{calls.push(args);return runner(args,options);};
const options={...structuredClone(DEFAULTS),servicePort:3498};
const service=await createPageService({options,paths,stateDir:dir,run,trigger:()=>{},getReport:async()=>({pluginVersion:'0.4.5',features:{},issues:[]}),getModelCatalog:async()=>({items:[]})});
const host=createServer((req,res)=>{if(req.url==='/counts'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(calls));}res.setHeader('Content-Type','text/html');res.end(`<!doctype html><iframe style="width:100%;height:96vh;border:0" src="http://127.0.0.1:3498/"></iframe><script>addEventListener('message',e=>{if(e.data?.magpie!==1||!e.data.method)return;let result=e.data.method==='hello'?{lang:'en',dark:false}:e.data.method==='options.get'?${JSON.stringify(options)}:{};e.source.postMessage({magpie:1,id:e.data.id,result},'*')})</script>`);});host.listen(3499,'127.0.0.1');console.log('Live harness ready on 3499; isolated state; real Ducoro CLI');
process.on('SIGTERM',async()=>{await service.close();host.close();process.exit();});
