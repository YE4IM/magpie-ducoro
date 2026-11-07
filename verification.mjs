import { mapLimit } from "./performance.mjs";
import { planAccountConnector, samePolicy } from './account-plan.mjs';
import { readFile } from 'node:fs/promises';
import { list, policyRows } from './inventory-shapes.mjs';
import { modelEligible, modelTarget } from './model-sync.mjs';
export async function verifyConfiguration({options, state, run, paths, report = {}, signal, onProgress = () => {}}) {
  const rows = [];
  const deadline=Date.now()+25000;
  let source=null;
  try {source=JSON.parse(await readFile(paths.bridge,'utf8'));}catch{}
  const sourceModel=typeof source?.model==='string'?source.model:source?.model?.id;
  const add = (feature,target,status) => { rows.push({feature,target,status,message:({verified:'已读取配置并核验一致',failed:'读取结果与期望不一致',unknown:'结果待核实，请重新读取；不要直接重复写入',skipped:'本项未启用或未选择'})[status]}); onProgress({ rows: [...rows], running: true }); };
  const read = async args => { try {const remaining=deadline-Date.now();if(remaining<=0 || signal?.aborted)return null;const r=await run(args,{timeoutMs:Math.min(5000,remaining), signal}); return r.ok?r.json:null;}catch{return null;} };
  if(options.syncAgentModels !== false && options.syncConnection !== false) {
    const data=await read(['agent','list']);
    if(!data) add('models','global','unknown');
    else for(const bot of list(data,['agents','bots']).filter(x=>x?.modelPreference && modelEligible(options,x))) {
      const expected=modelTarget(options,bot.id,sourceModel);
      add('models',bot.id,expected ? (bot.modelPreference?.model===expected?'verified':'failed'):'unknown');
    }
  } else add('models','global','skipped');
  let instructionBase = null;
  try {
    const library = JSON.parse(await readFile(paths.library,'utf8')), item = library.instructions;
    if(item && !item.offHere && !item.disabled && item.enabled !== false && item.agents?.includes('ducoro')) {
      const exported=await readFile(paths.instructions,'utf8');
      const match=/<!-- magpie:begin[^\n]*-->\r?\n([\s\S]*?)<!-- magpie:end -->/.exec(exported);
      if(match)instructionBase=match[1];
    } else instructionBase='';
  } catch {}
  await mapLimit(Object.entries(state.total?.profiles ?? {}), 4, async ([id, owned]) => {
    if(options.syncInstructions === false) { add('instructions',id,'skipped'); return; }
    const data=await read(['agent','get',id]),bot=data?.agent??data;
    const text=[instructionBase??'',options.botInstructions?.[id]??''].filter(Boolean).join('\n\n').trim();
    const expected=text ? `\n\n<!-- magpie-ducoro-total:begin -->\n${text}\n<!-- magpie-ducoro-total:end -->\n` : '';
    add('instructions',id,instructionBase===null || !bot || bot.id!==id || typeof bot.profile!=='string' ? 'unknown' : expected && bot.profile.includes(expected) && (owned.pending??owned.block)===expected ? 'verified' : 'failed');
  });
  const desired=options.syncMcp ? options.accountConnectors??{} : {};
  await mapLimit([...new Set([...Object.keys(state.accountConnectors??{}),...Object.keys(desired)])], 4, async id => {
    const entries=state.accountConnectors?.[id]??{};
    const data=await read(['agent','connector','list',id]);
    for(const slug of new Set([...Object.keys(entries),...Object.keys(desired[id]??{})])) {
      const row=entries[slug];
      const current=data?(policyRows(data).find(x=>x.slug===slug)??null):null;
      // Planner honors explicit null pending during external-change detection,
      // and derives expected restoration from previous rather than old applied.
      const transition=planAccountConnector(current,desired[id]?.[slug]??null,row,options.accountResolutions?.[id]?.[slug]);
      add('accountConnectors',`${id}/${slug}`,!data?'unknown':transition.conflict?'failed':samePolicy(current,transition.next)?'verified':'failed');
    }
  });
  // A successful write is not read-back evidence. Features without a reliable
  // public read projection stay explicitly unverified.
  if(options.syncConnection === false || !state.connection) add('connection','global','skipped');
  else {
    const data=await read(['connections','list','--with-status']);
    const route=data?list(data,['connections']).find(x=>x.slug===state.connection.slug):null;
    add('connection','global',!data || !sourceModel?'unknown':typeof sourceModel==='string' && sourceModel.length>0 && typeof state.connection.baseUrl==='string' && state.connection.baseUrl.length>0 && route?.defaultModel===sourceModel && route?.baseUrl===state.connection.baseUrl?'verified':'failed');
  }
  for(const feature of ['mcp','skills','subagents']) {
    const row=report.features?.[feature];
    add(feature,'global',row?.status==='disabled'||row?.status==='skipped'?'skipped':'unknown');
  }
  return {updatedAt:new Date().toISOString(),runtimeLoaded:'unknown',rows};
}
