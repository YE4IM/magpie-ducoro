export function featureForReason(reason) {
  if (reason.startsWith("skill")) return "skills"
  if (reason.startsWith("mcp")) return "mcp"
  if (reason.startsWith("total")) return "total"
  if (reason.startsWith("account")) return "accounts"
  if (/model|connection|gateway/.test(reason)) return "gateway"
  return "all"
}

export function createScheduler({
  diagnostics,
  progress,
  manualRetries,
  syncAll,
  interruptGatewayReads,
  log,
  isWatching,
  onDirtyFeature,
}) {
  let running = false
  let pending = false
  let syncTimer = null
  let retryTimer = null
  let retryDelay = 250
  let retryRequested = false
  let activeRun = null

  const requestRetry = (reason, minDelay = 0) => {
    progress.fail()
    // Diagnostics also cover manual one-shot runs, where no retry timer runs.
    // Total's per-resource report provides finer attribution than its shared
    // retry signal; use that report rather than marking both resources failed.
    if (reason !== "total-resource") diagnostics.retry(reason)
    onDirtyFeature(featureForReason(reason))
    retryRequested = true
    if (!isWatching() || retryTimer) return
    retryTimer = setTimeout(() => {
      retryTimer = null
      trigger(`retry:${reason}`, 0)
    }, Math.max(retryDelay, minDelay))
    retryTimer.unref?.()
    retryDelay = Math.min(60_000, retryDelay * 2)
  }

  // A bounded batch window, not a trailing debounce: continuous filesystem
  // writes cannot postpone a user's selection indefinitely.
  const trigger = (reason = "file-change", delay = 75) => {
    if (!isWatching()) return
    if (reason.startsWith("page-operation:")) {
      if (!manualRetries.add(reason)) return
      onDirtyFeature(reason.split(":")[2] || "all")
    } else if (reason === "page-retry-failed") {
      manualRetries.add(reason)
      // The persisted failed rows are authoritative, even if diagnostics are stale.
      onDirtyFeature("all")
    } else if (!reason.startsWith("retry:") && !["file-change", "coalesced"].includes(reason)) {
      onDirtyFeature("all")
    }
    if (reason === "file-change" || reason === "watch-fallback") interruptGatewayReads()
    if (running) {
      pending = true
      return
    }
    if (syncTimer) return
    syncTimer = setTimeout(() => {
      syncTimer = null
      running = true
      activeRun = (async () => {
        try {
          if ((await syncAll(reason)) === false) requestRetry("host-lock")
          if (!retryRequested) {
            retryDelay = 250
            clearTimeout(retryTimer)
            retryTimer = null
          }
        } catch (e) {
          log("sync failed:", e?.message ?? e)
          requestRetry("sync-failed")
        } finally {
          running = false
          if (pending && isWatching()) {
            pending = false
            trigger("coalesced", 0)
          }
        }
      })()
    }, delay)
    syncTimer.unref?.()
  }

  const clearTimers = () => {
    pending = false
    retryRequested = false
    clearTimeout(syncTimer)
    clearTimeout(retryTimer)
    syncTimer = null
    retryTimer = null
  }

  const reset = () => {
    retryDelay = 250
    pending = false
    retryRequested = false
  }

  return {
    requestRetry,
    trigger,
    clearTimers,
    reset,
    isPending: () => pending,
    wasRetryRequested: () => retryRequested,
    consumeRetryRequested: () => { retryRequested = false },
    waitForActiveRun: () => activeRun,
  }
}
