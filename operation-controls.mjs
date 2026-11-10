import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
export async function readOperationControls(dir){return JSON.parse(await readFile(join(dir,'operation-controls.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return '{}';throw e;}));}
export async function setOperationControl(dir,id,paused){
  if(!/^[a-f0-9]{64}$/.test(id)||typeof paused!=='boolean')throw Error('Invalid operation control');
  const controls=await readOperationControls(dir);if(paused)controls[id]={paused:true};else delete controls[id];
  const file=join(dir,'operation-controls.json');await writeFile(file+'.tmp',JSON.stringify(controls),{mode:0o600});await rename(file+'.tmp',file);
}
export function classifyFailure(error){
  if(['temporary','permission','conflict'].includes(error?.failureClass))return error.failureClass;
  const text=String(error?.message??error??'')+' '+String(error?.code??'');
  if(/conflict|changed|belongs|invalid|unavailable.*model|配置|冲突|已变化|无效|由其他页面修改/i.test(text))return 'conflict';
  if(/permission|forbidden|unauthori[sz]ed|EACCES|EPERM|权限|401|403/i.test(text))return 'permission';
  return 'temporary';
}

export function commandFailure(result){const detail=result?.json?.error;return {failureClass:classifyFailure({message:detail?.message??result?.stderr??'',code:detail?.code??result?.code})};}
