// Pure capability planning. Nothing here changes Magpie routes or calls an LLM.
const text = value => typeof value === 'string' ? value.trim() : ''
const own = (object, key) => Object.hasOwn(object ?? {}, key)

export const OFFICIAL_PROVIDERS = [
  'zai', 'zai-coding-cn', 'kimi-coding', 'moonshotai', 'moonshotai-cn',
  'anthropic', 'openai', 'google', 'deepseek', 'xai',
  'minimax', 'minimax-cn', 'alibaba', 'alibaba-cn',
]

// Normalize formatting only. Versions, context variants, dates and suffixes
// remain significant: k3.1-pro is never shortened to k3, nor Flash to base GLM.
export function modelIdentity(value) {
  let name = text(value).split(' · ')[0].toLowerCase()
    .replace(/[\s_\u2010-\u2015]+/g, '-').replace(/-+/g, '-')
  if (/^k\d/.test(name)) name = `kimi-${name}`
  return /^(?:glm-\d|kimi-k\d|deepseek-|claude-|gpt-|o\d(?:-|$)|gemini-|grok-|qwen\d|minimax-)/.test(name) ? name : null
}

const descriptors = value => Array.isArray(value) ? value.map(m => typeof m === 'string' ? { id: m } : m)
  : value && typeof value === 'object' ? Object.entries(value).map(([id, m]) => ({ ...(m && typeof m === 'object' ? m : {}), id })) : []

// Copy model metadata only, never credentials, URLs, headers or account data.
const safeModel = model => Object.fromEntries(['id', 'name', 'context', 'contextWindow', 'efforts', 'images', 'tools']
  .filter(key => own(model, key)).map(key => [key, model[key]]))

function modelIndex(exported, providers, pluginProviders) {
  const index = new Map()
  for (const provider of [...(Array.isArray(pluginProviders) ? pluginProviders : []), ...(Array.isArray(providers?.providers) ? providers.providers : [])]) {
    if (!text(provider?.id)) continue
    for (const model of descriptors(provider.models)) {
      if (!text(model?.id)) continue
      const id = `${provider.id}/${model.id}`
      index.set(id, { ...index.get(id), ...safeModel(model), id })
    }
  }
  for (const model of descriptors(exported)) {
    if (text(model?.id)) index.set(model.id, { ...index.get(model.id), ...safeModel(model) })
  }
  return index
}

function identityFor(id, index) {
  const model = index.get(id)
  const fromId = modelIdentity(id.split('/').at(-1))
  const fromName = modelIdentity(model?.name)
  // Conflicting recognized IDs/names are evidence of an alias requiring review.
  return fromId && fromName && fromId !== fromName ? null : fromId ?? fromName
}

function commonCapabilities(members, index) {
  const models = members.map(id => index.get(id) ?? {})
  const contexts = models.map(m => [m.context, m.contextWindow].find(v => typeof v === 'number' && Number.isFinite(v) && v > 0) ?? null)
  const effortsKnown = models.every(m => Array.isArray(m.efforts))
  const flags = name => models.every(m => typeof m[name] === 'boolean') ? models.every(m => m[name]) : null
  const differences = []
  if (new Set(contexts.filter(Boolean)).size > 1) differences.push('member-context-limits-differ')
  if (new Set(models.filter(m => Array.isArray(m.efforts)).map(m => JSON.stringify([...new Set(m.efforts)].sort()))).size > 1) differences.push('member-thinking-levels-differ')
  for (const flag of ['images', 'tools']) {
    if (new Set(models.map(m => m[flag]).filter(value => typeof value === 'boolean')).size > 1) differences.push(`member-${flag}-support-differs`)
  }
  return {
    contextWindow: contexts.some(Boolean) ? Math.min(...contexts.filter(Boolean)) : null,
    contextComplete: contexts.every(Boolean),
    thinkingLevels: effortsKnown ? [...new Set(models[0]?.efforts ?? [])].filter(level => models.every(m => m.efforts.includes(level))) : null,
    images: flags('images'), tools: flags('tools'), differences,
  }
}

function capabilityIssues(reference, common) {
  if (!reference) return []
  const issues = []
  if (common.contextWindow && reference.contextWindow > common.contextWindow) issues.push('reference-context-exceeds-member-limit')
  const depths = reference.thinkingCapability?.depths
  if (Array.isArray(common.thinkingLevels) && Array.isArray(depths)
    && depths.some(level => !common.thinkingLevels.includes(level))) issues.push('reference-thinking-exceeds-member-levels')
  return issues
}

