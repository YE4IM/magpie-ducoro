import {opendir, realpath, stat} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {within} from './path-safety.mjs';
import {readCachedFile} from './file-cache.mjs';

export function checkScan({signal, deadline = Infinity} = {}) {
  signal?.throwIfAborted();
  if (Date.now() >= deadline) throw Object.assign(Error('技能扫描超过时限，请缩小目录后重试'), {name:'TimeoutError', code:'SCAN_TIMEOUT'});
}
export const isScanStopped = error => error?.name === 'AbortError' || error?.name === 'TimeoutError';
export const compatibleSkillMarkdown = (md, fileNames) => md.replace(/`([^`\n]+)`/g, (match, token) => {
  if (fileNames.has(token)) return match
  const version = /^v?\d+(?:\.\d+)+(?:\.[xX*])?(?:-[a-zA-Z0-9.-]+)?$/.test(token)
  const executable = /^[a-zA-Z0-9_-]+\.(?:cmd|exe|bat)$/i.test(token)
  return version || executable ? `<code>${token}</code>` : match
})


// Timers abort byte reads too; finally releases listeners on success or failure.
export async function withScanBudget(options, task) {
  const budgetMs = options.budgetMs ?? 10000;
  if (!Number.isFinite(budgetMs) || budgetMs < 0) throw new RangeError('Invalid scan budget');
  const deadline = Math.min(options.deadline ?? Infinity, Date.now() + budgetMs);
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal.reason);
  options.signal?.addEventListener('abort',abort,{once:true});
  if (options.signal?.aborted) abort();
  const timer = setTimeout(()=>controller.abort(Object.assign(Error('读取超过时限，请重试'),{name:'TimeoutError'})),Math.max(0,deadline-Date.now()));
  timer.unref?.();
  try {
    checkScan({signal:controller.signal,deadline});
    return await task({...options,signal:controller.signal,deadline});
  } finally {clearTimeout(timer);options.signal?.removeEventListener('abort',abort);}
}
// Select the first existing directory once; an invalid bundle is not replaced
// by a different source during preview or execution.
export async function findSkillSource(name, roots, context = {}) {
  if (typeof name !== 'string' || !name || basename(name) !== name || ['.','..'].includes(name)) throw Error('技能来源名称无效');
  for (const root of roots.filter(Boolean)) {
    checkScan(context);
    const path = join(root,name);
    let info;
    try {info = await stat(path);} catch (error) {if (!['ENOENT','ENOTDIR'].includes(error.code)) throw error;}
    checkScan(context);
    if (info?.isDirectory()) return path;
  }
  return null;
}
export async function readSkillBundle(source, options = {}) {
  return withScanBudget(options, context=>scanSkillBundle(source,context));
}
async function scanSkillBundle(source, {includeModes = true, modeMask = 0o777, signal, deadline = Infinity,
  budgetMs = 10000, maxDirectories = 1000, maxDepth = 64, maxEntries = 10000, maxFiles = 5000,
  maxBytes = 32 * 1024 * 1024} = {}) {
  const context = {signal, deadline:Math.min(deadline, Date.now()+budgetMs)};
  const check = () => checkScan(context);
  check();
  const root = await realpath(source), files = [];
  let directories = 0, entries = 0, totalSize = 0;
  const walk = async (dir, rel = '', parents = new Set(), depth = 0) => {
    check();
    if (++directories > maxDirectories || depth > maxDepth) throw Error('技能目录数量或深度超限');
    const target = await realpath(dir);
    check();
    if (!within(root,target) || parents.has(target)) throw Error('unsafe bundle');
    const ancestors = new Set([...parents,target]);
    const handle = await opendir(dir);
    for await (const entry of handle) {
      check();
      if (++entries > maxEntries) throw Error('技能目录条目过多');
      if (['.git','.DS_Store'].includes(entry.name)) continue;
      const path = join(dir,entry.name), resolved = await realpath(path);
      check();
      if (!within(root,resolved)) throw Error('unsafe bundle');
      const info = await stat(path), name = rel ? `${rel}/${entry.name}` : entry.name;
      check();
      if (info.isDirectory()) await walk(path,name,ancestors,depth+1);
      else if (info.isFile()) {
        totalSize += info.size;
        if (files.length >= maxFiles || totalSize > maxBytes) throw Error('bundle too large');
        files.push({name,path,mode:info.mode & 0o777});
      } else throw Error('unsupported bundle');
    }
  };
  await walk(root);
  check();
  files.sort((a,b)=>a.name.localeCompare(b.name));
  const manifest = files.find(file=>file.name === 'SKILL.md');
  if (!manifest) throw Error('missing manifest');
  const names = new Set(files.map(file=>file.name)), hash = createHash('sha256');
  let bytesTotal = 0, md;
  for (const file of files) {
    check();
    let bytes = await readCachedFile(file.path, {signal});
    check();
    bytesTotal += bytes.length;
    if (bytesTotal > maxBytes) throw Error('bundle too large');
    if (file === manifest) { md = compatibleSkillMarkdown(bytes.toString('utf8'),names); bytes = Buffer.from(md); }
    hash.update(JSON.stringify(includeModes ? [file.name,bytes.length,file.mode & modeMask] : [file.name,bytes.length])).update(bytes);
  }
  check();
  return {files,md,hash:hash.digest('hex'),fileCount:files.length};
}
export async function skillFingerprint(source, options) {
  const {hash,fileCount} = await readSkillBundle(source,options);
  return {hash,fileCount};
}
