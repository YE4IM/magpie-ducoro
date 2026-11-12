import {backupMetadata,removeBackupMetadata} from './backup-metadata.mjs';
import { readdir, lstat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { readManagedState, saveManagedState, compactManagedState } from './state-store.mjs';
const names = dir => readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
async function size(path) {
  const s=await lstat(path);
  if(s.isSymbolicLink())return s.size;
  if(!s.isDirectory())return s.size;
  let bytes=0;for(const name of await names(path))bytes+=await size(join(path,name));return bytes;
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function candidates(dir,state,{automatic=false}={}) {
  const rows=[];
  for(const name of ['state-backups','skill-artifacts']) {
    const info=await lstat(join(dir,name)).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(info && (!info.isDirectory()||info.isSymbolicLink()))throw Error('本地记录目录必须是普通目录。');
  }
  if(!automatic)for(const name of await names(join(dir,'state-backups')))if(/^[a-f0-9]{64}\.json$/.test(name)&&!(await backupMetadata(join(dir,'state-backups'),name.slice(0,-5))).retained)rows.push({kind:'备份',relative:'state-backups/'+name});
  const used=new Set([...Object.values(state.skills??{}),...Object.values(state.creations??{}).filter(row=>row.kind==='skills')].flatMap(row=>[row.hash,row.replacement?.previousHash,row.replacement?.nextHash].filter(Boolean)));
  const root=join(dir,'skill-artifacts');
  for(const name of await names(root)) {
    if(!/^[a-f0-9]{64}$/.test(name)&&!/^\.prepare-[a-f0-9-]{36}$/.test(name))continue;
    if(used.has(name))continue;
    const info=await lstat(join(root,name));
    if(automatic&&Date.now()-info.mtimeMs<7*86400000)continue;
    rows.push({kind:'未使用技能缓存',relative:'skill-artifacts/'+name});
  }
  for(const row of rows)row.bytes=await size(join(dir,row.relative));
  return rows.sort((a,b)=>a.relative.localeCompare(b.relative));
}
// Caller must own sync.lock for preview, execution and automatic maintenance.
export async function previewLocalRecords(dir) {
  const {state}=await readManagedState(join(dir,'state.json'));
  const rows=await candidates(dir,state);
  const completed=Object.entries(state.operations??{}).filter(([,row])=>row.status==='completed').map(([id])=>id).sort();
  const journalBytes=await size(join(dir,'state.json.journal')).catch(e=>{if(e.code==='ENOENT')return 0;throw e;});
  return {token:hash([state,rows,completed,journalBytes]),files:rows.length,bytes:rows.reduce((n,r)=>n+r.bytes,0),completed:completed.length,journalBytes,groups:['已完成的操作历史','历史状态备份','未被使用的技能缓存','已合并的增量记录']};
}
export async function cleanLocalRecords(dir,token) {
  const preview=await previewLocalRecords(dir);
  if(token!==preview.token)throw Error('本地记录已变化，请重新预览后清理。');
  const file=join(dir,'state.json'),{state}=await readManagedState(file);
  const before=await size(dir);
  for(const [id,row] of Object.entries(state.operations??{}))if(row.status==='completed')delete state.operations[id];
  await saveManagedState(file,state);
  await compactManagedState(file,{keepBackup:false});
  // Re-enumerate backups: a threshold checkpoint during save may create one.
  const rows=await candidates(dir,state);
  for(const row of rows){await rm(join(dir,row.relative),{recursive:true,force:true});if(row.relative.startsWith('state-backups/'))await removeBackupMetadata(join(dir,'state-backups'),row.relative.split('/')[1].slice(0,-5));}
  return {deletedFiles:rows.length,deletedRecords:preview.completed,releasedBytes:Math.max(0,before-await size(dir))};
}
export async function maintainLocalRecords(dir,state,save) {
  const completed=Object.entries(state.operations??{}).filter(([,r])=>r.status==='completed').sort((a,b)=>b[1].updatedAt.localeCompare(a[1].updatedAt));
  if(completed.length>500){for(const [id] of completed.slice(500))delete state.operations[id];await save();}
  for(const row of await candidates(dir,state,{automatic:true}))await rm(join(dir,row.relative),{recursive:true,force:true});
}
