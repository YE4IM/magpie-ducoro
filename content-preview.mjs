import {desiredResources} from './resource-plan.mjs';
import {planResourceScopes} from './resource-scopes.mjs';
import {validateLibrary} from './library-schema.mjs';
import { defHash, totalTargets } from './resource-fingerprint.mjs';
// Read-only fingerprints. No resource body, credentials, or local paths leave this module.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { renderSubagent } from './total.mjs';
import './ui/i18n.js';
const { message } = globalThis.DucoroI18n;
const digest = text => createHash('sha256').update(text).digest('hex');
export {skillFingerprint} from './skill-bundle.mjs';
import {skillFingerprint, findSkillSource, checkScan, isScanStopped} from './skill-bundle.mjs';
export async function contentChanges({ paths, state, options, bots, desired, library:sourceLibrary, signal, deadline }) {
  checkScan({signal,deadline});
  if (!paths?.library) return [];
  const library = sourceLibrary ?? validateLibrary(JSON.parse(await readFile(paths.library, {encoding:'utf8',signal}))), changes = [];
  if (!desired) {
    let exported;
    try {exported = JSON.parse(await readFile(paths.mcp,{encoding:'utf8',signal}));}
    catch (error) {if (signal?.aborted) throw error;}
    desired = desiredResources({library,options,scopes:planResourceScopes(options,bots),exported,exportReadable:!!exported,state,env:process.env});
  }
  const desiredProfiles=new Set(),desiredFiles=new Set();
  const enabled = x => x && !x.offHere && !x.disabled && x.enabled !== false;
  const fingerprints = new Map();
  for (const record of Object.values(state.skills ?? {})) {
    checkScan({signal,deadline});
    if (!desired?.skills.get(record.scope ?? 'global')?.has(record.sourceName)) continue;
    try {
      const path = await findSkillSource(record.sourceName,[paths.skills,paths.librarySkills],{signal,deadline});
      let fingerprint;
      if (path) {
        if (!fingerprints.has(path)) fingerprints.set(path,skillFingerprint(path,{signal,deadline}));
        fingerprint = await fingerprints.get(path);
      }
      if (!fingerprint) throw Error();
      if (fingerprint.hash !== record.hash) changes.push({ scope: record.scope ?? 'global', kind: 'skills', name: record.sourceName, action: 'update', summary: `技能内容或文件权限变化；将核对 ${fingerprint.fileCount} 个文件`, fileCount: fingerprint.fileCount });
    } catch (error) { if (isScanStopped(error) || signal?.aborted) throw error; changes.push({ scope: record.scope ?? 'global', kind: 'skills', name: record.sourceName, action: 'unknown', summary: '技能内容暂不可读取，保留现状并等待核实' }); }
  }
  if (options.syncLibraryMcp !== false && options.syncMcp) {
    for (const record of Object.values(state.mcp ?? {})) {
      checkScan({signal,deadline});
      const source = desired?.mcp.get(record.scope ?? 'global')?.get(record.sourceName);
      if (!source) continue;
      if (source.status === 'unknown') changes.push({scope:record.scope ?? 'global',kind:'mcp',name:source.name,action:'unknown',summary:'连接器内容暂不可核对，保留现状并等待核实'});
      else if (defHash(source.definition) !== record.hash) changes.push({scope:record.scope ?? 'global',kind:'mcp',name:source.name,action:'update',summary:'同名连接器的配置或工具权限发生变化；敏感字段不展示'});
    }
  }
  const targets = totalTargets(bots, options);
  if (options.syncInstructions && ((enabled(library.instructions) && library.instructions.agents?.includes('ducoro')) || Object.values(options.botInstructions ?? {}).some(Boolean))) {
    try {
      let sourceText = '';
      if (enabled(library.instructions) && library.instructions.agents?.includes('ducoro')) {
        const exported=await readFile(paths.instructions,{encoding:'utf8',signal});
        const match=/<!-- magpie:begin[^\n]*-->\r?\n([\s\S]*?)<!-- magpie:end -->/.exec(exported);
        if(!match)throw Error('Incomplete instruction export');sourceText=match[1].trim();
      }
      for(const bot of targets) {
        desiredProfiles.add(bot.id);
        const text=[sourceText,options.botInstructions?.[bot.id]??''].filter(Boolean).join('\n\n').trim();
        const block=text ? `\n\n<!-- magpie-ducoro-total:begin -->\n${text}\n<!-- magpie-ducoro-total:end -->\n` : '';
        if(state.total?.profiles?.[bot.id]?.block!==block)changes.push({scope:bot.id,kind:'instructions',name:'全局指令',action:'update',characterCount:text.length,summary:`指令内容将更新（${text.length} 字符），运行中会话需另行确认`});
      }
    } catch (error) { if (isScanStopped(error) || signal?.aborted) throw error; for(const bot of targets)desiredProfiles.add(bot.id); changes.push({ scope: 'global', kind: 'instructions', name: '全局指令', action: 'unknown', summary: '指令源文件暂不可读取' }); }
  }
  if (options.syncSubagents) for (const item of library.subagents ?? []) {
    if (!enabled(item) || !(item.agents?.includes('ducoro') || options.subagentNames?.includes(item.name))) continue;
    for (const bot of targets) {
      desiredFiles.add(`${bot.id}/${item.name}`);
      try {
        if (state.total?.files?.[`${bot.id}/${item.name}`]?.hash !== digest(renderSubagent(item))) changes.push({ scope: bot.id, kind: 'subagents', name: item.name, action: 'update', summary: '子代理描述或指令内容将更新' });
      } catch { changes.push({ scope: bot.id, kind: 'subagents', name: item.name, action: 'unknown', summary: '子代理定义无法安全映射，需在诊断中处理' }); }
    }
  }
  for(const id of Object.keys(state.total?.profiles??{}))if(!desiredProfiles.has(id))changes.push({scope:id,kind:'instructions',name:'全局指令',action:'remove',summary:'撤销此 Bot 的托管指令区块'});
  for(const [id,owned] of Object.entries(state.total?.files??{}))if(!desiredFiles.has(id))changes.push({scope:owned.botId,kind:'subagents',name:owned.name,action:'remove',summary:'撤销此 Bot 的托管子代理文件'});
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
