const NOT_FOUND_RE =
  /not_found|notfound|no (mcp server|connection|skill|credential)|no such|unknown (slug|connection)/i

function addBounded(set, key, limit) {
  if (set.has(key)) {
    set.delete(key)
    set.add(key)
    return false
  }
  if (set.size >= limit) set.delete(set.values().next().value)
  set.add(key)
  return true
}

export function createBridgeLogger({ diagnostics, maxTrackedKeys = 500 }) {
  const knownSecrets = new Set()
  const warned = new Set()
  let sortedSecrets = []

  const rememberSecret = (value) => {
    if (value === undefined || value === null || !String(value)) return
    const text = String(value)
    let changed = addBounded(knownSecrets, text, maxTrackedKeys)
    // CLI errors sometimes echo the token without its authorization scheme.
    const authorization = /^(?:Bearer|Basic)\s+(.+)$/i.exec(text)
    if (authorization) {
      changed = addBounded(knownSecrets, authorization[1], maxTrackedKeys) || changed
    }
    if (changed) {
      sortedSecrets = [...knownSecrets].sort((a, b) => b.length - a.length)
    }
  }

  const redact = (value) => {
    let out = String(value)
    for (const secret of sortedSecrets) {
      out = out.split(secret).join("[redacted]")
    }
    return out.replace(/https?:\/\/[^\s<>"')]+/g, (text) => {
      try {
        const url = new URL(text)
        if (url.username || url.password) {
          url.username = "redacted"
          url.password = "redacted"
        }
        for (const key of [...url.searchParams.keys()]) {
          url.searchParams.set(key, "redacted")
        }
        if (url.hash) url.hash = "redacted"
        return url.toString()
      } catch {
        return "[redacted-url]"
      }
    })
  }

  const log = (...args) => console.log("[ducoro-bridge]", ...args.map(redact))

  const warnOnce = (key, msg) => {
    // A repeated conflict is still part of this round's diagnostics even when
    // the human-readable log has already been emitted by this host.
    const feature = key.startsWith("conn:")
      ? "connection"
      : key.startsWith("mcp:")
        ? "mcp"
        : key.startsWith("skill:")
          ? "skills"
          : null
    if (feature) {
      diagnostics.retry(
        "ownership-conflict",
        feature === "connection" ? ["connection", "models"] : [feature],
      )
    }
    if (warned.has(key)) return
    addBounded(warned, key, maxTrackedKeys)
    log("note:", msg)
  }

  const clearWarned = () => warned.clear()

  const errMsg = (r) => {
    const j = r.json?.error?.message ?? r.json?.error?.code
    if (j) return redact(j)
    const line = (r.stderr || r.stdout || "").trim().split("\n")[0]
    return redact(line || `exit code ${r.code}`)
  }

  const isNotFound = (r) => {
    if (r.ok) return false
    const rawErr = r.json?.error?.message ?? r.json?.error?.code
    return (
      NOT_FOUND_RE.test(r.stderr) ||
      NOT_FOUND_RE.test(r.stdout) ||
      (rawErr ? NOT_FOUND_RE.test(String(rawErr)) : NOT_FOUND_RE.test(errMsg(r)))
    )
  }

  return { rememberSecret, redact, log, warnOnce, clearWarned, errMsg, isNotFound }
}
