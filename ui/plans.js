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
  globalThis.DucoroPlans = { resolve };
})();
