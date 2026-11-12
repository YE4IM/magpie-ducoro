import {mkdir,readFile,writeFile,rename,unlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {projectOptions} from './control-center.mjs';
import {validateOptions} from './options.mjs';
import {publicError} from './page-http.mjs';
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validEditor=raw=>raw===null || record(raw)&&Array.isArray(raw.values)&&raw.values.length===5&&raw.values.every(x=>typeof x==='string')&&typeof raw.selected==='string'&&typeof raw.dirty==='boolean'&&(raw.targets===null||Array.isArray(raw.targets)&&raw.targets.every(id=>/^agt-[A-Za-z0-9-]+$/.test(id)));
function validDraft(value) {
  if(!record(value)||typeof value.revision!=='string'||!/^[a-f0-9]{32}$/.test(value.revision))return false;
  if(Object.keys(value).length===1)return true;
  return Object.hasOwn(value,'options')&&Object.hasOwn(value,'base')&&validateOptions(value.options).length===0&&validateOptions(value.base).length===0&&validEditor(value.editor)&&Number.isFinite(value.at);
}
// Drafts have their own short cross-process lock, independent of synchronization.
export async function withDraftLock(dir,work) {
  const lock=join(dir,'page-draft.lock'),deadline=Date.now()+1000;
  while(true){try{await mkdir(lock);break;}catch(e){if(e.code!=='EEXIST')throw e;if(Date.now()>=deadline)throw publicError(409,'DRAFT_BUSY','草稿正在保存，请稍后重试。');await new Promise(r=>setTimeout(r,20));}}
  try{return await work();}finally{await rm(lock,{recursive:true,force:true});}
}
export async function readDraft(file){
  let body;
  try{body=await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return {};throw error;}
  try {
    const value=JSON.parse(body);
    if(!validDraft(value))throw Error();
    return value;
  }catch{throw publicError(409,'DRAFT_CORRUPT','本地草稿已损坏，原文件已保留。请备份 page-draft.json 后移走该文件，再重新读取页面。');}
}
export async function saveDraft(file,value){
  if(value.clear!==undefined && typeof value.clear!=="boolean")throw publicError(422,"INVALID_DRAFT","草稿编辑内容无效。");
  const previous=await readDraft(file);
  if((value.revision??null)!==(previous.revision??null))throw publicError(409,'DRAFT_CONFLICT','草稿已由其他页面修改，请恢复最新草稿或重新读取后编辑。');
  let editor=null;
  if(value.editor!==undefined && value.editor!==null){const raw=value.editor;if(!Array.isArray(raw.values)||raw.values.length!==5||raw.values.some(x=>typeof x!=='string')||typeof raw.selected!=='string'||typeof raw.dirty!=='boolean'||raw.targets!==null&&(!Array.isArray(raw.targets)||raw.targets.some(id=>!/^agt-[A-Za-z0-9-]+$/.test(id))))throw publicError(422,'INVALID_DRAFT','草稿编辑内容无效。');editor={selected:raw.selected,dirty:raw.dirty,targets:raw.targets,values:raw.values};}
  if(!value.clear && (validateOptions(value.base??{}).length || validateOptions(value.options??{}).length))throw publicError(422,'INVALID_DRAFT','草稿编辑内容无效。');
  if(!value.clear && !validEditor(editor))throw publicError(422,'INVALID_DRAFT','草稿编辑内容无效。');
  const revision=randomBytes(16).toString('hex');
  const data=value.clear?{revision}:{base:projectOptions(value.base??{}),options:projectOptions(value.options??{}),editor,revision,at:Date.now()};
  const temp=file+'.'+randomUUID()+'.tmp';
  try{await writeFile(temp,JSON.stringify(data),{mode:0o600,flag:'wx'});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
  return {saved:true,revision};
}
