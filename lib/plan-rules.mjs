// Pure configuration rules. Browser facade parity is covered by tests.
  // Shared by the browser and draft store, including pre-mode drafts.
  export function editorSnapshot(raw, options = {}) {
    if (raw === null) return null;
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    if (!record(raw) || !Array.isArray(raw.values) || raw.values.length !== 5 ||
        !raw.values.every(value => typeof value === 'string') || typeof raw.selected !== 'string' ||
        typeof raw.dirty !== 'boolean' || !(raw.targets === null || Array.isArray(raw.targets) &&
        raw.targets.every(id => /^agt-[A-Za-z0-9-]+$/.test(id)))) throw Error('Invalid plan editor snapshot');
    if (raw.modes !== undefined && (!record(raw.modes) ||
        Object.keys(raw.modes).some(key => !['mcp','skills'].includes(key)) ||
        ['mcp','skills'].some(key => !['inherit','custom','none'].includes(raw.modes[key])))) throw Error('Invalid plan editor modes');
    if (raw.modelMode !== undefined && !['inherit','custom'].includes(raw.modelMode)) throw Error('Invalid plan editor model mode');
    const plan = options.botPlansCatalog?.[raw.selected];
    const modes = Object.fromEntries(['mcp','skills'].map((kind,index) => {
      // Old drafts cannot distinguish an empty custom list from inheritance.
      // Keep the saved plan's mode, defaulting new empty editors to inheritance.
      const fallback = raw.values[index+2].trim() ? 'custom' :
        plan?.[kind] === undefined ? 'inherit' : plan[kind].length ? 'custom' : 'none';
      return [kind, raw.modes?.[kind] ?? fallback];
    }));
    return {selected:raw.selected,dirty:raw.dirty,targets:raw.targets === null ? null : [...raw.targets],
      values:[...raw.values],modes,modelMode:raw.modelMode ?? (raw.values[1].trim() ? 'custom' : 'inherit')};
  }
  function planFor(options, id) {
    const key = options.botPlans?.[id];
    const trial = options.planTrial;
    return trial?.botId === id && trial.planId === key ? trial.candidate : options.botPlansCatalog?.[key];
  }
  export function resolve(options) {
    const out = structuredClone(options);
    out.botModels ??= {}; out.resourceAssignments ??= {}; out.botInstructions ??= {};
    for (const id of Object.keys(options.botPlans ?? {})) {
      const plan = planFor(options, id); if (!plan) throw Error('Unknown Bot configuration plan');
      if (plan.model && !Object.hasOwn(out.botModels,id)) out.botModels[id] = plan.model;
      const assignment = out.resourceAssignments[id] ??= {};
      for (const kind of ['mcp','skills']) if (plan[kind] !== undefined && !Object.hasOwn(assignment,kind)) assignment[kind] = [...plan[kind]];
      if (plan.instructions !== undefined && !Object.hasOwn(out.botInstructions,id)) out.botInstructions[id] = plan.instructions;
    }
    return out;
  }
  export function source(options,id,kind){
    const global=()=>({type:'global'});
    if(id==='global')return global();
    const scope=kind==='model'?options.modelScope:kind==='mcp'?options.mcpScope:kind==='skills'?options.skillsScope:'agents';
    if(scope!=='agents' && kind!=='instructions')return global();
    const explicit=kind==='model'?Object.hasOwn(options.botModels??{},id):kind==='instructions'?Object.hasOwn(options.botInstructions??{},id):Object.hasOwn(options.resourceAssignments?.[id]??{},kind);
    if(explicit)return {type:'override',additive:kind==='instructions'};
    const key=options.botPlans?.[id],plan=planFor(options,id);
    if(plan && (kind==='model'?!!plan.model:plan[kind]!==undefined))return {type:'plan',plan:String(plan.name??key).slice(0,120),trial:options.planTrial?.botId===id,additive:kind==='instructions'};
    return global();
  }
  export function copyEffective(options,sourceId,targets,keys,inventory) {
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
  export function clearOverrides(options,id) {
    const next=structuredClone(options);
    for(const key of ['botModels','resourceAssignments','botInstructions'])if(next[key])delete next[key][id];
    return next;
  }
