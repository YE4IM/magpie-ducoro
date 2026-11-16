import {mkdir,readdir,readFile,writeFile,rename,rm,symlink,lstat,readlink} from 'node:fs/promises';
import {join,resolve,dirname,basename,toNamespacedPath} from 'node:path';
import {randomUUID} from 'node:crypto';
import {publicError} from './page-http.mjs';

const claimName = /^([1-9]\d*)-([a-f0-9-]{36})$/;
const pause = () => new Promise(resolve => setTimeout(resolve,20));
const busy = () => publicError(409,'DRAFT_BUSY','草稿正在保存，请稍后重试。');
const unknown = () => publicError(409,'DRAFT_LOCK_UNKNOWN','草稿锁无法确认归属。请停止所有插件宿主，备份后移走 page-draft.lock 与 page-draft-locks，再重新打开页面。');
const samePath = (a,b) => process.platform==='win32' ? toNamespacedPath(a).toLowerCase()===toNamespacedPath(b).toLowerCase() : a===b;
const dead = pid => {
  try { process.kill(pid,0); return false; }
  catch(error) { return error.code === 'ESRCH'; }
};

// Bakery tickets serialize acquisition and recovery without a second shared
// gate that could itself be orphaned. Every claim has an immutable PID/UUID
// path; reclaiming a dead claim can never delete a successor's lock.
export async function withDraftLock(dir,work) {
  const root=resolve(dir,'page-draft-locks'),lock=resolve(dir,'page-draft.lock');
  await mkdir(root,{recursive:true,mode:0o700});
  const rootInfo=await lstat(root);
  if(!rootInfo.isDirectory() || rootInfo.isSymbolicLink())throw unknown();
  const name=`${process.pid}-${randomUUID()}`,claim=join(root,name);
  await mkdir(claim,{mode:0o700});
  let linked=false;
  const deadline=Date.now()+1000;
  const entries=async()=>{
    const rows=[];
    for(const item of await readdir(root)) {
      const match=claimName.exec(item);
      if(!match)throw unknown();
      const pid=Number(match[1]),path=join(root,item);
      if(!Number.isSafeInteger(pid))throw unknown();
      if(dead(pid)){await rm(path,{recursive:true,force:true});continue;}
      let ticket;
      try{ticket=Number(await readFile(join(path,'ticket'),'utf8'));}
      catch(error){if(error.code!=='ENOENT')throw error;}
      if(ticket!==undefined && (!Number.isSafeInteger(ticket)||ticket<1))throw unknown();
      rows.push({name:item,ticket});
    }
    return rows;
  };
  try {
    const rows=await entries(),ticket=Math.max(0,...rows.map(row=>row.ticket??0))+1;
    if(!Number.isSafeInteger(ticket))throw unknown();
    await writeFile(join(claim,'owner.json'),JSON.stringify({pid:process.pid,token:name}),{mode:0o600,flag:'wx'});
    // Absent ticket means "choosing"; readers must never observe a partial one.
    await writeFile(join(claim,'ticket.tmp'),String(ticket),{mode:0o600,flag:'wx'});
    await rename(join(claim,'ticket.tmp'),join(claim,'ticket'));
    for(;;) {
      const waiting=(await entries()).some(row=>row.name!==name &&
        (row.ticket===undefined || row.ticket<ticket || row.ticket===ticket && row.name<name));
      if(!waiting)break;
      if(Date.now()>=deadline)throw busy();
      await pause();
    }
    // Keep the original lock path as an interlock with older plugin hosts.
    // Publish ownership atomically: a crash cannot leave an ownerless new lock.
    for(;;) {
      try {await symlink(claim,lock,process.platform==='win32'?'junction':'dir');linked=true;break;}
      catch(error){if(error.code!=='EEXIST')throw error;}
      let owner;
      try{owner=JSON.parse(await readFile(join(lock,'owner.json'),'utf8'));}
      catch(error){
        if(error.code!=='ENOENT')throw unknown();
        const info=await lstat(lock).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
        if(!info)continue;
        // The dead claim may already have been collected by another waiter.
        // Its immutable link target still identifies the departed owner.
        if(info.isSymbolicLink()) {
          const target=resolve(dirname(lock),await readlink(lock)),match=claimName.exec(basename(target));
          if(samePath(dirname(target),root) && match && dead(Number(match[1]))) {await rm(lock,{force:true});continue;}
        }
        throw unknown();
      }
      if(!Number.isSafeInteger(owner.pid)||owner.pid<1)throw unknown();
      if(dead(owner.pid)) {await rm(lock,{recursive:true,force:true});continue;}
      if(Date.now()>=deadline)throw busy();
      await pause();
    }
    return await work();
  } finally {
    try {
      if(linked) {
        const owner=await readFile(join(lock,'owner.json'),'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
        if(owner?.token===name)await rm(lock,{recursive:true,force:true});
      }
    } finally {await rm(claim,{recursive:true,force:true});}
  }
}
