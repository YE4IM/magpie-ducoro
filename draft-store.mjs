import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {randomBytes,randomUUID} from 'node:crypto';
import {projectOptions} from './control-center.mjs';
import {validateOptions} from './options.mjs';
import {publicError} from './page-http.mjs';
export {withDraftLock} from './draft-lock.mjs';
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validEditor=(raw,options)=>{try{globalThis.DucoroPlans.editorSnapshot(raw,options);return true;}catch{return false;}};
function validDraft(value) {
  if(!record(value)||typeof value.revision!=='string'||!/^[a-f0-9]{32}$/.test(value.revision))return false;
  if(Object.keys(value).length===1)return true;
  return Object.hasOwn(value,'options')&&Object.hasOwn(value,'base')&&validateOptions(value.options).length===0&&validateOptions(value.base).length===0&&validEditor(value.editor,value.options)&&Number.isFinite(value.at);
}
export async function readDraft(file){
  let body;
  try{body=await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')return {};throw error;}
  try {
    const value=JSON.parse(body);
    if(!validDraft(value))throw Error();
    return value.options ? {...value,editor:globalThis.DucoroPlans.editorSnapshot(value.editor,value.options)} : value;
  }catch{throw publicError(409,'DRAFT_CORRUPT','本地草稿已损坏，原文件已保留。请备份 page-draft.json 后移走该文件，再重新读取页面。');}
}
export async function saveDraft(file,value){
  if(value.clear!==undefined && typeof value.clear!=="boolean")throw publicError(422,"INVALID_DRAFT","草稿编辑内容无效。");
  const previous=await readDraft(file);
  if((value.revision??null)!==(previous.revision??null))throw publicError(409,'DRAFT_CONFLICT','草稿已由其他页面修改，请恢复最新草稿或重新读取后编辑。');
  let editor=null;
  if(value.editor!==undefined && value.editor!==null){try{editor=globalThis.DucoroPlans.editorSnapshot(value.editor,value.options);}catch{throw publicError(422,'INVALID_DRAFT','草稿编辑内容无效。');}}
  if(!value.clear && (validateOptions(value.base??{}).length || validateOptions(value.options??{}).length))throw publicError(422,'INVALID_DRAFT','草稿编辑内容无效。');
  if(!value.clear && !validEditor(editor,value.options))throw publicError(422,'INVALID_DRAFT','草稿编辑内容无效。');
  const revision=randomBytes(16).toString('hex');
  const data=value.clear?{revision}:{base:projectOptions(value.base??{}),options:projectOptions(value.options??{}),editor,revision,at:Date.now()};
  const temp=file+'.'+randomUUID()+'.tmp';
  try{await writeFile(temp,JSON.stringify(data),{mode:0o600,flag:'wx'});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
  return {saved:true,revision};
}
