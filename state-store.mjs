import { readFile } from "node:fs/promises";
const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const policy = (x) =>
  x === null ||
  (object(x) &&
    Array.isArray(x.allow) &&
    x.allow.every((v) => typeof v === "string") &&
    Array.isArray(x.deny ?? []) &&
    (x.deny ?? []).every((v) => typeof v === "string"));
export function validateState(raw) {
  if (!object(raw) || ![1, 2].includes(raw.v))
    throw Object.assign(
      Error("管理记录版本未知，请恢复兼容的备份后重新读取。"),
      { code: "state-version" },
    );
  for (const key of ["mcp", "skills", "accountConnectors"])
    if (raw[key] !== undefined && !object(raw[key]))
      throw Error("管理记录格式损坏");
  for (const [id, row] of Object.entries(raw.mcp ?? {})) {
    if (typeof row === "string" && !id.includes(":")) continue;
    if (
      !object(row) ||
      typeof row.slug !== "string" ||
      !/^(global|agt-[A-Za-z0-9-]+)$/.test(row.scope ?? "") ||
      id !== `${row.scope}:${row.slug}` ||
      typeof row.hash !== "string"
    )
      throw Error("连接器管理记录损坏");
  }
  for (const row of Object.values(raw.skills ?? {}))
    if (
      !object(row) ||
      typeof row.hash !== "string" ||
      (row.scope !== undefined &&
        (!/^(global|agt-[A-Za-z0-9-]+)$/.test(row.scope) ||
          typeof row.name !== "string" ||
          typeof row.sourceName !== "string")) ||
      (row.replacement &&
        (!object(row.replacement) ||
          typeof row.replacement.backupName !== "string" ||
          !["installed", "backed-up", "prepared"].includes(
            row.replacement.phase,
          )))
    )
      throw Error("技能管理记录损坏");
  for (const [id, rows] of Object.entries(raw.accountConnectors ?? {})) {
    if (!/^agt-[A-Za-z0-9-]+$/.test(id) || !object(rows))
      throw Error("账户管理记录损坏");
    for (const [slug, row] of Object.entries(rows))
      if (
        ["__proto__", "constructor", "prototype"].includes(slug) ||
        !/^[A-Za-z0-9_-]+$/.test(slug) ||
        !object(row) ||
        !Object.hasOwn(row, "previous") ||
        !Object.hasOwn(row, "applied") ||
        !policy(row.previous) ||
        !policy(row.applied) ||
        (Object.hasOwn(row, "pending") && !policy(row.pending))
      )
        throw Error("账户权限恢复记录损坏");
  }
  if (
    raw.connection != null &&
    (!object(raw.connection) || typeof raw.connection.slug !== "string")
  )
    throw Error("模型连接管理记录损坏");
  if (
    raw.modelMigration != null &&
    (!object(raw.modelMigration) ||
      typeof raw.modelMigration.slug !== "string" ||
      typeof raw.modelMigration.target !== "string" ||
      !Array.isArray(raw.modelMigration.from) ||
      !raw.modelMigration.from.every((x) => typeof x === "string"))
  )
    throw Error("模型迁移记录损坏");
  if (raw.modelApplied !== undefined && (!object(raw.modelApplied) || Object.entries(raw.modelApplied).some(([id,row]) => !/^agt-[A-Za-z0-9-]+$/.test(id) || !object(row) || typeof row.model !== 'string'))) throw Error('Invalid applied model records');
  if (raw.total !== undefined) {
    if (
      !object(raw.total) ||
      !object(raw.total.profiles) ||
      !object(raw.total.files)
    )
      throw Error("指令管理记录损坏");
    for (const [id, row] of Object.entries(raw.total.profiles))
      if (
        !/^agt-[A-Za-z0-9-]+$/.test(id) ||
        !object(row) ||
        typeof row.block !== "string" ||
        (row.pending !== undefined && typeof row.pending !== "string")
      )
        throw Error("指令恢复记录损坏");
    for (const [key, row] of Object.entries(raw.total.files))
      if (
        !object(row) ||
        !/^agt-[A-Za-z0-9-]+$/.test(row.botId ?? "") ||
        !/^[a-z0-9][a-z0-9-]{1,49}$/.test(row.name ?? "") ||
        key !== `${row.botId}/${row.name}` ||
        typeof row.hash !== "string" ||
        (row.pending !== undefined && typeof row.pending !== "string")
      )
        throw Error("子代理管理记录损坏");
  }
  return {
    ...raw,
    v: 2,
    connection: raw.connection ?? null,
    mcp: raw.mcp ?? {},
    skills: raw.skills ?? {},
    accountConnectors: raw.accountConnectors ?? {},
  };
}
export async function readManagedState(file) {
  let value;
  try {
    value = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT")
      return {
        status: "missing",
        state: {
          v: 2,
          connection: null,
          mcp: {},
          skills: {},
          accountConnectors: {},
        },
      };
    throw Object.assign(
      Error("管理记录暂时无法读取；已暂停同步，请检查文件权限后重新读取。"),
      { code: "state-unreadable" },
    );
  }
  try {
    return { status: "ready", state: validateState(JSON.parse(value)) };
  } catch (error) {
    throw Object.assign(
      Error(
        error.code === "state-version"
          ? error.message
          : "管理记录已损坏；原文件已保留，请恢复备份后重新读取。",
      ),
      { code: error.code ?? "state-corrupt" },
    );
  }
}

