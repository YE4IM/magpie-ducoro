// Public diagnostics contain configuration facts only. Never copy CLI output,
// raw exception messages, resource contents, credentials or endpoint URLs here.
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

export const FEATURES = ['connection', 'models', 'mcp', 'skills', 'instructions', 'subagents']
const STATUSES = new Set(['configured', 'pending', 'disabled', 'skipped', 'unknown'])
const SKIP_REASONS = new Set(['not-selected', 'superseded', 'disconnected', 'preview'])
const REVOCATION_ERRORS = new Set(['mcp-sync', 'skill-cleanup', 'skill-restore', 'instruction-pending', 'subagent-pending', 'total-sync'])
const ids = value => [...new Set((Array.isArray(value) ? value : []).filter(x => typeof x === 'string' && /^agt-[A-Za-z0-9-]{1,120}$/.test(x)))].sort()
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : undefined
const object = value => value && typeof value === 'object' && !Array.isArray(value)
const timestamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
const validRoundId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
const OPTIONS = { connection: 'syncConnection', models: 'syncAgentModels', mcp: 'syncMcp', skills: 'syncSkills', instructions: 'syncInstructions', subagents: 'syncSubagents' }

const REASONS = {
  'gateway-sync': ['connection', '连接同步未完成。', '检查 Ducoro 是否可用及 Magpie 连接设置，然后等待重试。'],
  'gateway-unreadable': ['connection', 'Magpie 连接导出暂时缺失或不完整。', '在 Magpie 中确认 Ducoro 已连接，并重新同步。'],
  'gateway-model-catalog': ['connection', '所选模型不在完整的导出列表中。', '刷新 Magpie 模型列表并确认默认模型仍可用。'],
  'bot-model-sync': ['models', '部分 Bot 的模型设置未通过校验。', '检查目标 Bot 与连接的模型能力设置，完成后等待重试。'],
  'model-metadata': ['models', '模型或路由组元数据暂时不可读。', '检查 Magpie 供应商及路由组配置，恢复后会自动重试。'],
  'mcp-sync': ['mcp', '部分 MCP 配置未完成同步。', '检查 MCP 定义、工具限制和 Ducoro 可用性，然后等待重试。'],
  'mcp-conflict': ['mcp', 'MCP 目标已有用户配置，插件保留原内容。', '检查同名 MCP，保留本地配置或调整目标与名称后重新同步。'],
  'mcp-probe': ['mcp', 'MCP 可用性探测未通过。', '检查该 MCP 的依赖、授权及服务状态；配置保存不代表工具可用。'],
  'skill-list': ['skills', '无法读取目标作用域的技能列表。', '检查 Ducoro 和目标 Bot 是否可用，然后等待重试。'],
  'skill-source': ['skills', '部分选中技能的源文件不可读或无效。', '检查 Magpie 资源库中的技能目录与 SKILL.md。'],
  'skill-cleanup': ['skills', '旧技能的撤销尚未完成。', '检查目标技能作用域及权限，然后等待重试。'],
  'skill-backup': ['skills', '技能替换前的备份未完成。', '检查 Ducoro 技能目录状态；旧版本会保留并重试。'],
  'skill-restore': ['skills', '技能替换或恢复尚未完成。', '检查目标技能及备份状态；不要手动删除插件备份。'],
  'skill-import': ['skills', '技能导入未完成。', '检查技能格式及 Ducoro 可用性，然后等待重试。'],
  'skill-stage': ['skills', '技能暂存或内容校验未完成。', '确认技能源文件稳定且完整，然后等待重试。'],
  'skill-sync': ['skills', '技能同步未完成。', '检查资源库、技能目录和 Ducoro 可用性，然后等待重试。'],
  'skill-conflict': ['skills', '技能目标已有用户配置，插件保留原内容。', '检查同名技能，保留本地配置或调整目标与名称后重新同步。'],
  'total-sync': [['instructions', 'subagents'], '指令或子代理同步未完成。', '检查目标 Bot、指令导出和子代理定义。'],
  'total-resource': [['instructions', 'subagents'], '指令或子代理需要再次对账。', '检查对应资源和目标 Bot；不支持的字段需要调整。'],
  'library-unreadable': [['mcp', 'skills', 'instructions', 'subagents'], 'Magpie 资源选择暂时不可读。', '检查 Magpie 资源库配置并重新同步，现有配置会保留。'],
  'resource-targets': [['mcp', 'skills'], '无法确认按 Bot 分配资源的目标。', '检查目标 Bot ID、连接绑定及 Ducoro 可用性。'],
  'resource-options': [['mcp', 'skills'], '按 Bot 分配资源的选项无效。', '检查资源作用域和 resourceAssignments 中的名称列表。'],
  'resource-selection-unavailable': [['mcp', 'skills'], '部分指定资源未启用、未分配给 Ducoro 或名称不存在。', '检查 Magpie 资源库中的精确名称、启用状态及 Ducoro 分配。'],
  'options-invalid': [FEATURES, '插件选项未通过校验，本轮不会写入配置。', '在插件配置页面修正标出的选项，然后重新保存。'],
  'ownership-conflict': [FEATURES, '目标配置由用户创建或已被手动修改，插件保留原内容。', '检查冲突项，确认保留本地配置或调整插件的目标与名称后重新同步。'],
  'sync-failed': [FEATURES, '本轮同步未完整结束。', '查看插件日志的详细原因，修复后重新同步。'],
  'host-lock': [FEATURES, '另一个插件宿主正在同步。', '等待正在运行的同步完成。'],
  'watch-error': [FEATURES, '文件监听暂时不可用。', '等待定时对账；持续出现时重新启用插件。'],
  'watch-missing': [FEATURES, '部分源文件尚不存在。', '确认 Magpie 已导出配置与所选资源。'],
  'watch-refresh': [FEATURES, '文件监听刷新未完成。', '等待自动重试；持续出现时重新启用插件。'],
  'mapping-review': ['models', '部分模型能力参考需要人工确认。', '查看 model-capabilities.json，按实际能力指定或禁用参考映射。'],
  'mapping-unapplied': ['models', '模型能力参考更新尚未核实。', '检查连接同步是否成功，然后等待重试。'],
  'instruction-pending': ['instructions', '指令尚未完成配置。', '检查 Magpie 指令导出及目标 Bot 的 Profile。'],
  'subagent-pending': ['subagents', '部分子代理尚未完成配置。', '检查显式选择、定义字段及本地 Ducoro 守护进程。'],
  'targets-empty': [['instructions', 'subagents'], '没有可用的目标 Bot。', '将 Bot 绑定到 Magpie 连接，或填写目标 Bot ID。'],
  'report-missing': [FEATURES, '尚无统一同步报告。', '启动 0.3.2 插件并等待完成一次同步。'],
  'report-invalid': [FEATURES, '同步报告不可读或格式无效。', '启动插件重新同步以生成报告。'],
  'diagnostics-issue': [FEATURES, '同步需要进一步检查。', '查看插件日志并重新同步。'],
}

