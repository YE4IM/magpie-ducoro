import {mkdir,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
// All mutation paths use the same owner protocol. Recover only demonstrably stale locks.
export async function acquireSyncLock(stateDir,{recover=false}={}) {
  await mkdir(stateDir,{recursive:true,mode:0o700});
  const lock=join(stateDir,'sync.lock');
  try {await mkdir(lock);} catch(error) {
    if(error.code!=='EEXIST')throw error;
    if(!recover)return null;
    const owner=await readFile(join(lock,'owner.json'),'utf8').then(JSON.parse).catch(()=>null);
    let stale=false;
    if(Number.isInteger(owner?.pid)&&owner.pid>0) {
      try{process.kill(owner.pid,0);}catch(e){stale=e.code==='ESRCH';}
    } else {const info=await stat(lock).catch(()=>null);stale=!!info&&Date.now()-info.mtimeMs>60000;}
    if(!stale)return null;
    await rm(lock,{recursive:true,force:true});
    try{await mkdir(lock);}catch(e){if(e.code==='EEXIST')return null;throw e;}
  }
  try{await writeFile(join(lock,'owner.json'),JSON.stringify({pid:process.pid}),{mode:0o600});}
  catch(error){await rm(lock,{recursive:true,force:true});throw error;}
  return ()=>rm(lock,{recursive:true,force:true});
}
