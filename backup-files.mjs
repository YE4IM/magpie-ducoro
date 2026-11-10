import {backupMetadata,updateBackupMetadata,removeBackupMetadata} from './backup-metadata.mjs';
import { acquireSyncLock } from "./sync-lock.mjs";
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { readFile, writeFile, open, mkdir, lstat, readdir, rename, unlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateState } from './state-store.mjs';
import { validateCheckpoint } from './control-center.mjs';

export const MAX_BACKUP_BYTES = 8 * 1024 * 1024;
const types = {
  state: { directory: 'state-backups', pattern: /^[a-f0-9]{64}\.json$/ },
  checkpoints: { directory: 'configuration-checkpoints', pattern: /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.json$/ },
};
const fail = (message, status=422) => Object.assign(Error(message), { backupStatus:status });
const hash = value => createHash('sha256').update(value).digest('hex');
function typeFor(kind) { if (!Object.hasOwn(types,kind)) throw fail('备份类型无效。'); return types[kind]; }
function safeKeys(value, depth=0) {
  if(depth>80)throw fail('备份文件格式无效。');
  if(!value || typeof value!=='object')return;
  for(const [key,item] of Object.entries(value)) {
    if(['__proto__','constructor','prototype'].includes(key))throw fail('备份文件格式无效。');
    safeKeys(item,depth+1);
  }
}
function parseImport(kind, content) {
  typeFor(kind);
  if(typeof content!=='string' || Buffer.byteLength(content)>MAX_BACKUP_BYTES)throw fail('备份文件过大，最大支持 8 MiB。',413);
  let value;
  try { value=JSON.parse(content); safeKeys(value); value=kind==='state'?validateState(value):validateCheckpoint(value); }
  catch { throw fail(kind==='state'?'管理记录备份格式无效，请选择完整的状态快照。':'检查点文件格式无效。'); }
  const body=JSON.stringify(value,null,2)+'\n';
  if(Buffer.byteLength(body)>MAX_BACKUP_BYTES)throw fail('备份文件过大，最大支持 8 MiB。',413);
  return {value,body,token:hash(kind+'\n'+body)};
}
export function previewBackupImport(kind,content) {
  const {value,token}=parseImport(kind,content);
  return kind==='state'
    ? {kind,token,counts:Object.fromEntries(['mcp','skills','accountConnectors'].map(key=>[key,Object.keys(value[key]??{}).length]))}
    : {kind,token,createdAt:value.createdAt,changes:value.changes.length};
}
async function directory(stateDir,kind,create=false) {
  const dir=join(stateDir,typeFor(kind).directory);
  if(create)await mkdir(dir,{recursive:true,mode:0o700});
  const info=await lstat(dir).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(info && (!info.isDirectory()||info.isSymbolicLink()))throw fail('备份目录必须是普通目录。');
  return {dir,exists:!!info};
}
async function writeBackup(dir,name,body) {
  const temp=join(dir,'.import-'+randomUUID()+'.tmp');
  try {
    const file=await open(temp,'wx',0o600);
    try { await file.writeFile(body); await file.sync(); } finally { await file.close(); }
    await rename(temp,join(dir,name));
  } finally { await unlink(temp).catch(()=>{}); }
}
// Imports only add a validated backup. Existing restore/draft flows apply it.
export async function importBackupFile(stateDir,kind,content,token) {
  const parsed=parseImport(kind,content);
  if(token!==parsed.token)throw fail('导入内容已变化，请重新预览。',409);
  const {dir}=await directory(stateDir,kind,true);
  if(kind==='state') {
    const id=hash(parsed.body),path=join(dir,id+'.json');
    const existing=await lstat(path).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(existing) {
      if(!existing.isFile()||existing.isSymbolicLink()||await readFile(path,'utf8')!==parsed.body)throw fail('本地同名备份异常，请检查后重试。',409);
      return {id,imported:false};
    }
    await writeBackup(dir,id+'.json',parsed.body);
    return {id,imported:true};
  }
  // Regenerate identity so external files never overwrite a local checkpoint.
  const value={...parsed.value,id:randomUUID()};
  await writeBackup(dir,value.id+'.json',JSON.stringify(value,null,2)+'\n');
  return {id:value.id,imported:true};
}
async function deletionFiles(stateDir,kind) {
  const {dir,exists}=await directory(stateDir,kind),files=[];
  if(exists)for(const name of (await readdir(dir)).sort()) {
    if(!typeFor(kind).pattern.test(name))continue;
    const info=await lstat(join(dir,name),{bigint:true});
    if(!info.isFile()||info.isSymbolicLink())continue;
    if((await backupMetadata(dir,name.slice(0,-5))).retained)continue;
    files.push({name,bytes:Number(info.size),stamp:[info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':')});
  }
  return {dir,files};
}
export async function previewBackupDeletion(stateDir,kind) {
  const {files}=await deletionFiles(stateDir,kind);
  return {kind,count:files.length,bytes:files.reduce((sum,file)=>sum+file.bytes,0),token:hash(JSON.stringify([kind,files]))};
}
export async function clearBackupFiles(stateDir,kind,token) {
  const preview=await previewBackupDeletion(stateDir,kind);
  if(token!==preview.token)throw fail('本地备份已变化，请重新预览后删除。',409);
  const {dir,files}=await deletionFiles(stateDir,kind);
  if(hash(JSON.stringify([kind,files]))!==token)throw fail('本地备份已变化，请重新预览后删除。',409);
  for(const file of files){await unlink(join(dir,file.name));await removeBackupMetadata(dir,file.name.slice(0,-5));}
  return {deleted:files.length};
}
// All callers, including checkpoint creation, share the sync writer lock.
export async function withBackupLock(stateDir,work) {
  const release=await acquireSyncLock(stateDir);
  if(!release)throw fail('正在同步，请完成后再操作备份。',409);
  try {return await work();} finally {await release();}
}

export async function openBackupDirectory(stateDir,kind,{platform=process.platform,run=promisify(execFile)}={}) {
  const {dir,exists}=await directory(stateDir,kind);
  if(!exists)throw fail('备份目录尚不存在，请先创建或导入备份。');
  const command={darwin:'open',win32:'explorer.exe',linux:'xdg-open'}[platform];
  if(!command)throw fail('当前系统不支持打开文件管理器。');
  try {await run(command,[resolve(dir)],{timeout:10000,windowsHide:true});}
  catch {throw fail('无法打开备份目录，请检查本机文件管理器是否可用。');}
  return {opened:true};
}

export async function backupFileAction(stateDir,kind,id,action,value){
  const type=typeFor(kind);if(!type.pattern.test(id+'.json'))throw fail('Invalid backup id');
  const {dir}=await directory(stateDir,kind),path=join(dir,id+'.json');
  const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_BACKUP_BYTES)throw fail('Invalid backup file');
  const content=await readFile(path,'utf8');parseImport(kind,content);
  if(kind==='state'&&hash(content)!==id)throw fail('Backup checksum differs');
  if(action==='export')return {filename:id+'.json',content};
  return updateBackupMetadata(dir,id,value);
}