function issueFor(code, feature, targets = []) {
  const safeCode = Object.hasOwn(REASONS, code) ? code : 'diagnostics-issue'
  const [, message, nextAction] = REASONS[safeCode]
  return { feature, code: safeCode, message, nextAction, targets: ids(targets) }
}

function affected(code) {
  const value = REASONS[code]?.[0] ?? FEATURES
  return Array.isArray(value) ? value : [value]
}

function safeFeature(value = {}) {
  if (!object(value)) value = {}
  const safe = { status: STATUSES.has(value.status) ? value.status : 'unknown', runtimeLoaded: 'unknown', targets: ids(value.targets), issues: [] }
  if (SKIP_REASONS.has(value.skipReason)) safe.skipReason = value.skipReason
  if (['passed', 'failed'].includes(value.probeStatus)) safe.probeStatus = value.probeStatus
  if (count(value.count) !== undefined) safe.count = value.count
  return safe
}

function addIssue(report, code, features = affected(code), targets = [], { pending = true } = {}) {
  const safeTargets = ids(targets)
  const safeFeatures = (Array.isArray(features) ? features : [features]).filter(name => FEATURES.includes(name))
  for (const feature of safeFeatures) {
    const row = report.features[feature]
    if (row.status === 'disabled' && !REVOCATION_ERRORS.has(code)) continue
    if (row.issues.some(issue => issue.code === code)) continue
    const issue = issueFor(code, feature, safeTargets.length ? safeTargets : row.targets)
    row.issues.push(issue)
    report.issues.push(issue)
    if (pending) row.status = 'pending'
  }
}

function summarize(report) {
  const rows = Object.values(report.features)
  report.status = rows.some(row => row.status === 'pending') ? 'pending'
    : rows.some(row => row.status === 'unknown' || row.status === 'skipped' && row.skipReason !== 'not-selected') ? 'unknown'
      : rows.every(row => row.status === 'disabled') ? 'disabled' : 'configured'
  report.targets = ids(rows.flatMap(row => row.targets))
  return report
}

