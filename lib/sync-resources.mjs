// Resource execution order and fault isolation are independent of host lifecycle.
export async function syncResources({library,resourcePlan,wants,progress,pruneSkills,syncMcp,syncTotal,syncSkills,diagnostics,state,opts,requestRetry,log,setTotal}) {
      // Skill conflict preflight precedes revocation; additions and gateway work
      // still wait until revocation has been attempted.
      try { if (resourcePlan && wants("skills")) await progress.step("revoke-skills", () => pruneSkills(library)) } catch (e) {
        log("skill cleanup error:", e?.message ?? e)
        requestRetry("skill-cleanup")
      }
      try {
        if (resourcePlan && wants("mcp")) {
          await progress.step("mcp", () => syncMcp(opts.syncMcp ? library : { ...library, mcp: [] }))
          diagnostics.stage("mcp", "configured", { targets: resourcePlan.mcpScopes, count: Object.keys(state.mcp).length })
        }
      } catch (e) {
        log("mcp sync error:", e?.message ?? e)
        requestRetry("mcp-sync")
      }
      try { if (wants("total")) await progress.step("instructions-subagents", async () => setTotal(await syncTotal(library))) } catch (e) {
        log("Total sync error:", e?.message ?? e)
        requestRetry("total-sync")
      }
      try {
        if (resourcePlan && wants("skills")) {
          await progress.step("skills", () => syncSkills(library))
          diagnostics.stage("skills", "configured", { targets: resourcePlan.skillScopes, count: Object.keys(state.skills).length })
        }
      } catch (e) {
        log("skill sync error:", e?.message ?? e)
        requestRetry("skill-sync")
      }
}
