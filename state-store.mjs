import { readFile } from 'node:fs/promises'
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x)
const policy = x => x === null || object(x) && Array.isArray(x.allow) && x.allow.every(v => typeof v === 'string') && Array.isArray(x.deny ?? []) && (x.deny ?? []).every(v => typeof v === 'string')
export function validateState(raw) {
  if (!object(raw) || ![1, 2].includes(raw.v)) throw Object.assign(Error('管理记录版本未知，请恢复兼容的备份后重新读取。'), {code:'state-version'})
  for (const key of ['mcp','skills','accountConnectors']) if (raw[key] !== undefined && !object(raw[key])) throw Error('管理记录格式损坏')
  for (const [id, row] of Object.entries(raw.mcp ?? {})) {
    if (typeof row === 'string' && !id.includes(':')) continue
    if (!object(row) || typeof row.slug !== 'string' || !/^(global|agt-[A-Za-z0-9-]+)$/.test(row.scope ?? '') || id !== `${row.scope}:${row.slug}` || typeof row.hash !== 'string') throw Error('连接器管理记录损坏')
  }
  for (const row of Object.values(raw.skills ?? {})) if (!object(row) || typeof row.hash !== 'string' || row.scope !== undefined && (!/^(global|agt-[A-Za-z0-9-]+)$/.test(row.scope) || typeof row.name !== 'string' || typeof row.sourceName !== 'string') || row.replacement && (!object(row.replacement) || typeof row.replacement.backupName !== 'string' || !['installed','backed-up','prepared'].includes(row.replacement.phase))) throw Error('技能管理记录损坏')
  for (const [id, rows] of Object.entries(raw.accountConnectors ?? {})) {
    if (!/^agt-[A-Za-z0-9-]+$/.test(id) || !object(rows)) throw Error('账户管理记录损坏')
    for (const [slug, row] of Object.entries(rows)) if (['__proto__','constructor','prototype'].includes(slug) || !/^[A-Za-z0-9_-]+$/.test(slug) || !object(row) || !Object.hasOwn(row,'previous') || !Object.hasOwn(row,'applied') || !policy(row.previous) || !policy(row.applied) || Object.hasOwn(row,'pending') && !policy(row.pending)) throw Error('账户权限恢复记录损坏')
  }
  if (raw.connection != null && (!object(raw.connection) || typeof raw.connection.slug !== 'string')) throw Error('模型连接管理记录损坏')
  if (raw.modelMigration != null && (!object(raw.modelMigration) || typeof raw.modelMigration.slug !== 'string' || typeof raw.modelMigration.target !== 'string' || !Array.isArray(raw.modelMigration.from) || !raw.modelMigration.from.every(x=>typeof x==='string'))) throw Error('模型迁移记录损坏')
  if (raw.total !== undefined) {
    if (!object(raw.total) || !object(raw.total.profiles) || !object(raw.total.files)) throw Error('指令管理记录损坏')
    for (const [id,row] of Object.entries(raw.total.profiles)) if (!/^agt-[A-Za-z0-9-]+$/.test(id) || !object(row) || typeof row.block !== 'string' || row.pending !== undefined && typeof row.pending !== 'string') throw Error('指令恢复记录损坏')
    for (const [key,row] of Object.entries(raw.total.files)) if (!object(row) || !/^agt-[A-Za-z0-9-]+$/.test(row.botId ?? '') || !/^[a-z0-9][a-z0-9-]{1,49}$/.test(row.name ?? '') || key !== `${row.botId}/${row.name}` || typeof row.hash !== 'string' || row.pending !== undefined && typeof row.pending !== 'string') throw Error('子代理管理记录损坏')
  }
  return {...raw,v:2,connection:raw.connection ?? null,mcp:raw.mcp ?? {},skills:raw.skills ?? {},accountConnectors:raw.accountConnectors ?? {}}
}
export async function readManagedState(file) {
  let value
  try { value = await readFile(file,'utf8') }
  catch (error) {
    if (error.code === 'ENOENT') return {status:'missing',state:{v:2,connection:null,mcp:{},skills:{},accountConnectors:{}}}
    throw Object.assign(Error('管理记录暂时无法读取；已暂停同步，请检查文件权限后重新读取。'),{code:'state-unreadable'})
  }
  try { return {status:'ready',state:validateState(JSON.parse(value))} }
  catch (error) { throw Object.assign(Error(error.code === 'state-version' ? error.message : '管理记录已损坏；原文件已保留，请恢复备份后重新读取。'),{code:error.code ?? 'state-corrupt'}) }
}
