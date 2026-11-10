import { defHash, totalTargets } from './resource-fingerprint.mjs';
import { readCachedFile } from "./file-cache.mjs";
// Read-only fingerprints. No resource body, credentials, or local paths leave this module.
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { renderSubagent } from './total.mjs';
import './ui/i18n.js';
const { message } = globalThis.DucoroI18n;
const digest = text => createHash('sha256').update(text).digest('hex');
export async function skillFingerprint(source, { includeModes = true, modeMask = 0o777 } = {}) {
  const root = await realpath(source), files = [];
  const walk = async (dir, rel = '', parents = new Set()) => {
    const target = await realpath(dir);
    if ((target !== root && !target.startsWith(root + '/')) || parents.has(target)) throw Error('unsafe bundle');
    const ancestors = new Set([...parents, target]);
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (['.git', '.DS_Store'].includes(entry.name)) continue;
      const path = join(dir, entry.name), resolved = await realpath(path);
      if (resolved !== root && !resolved.startsWith(root + '/')) throw Error('unsafe bundle');
      const info = await stat(path), name = rel ? `${rel}/${entry.name}` : entry.name;
      if (info.isDirectory()) await walk(path, name, ancestors);
      else if (info.isFile()) files.push({ name, path, mode: info.mode & 0o777 });
      else throw Error('unsupported bundle');
      if (files.length > 5000) throw Error('bundle too large');
    }
  };
  await walk(root);
  files.sort((a,b) => a.name.localeCompare(b.name));
  if (!files.some(f => f.name === 'SKILL.md')) throw Error('missing manifest');
  const names = new Set(files.map(f => f.name)), hash = createHash('sha256');
  let bytesTotal = 0;
  for (const file of files) {
    let bytes = await readCachedFile(file.path);
    bytesTotal += bytes.length;
    if (bytesTotal > 32 * 1024 * 1024) throw Error('bundle too large');
    if (file.name === 'SKILL.md') bytes = Buffer.from(bytes.toString().replace(/`([^`\n]+)`/g, (match, token) => {
      if (names.has(token)) return match;
      return /^v?\d+(?:\.\d+)+(?:\.[xX*])?(?:-[a-zA-Z0-9.-]+)?$/.test(token) || /^[a-zA-Z0-9_-]+\.(?:cmd|exe|bat)$/i.test(token) ? `<code>${token}</code>` : match;
    }));
    hash.update(JSON.stringify(includeModes ? [file.name, bytes.length, file.mode & modeMask] : [file.name, bytes.length])).update(bytes);
  }
  return { hash: hash.digest('hex'), fileCount: files.length };
}
export async function contentChanges({ paths, state, options, bots }) {
  if (!paths?.library) return [];
  const library = JSON.parse(await readFile(paths.library, 'utf8')), changes = [];
  const enabled = x => x && !x.offHere && !x.disabled && x.enabled !== false;
  const fingerprints = new Map();
  for (const record of Object.values(state.skills ?? {})) {
    if (!options.syncSkills || !record.sourceName || !library.skills?.some(x => x.name === record.sourceName && enabled(x))) continue;
    try {
      let fingerprint;
      for (const root of [paths.skills, paths.librarySkills].filter(Boolean)) {
        try { const path = join(root, record.sourceName); if (!fingerprints.has(path)) fingerprints.set(path, skillFingerprint(path)); fingerprint = await fingerprints.get(path); break; } catch {}
      }
      if (!fingerprint) throw Error();
      if (fingerprint.hash !== record.hash) changes.push({ scope: record.scope ?? 'global', kind: 'skills', name: record.sourceName, action: 'update', summary: `技能内容或文件权限变化；将核对 ${fingerprint.fileCount} 个文件`, fileCount: fingerprint.fileCount });
    } catch { changes.push({ scope: record.scope ?? 'global', kind: 'skills', name: record.sourceName, action: 'unknown', summary: '技能内容暂不可读取，保留现状并等待核实' }); }
  }
  if (options.syncLibraryMcp !== false && options.syncMcp) {
    let exported;
    try { exported = JSON.parse(await readFile(paths.mcp, 'utf8')).mcpServers ?? {}; } catch {}
    for (const record of Object.values(state.mcp ?? {})) {
      const source = library.mcp?.find(x => x.name === record.sourceName && enabled(x));
      if (!source) continue;
      try {
        if (!exported) throw Error();
        const direct = exported[source.name];
        let def = direct && !(direct.url && /\/mcp\/magpie\/hub(?:\/|$)/.test(direct.url)) ? direct : { ...source, type: source.transport };
        const expand = value => typeof value === 'string' ? value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key) => {
          if (process.env[key] === undefined) throw Error(); return process.env[key];
        }) : value;
        const pairs = obj => Object.entries(obj ?? {}).map(([k,v]) => [k,String(expand(v))]);
        const canon = values => JSON.stringify(values.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0));
        const type = String(def.type ?? '').trim().toLowerCase();
        const http = type === 'http' || type === 'sse' || (!def.command && def.url);
        if (def.disabled || def.enabled === false || (!http && !def.command)) continue;
        const normalized = { name: source.name, transport: http ? (type === 'sse' ? 'sse' : 'http') : 'stdio', command: http ? null : String(expand(def.command)), args: http ? null : (def.args ?? []).map(x=>String(expand(x))), url: http ? String(expand(def.url)).trim() : null, headers:canon(http ? pairs(def.headers) : []), env:canon(http ? [] : pairs(def.env)), disabledTools:(Array.isArray(source.disabledTools) ? source.disabledTools.map(String) : []).sort() };
        if (defHash({...normalized, headers: http ? pairs(def.headers) : [], env: http ? [] : pairs(def.env)}) !== record.hash) changes.push({ scope:record.scope ?? 'global', kind:'mcp', name:source.name, action:'update', summary:'同名连接器的配置或工具权限发生变化；敏感字段不展示' });
      } catch { changes.push({ scope:record.scope ?? 'global', kind:'mcp', name:source.name, action:'unknown', summary:'连接器内容暂不可核对，保留现状并等待核实' }); }
    }
  }
  const targets = totalTargets(bots, options);
  if (options.syncInstructions && ((enabled(library.instructions) && library.instructions.agents?.includes('ducoro')) || Object.values(options.botInstructions ?? {}).some(Boolean))) {
    try {
      let sourceText = '';
      if (enabled(library.instructions) && library.instructions.agents?.includes('ducoro')) {
        const exported=await readFile(paths.instructions,'utf8');
        const match=/<!-- magpie:begin[^\n]*-->\r?\n([\s\S]*?)<!-- magpie:end -->/.exec(exported);
        sourceText=(match ? match[1] : exported).trim();
      }
      for(const bot of targets) {
        const text=[sourceText,options.botInstructions?.[bot.id]??''].filter(Boolean).join('\n\n').trim();
        const block=text ? `\n\n<!-- magpie-ducoro-total:begin -->\n${text}\n<!-- magpie-ducoro-total:end -->\n` : '';
        if(state.total?.profiles?.[bot.id]?.block!==block)changes.push({scope:bot.id,kind:'instructions',name:'全局指令',action:'update',characterCount:text.length,summary:`指令内容将更新（${text.length} 字符），运行中会话需另行确认`});
      }
    } catch { changes.push({ scope: 'global', kind: 'instructions', name: '全局指令', action: 'unknown', summary: '指令源文件暂不可读取' }); }
  }
  if (options.syncSubagents) for (const item of library.subagents ?? []) {
    if (!enabled(item) || !(item.agents?.includes('ducoro') || options.subagentNames?.includes(item.name))) continue;
    for (const bot of targets) {
      try {
        if (state.total?.files?.[`${bot.id}/${item.name}`]?.hash !== digest(renderSubagent(item))) changes.push({ scope: bot.id, kind: 'subagents', name: item.name, action: 'update', summary: '子代理描述或指令内容将更新' });
      } catch { changes.push({ scope: bot.id, kind: 'subagents', name: item.name, action: 'unknown', summary: '子代理定义无法安全映射，需在诊断中处理' }); }
    }
  }
  for (const change of changes) {
    if (change.kind === 'skills' && change.action === 'update')
      change.summaryMessage = message('技能内容或文件权限变化；将核对 {0} 个文件', [change.fileCount]);
    else if (change.kind === 'instructions' && change.action === 'update')
      change.summaryMessage = message('指令内容将更新（{0} 字符），运行中会话需另行确认', [change.characterCount]);
    else change.summaryMessage = message(change.summary);
    if (change.kind === 'instructions') change.nameMessage = message('全局指令');
  }
  return changes;
}
