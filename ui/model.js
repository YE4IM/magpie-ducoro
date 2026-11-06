// Shared pure helpers; classic scripts work in Magpie's opaque-origin sandbox.
(() => {
// Browser-only data helpers. Keep this folder self-contained: Magpie serves
// only files below page.file's directory to its isolated plugin page.
const SWITCHES = [
  ['syncConnection', '网关连接', '同步连接地址、密钥与模型目录'],
  ['syncAgentModels', 'Bot 模型跟随', '更新绑定 Bot，修复失效模型 ID'],
  ['syncMcp', '连接器', '同步资源库连接器与 Bot 账户工具配备'],
  ['syncSkills', '技能', '同步完整技能包与附属文件'],
  ['syncInstructions', '指令', '同步到目标 Bot 的指令区块'],
  ['syncSubagents', '子代理', '同步显式选择的角色定义'],
]
const DEFAULT_OPTIONS = {
  connectionSlug: 'magpie-ducoro', syncConnection: true, syncAgentModels: true,
  syncMcp: true, syncSkills: true, syncInstructions: true, syncSubagents: true,
  prune: true, onDisconnect: 'keep', targetAgents: [], subagentNames: [],
  modelScope: 'global', botModels: {}, accountConnectors: {},
  mcpScope: 'global', skillsScope: 'global', resourceAssignments: {},
  modelCapabilityRefs: {}, officialProviders: [
    'zai', 'zai-coding-cn', 'kimi-coding', 'moonshotai', 'moonshotai-cn',
    'anthropic', 'openai', 'google', 'deepseek', 'xai', 'minimax', 'minimax-cn', 'alibaba', 'alibaba-cn',
  ],
}
const EDITABLE_KEYS = Object.keys(DEFAULT_OPTIONS)
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const botId = value => typeof value === 'string' && /^agt-[a-zA-Z0-9-]+$/.test(value)
const splitList = value => [...new Set(String(value).split(/[,\r\n]/).map(s => s.trim()).filter(Boolean))]
const coordinate = value => typeof value === 'string' && /^[^\s,=]+\/[^\s,=]+$/.test(value)

function optionsForDisplay(raw = {}) {
  if (!isRecord(raw)) throw Error('插件选项格式无效，请先在 Magpie 的 JSON 选项中修复。')
  const result = { ...structuredClone(DEFAULT_OPTIONS), ...structuredClone(raw) }
  validateFields(result)
  return result
}

function validateFields(value) {
  for (const [key] of SWITCHES) if (typeof value[key] !== 'boolean') throw Error(`${key} 必须是开关值。`)
  if (typeof value.connectionSlug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(value.connectionSlug)) throw Error('连接标识仅支持小写字母、数字和短横线。')
  if (!['keep', 'remove'].includes(value.onDisconnect)) throw Error('请选择有效的断开连接处理方式。')
  if (!['global', 'agents'].includes(value.modelScope) || !isRecord(value.botModels) || !isRecord(value.accountConnectors)) throw Error('模型或连接器分配格式无效。')
  if (!['global', 'agents'].includes(value.mcpScope)) throw Error('请选择有效的 连接器 作用域。')
  if (!['global', 'agents'].includes(value.skillsScope) && !botId(value.skillsScope)) throw Error('技能作用域需要一个有效的 Bot ID。')
  for (const key of ['targetAgents', 'subagentNames', 'officialProviders']) {
    if (!Array.isArray(value[key]) || !value[key].every(x => typeof x === 'string' && x.trim() && !/[\r\n,]/.test(x))) throw Error(`${key} 需要名称列表。`)
    if (value[key].length > 256) throw Error('单个列表最多支持 256 项。')
  }
  if (!value.targetAgents.every(botId)) throw Error('目标 Bot ID 格式应为 agt-…，请从 Ducoro 复制。')
  if (!value.subagentNames.every(s => /^[a-z0-9][a-z0-9-]{1,49}$/.test(s) && !['default', 'main'].includes(s))) throw Error('子代理名称需要 2–50 个小写字母、数字或短横线，不能使用 default 或 main。')
  if (!value.officialProviders.every(s => /^[a-z0-9][a-z0-9._-]*$/.test(s))) throw Error('官方供应商应使用目录 ID，例如 zai 或 kimi-coding。')
  if (!isRecord(value.modelCapabilityRefs)) throw Error('模型能力参考需要映射对象。')
  for (const [route, ref] of Object.entries(value.modelCapabilityRefs)) {
    if (!coordinate(route) || (ref !== null && !coordinate(ref))) throw Error('模型映射请填写完整的 供应商/模型 或 group/组名；禁用映射时勾选「禁用自动映射」。')
  }
  if (!isRecord(value.resourceAssignments)) throw Error('Bot 资源分配需要对象。')
  for (const [id, assignment] of Object.entries(value.resourceAssignments)) {
    if (!botId(id)) throw Error('资源分配中的 Bot ID 格式应为 agt-…。')
    if (!isRecord(assignment) || Object.keys(assignment).some(k => !['mcp', 'skills'].includes(k))) throw Error('Bot 资源分配仅支持 连接器 和技能。')
    for (const key of ['mcp', 'skills']) if (Object.hasOwn(assignment, key)) {
      if (!Array.isArray(assignment[key]) || assignment[key].length > 256 || !assignment[key].every(s => typeof s === 'string' && s.trim() && !/[,\r\n]/.test(s))) throw Error('自定义资源请填写资源库名称列表，留空代表不分配。')
    }
  }
  return value
}

const stable = value => JSON.stringify(value, (_key, item) => isRecord(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)

// Merge only fields the user changed. A parallel editor may add options or
// change other fields; neither should be overwritten by this page's save.
function mergeEditedOptions(rawCurrent, baseline, edited, keys = EDITABLE_KEYS) {
  const current = optionsForDisplay(rawCurrent)
  const changed = keys.filter(key => stable(edited[key]) !== stable(baseline[key]))
  for (const key of changed) if (stable(current[key]) !== stable(baseline[key]) && stable(current[key]) !== stable(edited[key])) {
    throw Error('这些设置已在其他页面更新。请点击「重新读取」后再修改，避免覆盖新配置。')
  }
  return { options: { ...rawCurrent, ...Object.fromEntries(changed.map(key => [key, edited[key]])) }, changed }
}

const FEATURE_NAMES = { connection: '网关连接', models: '模型与能力', mcp: '连接器', skills: '技能', instructions: '指令', subagents: '子代理' }
const STATUS_NAMES = { configured: '配置已同步', pending: '等待处理', disabled: '已关闭', skipped: '已跳过', unknown: '尚未确认' }
const safeText = (value, fallback = '') => typeof value === 'string' ? value.slice(0, 2000) : fallback
const stringList = value => Array.isArray(value) ? value.filter(x => typeof x === 'string').slice(0, 256).map(x => x.slice(0, 200)) : []

function parseDiagnosticReport(raw) {
  if (!isRecord(raw) || raw.schemaVersion !== 1 || !isRecord(raw.features) || !Object.keys(FEATURE_NAMES).some(key => Object.hasOwn(raw.features, key))) throw Error('实时诊断报告格式无法识别，请更新插件并重新打开页面。')
  const issues = Array.isArray(raw.issues) ? raw.issues : []
  const cleanIssue = issue => ({ feature: safeText(issue.feature), code: safeText(issue.code), message: safeText(issue.message, '需要进一步检查'), nextAction: safeText(issue.nextAction), targets: stringList(issue.targets) })
  return {
    updatedAt: typeof raw.updatedAt === 'string' && Number.isFinite(Date.parse(raw.updatedAt)) ? raw.updatedAt : null,
    lastSyncedAt: typeof raw.lastSyncedAt === 'string' && Number.isFinite(Date.parse(raw.lastSyncedAt)) ? raw.lastSyncedAt : null,
    stale: raw.stale === true, syncing: raw.syncing === true,
    pluginVersion: safeText(raw.pluginVersion), status: Object.hasOwn(STATUS_NAMES, raw.status) ? raw.status : 'unknown',
    targets: stringList(raw.targets),
    features: Object.fromEntries(Object.entries(FEATURE_NAMES).map(([key]) => {
      const item = isRecord(raw.features[key]) ? raw.features[key] : {}
      return [key, { status: Object.hasOwn(STATUS_NAMES, item.status) ? item.status : 'unknown', skipReason: item.skipReason === 'not-selected' ? 'not-selected' : null, probeStatus: ['unknown', 'passed', 'failed'].includes(item.probeStatus) ? item.probeStatus : 'unknown', targets: stringList(item.targets), count: Number.isSafeInteger(item.count) && item.count >= 0 ? item.count : null }]
    })),
    issues: issues.filter(isRecord).slice(0, 256).map(cleanIssue),
  }
}

globalThis.DucoroUI = Object.freeze({ SWITCHES, DEFAULT_OPTIONS, EDITABLE_KEYS, FEATURE_NAMES, STATUS_NAMES, splitList, optionsForDisplay, validateFields, mergeEditedOptions, parseDiagnosticReport })
})()