export function buildDiagnostics({ options = {}, reason, stages = {}, retries = [], state = {}, total, capabilities, startedAt, roundId, now = new Date() } = {}) {
  const report = { schemaVersion: 1, pluginVersion: '0.3.2', updatedAt: new Date(now).toISOString(), reason: safeReason(reason), status: 'unknown', runtimeLoaded: 'unknown', features: {}, issues: [], targets: [] }
  if (validRoundId(roundId)) report.roundId = roundId
  for (const feature of FEATURES) {
    report.features[feature] = safeFeature(stages[feature])
    if (options[OPTIONS[feature]] === false || feature === 'models' && options.syncConnection === false) report.features[feature].status = 'disabled'
    if (stages[feature]?.code) addIssue(report, stages[feature].code, [feature], stages[feature]?.targets)
  }
  const mcp = Object.values(object(state.mcp) ? state.mcp : {})
  const skills = Object.values(object(state.skills) ? state.skills : {})
  if (report.features.mcp.count === undefined) report.features.mcp.count = mcp.length
  if (report.features.skills.count === undefined) report.features.skills.count = skills.length
  report.features.mcp.targets = ids([...report.features.mcp.targets, ...mcp.map(row => row?.scope)])
  report.features.skills.targets = ids([...report.features.skills.targets, ...skills.map(row => row?.scope)])

  // total-status is written every sync. Do not attribute an earlier report to
  // this run after a library read failure or an interrupted total-sync stage.
  const totalTime = timestamp(total?.updatedAt)
  const currentTotal = object(total) && totalTime && (!startedAt || Date.parse(totalTime) >= Date.parse(startedAt) - 1000)
  if (currentTotal) {
    for (const feature of ['instructions', 'subagents']) {
      const row = report.features[feature]
      if (row.status === 'disabled') continue
      const status = total.features?.[feature]?.status
      row.targets = ids(total.targets)
      if (status === 'configured' || status === 'configured-with-limitations') row.status = 'configured'
      else if (status === 'off' || status === 'idle' || status === 'conditional') {
        row.status = 'skipped'
        row.skipReason = 'not-selected'
        row.count = 0
      }
      else if (status === 'pending') row.status = 'pending'
    }
    for (const error of Array.isArray(total.errors) ? total.errors : []) {
      const kind = typeof error?.resource === 'string' ? error.resource.split(':')[0] : ''
      if (kind === 'instructions') addIssue(report, 'instruction-pending', ['instructions'])
      else if (kind === 'subagent') addIssue(report, 'subagent-pending', ['subagents'])
      else if (kind === 'targets') addIssue(report, 'targets-empty')
      else addIssue(report, 'total-sync')
    }
  }
  for (const item of retries) {
    if (typeof item === 'string') addIssue(report, item)
    else if (object(item)) addIssue(report, item.code, item.features ?? affected(item.code), item.targets)
  }
  if (state.modelMigration && report.features.models.status !== 'disabled') addIssue(report, 'bot-model-sync')
  if (object(capabilities) && Array.isArray(capabilities.entries) && report.features.models.status !== 'disabled') {
    if (capabilities.applied === false) addIssue(report, 'mapping-unapplied')
    if (capabilities.entries.some(entry => entry?.status !== 'matched' || entry?.warnings?.length)) addIssue(report, 'mapping-review', ['models'], [], { pending: false })
  }
  if (options.dryRun === true || options.dryRun === 'true') {
    for (const row of Object.values(report.features)) if (row.status !== 'disabled') { row.status = 'skipped'; row.skipReason = 'preview' }
    report.reason = 'preview'
  }
  return summarize(report)
}

function safeReason(reason) {
  if (typeof reason !== 'string') return 'sync'
  if (['startup', 'interval', 'selftest', 'manual', 'preview', 'sync', 'retry', 'change'].includes(reason)) return reason
  return reason.startsWith('retry:') ? 'retry' : 'change'
}

