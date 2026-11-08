import { mkdir, copyFile, writeFile, chmod, rename, rm, lstat } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// One validated artifact per name/content, reused across authorized targets.
export function createSkillArtifacts(root, readBundle) {
  const ready = new Map();
  const metrics = { prepared: 0, reused: 0 };
  return {
    metrics: () => ({ ...metrics }),
    reset() { ready.clear(); },
    async prepare(name, bundle) {
      if(!/^[a-zA-Z0-9_-]+$/.test(name)||! /^[a-f0-9]{64}$/.test(bundle.hash))throw Error('技能产物标识无效');
      const key=bundle.hash+'/'+name;
      if(ready.has(key)){metrics.reused++;return ready.get(key);}
      const task=(async()=>{
        const parent=join(root,bundle.hash),target=join(parent,name);
        for(const path of [root,parent]) {
          await mkdir(path,{recursive:true,mode:0o700});
          const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())throw Error('技能缓存目录必须是普通目录');
        }
        try {if((await readBundle(target)).hash===bundle.hash){metrics.reused++;return target;}}catch{}
        await mkdir(parent,{recursive:true,mode:0o700});
        const temp=join(root,'.prepare-'+randomUUID()),staged=join(temp,name);
        try {
          await mkdir(staged,{recursive:true,mode:0o700});
          for(const f of bundle.files) {
            const path=resolve(staged,f.name);
            if(!path.startsWith(resolve(staged)+'/'))throw Error('技能文件路径无效');
            await mkdir(dirname(path),{recursive:true});
            if(f.name==='SKILL.md')await writeFile(path,bundle.md);else await copyFile(f.path,path);
            await chmod(path,f.mode);
          }
          if((await readBundle(staged)).hash!==bundle.hash)throw Error('技能来源在准备期间发生变化，请重试');
          await rm(target,{recursive:true,force:true});
          await rename(staged,target);metrics.prepared++;
          return target;
        }finally{await rm(temp,{recursive:true,force:true});}
      })();
      ready.set(key,task);
      try{return await task;}catch(e){ready.delete(key);throw e;}
    }
  };
}
