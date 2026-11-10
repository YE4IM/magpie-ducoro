import { mapLimit } from "./performance.mjs";
import { planAccountConnector, samePolicy } from './account-plan.mjs';
import {createHash} from 'node:crypto';
import {realpath,lstat} from 'node:fs/promises';
import {join,sep} from 'node:path';
import {skillFingerprint,contentChanges} from './content-preview.mjs';
import {defHash} from './resource-fingerprint.mjs';
import {mcpCommand} from './resource-scopes.mjs';
import { readFile } from 'node:fs/promises';
import { list, policyRows } from './inventory-shapes.mjs';
import { modelEligible, modelTarget } from './model-sync.mjs';
export async function verifyConfiguration({options, state, run, paths, report = {}, signal, onProgress = () => {}}) {
  const rows = [];
  const deadline=Date.now()+25000;
  let source=null;
  try {source=JSON.parse(await readFile(paths.bridge,'utf8'));}catch{}
  const sourceModel=typeof source?.model==='string'?source.model:source?.model?.id;
  const add = (feature,target,status,evidence={}) => { rows.push({feature,target,status,...evidence,...(status==='unknown'?{missingEvidence:evidence.missingEvidence??'缺少完整的已保存正文读回证据。',nextStep:evidence.nextStep??'请在 Ducoro 中检查此资源后重新核验，并在下一轮会话确认加载。'}:{}),message:({verified:'已读取配置并核验一致',failed:'读取结果与期望不一致',unknown:'结果待核实，请重新读取；不要直接重复写入',skipped:'本项未启用或未选择'})[status]}); onProgress({ rows: [...rows], running: true }); };
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
  const ownedProfiles=state.total?.profiles ?? {};
  const instructionTargets=new Set();
  const instructionsEnabled=options.syncInstructions !== false;
  if(instructionsEnabled && (instructionBase !== '' || Object.values(options.botInstructions ?? {}).some(Boolean))) {
    const roster=await read(['agent','list']);
    const validRoster=Array.isArray(roster) || Array.isArray(roster?.agents) || Array.isArray(roster?.bots);
    if(!validRoster) add('instructions','global','unknown');
    else for(const bot of list(roster,['agents','bots'])) {
      const selected=options.targetAgents?.length ? options.targetAgents.includes(bot.id) : bot.modelPreference?.connectionSlug===options.connectionSlug;
      if(selected)instructionTargets.add(bot.id);
    }
  }
  await mapLimit([...new Set([...Object.keys(ownedProfiles),...instructionTargets])], 4, async id => {
    if(!instructionsEnabled) { add('instructions',id,'skipped'); return; }
    const data=await read(['agent','get',id]),bot=data?.agent??data,owned=ownedProfiles[id];
    const selected=bot && (options.targetAgents?.length ? options.targetAgents.includes(id) : bot.modelPreference?.connectionSlug===options.connectionSlug);
    const text=selected ? [instructionBase??'',options.botInstructions?.[id]??''].filter(Boolean).join('\n\n').trim() : '';
    const expected=text ? `\n\n<!-- magpie-ducoro-total:begin -->\n${text}\n<!-- magpie-ducoro-total:end -->\n` : '';
    const unknown=(selected && instructionBase===null) || !bot || bot.id!==id || typeof bot.profile!=='string';
    const profile=typeof bot?.profile==='string' ? bot.profile : '';
    const matches=expected ? profile.includes(expected) && (owned?.pending??owned?.block)===expected
      : !profile.includes('<!-- magpie-ducoro-total:begin -->') && !profile.includes('<!-- magpie-ducoro-total:end -->');
    add('instructions',id,unknown ? 'unknown' : matches ? 'verified' : 'failed');
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
  const hash=body=>createHash('sha256').update(body).digest('hex');
  let home=null;
  try {
    const url=process.env.DUCORO_SERVER_URL;
    if(url&&!['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname))throw Error();
    const info=await read(['info']);
    if(paths.ducoroHome&&info?.paths?.ducoroHome&&await realpath(paths.ducoroHome)===await realpath(info.paths.ducoroHome))home=await realpath(paths.ducoroHome);
  }catch{}
  const localPath=async path=>{if(!home)throw Error();const resolved=await realpath(path);if(!resolved.startsWith(home+sep)||(await lstat(path)).isSymbolicLink())throw Error();return resolved;};
  let changed=[];try{changed=await contentChanges({paths,state,options,bots:[]});}catch{}
  for(const [feature,enabled] of [['mcp',options.syncMcp],['skills',options.syncSkills],['subagents',options.syncSubagents]]) {
    if(!enabled){add(feature,'global','skipped');continue;}
    const records=Object.entries(feature==='subagents'?state.total?.files??{}:state[feature]??{});
    if(!records.length){const row=report.features?.[feature];add(feature,'global',row?.status==='disabled'||row?.status==='skipped'?'skipped':'unknown');continue;}
    await mapLimit(records,4,async([id,owned])=>{
      const target=feature==='subagents'?id:`${owned.scope}/${owned.name??owned.slug}`;
      try {
        let digest,expectedHash=owned.hash,permissionEvidence,permissionsVerified;
        if(feature==='skills') {
          const args=owned.scope==='global'?['skill','show',owned.name]:['agent','skill','show',owned.scope,owned.name];
          const shown=await read(args);if(!shown?.dirPath||shown.name!==owned.name)throw Error();
          const installed=await localPath(shown.dirPath);
          if(!owned.dir || (await skillFingerprint(owned.dir)).hash!==owned.hash)throw Error();
          const [expected,actual]=await Promise.all([skillFingerprint(owned.dir,{includeModes:false}),skillFingerprint(installed,{includeModes:false})]);
          if((await skillFingerprint(owned.dir)).hash!==owned.hash)throw Error();
          digest=actual.hash;expectedHash=expected.hash;
          const [privateExpected,persisted]=await Promise.all([skillFingerprint(owned.dir,{modeMask:0o700}),skillFingerprint(installed)]);
          permissionsVerified=privateExpected.hash===persisted.hash;
          permissionEvidence=permissionsVerified?'正文与仅所有者可访问的文件权限均一致。':'文件权限与私有导入规则不一致，请检查可执行附属文件。';
        } else if(feature==='subagents') {
          if(!/^agt-[A-Za-z0-9-]+$/.test(owned.botId)||!/^[a-z0-9][a-z0-9-]{1,49}$/.test(owned.name))throw Error();
          digest=hash(await readFile(await localPath(join(home??'', 'agents',owned.botId,'subagents',owned.name+'.md'))));
        } else {
          const shown=await read(mcpCommand(owned.scope,'show',owned.slug)),server=shown?.server??shown,t=server?.transport;
          if(!server||server.slug!==owned.slug||!t||typeof t!=='object'||JSON.stringify(server).includes('{{credentials.'))throw Error();
          const pairs=value=>Array.isArray(value)?value:Object.entries(value??{});
          digest=defHash({name:server.name,transport:t.type,command:t.type==='stdio'?t.command:null,args:t.type==='stdio'?(t.args??[]):null,url:t.type==='stdio'?null:t.url,headers:pairs(t.headers),env:pairs(t.env),disabledTools:server.toolPolicy?.deny??server.disabledTools??[]});
        }
        const sourceChange=changed.find(row=>row.kind===feature&&row.scope===(owned.scope??owned.botId)&&row.name===(owned.sourceName??owned.name));
        add(feature,target,sourceChange?.action==='unknown'?'unknown':digest===expectedHash&&!sourceChange&&permissionsVerified!==false?'verified':'failed',{evidence:'persisted-content-sha256',digest,...(permissionEvidence?{permissionEvidence,permissionsVerified}:{}),nextStep:'请在下一轮会话确认此资源已加载。'});
      }catch{add(feature,target,'unknown',{missingEvidence:feature==='mcp'?'需要不含凭据间接引用的完整可读定义。':'需要已核实为本机守护进程目录中的可读技能包或子代理文件。'});}
    });
  }
  return {updatedAt:new Date().toISOString(),runtimeLoaded:'unknown',rows};
}
