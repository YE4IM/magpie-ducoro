import { stat, readdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
export async function sourceFingerprint(paths) {
  const rows = [], visited = new Set()
  const visit = async path => {
    if (visited.has(path)) return
    const resolved = await realpath(path).catch(() => path)
    if (visited.has(resolved)) return
    visited.add(resolved)
    try {
      const s = await stat(path)
      rows.push([path,s.ino,s.size,s.mtimeMs,s.ctimeMs])
      if (s.isDirectory()) for (const name of (await readdir(path)).sort()) await visit(join(path,name))
    } catch (error) { rows.push([path,error.code ?? 'unreadable']) }
  }
  for (const path of [...new Set(paths)].sort()) await visit(path)
  return JSON.stringify(rows)
}
export function createFallbackPoll({ fingerprint, refresh, changed }) {
  let previous, delay = 1000
  return async () => {
    const next = await fingerprint()
    const differs = previous !== undefined && next !== previous
    previous = next
    await refresh()
    if (differs) { delay = 1000; changed() } else delay = Math.min(30000, delay * 2)
    return delay
  }
}
