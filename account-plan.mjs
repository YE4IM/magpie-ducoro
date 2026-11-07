import { createHash } from 'node:crypto'
export const accountRevision = record => createHash('sha256').update(JSON.stringify(record ?? null)).digest('hex')
export const comparablePolicy = policy => policy == null ? null : {allow:[...(policy.allow ?? [])].sort(),deny:[...(policy.deny ?? [])].sort()}
export const samePolicy = (a,b) => JSON.stringify(comparablePolicy(a)) === JSON.stringify(comparablePolicy(b))
export function planAccountConnector(actual, want, record, resolution) {
  const external = !!record && !samePolicy(actual,record.applied) && !(Object.hasOwn(record,'pending') && samePolicy(actual,record.pending))
  const resolved = external && resolution?.revision === accountRevision(record) && samePolicy(actual,resolution.actual)
  const conflict = external && !resolved
  const next = resolved && resolution.mode === 'keep' ? actual : want ?? record?.previous ?? null
  return { resolved, keepExternal:resolved && resolution.mode === 'keep', next:comparablePolicy(next), conflict, action:conflict ? 'conflict' : samePolicy(actual,next) ? 'keep' : want ? actual ? 'update' : 'add' : next ? 'restore' : 'remove' }
}
export const accountOrder = (desired, history) => [...new Set([...Object.keys(history ?? {}),...Object.keys(desired ?? {})])].sort((a,b) => Number(!!desired?.[a])-Number(!!desired?.[b]) || a.localeCompare(b))
