import {readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
export async function readOperationControls(dir){return JSON.parse(await readFile(join(dir,'operation-controls.json'),'utf8').catch(e=>{if(e.code==='ENOENT')return '{}';throw e;}));}
export async function setOperationControl(dir,id,paused){
  if(!/^[a-f0-9]{64}$/.test(id)||typeof paused!=='boolean')throw Error('Invalid operation control');
  const controls=await readOperationControls(dir);if(paused)controls[id]={paused:true};else delete controls[id];
  const file=join(dir,'operation-controls.json');await writeFile(file+'.tmp',JSON.stringify(controls),{mode:0o600});await rename(file+'.tmp',file);
}
export const failureClasses = ['temporary','permission','conflict','unsupported','corrupt','unknown'];
export function classifyFailure(error){
  if(failureClasses.includes(error?.failureClass))return error.failureClass;
  const code=String(error?.errorCode??error?.code??'').toUpperCase();
  if(['EACCES','EPERM','UNAUTHORIZED','FORBIDDEN','401','403'].includes(code))return 'permission';
  if(['CONFLICT','REVISION_CONFLICT','409','412'].includes(code))return 'conflict';
  if(['ENOTSUP','ENOSYS','UNSUPPORTED','NOT_IMPLEMENTED','ENOENT','405','501'].includes(code))return 'unsupported';
  if(['CORRUPT','INVALID_JSON','STATE_CORRUPT','STATE-VERSION'].includes(code))return 'corrupt';
  if(error?.outcomeUnknown || ['ABORT_ERR','OUTPUT_LIMIT'].includes(code))return 'unknown';
  if(['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EAI_AGAIN','EPIPE','408','429','502','503','504'].includes(code))return 'temporary';
  const text=String(error?.message??error??'');
  if(/permission|forbidden|unauthori[sz]ed|权限/i.test(text))return 'permission';
  if(/corrupt|invalid json|损坏/i.test(text))return 'corrupt';
  if(/unsupported|not supported|unknown command|不支持/i.test(text))return 'unsupported';
  if(/conflict|changed|belongs|invalid|unavailable.*model|配置|冲突|已变化|无效|由其他页面修改/i.test(text))return 'conflict';
  if(/timed out|timeout|temporar|connection reset|connection refused|超时|暂时/i.test(text))return 'temporary';
  return 'unknown';
}
export function commandFailure(result){
  const detail=result?.json?.error;
  const error={message:detail?.message??result?.stderr??'',errorCode:detail?.code??result?.errorCode??result?.code,outcomeUnknown:result?.outcomeUnknown};
  return {...error,failureClass:classifyFailure(error)};
}
export function failureAdvice(kind){
  return ({temporary:'暂时失败，将按退避时间重试。',permission:'请检查 Ducoro 登录状态及此资源的写入权限。',conflict:'请对照期望值与当前值，处理冲突后手动重试。',unsupported:'请检查 Ducoro CLI 版本和命令能力后手动重试。',corrupt:'请保留原文件，从已校验的备份恢复后重试。',unknown:'结果未确认，请先读回核验，再手动重试。'})[kind]??'请先读回核验，再手动重试。';
}
