import {mkdir,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
// Serialize acquisition, stale recovery and release. An interrupted gate fails
// closed: remove sync.lock.gate only after stopping every plugin host.
export async function acquireSyncLock(stateDir,{recover=false}={}) {
  await mkdir(stateDir,{recursive:true,mode:0o700});
  const lock=join(stateDir,'sync.lock'),gate=join(stateDir,'sync.lock.gate');
  const enter=async()=>{try{await mkdir(gate);try{await writeFile(join(gate,'owner.json'),JSON.stringify({pid:process.pid,createdAt:new Date().toISOString()}),{mode:0o600});}catch(error){await rm(gate,{recursive:true,force:true});throw error;}return true;}catch(e){if(e.code==='EEXIST')return false;throw e;}};
  if(!await enter())return null;
  const token=randomUUID();
  try {
    try {await mkdir(lock);} catch(error) {
      if(error.code!=='EEXIST')throw error;
      if(!recover)return null;
      const owner=await readFile(join(lock,'owner.json'),'utf8').then(JSON.parse).catch(()=>null);
      let stale=false;
      if(Number.isInteger(owner?.pid)&&owner.pid>0) {
        try{process.kill(owner.pid,0);}catch(e){stale=e.code==='ESRCH';}
      } else {const info=await stat(lock).catch(()=>null);stale=!!info&&Date.now()-info.mtimeMs>60000;}
      if(!stale)return null;
      await rm(lock,{recursive:true,force:true});await mkdir(lock);
    }
    try{await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid,token}),{mode:0o600});}
    catch(error){await rm(lock,{recursive:true,force:true});throw error;}
  } finally {await rm(gate,{recursive:true,force:true});}
  return async()=>{
    // Release must not be dropped merely because another acquisition is checking.
    const deadline=Date.now()+5000;
    while(!await enter()){if(Date.now()>deadline)throw Error('Sync lock gate is unavailable; stop all hosts before inspecting sync.lock.gate');await new Promise(resolve=>setTimeout(resolve,10));}
    try {
      const owner=await readFile(join(lock,'owner.json'),'utf8').then(JSON.parse).catch(()=>null);
      if(owner?.token===token)await rm(lock,{recursive:true,force:true});
    } finally {await rm(gate,{recursive:true,force:true});}
  };
}