// Resolve every exported route independently, including inactive groups. The
// returned provenance is committed only after a verified connection readback.
export function resolveCapabilityMappings({
  ids, catalog, existing = {}, exported = [], providers = null, pluginProviders = [],
  previous = null, overrides = {}, officialProviders = OFFICIAL_PROVIDERS, metadataUnavailable = false,
}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)
    || Object.values(overrides).some(value => value !== null && !text(value))) throw Error('modelCapabilityRefs must map route IDs to catalog references or null')
  if (!Array.isArray(officialProviders) || !officialProviders.length || officialProviders.some(provider => !text(provider))) throw Error('officialProviders must be a non-empty list of catalog provider IDs')
  const index = modelIndex(exported, providers, pluginProviders)
  const groups = new Map((Array.isArray(providers?.groups) ? providers.groups : [])
    .filter(group => text(group?.id)).map(group => [`group/${group.id}`, group]))
  const entries = [], refs = {}, automatic = {}, manual = {}
  const cat = Array.isArray(catalog) ? catalog.filter(c => text(c?.provider) && text(c?.id)) : null
  const coordinate = entry => `${entry.provider}/${entry.id}`
  const catalogEntry = ref => cat?.find(c => coordinate(c) === ref)
  const candidatesFor = identity => identity ? (cat ?? []).filter(c =>
    (modelIdentity(c.id) ?? modelIdentity(c.name)) === identity) : []
  const expand = (id, stack = new Set()) => {
    if (!id.startsWith('group/')) return { members: [id] }
    if (stack.has(id)) return { members: [], error: 'cyclic-group' }
    const group = groups.get(id)
    // Exported group names alone cannot prove homogeneous membership.
    if (!group || !Array.isArray(group.members) || !group.members.length) return { members: [], error: 'membership-unavailable' }
    const next = new Set([...stack, id]), members = []
    for (const member of group.members) {
      const memberId = typeof member === 'string' ? text(member) : text(member?.id)
      if (!memberId || !memberId.includes('/')) return { members: [], error: 'invalid-member' }
      const resolved = expand(memberId, next)
      if (resolved.error) return resolved
      members.push(...resolved.members)
    }
    return { members: [...new Set(members)].sort() }
  }
  for (const id of [...new Set(ids)]) {
    // Recover pending writes per route: an operator may have edited one entry
    // after a lost response without making every other entry a manual choice.
    const history = previous?.pending && (existing[id] ?? null) === (previous.pending.refs[id] ?? null)
      ? previous.pending.provenance : previous
    const expanded = expand(id)
    const members = expanded.members
    const identities = [...new Set(members.map(member => identityFor(member, index)).filter(Boolean))].sort()
    const unknown = members.some(member => !identityFor(member, index))
    const identity = !unknown && identities.length === 1 ? identities[0] : null
    const candidates = candidatesFor(identity)
    const official = candidates.filter(c => officialProviders.includes(c.provider)).sort((a, b) =>
      officialProviders.indexOf(a.provider) - officialProviders.indexOf(b.provider)
      || Number(modelIdentity(b.id) === identity) - Number(modelIdentity(a.id) === identity)
      || coordinate(a).localeCompare(coordinate(b)))
    const best = official[0]
    const common = members.length ? commonCapabilities(members, index) : null
    let status = expanded.error ?? (unknown ? 'unrecognized-model' : identities.length > 1 ? 'mixed-models' : best ? 'matched' : 'no-official-match')
    const issues = capabilityIssues(best, common ?? {})
    if (status === 'matched' && issues.length) status = 'capability-mismatch'
    const previousRef = existing[id]
    if (!cat || metadataUnavailable) {
      const unavailable = !cat ? 'catalog-unavailable' : 'metadata-unavailable'
      if (previousRef) refs[id] = previousRef
      if (own(history?.automatic, id)) automatic[id] = history.automatic[id]
      if (own(history?.manual, id)) manual[id] = history.manual[id]
      entries.push({ id, status: unavailable, source: previousRef ? 'retained' : 'none', reference: previousRef ?? null,
        identities, members, commonCapabilities: common, candidates: [], warnings: [unavailable] })
      continue
    }
    const tracked = history && (own(history.automatic, id) || own(history.manual, id))
    let isManual = own(history?.manual, id)
    if (tracked) {
      const expected = isManual ? history.manual[id] : history.automatic[id]
      if ((previousRef ?? null) !== (expected ?? null)) isManual = true
    } else if (previousRef) {
      // Upgrade legacy exact-ID mappings from 0.3.0/early 0.3.1. An existing
      // official or different-model choice is treated as an explicit selection.
      const saved = catalogEntry(previousRef)
      const legacyIdentity = modelIdentity(id.split('/').at(-1)) ?? modelIdentity(index.get(id)?.name)
      const legacy = saved && !officialProviders.includes(saved.provider)
        && (modelIdentity(saved.id) ?? modelIdentity(saved.name)) === legacyIdentity
      isManual = !legacy
    }
    let ref = null, source = 'none'
    if (own(overrides, id)) {
      ref = overrides[id]; source = 'option'
      if (ref && cat && !catalogEntry(ref)) throw Error(`unknown capability reference for ${id}`)
    } else if (isManual) {
      ref = previousRef ?? null; source = 'manual'
      manual[id] = ref
    } else if (status === 'membership-unavailable') {
      ref = previousRef ?? null; source = ref ? 'retained' : 'none'
      if (ref && own(history?.automatic, id)) automatic[id] = ref
    } else if (status === 'matched') {
      ref = coordinate(best); source = 'automatic'; automatic[id] = ref
    }
    // Option overrides are not classified as manual edits on the next sync.
    if (source === 'option') automatic[id] = ref
    if (ref) refs[id] = ref
    const warnings = [...issues, ...(common?.differences ?? [])]
    if (common && (!common.contextComplete || common.thinkingLevels === null)) warnings.push('member-capabilities-incomplete')
    if (source === 'manual' && ref && cat && !catalogEntry(ref)) warnings.push('manual-reference-not-in-catalog')
    const selected = catalogEntry(ref)
    if (identity && selected && (modelIdentity(selected.id) ?? modelIdentity(selected.name)) !== identity) warnings.push('reference-model-differs')
    if (ref && ref !== (best && coordinate(best))) warnings.push(...capabilityIssues(catalogEntry(ref), common ?? {}))
    entries.push({ id, status, source, reference: ref, identities, members, commonCapabilities: common,
      candidates: (identity ? candidates : identities.flatMap(candidatesFor)).map(coordinate).slice(0, 12), warnings: [...new Set(warnings)] })
  }
  return { refs, entries, provenance: { automatic, manual } }
}
