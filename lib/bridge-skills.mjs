import { realpath } from "node:fs/promises"
import { basename, join } from "node:path"
import { clearFileCache } from "./file-cache.mjs"
import { selected } from "./inventory-shapes.mjs"
import { commandFailure } from "./operation-controls.mjs"
import { within } from "./path-safety.mjs"
import { sha256 } from "./resource-plan.mjs"
import { createSkillArtifacts } from "./skill-artifacts.mjs"
import { findSkillSource, readSkillBundle, skillFingerprint, skillName } from "./skill-bundle.mjs"
import { trimmedString as str } from "./utils.mjs"

// Resolve manifest identities only after a target has selected its sources.
const scopedSkillBundles = (bundles, sourceNames) => {
  const groups = new Map()
  for (const bundle of bundles.values()) {
    if (!sourceNames.has(bundle.sourceName) || !bundle.name) continue
    const group = groups.get(bundle.name)
    if (group) {
      group.sources.push(bundle.sourceName)
      group.bundle = null
    } else {
      groups.set(bundle.name, { sources: [bundle.sourceName], bundle })
    }
  }
  for (const group of groups.values()) group.sources.sort()
  return groups
}

const scopeTouchedByPaths = (scope, bundles, sourceNames, roundSkillPaths, skillsState) => {
  if (!roundSkillPaths) return true
  if (Object.values(skillsState).some((row) => row.scope === scope && row.replacement)) return true
  return [...bundles.values()].some(
    (bundle) =>
      sourceNames.has(bundle.sourceName) &&
      bundle.dir &&
      [...roundSkillPaths].some((path) => within(bundle.dir, path) || within(path, bundle.dir)),
  )
}

