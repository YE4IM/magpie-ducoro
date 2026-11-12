import {backupMetadata,removeBackupMetadata,pruneBackups} from './backup-metadata.mjs';
import { readFile, open, mkdir, rename, unlink, readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const policy = (x) =>
  x === null ||
  (object(x) &&
    Array.isArray(x.allow) &&
    x.allow.every((v) => typeof v === "string") &&
    Array.isArray(x.deny ?? []) &&
    (x.deny ?? []).every((v) => typeof v === "string"));
function safeKeys(value) {
  if(value && typeof value==='object')for(const [key,child] of Object.entries(value)) {
    if(['__proto__','constructor','prototype'].includes(key))throw Error('管理记录包含保留键');
    safeKeys(child);
  }
}
export function validateState(raw) {
  safeKeys(raw);
  if (!object(raw) || ![1, 2].includes(raw.v))
    throw Object.assign(
      Error("管理记录版本未知，请恢复兼容的备份后重新读取。"),
      { code: "state-version" },
    );
  if(raw.creations!==undefined) {
    if(!object(raw.creations))throw Error('创建恢复记录损坏');
    for(const [id,tx] of Object.entries(raw.creations))if(!object(tx)||!['mcp','skills'].includes(tx.kind)||!/^(global|agt-[A-Za-z0-9-]+)$/.test(tx.scope??'')||id!==`${tx.kind}:${tx.scope}:${tx.name}`||typeof tx.name!=='string'||typeof tx.sourceName!=='string'||typeof tx.hash!=='string'||typeof tx.contentHash!=='string'||tx.kind==='skills'&&typeof tx.dir!=='string')throw Error('创建恢复记录损坏');
  }
  if(raw._journalSeq !== undefined && (!Number.isSafeInteger(raw._journalSeq)||raw._journalSeq<0))throw Error('管理记录序号无效');
  if (raw.operations !== undefined && (!object(raw.operations) || Object.values(raw.operations).some(row =>
    !object(row) || !['running','failed','completed'].includes(row.status) ||
    !['feature','target','resource'].every(key => typeof row[key] === 'string' && row[key].length > 0) ||
    typeof row.revision !== 'string' || !/^[a-f0-9]{64}$/.test(row.revision) ||
    (row.failureClass!==undefined&&!['temporary','permission','conflict','unsupported','corrupt','unknown'].includes(row.failureClass)) ||
    (row.nextRetryAt!=null && (typeof row.nextRetryAt!=='string'||!Number.isFinite(Date.parse(row.nextRetryAt)))) ||
    !Number.isSafeInteger(row.attempts) || row.attempts < 1 ||
    typeof row.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.updatedAt) ||
    !Number.isFinite(Date.parse(row.updatedAt)) ||
    !Array.isArray(row.dependencies) || !row.dependencies.every(value => typeof value === 'string')
  ))) throw Error('操作恢复记录损坏');
  for (const key of ["mcp", "skills", "accountConnectors"])
    if (raw[key] !== undefined && !object(raw[key]))
      throw Error("管理记录格式损坏");
  for (const [id, row] of Object.entries(raw.mcp ?? {})) {
    if (typeof row === "string" && !id.includes(":")) continue;
    if (
      !object(row) ||
      typeof row.slug !== "string" ||
      !/^(global|agt-[A-Za-z0-9-]+)$/.test(row.scope ?? "") ||
      id !== `${row.scope}:${row.slug}` ||
      typeof row.hash !== "string"
    )
      throw Error("连接器管理记录损坏");
  }
  for (const row of Object.values(raw.skills ?? {}))
    if (
      !object(row) ||
      typeof row.hash !== "string" ||
      (row.scope !== undefined &&
        (!/^(global|agt-[A-Za-z0-9-]+)$/.test(row.scope) ||
          typeof row.name !== "string" ||
          typeof row.sourceName !== "string")) ||
      (row.replacement &&
        (!object(row.replacement) ||
          typeof row.replacement.backupName !== "string" ||
          !["installed", "backed-up", "prepared"].includes(
            row.replacement.phase,
          )))
    )
      throw Error("技能管理记录损坏");
  for (const [id, rows] of Object.entries(raw.accountConnectors ?? {})) {
    if (!/^agt-[A-Za-z0-9-]+$/.test(id) || !object(rows))
      throw Error("账户管理记录损坏");
    for (const [slug, row] of Object.entries(rows))
      if (
        ["__proto__", "constructor", "prototype"].includes(slug) ||
        !/^[A-Za-z0-9_-]+$/.test(slug) ||
        !object(row) ||
        !Object.hasOwn(row, "previous") ||
        !Object.hasOwn(row, "applied") ||
        !policy(row.previous) ||
        !policy(row.applied) ||
        (Object.hasOwn(row, "pending") && !policy(row.pending))
      )
        throw Error("账户权限恢复记录损坏");
  }
  if (
    raw.connection != null &&
    (!object(raw.connection) || typeof raw.connection.slug !== "string")
  )
    throw Error("模型连接管理记录损坏");
  if (
    raw.modelMigration != null &&
    (!object(raw.modelMigration) ||
      typeof raw.modelMigration.slug !== "string" ||
      typeof raw.modelMigration.target !== "string" ||
      !Array.isArray(raw.modelMigration.from) ||
      !raw.modelMigration.from.every((x) => typeof x === "string"))
  )
    throw Error("模型迁移记录损坏");
  if (raw.modelApplied !== undefined && (!object(raw.modelApplied) || Object.entries(raw.modelApplied).some(([id,row]) => !/^agt-[A-Za-z0-9-]+$/.test(id) || !object(row) || typeof row.model !== 'string'))) throw Error('Invalid applied model records');
  if (raw.total !== undefined) {
    if (
      !object(raw.total) ||
      !object(raw.total.profiles) ||
      !object(raw.total.files)
    )
      throw Error("指令管理记录损坏");
    for (const [id, row] of Object.entries(raw.total.profiles))
      if (
        !/^agt-[A-Za-z0-9-]+$/.test(id) ||
        !object(row) ||
        typeof row.block !== "string" ||
        (row.pending !== undefined && typeof row.pending !== "string")
      )
        throw Error("指令恢复记录损坏");
    for (const [key, row] of Object.entries(raw.total.files))
      if (
        !object(row) ||
        !/^agt-[A-Za-z0-9-]+$/.test(row.botId ?? "") ||
        !/^[a-z0-9][a-z0-9-]{1,49}$/.test(row.name ?? "") ||
        key !== `${row.botId}/${row.name}` ||
        typeof row.hash !== "string" ||
        (row.pending !== undefined && typeof row.pending !== "string")
      )
        throw Error("子代理管理记录损坏");
  }
  return {
    ...raw,
    v: 2,
    connection: raw.connection ?? null,
    mcp: raw.mcp ?? {},
    skills: raw.skills ?? {},
    accountConnectors: raw.accountConnectors ?? {},
  };
}
// The sync.lock owner serializes writers, including checkpoint/cleanup operations.
// Snapshot sequence numbers make a crash between snapshot and journal rotation safe.
export const stateMetrics = { snapshotBytes: 0, journalBytes: 0, backupBytes: 0, writes: 0 };
const cache = new Map();
const queues = new Map();
const digest = value => createHash('sha256').update(value).digest('hex');
const empty = () => ({v:2,connection:null,mcp:{},skills:{},accountConnectors:{}});
const optional = async file => readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
const stamp = async file => Promise.all([file,file+'.journal'].map(async p=>{try {const s=await stat(p);return `${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;}catch(e){if(e.code==='ENOENT')return '';throw e;}})).then(x=>x.join('|'));
const serial = (file,work) => {const task=(queues.get(file)??Promise.resolve()).then(work);const tail=task.catch(()=>{});queues.set(file,tail);void tail.then(()=>{if(queues.get(file)===tail)queues.delete(file);});return task;};
async function atomic(file,body) {
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  const temp=file+'.'+randomUUID()+'.tmp';
  try {
    const h=await open(temp,'wx',0o600);
    try {
      await h.writeFile(body);
      const key=file.endsWith('.journal')?'journalBytes':file.includes('state-backups/')?'backupBytes':'snapshotBytes';
      stateMetrics[key]+=Buffer.byteLength(body);stateMetrics.writes++;
      await h.sync();
    }finally{await h.close();}
    await rename(temp,file);
    const dir=await open(dirname(file),'r');try{await dir.sync();}finally{await dir.close();}
  }finally{await unlink(temp).catch(()=>{});}
}
function delta(before,after,path=[],out=[]) {
  if(before===after)return out;
  if(object(before)&&object(after)) {
    for(const k of new Set([...Object.keys(before),...Object.keys(after)])) {
      if(!Object.hasOwn(after,k))out.push({path:[...path,k],remove:true});
      else if(!Object.hasOwn(before,k))out.push({path:[...path,k],value:after[k]});
      else delta(before[k],after[k],[...path,k],out);
    }
  }else if(!Array.isArray(before)||!Array.isArray(after)||JSON.stringify(before)!==JSON.stringify(after))out.push({path,value:after});
  return out;
}
function apply(state,changes) {
  for(const c of changes) {
    if(!Array.isArray(c.path)||!c.path.length||c.path.some(k=>typeof k!=='string'||['__proto__','constructor','prototype'].includes(k)))throw Error('增量记录路径无效');
    let parent=state;
    for(const k of c.path.slice(0,-1)){if(!Object.hasOwn(parent,k)||!object(parent[k]))throw Error('增量记录顺序无效');parent=parent[k];}
    if(c.remove)delete parent[c.path.at(-1)];else parent[c.path.at(-1)]=c.value;
  }
}
export async function readManagedState(file) {
  // Retry when a concurrent writer rotates the snapshot while a page reads it.
  for(let attempt=0;attempt<5;attempt++) {
    const before=await stamp(file);
    const [body,journalBody]=await Promise.all([optional(file),optional(file+'.journal')]);
    const journal=journalBody??'';
    if(before!==await stamp(file))continue;
    try {
      const state=body!==null?validateState(JSON.parse(body)):empty();
      let seq=state._journalSeq??0;
      const lines=journal.split('\n'); const tail=lines.pop();
      let count=0;
      for(const line of lines) {
        if(!line)throw Error('增量记录损坏');
        const {payload,checksum}=JSON.parse(line);
        if(typeof payload!=='string'||digest(payload)!==checksum)throw Error('增量记录校验失败');
        const row=JSON.parse(payload);
        if(!Number.isSafeInteger(row.seq)||row.seq<1||!Array.isArray(row.changes))throw Error('增量记录无效');
        if(row.seq<=seq)continue;
        if(row.seq!==seq+1)throw Error('增量记录不连续');
        apply(state,row.changes);seq=row.seq;count++;
      }
      state._journalSeq=seq;validateState(state);
      cache.set(file,{state:structuredClone(state),stamp:before,exists:body!==null,count,bytes:Buffer.byteLength(journal)-Buffer.byteLength(tail),tail:!!tail});
      return {status:body!==null?'ready':'missing',state};
    } catch(error) {
      throw Object.assign(Error(error.code==='state-version'?error.message:'管理记录已损坏；原文件已保留，请恢复备份后重新读取。'),{code:error.code??'state-corrupt'});
    }
  }
  throw Object.assign(Error('管理记录正在更新，请稍后重试。'),{code:'state-unreadable'});
}
async function current(file) {
  let entry=cache.get(file);
  if(!entry||entry.stamp!==await stamp(file)){await readManagedState(file);entry=cache.get(file);}
  return entry;
}
async function compact(file,state,keepBackup=true) {
  const body=JSON.stringify(state,null,2)+'\n';
  const previous=await optional(file);
  if(previous&&keepBackup&&previous!==body) {
    validateState(JSON.parse(previous));
    const dir=join(dirname(file),'state-backups');await mkdir(dir,{recursive:true,mode:0o700});
    await atomic(join(dir,digest(previous)+'.json'),previous);
    const entries=await Promise.all((await readdir(dir)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(async n=>({n,time:(await stat(join(dir,n))).mtimeMs})));
    entries.sort((a,b)=>b.time-a.time);
    await pruneBackups(dir,entries.map(item=>item.n.slice(0,-5)),5);
  }
  await atomic(file,body);
  await atomic(file+'.journal','');
  cache.set(file,{state:structuredClone(state),stamp:await stamp(file),exists:true,count:0,bytes:0,tail:false});
}
// Explicit paths capture only operation intent. All other callers retain full
// validation and saving, including resource changes made before operation finish.
export function saveManagedState(file,state,{paths}={}) {
  let captured;
  if (paths) {
    captured = paths.map(path => {
      if (!Array.isArray(path) || !path.length || path.some(k => typeof k !== 'string' || ['__proto__','constructor','prototype','_journalSeq'].includes(k))) throw Error('Invalid state save path');
      let value = state;
      for (const key of path) value = value != null && Object.hasOwn(value,key) ? value[key] : undefined;
      return value === undefined ? {path,remove:true} : {path,value:JSON.parse(JSON.stringify(value))};
    });
  } else {
    captured=JSON.parse(JSON.stringify(state));validateState(captured);
  }
  return serial(file,async()=>{
    let entry=await current(file);
    let next, changes;
    if (paths) {
      next={...entry.state};
      // Copy ancestors only: cached, validated branches remain immutable.
      for (const change of captured) {
        let parent=next;
        for (const key of change.path.slice(0,-1)) {
          if (!object(parent[key])) {
            if (parent[key] !== undefined) throw Error('Invalid state save parent');
            parent[key]={};
          } else parent[key]={...parent[key]};
          parent=parent[key];
        }
        if (change.remove) delete parent[change.path.at(-1)];
        else parent[change.path.at(-1)]=change.value;
      }
      const roots=new Set(captured.map(c=>c.path[0]));
      validateState({...empty(),...Object.fromEntries([...roots].map(k=>[k,next[k]]))});
      changes=[];
      const missingParent=captured.some(change => {
        let parent=entry.state;
        for(const key of change.path.slice(0,-1)) {parent=parent?.[key];if(!object(parent))return true;}
        return false;
      });
      for (const change of missingParent ? [] : captured) {
        let before=entry.state,after=next;
        for (const key of change.path) { before=before?.[key];after=after?.[key]; }
        if (change.remove) { if(before!==undefined)changes.push(change); }
        else delta(before,after,change.path,changes);
      }
      if(missingParent)changes=delta(entry.state,next);
    } else {
      next=captured;
      next._journalSeq=entry.state._journalSeq??0;
      changes=delta(entry.state,next);
    }
    if(!changes.length)return;
    const replay=structuredClone(entry.state);apply(replay,changes);validateState(replay);
    await mkdir(dirname(file),{recursive:true,mode:0o700});
    if(!entry.exists) { await compact(file,entry.state,false);entry=cache.get(file); }
    const seq=(entry.state._journalSeq??0)+1;
    const payload=JSON.stringify({seq,changes});
    const line=JSON.stringify({payload,checksum:digest(payload)})+'\n';
    const h=await open(file+'.journal','a+',0o600);
    try {if(entry.tail)await h.truncate(entry.bytes);await h.writeFile(line);stateMetrics.journalBytes+=Buffer.byteLength(line);stateMetrics.writes++;await h.sync();}finally{await h.close();}
    next._journalSeq=seq;
    const updated={state:next,stamp:await stamp(file),exists:true,count:entry.count+1,bytes:entry.bytes+Buffer.byteLength(line),tail:false};
    cache.set(file,updated);
    if(updated.count>=128||updated.bytes>=1024*1024)await compact(file,next);
  });
}
export function createStateBackup(file) {
  return serial(file,async()=>{
    const entry=await current(file);
    const body=JSON.stringify(entry.state,null,2)+'\n';validateState(entry.state);
    const dir=join(dirname(file),'state-backups');await mkdir(dir,{recursive:true,mode:0o700});
    const id=digest(body);await atomic(join(dir,id+'.json'),body);
    const entries=await Promise.all((await readdir(dir)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(async n=>({n,time:(await stat(join(dir,n))).mtimeMs})));
    entries.sort((a,b)=>b.time-a.time);await pruneBackups(dir,entries.map(item=>item.n.slice(0,-5)),5);
    return {id};
  });
}
export function compactManagedState(file,{keepBackup=true}={}) {
  return serial(file,async()=>{const entry=await current(file);if(entry.bytes||entry.tail)await compact(file,entry.state,keepBackup);});
}
const counts = s => Object.fromEntries(['mcp','skills','accountConnectors'].map(k=>[k,Object.keys(s[k]??{}).length]));
export async function stateBackups(file) {
  const {readdir,stat}=await import('node:fs/promises');
  const {dirname,join}=await import('node:path');
  const dir=join(dirname(file),'state-backups'), result=[];
  for(const name of await readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;})) {
    if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
    try {const body=await readFile(join(dir,name),'utf8');const {createHash}=await import('node:crypto');if(createHash('sha256').update(body).digest('hex')!==name.slice(0,-5))continue;const state=validateState(JSON.parse(body));result.push({id:name.slice(0,-5),checksum:name.slice(0,-5),createdAt:(await stat(join(dir,name))).mtime.toISOString(),counts:counts(state),...await backupMetadata(dir,name.slice(0,-5))});}catch{}
  }
  return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function previewStateBackup(file,id) {
  if(!/^[a-f0-9]{64}$/.test(id??''))throw Error('备份标识无效');
  const {dirname,join}=await import('node:path');
  const {createHash}=await import('node:crypto');
  const body=await readFile(join(dirname(file),'state-backups',id+'.json'),'utf8');
  if(createHash('sha256').update(body).digest('hex')!==id)throw Error('备份校验失败');
  const state=validateState(JSON.parse(body));
  const current=await readManagedState(file).catch(()=>null);
  return {id,checksum:id,counts:counts(state),currentCounts:current?counts(current.state):null,state};
}
export async function restoreStateBackup(file,id,checksum) {
  if(id!==checksum)throw Error('请先预览并核对备份');
  const preview=await previewStateBackup(file,id);
  const {writeFile,rename,copyFile,unlink}=await import('node:fs/promises');
  const {randomUUID}=await import('node:crypto');
  // Preserve the original even when corrupt, independently of valid backups.
  await copyFile(file,`${file}.before-restore`).catch(e=>{if(e.code!=='ENOENT')throw e;});
  await copyFile(file+'.journal',file+'.journal.before-restore').catch(e=>{if(e.code!=='ENOENT')throw e;});
  // Advance past the old journal before installing a restored snapshot. A crash
  // before journal rotation must never replay the state being rolled back.
  let max=preview.state._journalSeq??0;
  for(const line of (await optional(file+'.journal')??'').split('\n'))try{const row=JSON.parse(JSON.parse(line).payload);if(Number.isSafeInteger(row.seq))max=Math.max(max,row.seq);}catch{}
  await compact(file,{...preview.state,_journalSeq:max+1},false);
}

export async function deleteStateBackup(file, id, checksum) {
  if (!/^[a-f0-9]{64}$/.test(id ?? '') || id !== checksum)
    throw Error('备份标识无效，请刷新列表后重试。');
  const { dirname, join } = await import('node:path');
  const { unlink } = await import('node:fs/promises');
  try {
    await previewStateBackup(file, id);
    if((await backupMetadata(join(dirname(file),'state-backups'),id)).retained)throw Error('Unmark retention before deleting this backup');
    await removeBackupMetadata(join(dirname(file),'state-backups'),id);
    await unlink(join(dirname(file), 'state-backups', id + '.json'));
    return { deleted: true };
  } catch (error) {
    if (error.code === 'ENOENT') return { deleted: false };
    throw error;
  }
}
