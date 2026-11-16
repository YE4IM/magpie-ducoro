// Only authored messages cross the API boundary; filesystem paths stay private.
export const publicError = (status, code, message) => Object.assign(new Error(message), {httpStatus:status, publicCode:code});
export async function readJsonBody(req, limit = 512 * 1024) {
  const chunks=[];let bytes=0;
  for await(const chunk of req){const data=Buffer.from(chunk);bytes+=data.length;if(bytes>limit)throw publicError(413,'REQUEST_TOO_LARGE','请求过大');chunks.push(data);}
  let value;
  try {value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw publicError(400,'INVALID_JSON','请求内容必须是有效的 JSON 对象。');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw publicError(422,'INVALID_INPUT','请求内容必须是有效的 JSON 对象。');
  return value;
}
export function apiFailure(error){
  if(error.httpStatus)return {status:error.httpStatus,body:{error:error.message,errorCode:error.publicCode}};
  if(['state-corrupt','state-version'].includes(error.code))return {status:409,body:{error:'管理记录已损坏或版本不兼容，请保留原文件并恢复有效备份。',errorCode:'STATE_CORRUPT'}};
  if(['EACCES','EPERM','EROFS','ENOSPC','EIO'].includes(error.code))return {status:503,body:{error:'本地存储不可读写，请检查权限及剩余空间。',errorCode:'STORAGE_UNAVAILABLE'}};
  return {status:503,body:{error:'读取失败，请检查 Ducoro 是否运行，然后重试。',errorCode:'SERVICE_UNAVAILABLE'}};
}
