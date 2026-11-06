// Reconcile Ducoro Bot addresses after a Magpie connection change. The wire
// model remains Magpie's ID; catalog references describe capabilities only.
const rows = value => Array.isArray(value) ? value : value?.agents ?? value?.bots
const record = value => value?.agent ?? value
const sameRefs = (a, b) => Object.keys({ ...a, ...b }).every(key => a?.[key] === b?.[key])

export function compatiblePreference(preference, model, info) {
  const next = { ...preference, model }
  const capability = info?.thinkingCapability
  const depths = Array.isArray(capability?.depths) ? capability.depths : []
  const levels = new Set(depths)
  if (capability?.canDisable) {
    levels.add('off')
    if (!depths.length) levels.add('on')
  }
  if (next.thinkingLevel && !levels.has(next.thinkingLevel)) delete next.thinkingLevel
  // The connection projection does not advertise speed support. On a model
  // change, use the target's default instead of carrying an unverified override.
  if (model !== preference.model) delete next.speedMode
  return next
}

export function createModelSync({ opts, run, getState, save, requestRetry, log, isCurrent = () => true, onStatus = () => {} }) {
  const call = async args => {
    if (!isCurrent()) throw Error('model sync superseded by a gateway change')
    const result = await run(args, { timeoutMs: 30_000 })
    if (!result.ok) throw Error(`Ducoro ${args.slice(0, 2).join(' ')} failed: ${result.json?.error?.message ?? 'CLI unavailable or request rejected'}`)
    return result.json
  }
  // Persist a transition before replacing the connection default. Otherwise
  // an RPC failure/restart could forget which Bots followed the old selection.
  const prepare = async (slug, target, previous) => {
    if (!opts.syncAgentModels || !target || opts.dryRun) return
    const state = getState()
    const pending = state.modelMigration?.slug === slug ? state.modelMigration : null
    const from = new Set([...(pending?.from ?? []), pending?.target, previous].filter(id => id && id !== target))
    if (!from.size && !pending) return
    state.modelMigration = { slug, target, from: [...from] }
    await save()
  }
  const sync = async connection => {
    if (!opts.syncAgentModels || opts.dryRun || !connection.defaultModel) return
    const { slug, defaultModel: target } = connection
    const models = Array.isArray(connection.models) ? connection.models : []
    if (models.length && !models.includes(target)) throw Error('selected model is absent from the saved connection catalog')
    const state = getState()
    const migration = state.modelMigration?.slug === slug && state.modelMigration.target === target ? state.modelMigration : null
    const following = new Set(migration?.from ?? [])
    const all = rows(await call(['agent', 'list']))
    if (!Array.isArray(all)) throw Error('unrecognized Ducoro Bot list response')
    const eligible = bot => bot?.modelPreference?.connectionSlug === slug && bot.modelPreference.runtime === 'pi-agent'
      && (!Array.isArray(opts.targetAgents) || !opts.targetAgents.length || opts.targetAgents.includes(bot.id))
    const bots = all.filter(eligible)
    onStatus('unknown', { targets: bots.map(bot => bot.id), count: bots.length })
    let infos = []
    if (bots.length) {
      const status = await call(['connections', 'list', '--with-status'])
      const connections = Array.isArray(status) ? status : status?.connections
      const route = connections?.find(c => c.slug === slug)
      // Capabilities must belong to the route just saved, not a stale projection.
      if (!route || route.defaultModel !== target || route.baseUrl !== connection.baseUrl
        || JSON.stringify([...(route.models ?? [])].sort()) !== JSON.stringify([...models].sort())
        || !sameRefs(route.modelCapabilityRefs, connection.modelCapabilityRefs)
        || !Array.isArray(route.availableModelInfos)) throw Error('connection capability projection unavailable or changed; Bot sync deferred')
      infos = route.availableModelInfos
    }
    let complete = true
    for (const bot of bots) {
      try {
        // The roster is only an index. Re-read the full preference so an
        // operator's recent route/control changes are not replaced by old data.
        const current = record(await call(['agent', 'get', bot.id]))
        if (current?.id !== bot.id) throw Error('unrecognized Ducoro Bot record')
        if (!eligible(current)) continue
        const preference = current.modelPreference
        const removed = models.length > 0 && !models.includes(preference.model)
        const model = removed || following.has(preference.model) ? target : preference.model
        const info = infos.find(info => info.id === model)
        if (!info) throw Error('effective model capabilities unavailable; Bot sync deferred')
        const next = compatiblePreference(preference, model, info)
        if (JSON.stringify(next) === JSON.stringify(preference)) continue
        await call(['agent', 'update', bot.id, '--patch', JSON.stringify({ modelPreference: next })])
        const verified = record(await call(['agent', 'get', bot.id]))
        if (verified?.id !== bot.id || !verified.modelPreference
          || Object.keys({ ...next, ...verified.modelPreference }).some(key => next[key] !== verified.modelPreference[key])) {
          throw Error('Bot model preference readback differs; reconciliation required')
        }
        log(`Bot ${bot.id} model synchronized: ${preference.model} -> ${model}${preference.thinkingLevel && !next.thinkingLevel ? ' (unsupported thinking override cleared)' : ''}`)
      } catch (error) {
        complete = false
        log(`Bot ${bot.id} model sync deferred: ${error.message}`)
        requestRetry('bot-model-sync')
      }
    }
    if (complete && migration) {
      delete state.modelMigration
      await save()
    }
    onStatus(complete ? 'configured' : 'pending', { targets: bots.map(bot => bot.id), count: bots.length })
  }
  return { prepare, sync }
}