export function createSkillSync({
  opts,
  dryRun,
  paths,
  stateDir,
  run,
  getState,
  saveState,
  operations,
  diagnostics,
  requestRetry,
  log,
  warnOnce,
  errMsg,
  isNotFound,
  isWatching,
  isSuperseded,
  refreshWatches,
  reconcileCreations,
}) {
  // Keep only paths and the small manifest in memory. A scan hashes one file
  // at a time; staging is needed only for a changed bundle. Watches invalidate
  // the cache, while explicit/periodic reconciliations still hash all bytes.
  const activeSkillRoots = new Set()
  const skillBundleCache = new Map()
  const skillListCache = new Map()
  let skillCacheGeneration = 0
  let roundSkillBundles = null

  const invalidateSkillCache = () => {
    skillCacheGeneration++
    skillBundleCache.clear()
    clearFileCache()
  }

  const handleSkillChange = (changedPath) => {
    skillCacheGeneration++
    for (const root of skillBundleCache.keys()) {
      if (within(root, changedPath) || within(changedPath, root)) skillBundleCache.delete(root)
    }
  }

  const artifacts = createSkillArtifacts(join(stateDir, "skill-artifacts"), readSkillBundle)

  const skillCommand = (scope, action, ...args) =>
    scope === "global" ? ["skill", action, ...args] : ["agent", "skill", action, scope, ...args]

  const skillNames = async (scope) => {
    if (skillListCache.has(scope)) return new Set(skillListCache.get(scope))
    const r = await run(skillCommand(scope, "list"), { timeoutMs: 30_000 })
    if (!r.ok) {
      log(`skill list (${scope}) failed: ${errMsg(r)}`)
      requestRetry("skill-list")
      return null
    }
    if (dryRun && !r.json) return new Set()
    const raw = r.json
    const arr = Array.isArray(raw) ? raw : raw?.skills ?? raw?.data
    if (!Array.isArray(arr)) {
      requestRetry("skill-list")
      return null
    }
    const set = new Set(
      arr.map((s) => (typeof s === "string" ? s : str(s?.name) || str(s?.slug))).filter(Boolean),
    )
    skillListCache.set(scope, set)
    return new Set(set)
  }

  const listSkillBundles = async (library) => {
    const found = new Map()
    const candidates = []
    activeSkillRoots.clear()
    const entries = await Promise.all(
      selected(library.skills).map(async (item) => {
        const sourceName = str(item.name)
        if (!sourceName || basename(sourceName) !== sourceName || sourceName === "." || sourceName === "..") {
          return null
        }
        let dir
        try {
          dir = await findSkillSource(sourceName, [paths.skills, paths.librarySkills])
        } catch (e) {
          return {
            sourceName,
            error: `selected skill ${sourceName} cannot be located: ${e?.message ?? e}`,
          }
        }
        if (!dir) {
          return { sourceName, error: `selected skill ${sourceName} has no readable bundle; will retry` }
        }
        try {
          const root = await realpath(dir)
          return { sourceName, dir, root }
        } catch (e) {
          return { sourceName, error: `selected skill ${sourceName} cannot be resolved: ${e.message}` }
        }
      }),
    )
    for (const entry of entries) {
      if (!entry) continue
      if (entry.error) {
        log(entry.error)
        requestRetry("skill-source")
        found.set(entry.sourceName, { sourceName: entry.sourceName })
        continue
      }
      activeSkillRoots.add(entry.root)
      candidates.push(entry)
    }
    // Discover all roots before refreshing so one source cannot retire the
    // next source's watcher while this round is still scanning its bytes.
    if (isWatching()) await refreshWatches()
    for (const { sourceName, dir, root } of candidates) {
      try {
        const generation = skillCacheGeneration
        const bundle = (isWatching() && skillBundleCache.get(root)) || (await readSkillBundle(dir))
        if (isWatching() && generation === skillCacheGeneration) skillBundleCache.set(root, bundle)
        const name = skillName(bundle.md, sourceName)
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error("invalid skill manifest name")
        found.set(sourceName, { name, sourceName, dir, ...bundle })
      } catch (e) {
        log(`selected skill ${sourceName} cannot be prepared: ${e.message}`)
        requestRetry("skill-source")
        found.set(sourceName, { sourceName })
      }
    }
    for (const root of skillBundleCache.keys()) {
      if (!activeSkillRoots.has(root)) skillBundleCache.delete(root)
    }
    return found
  }

  const skillBundlesForRound = (library) => (roundSkillBundles ??= listSkillBundles(library))

  const removeNamedSkill = async (scope, name) => {
    skillListCache.delete(scope)
    const r = await run(skillCommand(scope, "remove", name), { timeoutMs: 30_000 })
    if (r.ok || isNotFound(r)) return true
    log(`removing skill ${name} failed: ${errMsg(r)}`)
    requestRetry("skill-cleanup")
    return false
  }

  const removeSkill = async (id, mine) => {
    // A cancelled assignment also owns its interrupted replacement backup.
    // Retain the transaction until both names have been removed successfully.
    if (!(await removeNamedSkill(mine.scope, mine.name))) return false
    if (mine.replacement && !(await removeNamedSkill(mine.scope, mine.replacement.backupName))) {
      return false
    }
    delete getState().skills[id]
    await saveState([["skills", id]])
    log(`removed skill ${mine.name} (${mine.scope})`)
    return true
  }

  const pruneSkills = async (library, { resourcePlan, desiredPlan }) => {
    await reconcileCreations("skills")
    const state = getState()
    let complete = true
    const sourceNames = new Map(
      resourcePlan.skillScopes.map((scope) => [
        scope,
        new Set(desiredPlan.skills.get(scope)?.keys() ?? []),
      ]),
    )
    let migrated = false
    for (const [id, mine] of Object.entries(state.skills)) {
      if (!mine.scope) {
        delete state.skills[id]
        state.skills[`global:${id}`] = { ...mine, scope: "global", name: id, sourceName: id }
        migrated = true
      }
    }
    if (migrated) await saveState()
    const bundles = opts.syncSkills ? await skillBundlesForRound(library) : new Map()
    const conflicts = new Map(
      [...sourceNames].map(([scope, names]) => [
        scope,
        new Set(
          [...scopedSkillBundles(bundles, names)]
            .filter(([, group]) => !group.bundle)
            .map(([name]) => name),
        ),
      ]),
    )
    for (const [id, mine] of Object.entries(state.skills)) {
      // A selected ambiguous name cannot authorize deleting its current import.
      if (conflicts.get(mine.scope)?.has(mine.name)) continue
      if (!sourceNames.get(mine.scope)?.has(mine.sourceName) && !(await removeSkill(id, mine))) {
        complete = false
      }
    }
    if (![...sourceNames.values()].some((names) => names.size)) {
      activeSkillRoots.clear()
      invalidateSkillCache()
    }
    return complete
  }

  // import refuses an existing valid target. Rename the complete old bundle
  // instead of deleting it, and journal the backup in the existing owner entry
  // before touching Ducoro. The journal survives app/CLI host restarts.
  const recoverSkillReplacement = async (id, mine, existing) => {
    const tx = mine.replacement
    if (!tx) return true
    const hasOriginal = existing.has(mine.name)
    const hasBackup = existing.has(tx.backupName)
    if (hasOriginal && tx.phase === "installed") {
      if (hasBackup && !(await removeNamedSkill(mine.scope, tx.backupName))) return false
      existing.delete(tx.backupName)
      delete mine.replacement
      await saveState([["skills", id]])
      return true
    }
    if (hasBackup) {
      if (hasOriginal) {
        // An import completed just before the process exited. Both identities
        // are recorded by this transaction; commit the valid listed candidate.
        mine.hash = tx.nextHash
        tx.phase = "installed"
        await saveState([["skills", id]])
        return recoverSkillReplacement(id, mine, existing)
      }
      skillListCache.delete(mine.scope)
      const restored = await run(
        skillCommand(mine.scope, "rename", tx.backupName, "--to", mine.name),
        { timeoutMs: 30_000 },
      )
      if (!restored.ok) {
        log(`restoring previous skill ${mine.name} failed; backup retained: ${errMsg(restored)}`)
        requestRetry("skill-restore")
        return false
      }
      existing.delete(tx.backupName)
      existing.add(mine.name)
      mine.hash = tx.previousHash
    } else if (!hasOriginal) {
      log(`skill ${mine.name} replacement is incomplete; ownership retained for retry`)
      requestRetry("skill-restore")
      return false
    }
    delete mine.replacement
    await saveState([["skills", id]])
    return true
  }

  const syncSkills = async (library, { resourcePlan, desiredPlan, roundSkillPaths }) => {
    if (!(await pruneSkills(library, { resourcePlan, desiredPlan }))) return
    const bundles = opts.syncSkills ? await skillBundlesForRound(library) : new Map()
    if (!bundles.size) return
    const state = getState()
    for (const scope of resourcePlan.skillScopes) {
      const sourceNames = new Set(desiredPlan.skills.get(scope)?.keys() ?? [])
      const scopedBundles = scopedSkillBundles(bundles, sourceNames)
      for (const [name, group] of scopedBundles) {
        if (!group.bundle) {
          const operation = await operations.begin(
            "skills",
            scope,
            name,
            { conflictingSources: group.sources },
            ["revoke-skills"],
          )
          await operations.finish(operation, false, [], { failureClass: "conflict" })
          log(
            `skill "${name}" (${scope}) has conflicting library sources: ${group.sources.join(", ")}; existing import retained`,
          )
          requestRetry("skill-source-conflict")
          diagnostics.retry("skill-source-conflict", ["skills"], scope === "global" ? [] : [scope])
        }
      }
      if (!scopeTouchedByPaths(scope, bundles, sourceNames, roundSkillPaths, state.skills)) {
        continue
      }
      const existing = await skillNames(scope)
      if (!existing) continue
      for (const [id, mine] of Object.entries(state.skills)) {
        if (mine.scope === scope && mine.replacement && scopedBundles.get(mine.name)?.bundle !== null) {
          if (!(await recoverSkillReplacement(id, mine, existing))) continue
        }
      }
      for (const [name, { bundle }] of scopedBundles) {
        if (isSuperseded()) return
        if (!bundle?.dir) continue
        const { dir, hash, sourceName } = bundle
        const id = `${scope}:${name}`
        let mine = state.skills[id]
        if (mine?.replacement || state.creations?.[`skills:${id}`]) continue
        if (existing.has(name) && !mine) {
          warnOnce(
            `skill:${id}`,
            `skill "${name}" exists in Ducoro (${scope}) and was not imported by this plugin; skipped`,
          )
          requestRetry("skill-conflict")
          continue
        }
        if (mine?.hash === hash && existing.has(name)) {
          const op = await operations.begin("skills", scope, name, hash, ["revoke-skills"], true)
          await operations.finish(op)
          continue
        }
        const operation = await operations.begin("skills", scope, name, hash, ["revoke-skills"])
        if (!operation) {
          requestRetry("skill-import")
          continue
        }
        try {
          const staged = await artifacts.prepare(name, bundle)
          if (mine && existing.has(name)) {
            let suffix = 0
            let backupName
            do {
              backupName = `magpie-backup-${sha256(id + hash).slice(0, 16)}${suffix ? `-${suffix}` : ""}`
              suffix++
            } while (existing.has(backupName))
            mine.replacement = { backupName, previousHash: mine.hash, nextHash: hash, phase: "prepared" }
            await saveState([["skills", id]])
            skillListCache.delete(scope)
            const backup = await run(
              skillCommand(scope, "rename", name, "--to", backupName),
              { timeoutMs: 30_000 },
            )
            if (!backup.ok) {
              log(`backing up skill ${name} failed; update deferred: ${errMsg(backup)}`)
              requestRetry("skill-backup")
              await operations.finish(
                operation,
                false,
                [],
                Object.assign(Error(errMsg(backup)), commandFailure(backup)),
              )
              continue
            }
            existing.delete(name)
            existing.add(backupName)
            mine.replacement.phase = "backed-up"
            await saveState([["skills", id]])
          }
          if (!mine) {
            state.creations ??= {}
            state.creations[`skills:${id}`] = {
              kind: "skills",
              scope,
              name,
              sourceName,
              hash,
              dir,
              contentHash: (await skillFingerprint(staged, { includeModes: false })).hash,
            }
            await saveState([["creations", `skills:${id}`]])
          }
          skillListCache.delete(scope)
          const r = await run(skillCommand(scope, "import", staged), { timeoutMs: 60_000 })
          if (r.ok) {
            existing.add(name)
            const hadCreation = Boolean(
              state.creations && Object.hasOwn(state.creations, `skills:${id}`),
            )
            if (hadCreation) delete state.creations[`skills:${id}`]
            state.skills[id] = {
              scope,
              name,
              sourceName,
              hash,
              dir,
              ...(mine?.replacement
                ? { replacement: { ...mine.replacement, phase: "installed" } }
                : {}),
            }
            mine = state.skills[id]
            await saveState([
              ["skills", id],
              ...(hadCreation ? [["creations", `skills:${id}`]] : []),
            ])
            const replacementClean = mine.replacement
              ? await recoverSkillReplacement(id, mine, existing)
              : true
            // A manifest rename should retire its old identity only after the
            // replacement has successfully reached Ducoro.
            let removedOld = true
            for (const [oldId, old] of Object.entries(state.skills)) {
              if (oldId !== id && old.scope === scope && old.sourceName === sourceName) {
                if (!(await removeSkill(oldId, old))) removedOld = false
              }
            }
            await operations.finish(operation, replacementClean && removedOld)
            log(`skill ${name} imported (${scope})`)
          } else {
            log(`importing skill ${name} failed; restoring previous version: ${errMsg(r)}`)
            await operations.finish(
              operation,
              false,
              [],
              Object.assign(Error(errMsg(r)), commandFailure(r)),
            )
            requestRetry("skill-import")
            if (mine?.replacement && !(await recoverSkillReplacement(id, mine, existing))) {
              log(`skill ${name} rollback remains pending`)
            }
          }
        } catch (e) {
          invalidateSkillCache()
          log(`preparing skill ${name} failed; existing import retained: ${e.message}`)
          await operations.finish(operation, false, [], e)
          requestRetry("skill-stage")
        }
      }
    }
  }

  return {
    skillCommand,
    skillNames,
    invalidateSkillCache,
    handleSkillChange,
    resetRound: () => {
      artifacts.reset()
      roundSkillBundles = null
      skillListCache.clear()
    },
    activeSkillRoots: () => activeSkillRoots,
    metrics: () => artifacts.metrics(),
    pruneSkills,
    syncSkills,
  }
}
