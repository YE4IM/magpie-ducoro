import {backupMetadata,pruneBackups} from './backup-metadata.mjs';
import { DEFAULTS } from "./defaults.mjs";
import { readFile, writeFile, mkdir, readdir, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validateOptions } from './options.mjs';
import { mapLimit } from './performance.mjs';
import { modelEligible, modelTarget } from './model-sync.mjs';
import { list } from './inventory-shapes.mjs';
import './ui/plans.js';
const defaults = globalThis.DucoroDefaultOptions;
const maps = new Set(['botPlansCatalog','botPlans','botInstructions','modelGuards','botModels','resourceAssignments','accountConnectors','accountResolutions','modelCapabilityRefs']);
export const stable = value => JSON.stringify(value, (_, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))) : x);
export const revision = value => createHash('sha256').update(stable(value) ?? 'undefined').digest('hex');
export function validateCheckpoint(value) {
  if (!value || value.version !== 1 || typeof value.id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value.id)
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || validateOptions(value.before).length || validateOptions(value.after).length) throw Error('检查点文件格式无效。');
  const before=projectOptions(value.before),after=projectOptions(value.after);
  return {version:1,id:value.id,createdAt:new Date(value.createdAt).toISOString(),before,after,snapshot:value.snapshot===true,changes:optionChanges(before,after)};
}
export const projectOptions = options => Object.fromEntries(Object.entries(defaults).map(([k,v])=>[k,structuredClone(options[k] ?? v)]));
export function optionChanges(before, after) {
  const rows = [];
  for (const key of Object.keys(defaults)) {
    if (maps.has(key)) {
      for (const id of new Set([...Object.keys(before[key] ?? {}),...Object.keys(after[key] ?? {})])) {
        const a=before[key]?.[id],b=after[key]?.[id];
        if(stable(a)!==stable(b))rows.push({ key, target:id, before:a ?? null, after:b ?? null, beforePresent:a!==undefined, afterPresent:b!==undefined });
      }
    } else if(stable(before[key])!==stable(after[key]))rows.push({key,target:'global',before:before[key],after:after[key],beforePresent:true,afterPresent:true});
  }
  return rows;
}
export async function createCheckpoint(stateDir, before, after, snapshot=false) {
  if(validateOptions(before).length || validateOptions(after).length)throw Error('Invalid checkpoint settings');
  const checkpoint={version:1,id:randomUUID(),createdAt:new Date().toISOString(),before:projectOptions(before),after:projectOptions(after)};
  checkpoint.snapshot=snapshot;
  checkpoint.changes=optionChanges(checkpoint.before,checkpoint.after);
  if(!snapshot&&!checkpoint.changes.length)return null;
  const dir=join(stateDir,'configuration-checkpoints');await mkdir(dir,{recursive:true,mode:0o700});
  const file=join(dir,checkpoint.id+'.json'),temp=file+'.tmp';
  try {await writeFile(temp,JSON.stringify(checkpoint),{mode:0o600,flag:'wx'});await rename(temp,file);}finally{await unlink(temp).catch(()=>{});}
  const records=await checkpoints(stateDir);await pruneBackups(dir,records.map(row=>row.id),20);
  return {id:checkpoint.id,createdAt:checkpoint.createdAt,changes:checkpoint.changes};
}
export async function checkpoints(stateDir, current) {
  const dir=join(stateDir,'configuration-checkpoints');const result=[];
  for(const file of await readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;})) {
    if(!/^[a-f0-9-]{36}\.json$/.test(file))continue;
    try {const c=validateCheckpoint(JSON.parse(await readFile(join(dir,file),'utf8')));if(file!==c.id+'.json')continue;result.push({id:c.id,createdAt:c.createdAt,...await backupMetadata(dir,c.id),changes:c.snapshot&&current?optionChanges(c.before,projectOptions(current)):c.changes});}catch{}
  }
  return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function rollbackDraft(stateDir,id,selections,current) {
  if(!/^[a-f0-9-]{36}$/.test(id) || !Array.isArray(selections) || !selections.length)throw Error('Invalid checkpoint selection');
  const c=validateCheckpoint(JSON.parse(await readFile(join(stateDir,'configuration-checkpoints',id+'.json'),'utf8')));
  if(c.id!==id)throw Error('Invalid checkpoint');
  const rows=optionChanges(c.before,c.snapshot?projectOptions(current):c.after), draft=structuredClone(current), normalized=projectOptions(current);
  selections=rollbackSelections(rows,selections);
  for(const index of selections) {
    if(!Number.isInteger(index)||!rows[index])throw Error('Invalid checkpoint selection');
    const row=rows[index],actual=maps.has(row.key)?normalized[row.key]?.[row.target]:normalized[row.key];
    if(stable(actual)!==stable(row.afterPresent?row.after:undefined))throw Error('Configuration changed since checkpoint; refresh before restoring');
    if(maps.has(row.key)){draft[row.key]??={};if(row.beforePresent)draft[row.key][row.target]=structuredClone(row.before);else delete draft[row.key][row.target];}
    else draft[row.key]=structuredClone(row.before);
  }
  if(validateOptions(draft).length)throw Error('Select related plan changes together to retain valid assignments');
  return {options:draft,selections,revision:revision(projectOptions(current)),changes:optionChanges(normalized,projectOptions(draft))};
}
export async function inspectDrift({options,state,paths,run,signal}) {
  const resolved=globalThis.DucoroPlans.resolve(options), rows=[];
  let source;try{source=JSON.parse(await readFile(paths.bridge,'utf8'));}catch{}
  const fallback=typeof source?.model==='string'?source.model:source?.model?.id;
  const roster=await run(['agent','list'],{timeoutMs:5000,signal});
  if(!roster.ok || !Array.isArray(roster.json?.agents??roster.json?.bots??roster.json))return {rows:[],unknown:true};
  const bots=list(roster.json,['agents','bots']).filter(bot=>modelEligible({...resolved,pausedModels:[]},bot) || state.total?.profiles?.[bot.id]);
  await mapLimit(bots,4,async bot=>{
    const response=await run(['agent','get',bot.id],{timeoutMs:5000,signal});
    const actual=response.ok?(response.json?.agent??response.json):null;
    if(!actual || actual.id!==bot.id){rows.push({feature:'models',target:bot.id,status:'unknown'});return;}
    if(modelEligible({...resolved,pausedModels:[]},actual)) {
      const expected=modelTarget(resolved,bot.id,fallback),applied=state.modelApplied?.[bot.id]?.model??null;
      rows.push({feature:'models',target:bot.id,expected:expected??null,current:actual.modelPreference?.model??null,applied,status:!expected?'unknown':resolved.pausedModels?.includes(bot.id)?'paused':actual.modelPreference?.model===expected?'same':'drift',revision:revision(actual.modelPreference)});
    }
    const owned=state.total?.profiles?.[bot.id];
    if(owned) {
      const block=owned.pending??owned.block;
      rows.push({feature:'instructions',target:bot.id,status:typeof actual.profile!=='string'?'unknown':actual.profile.includes(block)?'same':'drift',applied:revision(owned.block),current:typeof actual.profile==='string'?revision(actual.profile):null,expected:'managed-block',readOnly:true});
    }
  },{signal});
  // Resource list membership does not prove content identity or session loading.
  for(const feature of ['mcp','skills','subagents'])rows.push({feature,target:'global',status:'unknown',readOnly:true});
  return {updatedAt:new Date().toISOString(),rows,runtimeLoaded:'unknown'};
}

// A plan binding depends on its catalog and resource scope; catalog removal also
// needs the bindings that stop referring to it. Include only changed rows.
export function rollbackSelections(rows,selected){
  const result=new Set(selected);
  for(const index of result)if(!Number.isInteger(index)||!rows[index])throw Error('Invalid checkpoint selection');
  let changed=true;
  while(changed){changed=false;for(const index of [...result]){
    const row=rows[index];
    for(const [i,other] of rows.entries()){
      const needed=(row.key==='botPlans' && (other.key==='botPlansCatalog'&&[row.before,row.after].includes(other.target)||['modelScope','mcpScope','skillsScope'].includes(other.key)))
        ||(row.key==='botPlansCatalog'&&other.key==='botPlans'&&[other.before,other.after].includes(row.target));
      if(needed&&!result.has(i)){result.add(i);changed=true;}
    }
  }}
  return [...result].sort((a,b)=>a-b);
}
