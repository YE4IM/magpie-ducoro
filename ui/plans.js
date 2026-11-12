// Shared pure projection. Explicit per-Bot values override inherited values.
(() => {
  function resolve(options) {
    const out = structuredClone(options);
    out.botModels ??= {}; out.resourceAssignments ??= {}; out.botInstructions ??= {};
    for (const [id, name] of Object.entries(options.botPlans ?? {})) {
      const plan = options.botPlansCatalog?.[name]; if (!plan) throw Error('Unknown Bot configuration plan');
      if (plan.model && !Object.hasOwn(out.botModels,id)) out.botModels[id] = plan.model;
      const assignment = out.resourceAssignments[id] ??= {};
      for (const kind of ['mcp','skills']) if (plan[kind] !== undefined && !Object.hasOwn(assignment,kind)) assignment[kind] = [...plan[kind]];
      if (plan.instructions !== undefined && !Object.hasOwn(out.botInstructions,id)) out.botInstructions[id] = plan.instructions;
    }
    return out;
  }
  function source(options,id,kind){
    const global=()=>({type:'global'});
    if(id==='global')return global();
    const scope=kind==='model'?options.modelScope:kind==='mcp'?options.mcpScope:kind==='skills'?options.skillsScope:'agents';
    if(scope!=='agents' && kind!=='instructions')return global();
    const explicit=kind==='model'?Object.hasOwn(options.botModels??{},id):kind==='instructions'?Object.hasOwn(options.botInstructions??{},id):Object.hasOwn(options.resourceAssignments?.[id]??{},kind);
    if(explicit)return {type:'override',additive:kind==='instructions'};
    const key=options.botPlans?.[id],plan=options.botPlansCatalog?.[key];
    if(plan && (kind==='model'?!!plan.model:plan[kind]!==undefined))return {type:'plan',plan:String(plan.name??key).slice(0,120),additive:kind==='instructions'};
    return global();
  }
  function copyEffective(options,sourceId,targets,keys,inventory) {
    const next=structuredClone(options),effective=resolve(options);
    next.botModels??={};next.resourceAssignments??={};
    for(const id of targets) {
      if(keys.includes('model')) {
        const value=effective.modelScope==='agents'?effective.botModels[sourceId]??inventory.defaultModel:inventory.defaultModel;
        if(!value)throw Error('Source model is unavailable');
        next.botModels[id]=value;next.modelScope='agents';
      }
      for(const kind of ['mcp','skills'])if(keys.includes(kind)) {
        const scopeKey=kind==='mcp'?'mcpScope':'skillsScope';
        const selected=effective[scopeKey]==='agents'?effective.resourceAssignments[sourceId]?.[kind]:undefined;
        const available=inventory.library?.[kind];
        if(selected===undefined&&!Array.isArray(available))throw Error('Source resources are unavailable');
        (next.resourceAssignments[id]??={})[kind]=structuredClone(selected??available.map(item=>item.name));
        next[scopeKey]='agents';
      }
    }
    return next;
  }
  function clearOverrides(options,id) {
    const next=structuredClone(options);
    for(const key of ['botModels','resourceAssignments','botInstructions'])if(next[key])delete next[key][id];
    return next;
  }
  globalThis.DucoroPlans = { resolve,source,copyEffective,clearOverrides };
})();
