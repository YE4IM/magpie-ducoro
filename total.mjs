// Total's additional resources. Never execute hook commands as a substitute
// for runtime events: a filesystem notification is not a tool/session event.
import { readFile, writeFile, mkdir, rename, rm, realpath, lstat } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'

// Keep legacy ownership markers so upgrades can restore existing Profiles.
const BEGIN = '<!-- magpie-ducoro-total:begin -->'
const END = '<!-- magpie-ducoro-total:end -->'
const hash = text => createHash('sha256').update(text).digest('hex')
const enabled = x => x && !x.offHere && x.disabled !== true && x.enabled !== false
const assigned = x => enabled(x) && Array.isArray(x.agents) && x.agents.includes('ducoro')
const list = value => Array.isArray(value) ? value : value?.agents ?? value?.bots
const readOptional = async path => {
  try { return await readFile(path, 'utf8') } catch (e) { if (e.code === 'ENOENT') return null; throw e }
}

export function mergeInstructions(profile, previous, text) {
  const block = text.trim() ? `\n\n${BEGIN}\n${text.trim()}\n${END}\n` : ''
  if (previous && profile.includes(previous)) {
    if (profile.indexOf(previous) !== profile.lastIndexOf(previous)) throw Error('duplicate instruction blocks')
    return { profile: profile.replace(previous, block), block }
  }
  if (profile.includes(BEGIN) || profile.includes(END)) throw Error('instruction block edited by user; retained')
  // Keep the exact original whitespace, so removing our block restores it.
  return { profile: profile + (block ? block : ''), block }
}

export function renderSubagent(item) {
  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(item.name) || ['default', 'main'].includes(item.name)) throw Error('invalid subagent name')
  if (typeof item.description !== 'string' || !item.description.trim() || typeof item.prompt !== 'string' || !item.prompt.trim()) throw Error('invalid subagent description or prompt')
  // Magpie's skills/MCP restrictions have no equivalent verified mapping in
  // Ducoro. Refuse them rather than silently giving a child broader access.
  if (item.skills?.length || item.mcp?.length) throw Error('subagent skill/MCP restrictions cannot be faithfully projected')
  const fields = { name: item.name, description: item.description }
  if (item.model) throw Error('Magpie subagent model ids require a Ducoro runtime mapping; omitted models inherit the parent')
  return '---\n' + Object.entries(fields).map(([k,v]) => `${k}: ${JSON.stringify(v)}`).join('\n') + '\n---\n' + item.prompt + '\n'
}

