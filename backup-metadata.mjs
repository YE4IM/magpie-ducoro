import {readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {join} from 'node:path';
export async function backupMetadata(dir,id){
  if(!/^(?:[a-f0-9]{64}|[a-f0-9-]{36})$/.test(id))throw Error('Invalid backup id');
  const value=JSON.parse(await readFile(join(dir,id+'.meta.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return '{}';throw e;}));
  return {name:typeof value.name==='string'?value.name:'',note:typeof value.note==='string'?value.note:'',retained:value.retained===true};
}
export async function updateBackupMetadata(dir,id,value){
  await backupMetadata(dir,id);
  if(typeof value.name!=='string'||value.name.length>120||typeof value.note!=='string'||value.note.length>2000||typeof value.retained!=='boolean')throw Error('Invalid backup metadata');
  const file=join(dir,id+'.meta.json'),body={name:value.name,note:value.note,retained:value.retained};
  await writeFile(file+'.tmp',JSON.stringify(body),{mode:0o600});await rename(file+'.tmp',file);return body;
}
export async function removeBackupMetadata(dir,id){await unlink(join(dir,id+'.meta.json')).catch(e=>{if(e.code!=='ENOENT')throw e;});}
export async function pruneBackups(dir,ids,limit){
  let unretained=0;
  for(const id of ids){if((await backupMetadata(dir,id)).retained)continue;if(++unretained>limit){await unlink(join(dir,id+'.json'));await removeBackupMetadata(dir,id);}}
}