// Backups contain ownership facts and original policies; keep them private.
export async function saveManagedState(file, state) {
  validateState(state);
  const {writeFile,rename,mkdir,readdir,unlink}=await import('node:fs/promises');
  const {dirname,join}=await import('node:path');
  const {createHash,randomUUID}=await import('node:crypto');
  const dir=join(dirname(file),'state-backups');
  await mkdir(dir,{recursive:true,mode:0o700});
  const previous=await readFile(file,'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
  if(previous!==null && previous === JSON.stringify(state,null,2)+'\n') return;
  if(previous!==null) {
    // Never replace a corrupt original or promote it into a valid backup.
    validateState(JSON.parse(previous));
    const id=createHash('sha256').update(previous).digest('hex');
    await writeFile(join(dir,`${id}.json`),previous,{flag:'wx',mode:0o600}).catch(e=>{if(e.code!=='EEXIST')throw e;});
  }
  const temp=`${file}.${randomUUID()}.tmp`;
  try {await writeFile(temp,JSON.stringify(state,null,2)+'\n',{mode:0o600});await rename(temp,file);} finally {await unlink(temp).catch(()=>{});}
  const entries=await Promise.all((await readdir(dir)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(async n=>({n,time:(await (await import('node:fs/promises')).stat(join(dir,n))).mtimeMs})));
  entries.sort((a,b)=>b.time-a.time);
  await Promise.all(entries.slice(5).map(x=>unlink(join(dir,x.n))));
}
const counts = s => Object.fromEntries(['mcp','skills','accountConnectors'].map(k=>[k,Object.keys(s[k]??{}).length]));
export async function stateBackups(file) {
  const {readdir,stat}=await import('node:fs/promises');
  const {dirname,join}=await import('node:path');
  const dir=join(dirname(file),'state-backups'), result=[];
  for(const name of await readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;})) {
    if(!/^[a-f0-9]{64}\.json$/.test(name))continue;
    try {const body=await readFile(join(dir,name),'utf8');const {createHash}=await import('node:crypto');if(createHash('sha256').update(body).digest('hex')!==name.slice(0,-5))continue;const state=validateState(JSON.parse(body));result.push({id:name.slice(0,-5),checksum:name.slice(0,-5),createdAt:(await stat(join(dir,name))).mtime.toISOString(),counts:counts(state)});}catch{}
  }
  return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function previewStateBackup(file,id) {
  if(!/^[a-f0-9]{64}$/.test(id??''))throw Error('备份标识无效');
  const {dirname,join}=await import('node:path');
  const {createHash}=await import('node:crypto');
  const body=await readFile(join(dirname(file),'state-backups',id+'.json'),'utf8');
  if(createHash('sha256').update(body).digest('hex')!==id)throw Error('备份校验失败');
  const state=validateState(JSON.parse(body));
  const current=await readManagedState(file).catch(()=>null);
  return {id,checksum:id,counts:counts(state),currentCounts:current?counts(current.state):null,state};
}
export async function restoreStateBackup(file,id,checksum) {
  if(id!==checksum)throw Error('请先预览并核对备份');
  const preview=await previewStateBackup(file,id);
  const {writeFile,rename,copyFile,unlink}=await import('node:fs/promises');
  const {randomUUID}=await import('node:crypto');
  // Preserve the original even when corrupt, independently of valid backups.
  await copyFile(file,`${file}.before-restore`).catch(e=>{if(e.code!=='ENOENT')throw e;});
  const temp=`${file}.${randomUUID()}.tmp`;
  try {await writeFile(temp,JSON.stringify(preview.state,null,2)+'\n',{mode:0o600});await rename(temp,file);} finally {await unlink(temp).catch(()=>{});}
}

export async function deleteStateBackup(file, id, checksum) {
  if (!/^[a-f0-9]{64}$/.test(id ?? '') || id !== checksum)
    throw Error('备份标识无效，请刷新列表后重试。');
  const { dirname, join } = await import('node:path');
  const { unlink } = await import('node:fs/promises');
  try {
    await previewStateBackup(file, id);
    await unlink(join(dirname(file), 'state-backups', id + '.json'));
    return { deleted: true };
  } catch (error) {
    if (error.code === 'ENOENT') return { deleted: false };
    throw error;
  }
}