export function createTotalSync({ opts, paths, run, save, getState, requestRetry, log }) {
  const problem = (report, key, message) => {
    report.errors.push({ resource: key, message })
    requestRetry('total-resource')
  }
  const call = async args => {
    const result = await run(args, { timeoutMs: 5000 })
    if (!result.ok) throw Error(`Ducoro ${args.slice(0, 2).join(' ')} failed`)
    return result.json
  }
  // Direct file writes are allowed by Ducoro only for named subagents on the
  // same daemon host. Reject remote CLI overrides and mismatched homes.
  const localHome = async () => {
    const url = process.env.DUCORO_SERVER_URL
    if (url && !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname)) throw Error('subagent writes require the local Ducoro daemon')
    const info = await call(['info'])
    const reported = info?.paths?.ducoroHome
    if (!reported || await realpath(reported) !== await realpath(paths.ducoroHome)) throw Error('cannot verify local daemon home')
    return reported
  }
  const safeDirectory = async (home, id) => {
    if (!/^agt-[a-zA-Z0-9-]+$/.test(id)) throw Error('invalid Ducoro Bot id')
    const agents = join(home, 'agents')
    const bot = join(agents, id)
    for (const path of [agents, bot]) {
      const info = await lstat(path)
      if (info.isSymbolicLink() || !info.isDirectory()) throw Error('subagent parent must be a local ordinary directory')
    }
    const dir = join(bot, 'subagents')
    await mkdir(dir, { recursive: true })
    if ((await lstat(dir)).isSymbolicLink()) throw Error('subagent directory must not be a symlink')
    return dir
  }
  return async library => {
    if (opts.dryRun) return { fullLibrarySupport: false, dryRun: true }
    const state = getState()
    state.total ??= { profiles: {}, files: {} }
    const owned = state.total
    const report = {
      version: 1, updatedAt: new Date().toISOString(),
      features: {
        instructions: { status: 'idle' }, mcp: { status: 'handled-by-basic-engine' },
        skills: { status: 'handled-by-basic-engine' },
        subagents: { status: 'conditional', reason: 'Magpie does not expose a Ducoro subagent assignment chip; use subagentNames explicitly. Local daemon required; no model or skill/MCP restrictions.' },
        hooks: { status: 'unsupported', reason: 'Magpie plugin library and Ducoro CLI expose no generic runtime hook adapter.' },
        rtk: { status: 'unsupported', reason: 'Magpie RTK installers do not support plugin Agents; Ducoro exposes no shell interception adapter.' },
      }, errors: [], targets: [],
      sessionReload: 'Configuration changes do not prove running sessions have reloaded. No automatic session restart.',
    }
    try {
      const instructionOn = opts.syncInstructions && assigned(library.instructions)
      const selectedSubagents = (library.subagents ?? []).filter(x => enabled(x) &&
        (assigned(x) || (Array.isArray(opts.subagentNames) && opts.subagentNames.includes(x.name))))
      if (library.subagents != null && !Array.isArray(library.subagents)) throw Error('unrecognized subagents schema')
      const active = instructionOn || (opts.syncSubagents && selectedSubagents.length)
      const hasOwned = Object.keys(owned.profiles).length || Object.keys(owned.files).length
      if (active || hasOwned) {
        const all = list(await call(['agent', 'list']))
        if (!Array.isArray(all)) throw Error('unrecognized Ducoro Bot list response')
        const targets = all.filter(a => Array.isArray(opts.targetAgents) && opts.targetAgents.length
          ? opts.targetAgents.includes(a.id)
          : a.modelPreference?.connectionSlug === opts.connectionSlug)
        const ids = new Set(targets.map(a => a.id))
        report.targets = [...ids]
        if (active && !targets.length) report.errors.push({ resource: 'targets', message: 'No target Bots: bind a Bot to the Magpie connection or configure targetAgents.' })
        let instructionText = ''
        let instructionReady = true
        if (instructionOn) {
          try {
            // The Agent export is the official aggregate of named instruction
            // sets, external files and Magpie's marker ownership rules.
            const exported = await readOptional(paths.instructions)
            if (exported === null) throw Error('Magpie instruction export missing; run magpie library sync')
            const match = /<!-- magpie:begin[^\n]*-->\r?\n([\s\S]*?)<!-- magpie:end -->/.exec(exported)
            if (!match) throw Error('Magpie instruction export incomplete; retaining current instructions')
            instructionText = match[1]
          } catch (e) { instructionReady = false; problem(report, 'instructions', e.message) }
        }
        for (const id of new Set([...ids, ...Object.keys(owned.profiles)])) {
          try {
            if (instructionOn && ids.has(id) && !instructionReady) continue
            const bot = await call(['agent', 'get', id])
            const record = bot?.agent ?? bot
            if (record.id !== id || typeof record.profile !== 'string') throw Error('unrecognized Ducoro Bot record')
            const entry = owned.profiles[id]
            const previous = entry?.pending && record.profile.includes(entry.pending) ? entry.pending : entry?.block
            const next = mergeInstructions(record.profile, previous, instructionOn && ids.has(id) ? instructionText : '')
            if (record.profile !== next.profile) {
              // Save the intended block before the RPC. After a lost response,
              // either the old or new exact block is recognizable on retry.
              owned.profiles[id] = { block: previous || next.block, pending: next.block }
              await save()
              await call(['agent', 'update', id, '--patch', JSON.stringify({ profile: next.profile })])
            }
            if (next.block) owned.profiles[id] = { block: next.block }
            else delete owned.profiles[id]
            await save()
          } catch (e) { problem(report, `instructions:${id}`, e.message) }
        }
        report.features.instructions.status = instructionOn ? (instructionReady ? 'configured' : 'pending') : 'off'
        if ((opts.syncSubagents && selectedSubagents.length) || Object.keys(owned.files).length) {
          const home = await localHome()
          const wanted = new Map()
          for (const bot of targets) for (const item of opts.syncSubagents ? selectedSubagents : []) {
            const key = `${bot.id}/${item.name}`
            // Reserve selected-but-invalid definitions: retain the previous
            // version, and report the failure instead of treating it as removal.
            wanted.set(key, null)
            try { wanted.set(key, renderSubagent(item)) } catch (e) { problem(report, `subagent:${key}`, e.message) }
          }
          for (const [key, old] of Object.entries(owned.files)) {
            if (wanted.has(key)) continue
            try {
              const dir = await safeDirectory(home, old.botId)
              if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(old.name)) throw Error('invalid owned subagent name')
              const path = join(dir, `${old.name}.md`)
              const current = await readOptional(path)
              if (current !== null && ![old.hash, old.pending].includes(hash(current))) throw Error('subagent edited by user; retained')
              if (current !== null && !(await lstat(path)).isSymbolicLink()) await rm(path)
              else if (current !== null) throw Error('subagent became a symlink; retained')
              delete owned.files[key]
              await save()
            } catch (e) { problem(report, `subagent:${key}`, e.message) }
          }
          for (const [key, content] of wanted) {
            if (content === null) continue
            try {
              const [botId, name] = key.split('/')
              const dir = await safeDirectory(home, botId)
              const path = join(dir, `${name}.md`)
              const current = await readOptional(path)
              const old = owned.files[key]
              if (current !== null && ((await lstat(path)).isSymbolicLink() || !old || ![old.hash, old.pending].includes(hash(current)))) throw Error('subagent file belongs to user or was edited; retained')
              if (current !== content) {
                owned.files[key] = { botId, name, hash: old?.hash ?? hash(content), pending: hash(content) }
                await save()
                const temp = `${path}.${process.pid}.tmp`
                await writeFile(temp, content, { mode: 0o600 })
                await rename(temp, path)
              }
              owned.files[key] = { botId, name, hash: hash(content) }
              await save()
              const readback = await call(['agent', 'subagents', botId])
              if (readback?.warnings?.length) throw Error('Ducoro reports subagent projection warnings; inspect agent subagents')
            } catch (e) { problem(report, `subagent:${key}`, e.message) }
          }
          report.features.subagents.status = 'configured-with-limitations'
        }
      }
    } catch (e) { problem(report, 'total', e.message) }
    if (report.errors.some(e => e.resource.startsWith('instructions') || e.resource === 'targets')) report.features.instructions.status = 'pending'
    if (report.errors.some(e => e.resource.startsWith('subagent') || e.resource === 'total')) report.features.subagents.status = 'pending'
    report.ok = report.errors.length === 0
    // Full support is deliberately false until both products expose adapters.
    report.fullLibrarySupport = false
    if (!opts.dryRun) {
      await mkdir(dirname(paths.report), { recursive: true })
      const temp = `${paths.report}.${process.pid}.tmp`
      await writeFile(temp, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
      await rename(temp, paths.report)
    }
    for (const error of report.errors) log(`Total ${error.resource}: ${error.message}`)
    return report
  }
}