// Rebuild imported reports from an allowlist. Additional or tampered fields
// never become part of a support export or the CLI's output.
export function sanitizeDiagnostics(input) {
  if (!object(input) || input.schemaVersion !== 1 || !object(input.features) || !timestamp(input.updatedAt)) return null
  const report = { schemaVersion: 1, pluginVersion: '0.3.2', updatedAt: timestamp(input.updatedAt), reason: safeReason(input.reason), status: 'unknown', runtimeLoaded: 'unknown', features: {}, issues: [], targets: [] }
  if (validRoundId(input.roundId)) report.roundId = input.roundId
  for (const feature of FEATURES) report.features[feature] = safeFeature(input.features[feature])
  for (const feature of FEATURES) {
    for (const issue of Array.isArray(input.features[feature]?.issues) ? input.features[feature].issues : []) {
      const code = typeof issue?.code === 'string' && Object.hasOwn(REASONS, issue.code) ? issue.code : 'diagnostics-issue'
      addIssue(report, code, [feature], issue.targets, { pending: input.features[feature]?.status === 'pending' })
    }
  }
  return summarize(report)
}

export function defaultStateDir(env = process.env) {
  return env.DUCORO_BRIDGE_STATE_DIR?.trim() || join(env.XDG_CONFIG_HOME?.trim() || join(homedir(), '.config'), 'magpie', 'ducoro-bridge')
}

async function readSmallJson(file) {
  try {
    if ((await stat(file)).size > 2 * 1024 * 1024) return { error: 'report-invalid' }
    return { value: JSON.parse(await readFile(file, 'utf8')) }
  } catch (error) { return { error: error.code === 'ENOENT' ? 'report-missing' : 'report-invalid' } }
}

export async function readDiagnostics({ stateDir = defaultStateDir(), now = new Date(), staleAfterMs = 300_000 } = {}) {
  const { value, error } = await readSmallJson(join(stateDir, 'sync-status.json'))
  let report = sanitizeDiagnostics(value)
  if (!report) {
    report = buildDiagnostics({ now })
    addIssue(report, error || 'report-invalid', FEATURES, [], { pending: false })
    report = summarize(report)
    report.updatedAt = null
  }
  const age = report.updatedAt ? new Date(now).getTime() - Date.parse(report.updatedAt) : null
  return { ...report, observedAt: new Date(now).toISOString(), stale: age === null || age > staleAfterMs || age < -60_000, ageMs: age === null ? null : Math.max(age, 0) }
}

export function createDiagnostics({ stateDir = defaultStateDir(), options = {}, now = () => new Date() } = {}) {
  let round = null
  const writeReport = async report => {
    const target = join(stateDir, 'sync-status.json')
    const temporary = `${target}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
    await rename(temporary, target)
  }
  return {
    begin(reason = 'sync') { round = { roundId: randomUUID(), reason, startedAt: now().toISOString(), stages: {}, retries: [] } },
    token() { return round?.roundId ?? null },
    isCurrent(token) { return validRoundId(token) && round?.roundId === token },
    stage(feature, status, details = {}) {
      if (!round || !FEATURES.includes(feature)) return
      round.stages[feature] = { ...safeFeature({ status, ...details }), ...(details.code ? { code: details.code } : {}) }
    },
    retry(reason, features, targets) {
      if (round) round.retries.push({ code: Object.hasOwn(REASONS, reason) ? reason : 'sync-failed', features, targets })
    },
    async write({ state, total, capabilities } = {}) {
      if (!round) return null
      const report = buildDiagnostics({ ...round, retries: [...round.retries], options, state, total, capabilities, now: now() })
      if (options.dryRun === true || options.dryRun === 'true') return report
      await mkdir(stateDir, { recursive: true })
      await writeReport(report)
      return report
    },
    // A probe runs outside the mutation lock. Fence its late result against
    // both another round in this host and reports written by another host.
    // Only the bounded report read/write occurs while holding the same lock.
    async probeResult(token, okay) {
      if (!validRoundId(token) || round?.roundId !== token || typeof okay !== 'boolean' || options.dryRun === true || options.dryRun === 'true') return false
      const lock = join(stateDir, 'sync.lock')
      let locked = false
      try {
        try { await mkdir(lock); locked = true } catch (error) { if (error.code === 'EEXIST' || error.code === 'ENOENT') return false; throw error }
        await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid }))
        const { value } = await readSmallJson(join(stateDir, 'sync-status.json'))
        const report = sanitizeDiagnostics(value)
        if (!report || report.roundId !== token) return false
        report.features.mcp.probeStatus = !okay || report.features.mcp.probeStatus === 'failed' ? 'failed' : 'passed'
        if (!okay) addIssue(report, 'mcp-probe', ['mcp'])
        if (round?.roundId !== token) return false
        await writeReport(summarize(report))
        return true
      } finally { if (locked) await rm(lock, { recursive: true, force: true }) }
    },
  }
}
