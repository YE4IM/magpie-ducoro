// Account connector assignments are Bot-local, independent of global library
// definitions. Record previous policies so clearing a plugin assignment restores
// user equipment, and stop on edits made outside this plugin.
import { list, policyRows, toolRows } from './page-service.mjs'
const comparable = policy => policy == null ? null : {allow:[...(policy.allow ?? [])].sort(),deny:[...(policy.deny ?? [])].sort()}
const same = (a,b) => JSON.stringify(comparable(a)) === JSON.stringify(comparable(b))

export async function syncAccountConnectors({options,state,run,save}) {
  const desired = options.syncMcp ? options.accountConnectors ?? {} : {}
  const owned = state.accountConnectors ??= {}
  const ids = [...new Set([...Object.keys(desired),...Object.keys(owned)])]
  if (!ids.length || options.dryRun === true || options.dryRun === 'true') return
  const call = async args => {
    const response = await run(args,{timeoutMs:20000})
    if (!response.ok) throw Error('账户连接器操作未完成；现有分配已保留')
    return response.json
  }
  const bots = list(await call(['agent','list']),['agents','bots'])
  const failures = []
  for (const id of ids) {
    try {
      const bot = bots.find(bot => bot.id === id)
      if (!bot) { delete owned[id]; await save(); continue }
      if (!['pi-agent','claude-code','codex'].includes(bot.modelPreference?.runtime)) throw Error('Bot 不支持账户连接器')
      const current = new Map(policyRows(await call(['agent','connector','list',id])).map(x => [x.slug,x]))
      const history = owned[id] ??= {}
      for (const slug of new Set([...Object.keys(desired[id] ?? {}),...Object.keys(history)])) {
        const want = desired[id]?.[slug] ?? null
        const record = history[slug]
        const actual = current.get(slug) ?? null
        if (record && !same(actual,record.applied) && !(Object.hasOwn(record,'pending') && same(actual,record.pending))) throw Error('连接器配备已由其他页面修改')
        const next = want ?? record?.previous ?? null
        if (want) {
          const status = await call(['mcp','catalog','status',slug])
          if ((status.status ?? status.connection?.status) !== 'connected') throw Error('账户连接器尚未连接')
          const tools = new Set(toolRows(await call(['mcp','catalog','tools',slug])).map(x => x.slug))
          if (!want.allow.length || [...want.allow,...(want.deny ?? [])].some(x => !tools.has(x))) throw Error('工具权限无效或已变化')
        }
        if (!same(actual,next)) {
          // Save the intended transition before the mutation. A lost CLI
          // response is reconciled against pending on the next round.
          history[slug] = {...(record ?? {previous:comparable(actual),applied:comparable(actual)}),pending:comparable(next)}
          await save()
          if (next) {
            await call(['agent','connector',actual ? 'update' : 'add',id,slug,'--allow',next.allow.join(','),...(next.deny?.length ? ['--deny',next.deny.join(',')] : [])])
          } else if (actual) await call(['agent','connector','rm',id,slug])
          const verified = policyRows(await call(['agent','connector','list',id])).find(x => x.slug === slug) ?? null
          if (!same(verified,next)) throw Error('连接器保存结果尚未核实')
        }
        if (want) history[slug] = {previous:record ? record.previous : comparable(actual),applied:comparable(want)}
        else delete history[slug]
        await save()
      }
      if (!Object.keys(history).length) delete owned[id]
    } catch { failures.push(id) }
  }
  if (failures.length) throw Error(`${failures.length} 个 Bot 的账户连接器分配待处理`)
}
