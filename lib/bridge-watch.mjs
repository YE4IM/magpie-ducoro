import { watch as fsWatch } from "node:fs"
import { realpath, stat } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { within } from "./path-safety.mjs"

export function createWatchManager({
  paths,
  getActiveSkillRoots,
  classifyChange,
  onFilesChanged,
  onDegradedChange,
  onWatchEvent,
  diagnostics,
  warnOnce,
  log,
  isWatching,
}) {
  const watchers = new Map()
  let refreshPromise = null
  let refreshAgain = false

  const refreshWatches = () => {
    if (!isWatching()) return Promise.resolve()
    if (refreshPromise) {
      refreshAgain = true
      return refreshPromise
    }
    refreshPromise = (async () => {
      do {
        refreshAgain = false
        const desired = new Map()
        const add = (dir, recursive = false, name = null, info = null) => {
          const entry = desired.get(dir) ?? { recursive: false, names: new Set(), info }
          entry.recursive ||= recursive
          if (name) entry.names.add(name)
          if (info) entry.info = info
          desired.set(dir, entry)
        }
        // Anchor a missing directory at its nearest existing ancestor. When
        // Magpie creates it, attach the real watcher during the same event.
        const observe = async (target, recursive, name = null) => {
          let dir = target
          let child = name
          let info = await stat(dir).catch(() => null)
          while (!info?.isDirectory() && dirname(dir) !== dir) {
            child = basename(dir)
            dir = dirname(dir)
            info = await stat(dir).catch(() => null)
          }
          if (info?.isDirectory()) {
            add(await realpath(dir), dir === target && recursive, child, info)
          }
        }
        const observeTasks = []
        for (const file of [
          paths.bridge,
          paths.mcp,
          paths.library,
          paths.instructions,
          paths.providers,
          paths.pluginProviders,
        ]) {
          observeTasks.push(
            observe(dirname(file), false, basename(file)),
            observe(dirname(dirname(file)), false, basename(dirname(file))),
          )
        }
        const roots = new Set([paths.skills, paths.librarySkills, ...getActiveSkillRoots()])
        for (const dir of roots) {
          observeTasks.push(
            observe(dir, true),
            observe(dirname(dir), false, basename(dir)),
          )
        }
        await Promise.all(observeTasks)
        // A recursive root already covers its physical subdirectories.
        for (const dir of [...desired.keys()]) {
          if (
            [...desired].some(
              ([parent, entry]) =>
                parent !== dir && entry.recursive && within(parent, dir, { allowRoot: false }),
            )
          ) {
            desired.delete(dir)
          }
        }
        if (!isWatching()) break
        onDegradedChange(false)
        for (const [dir, entry] of watchers) {
          const want = desired.get(dir)
          if (
            !want ||
            want.recursive !== entry.recursive ||
            want.info?.ino !== entry.ino ||
            want.info?.dev !== entry.dev
          ) {
            entry.watcher.close()
            watchers.delete(dir)
          } else {
            entry.names = want.names
          }
        }
        for (const [dir, want] of desired) {
          if (watchers.has(dir)) continue
          try {
            const entry = { ...want, ino: want.info?.ino, dev: want.info?.dev }
            const watcher = fsWatch(dir, { recursive: want.recursive }, (_event, filename) => {
              const name = filename == null ? null : String(filename).split(/[\\/]/)[0]
              if (!entry.recursive && name && !entry.names.has(name)) return
              const changedPath = filename == null ? dir : join(dir, String(filename))
              const isParentDir = Object.values(paths).some(path => dirname(path) === changedPath)
              if (_event === "change" && isParentDir) {
                void refreshWatches()
                return
              }
              const features = classifyChange(changedPath)
              onFilesChanged(changedPath, features)
              onWatchEvent()
              if (_event === "rename" || isParentDir) void refreshWatches()
            })
            entry.watcher = watcher
            watcher.on("error", (error) => {
              onDegradedChange(true)
              warnOnce(
                `watch:${dir}:${error?.code}`,
                `watch error (${error?.code ?? "unknown"}): ${dir}; using short reconciliation fallback`,
              )
              watcher.close()
              if (watchers.get(dir) === entry) watchers.delete(dir)
              diagnostics.retry("watch-error")
            })
            watchers.set(dir, entry)
          } catch (error) {
            onDegradedChange(true)
            warnOnce(
              `watch:${dir}:${error?.code ?? "missing"}`,
              `watch unavailable (${error?.code ?? "unknown"}): ${dir}; using short reconciliation fallback`,
            )
            diagnostics.retry("watch-missing")
          }
        }
      } while (refreshAgain && isWatching())
    })()
      .catch((e) => {
        log("watch refresh failed:", e?.message ?? e)
        diagnostics.retry("watch-refresh")
      })
      .finally(() => {
        refreshPromise = null
      })
    return refreshPromise
  }

  const closeAll = () => {
    for (const { watcher } of watchers.values()) watcher.close()
    watchers.clear()
  }

  return {
    refreshWatches,
    closeAll,
    waitForRefresh: () => refreshPromise,
    watchedPaths: () => [...watchers.keys()],
  }
}
