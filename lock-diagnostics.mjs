import {readFile, stat, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const alive=pid=>{if(!Number.isInteger(pid)||pid<=0)return 'unknown';try{process.kill(pid,0);return 'alive';}catch(e){return e.code==='ESRCH'?'dead':'unknown';}};
export async function inspectSyncLock(dir) {
  const rows=[];
  for(const name of ['sync.lock','sync.lock.gate']) {
    const path=join(dir,name),info=await stat(path).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(!info)continue;
    const raw=await readFile(join(path,'owner.json'),'utf8').catch(()=>''),owner=(()=>{try{return JSON.parse(raw);}catch{return {};}})();
    rows.push({name,pid:owner.pid??null,process:alive(owner.pid),ageMs:Math.max(0,Date.now()-info.mtimeMs),stamp:[info.dev,info.ino,info.mtimeMs,raw].join(':')});
  }
  return {rows:rows.map(({stamp,...r})=>r),token:createHash('sha256').update(JSON.stringify(rows.map(({ageMs,...r})=>r))).digest('hex'),nextStep:rows.some(r=>r.process==='alive')?'Wait for the owning process to finish.':'Stop every Magpie plugin host, inspect again, then use the offline recovery command.'};
}
// Offline only: explicit acknowledgement is required even when PID metadata is missing.
export async function recoverSyncLock(dir,{token,hostsStopped=false}={}) {
  if(!hostsStopped)throw Error('Stop every plugin host before recovering the lock');
  const current=await inspectSyncLock(dir);
  if(token!==current.token)throw Error('Lock changed; inspect again');
  if(current.rows.some(r=>r.process==='alive'||r.process==='unknown'&&r.pid!==null||r.ageMs<60000))throw Error('Lock owner is active, uncertain, or too recent');
  for(const row of current.rows)await rm(join(dir,row.name),{recursive:true,force:true});
  return {recovered:current.rows.length};
}
