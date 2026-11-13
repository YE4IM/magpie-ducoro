from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'ui'
mock=r'''
window.auditCalls=[];window.faults={};window.addEventListener('unhandledrejection',event=>(window.testErrors??=[]).push(String(event.reason)));window.onerror=(...args)=>(window.testErrors??=[]).push(String(args[0]));
let options={};
window.magpie={ready:Promise.resolve({lang:'zh-CN'}),options:{get:async()=>structuredClone(options),set:async v=>(options=structuredClone(v))}};
window.DucoroLanguageReady=new Promise(resolve=>document.addEventListener('DOMContentLoaded',()=>{DucoroI18n.applyDocument('zh-CN');resolve();}));
window.ducoroApi=async(path,body)=>{
 auditCalls.push({path,body});if(faults[path])throw Error('模拟读取失败');const now=new Date().toISOString();
 if(path==='state-status')return {pending:false,readable:true};
 if(path.startsWith('equipment?'))return [];
 if(path.startsWith('tools?'))return [{slug:'read-doc',name:'读取文档',description:'读取用户选定的文档内容。'}];
 if(path==='draft')return {revision:1};
 if(path==='inventory')return {bots:[{id:'agt-review',name:'审查助手',runtime:'pi-agent',connectionSlug:'magpie-ducoro',model:'openai/example'},{id:'agt-research',name:'研究助手',runtime:'pi-agent',connectionSlug:'magpie-ducoro',model:'openai/example'}],models:[{id:'openai/example',name:'Example model'}],gatewayStatus:'connected',defaultModel:'openai/example',library:{mcp:[{name:'文档检索'},{name:'开发工具'}],skills:[{name:'代码审查'},{name:'写作规范'}]},catalog:{sourceStatus:'ok',items:[{slug:'docs',name:'文档账户',status:'connected'}]},capabilities:{botModelWrite:'available',botMcp:'available',botSkills:'available',accountPolicy:'available'},warnings:[],updatedAt:now};
 if(path==='preview')return {rows:[{id:'global',name:'全局资源',resources:[{kind:'skills',name:'代码审查',action:'add'}],accounts:[]},{id:'agt-review',name:'审查助手',resources:[],accounts:[],model:{status:'same',current:'openai/example',desired:'openai/example'}}],warnings:[],capabilities:{},updatedAt:now};
 if(path==='model-catalog')return {models:[{provider:'openai',id:'example',name:'Example model',contextWindow:128000}],entries:[],updatedAt:now};
 if(path==='verification-progress'||path==='verification-start')return {rows:[],running:false};
 if(path==='progress')return {current:null,history:[]};
 if(path==='operations')return {summary:{total:0,completed:0,failed:0},operations:[]};
 if(path==='report')return {schemaVersion:1,updatedAt:now,features:{models:{status:'configured'}},issues:[]};
 if(path==='checkpoints')return {checkpoints:[]};
 if(path==='state-backups')return {backups:[]};
 return {};
};
'''
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  name=self.path.split('?')[0].lstrip('/') or 'index.html'
  if name=='mock.js':data=mock.encode();kind='text/javascript'
  else:
   p=root/name
   if p.parent!=root or not p.is_file():self.send_error(404);return
   data=p.read_bytes();kind='text/javascript' if name.endswith('.js') else 'text/css' if name.endswith('.css') else 'image/svg+xml' if name.endswith('.svg') else 'text/html'
   if name=='index.html':data=data.replace(b'src="service-bridge.js"',b'src="mock.js"')
  self.send_response(200);self.send_header('Content-Type',kind+'; charset=utf-8');self.end_headers();self.wfile.write(data)
 def log_message(self,*args):pass
ThreadingHTTPServer(('127.0.0.1',48766),Handler).serve_forever()
