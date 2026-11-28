import { realpath } from "node:fs/promises"
import { within } from "./path-safety.mjs"
import { readableMcpHash } from "./resource-fingerprint.mjs"
import { mcpCommand } from "./resource-scopes.mjs"
import { skillFingerprint } from "./skill-bundle.mjs"

export function createCreationReconciler({
  paths,
  run,
  getState,
  saveState,
  listMcpSlugs,
  skillNames,
  skillCommand,
  log,
  requestRetry,
}) {
  const reconcileCreations = async (kind) => {
    const state = getState()
    let skillHomePromise = null
    const getLocalSkillHome = () =>
      (skillHomePromise ??= (async () => {
        const serverUrl = process.env.DUCORO_SERVER_URL
        if (serverUrl) {
          let host = ""
          try { host = new URL(serverUrl).hostname } catch {}
          if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) {
            throw Error("Skill readback is not local")
          }
        }
        const info = await run(["info"], { timeoutMs: 5000 })
        if (!info.ok || !info.json?.paths?.ducoroHome) {
          throw Error("Skill creation readback unavailable")
        }
        const [home, daemonHome] = await Promise.all([
          realpath(paths.ducoroHome),
          realpath(info.json.paths.ducoroHome),
        ])
        if (home !== daemonHome) throw Error("Skill readback is not local")
        return home
      })())

    for (const [creationId, tx] of Object.entries(state.creations ?? {})) {
      if (tx.kind !== kind) continue
      const id = `${tx.scope}:${tx.name}`
      let added = false
      try {
        if (kind === "mcp") {
          const listed = await listMcpSlugs(tx.scope)
          if (!listed) throw Error("MCP inventory unavailable")
          if (listed.has(tx.name)) {
            const shown = await run(mcpCommand(tx.scope, "show", tx.name), { timeoutMs: 5000 })
            if (
              !shown.ok ||
              (shown.json?.server ?? shown.json)?.slug !== tx.name ||
              readableMcpHash(shown.json) !== tx.contentHash
            ) {
              throw Error("MCP creation readback differs or is incomplete")
            }
            state.mcp[id] = {
              scope: tx.scope,
              slug: tx.name,
              hash: tx.hash,
              sourceName: tx.sourceName,
            }
            added = true
          }
        } else {
          const listed = await skillNames(tx.scope)
          if (!listed) throw Error("Skill inventory unavailable")
          if (listed.has(tx.name)) {
            const shown = await run(skillCommand(tx.scope, "show", tx.name), { timeoutMs: 5000 })
            const item = shown.json?.skill ?? shown.json
            if (!shown.ok || item?.name !== tx.name || !item.dirPath) {
              throw Error("Skill creation readback unavailable")
            }
            const [home, installed] = await Promise.all([
              getLocalSkillHome(),
              realpath(item.dirPath),
            ])
            if (!within(home, installed, { allowRoot: false })) {
              throw Error("Skill readback is not local")
            }
            if ((await skillFingerprint(installed, { includeModes: false })).hash !== tx.contentHash) {
              throw Error("Skill creation content differs")
            }
            state.skills[id] = {
              scope: tx.scope,
              name: tx.name,
              sourceName: tx.sourceName,
              hash: tx.hash,
              dir: tx.dir,
            }
            added = true
          }
        }
        delete state.creations[creationId]
        await saveState([...(added ? [[kind, id]] : []), ["creations", creationId]])
      } catch (error) {
        log(`Pending ${kind} creation ${id}: ${error.message}; inspect full content before recovery`)
        requestRetry(kind === "mcp" ? "mcp-conflict" : "skill-conflict")
      }
    }
  }

  return { reconcileCreations }
}
