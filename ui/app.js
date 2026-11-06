;(async () => {
const { SWITCHES, DEFAULT_OPTIONS, EDITABLE_KEYS, FEATURE_NAMES, STATUS_NAMES, splitList, optionsForDisplay, validateFields, mergeEditedOptions, parseDiagnosticReport } = globalThis.DucoroUI

const $ = id => document.getElementById(id)
const panel = document.body.dataset.panel === 'true'
let baseline = null
let ready = false
let busy = false
const node = (tag, text, className) => {
  const el = document.createElement(tag)
  if (text !== undefined) el.textContent = text
  if (className) el.className = className
  return el
}
const message = (text, error = false, target = 'message') => {
  const el = $(target)
  if (!el) return
  el.textContent = text
  el.classList.toggle('error', error)
  el.hidden = !text
}

for (const [key, title, description] of SWITCHES) {
  const label = node('label', undefined, 'switch-card')
  const copy = node('span', undefined, 'switch-copy')
  copy.append(node('strong', title), node('small', description))
  const input = node('input')
  input.type = 'checkbox'
  input.id = key
  input.setAttribute('role', 'switch')
  input.setAttribute('aria-label', title)
  input.disabled = true
  label.append(copy, input)
  $('switches').append(label)
}

function textField(title, value, placeholder, className) {
  const label = node('label', title)
  const input = node('input')
  input.value = value
  input.placeholder = placeholder
  input.spellcheck = false
  if (className) input.className = className
  label.append(input)
  return { label, input }
}

function addReference(route = '', reference = '') {
  const row = node('div', undefined, 'reference-row')
  const routeField = textField('发送的模型 / 路由组', route, 'group/glm-5.3-flash', 'ref-route')
  const refField = textField('官方目录参考', reference ?? '', 'zai/glm-5.3-flash', 'ref-value')
  const remove = node('button', '移除', 'remove-row')
  remove.type = 'button'
  remove.setAttribute('aria-label', '移除模型映射')
  const disabled = node('label', undefined, 'disable-ref')
  const check = node('input')
  check.type = 'checkbox'
  check.className = 'ref-disabled'
  check.checked = reference === null
  refField.input.disabled = check.checked
  check.addEventListener('change', () => { refField.input.disabled = check.checked })
  disabled.append(check, node('span', '禁用自动映射'))
  remove.addEventListener('click', () => { row.remove(); updateEmptyRows(); dirty() })
  row.append(routeField.label, refField.label, remove, disabled)
  $('references').append(row)
  updateEmptyRows()
}

function updateEmptyRows() {
  if (panel) return
  $('reference-empty').hidden = $('references').children.length > 0
}

function setTab(name) {
  if (panel) return
  for (const el of document.querySelectorAll('[data-tab]')) {
    const active = el.dataset.tab === name
    el.classList.toggle('active', active)
    el.setAttribute('aria-pressed', String(active))
  }
  for (const el of document.querySelectorAll('.tab-content')) el.hidden = el.id !== name
  $('save-bar').hidden = name === 'diagnostics'
}

function populate(options) {
  for (const [key] of SWITCHES) $(key).checked = options[key]
  if (!panel) {
    $('connectionSlug').value = options.connectionSlug
    $('onDisconnect').value = options.onDisconnect
    $('subagentNames').value = options.subagentNames.join('\n')
    $('officialProviders').value = options.officialProviders.join('\n')
    for (const key of ['modelScope','mcpScope','skillsScope']) $(key).value = options[key]
    DucoroResources.set(options)
    $('references').replaceChildren()
    for (const [route, ref] of Object.entries(options.modelCapabilityRefs)) addReference(route, ref)
    updateEmptyRows()
  }
  $('connection-state').textContent = `连接标识：${options.connectionSlug} · 设置已读取，同步结果请查看同步诊断`
}

function collect() {
  const options = structuredClone(baseline ?? DEFAULT_OPTIONS)
  for (const [key] of SWITCHES) options[key] = $(key).checked
  if (panel) return options
  options.connectionSlug = $('connectionSlug').value.trim()
  options.onDisconnect = $('onDisconnect').value
  options.subagentNames = splitList($('subagentNames').value)
  options.officialProviders = splitList($('officialProviders').value)
  for (const key of ['modelScope','mcpScope','skillsScope']) options[key] = $(key).value
  options.modelCapabilityRefs = {}
  for (const row of $('references').children) {
    const route = row.querySelector('.ref-route').value.trim()
    const ref = row.querySelector('.ref-disabled').checked ? null : row.querySelector('.ref-value').value.trim()
    if (Object.hasOwn(options.modelCapabilityRefs, route)) throw Error(`模型 ${route || '（空名称）'} 重复，请仅保留一条映射。`)
    Object.defineProperty(options.modelCapabilityRefs, route, { value: ref, enumerable: true, configurable: true, writable: true })
  }
  Object.assign(options, DucoroResources.collect())
  return options
}

function dirty() {
  if (!ready || busy) return
  let changed = true
  try {
    const edited = collect()
    changed = (panel ? SWITCHES.map(([key]) => key) : EDITABLE_KEYS).some(key => JSON.stringify(edited[key]) !== JSON.stringify(baseline[key]))
  } catch { /* Duplicate/incomplete rows remain editable and are validated on save. */ }
  $('dirty-state').textContent = changed ? '有未保存的修改' : '设置与已读取配置一致'
  $('save').disabled = !changed
}

function setBusy(value) {
  busy = value
  document.body.dataset.busy = String(value)
  for (const el of document.querySelectorAll('input:not([type="file"]),textarea,select,button:not([data-tab])')) el.disabled = value || !ready
  if (!value && ready) {
    for (const row of document.querySelectorAll('.reference-row')) row.querySelector('.ref-value').disabled = row.querySelector('.ref-disabled').checked
    for (const el of document.querySelectorAll('[data-locked="true"]')) el.disabled = true
    dirty()
  }
}

async function load() {
  setBusy(true)
  try {
    const raw = await globalThis.magpie.options.get()
    baseline = optionsForDisplay(raw ?? {})
    populate(baseline)
    ready = true
    message('')
    if (!panel) { await DucoroResources.refresh(); await refreshReport() }
  } catch (error) {
    message(`无法读取设置：${error.message}`, true)
    $('connection-state').textContent = '配置尚未读取，未执行任何修改'
    $('dirty-state').textContent = '读取失败'
  } finally {
    setBusy(false)
    $('reload').disabled = false
  }
}

async function save() {
  try {
    const edited = validateFields(collect())
    setBusy(true)
    const current = await globalThis.magpie.options.get() ?? {}
    const { options, changed } = mergeEditedOptions(current, baseline, edited, panel ? SWITCHES.map(([key]) => key) : EDITABLE_KEYS)
    if (!changed.length) { message('没有需要保存的修改。'); return }
    if (!panel) await ducoroApi('validate',options)
    const saved = await globalThis.magpie.options.set(options)
    baseline = optionsForDisplay(saved ?? options)
    populate(baseline)
    message('设置已保存，正在同步。稍后刷新报告可查看结果。')
    if (!panel) setTimeout(async () => { await DucoroResources.refresh(); await refreshReport() }, 3000)
  } catch (error) {
    message(error.message || '保存失败，请重试。', true)
  } finally { setBusy(false) }
}

function showReport(report) {
  $('report-empty').hidden = true
  $('report-view').hidden = false
  const date = report.updatedAt ? new Date(report.updatedAt).toLocaleString() : '报告未提供时间'
  const age = report.updatedAt ? Date.now() - Date.parse(report.updatedAt) : null
  const stale = age === null || age > 5 * 60_000 || age < -60_000
  $('report-time').textContent = `生成时间：${date}${stale ? ' · 请重新导出以确认当前状态' : ''}`
  $('report-cards').replaceChildren()
  for (const [key, title] of Object.entries(FEATURE_NAMES)) {
    const item = report.features[key]
    const card = node('article', undefined, 'report-card')
    const status = node('strong', item.status === 'skipped' && item.skipReason === 'not-selected' ? '未选择资源' : STATUS_NAMES[item.status], item.status === 'configured' ? 'status-good' : item.status === 'pending' ? 'status-warning' : '')
    card.append(node('h3', title), status)
    if (item.count !== null) card.append(node('p', `${item.count} 个记录条目`))
    if (key === 'mcp') card.append(node('p', { passed: '服务探测通过', failed: '服务探测未通过', unknown: '服务探测未确认' }[item.probeStatus]))
    if (item.targets.length) card.append(node('p', `目标：${item.targets.join('、')}`))
    $('report-cards').append(card)
  }
  $('report-issues').replaceChildren()
  if (!report.issues.length) $('report-issues').append(node('p', '报告未记录待处理问题；运行中会话的加载状态仍需单独确认。', 'footnote'))
  for (const issue of report.issues) {
    const el = node('article', undefined, 'issue')
    el.append(node('strong', FEATURE_NAMES[issue.feature] ?? '同步诊断'), node('p', issue.message))
    if (issue.nextAction) el.append(node('p', `建议：${issue.nextAction}`))
    if (issue.targets.length) el.append(node('p', `受影响 Bot：${issue.targets.join('、')}`))
    $('report-issues').append(el)
  }
  message(`已读取诊断报告${report.pluginVersion ? `（${report.pluginVersion}）` : ''}。可点击刷新报告读取最新结果。`, false, 'report-message')
}

async function refreshReport() {
  try { const report = await ducoroApi('report'); if (!report) throw Error('尚无同步报告，请等待插件完成同步后刷新。'); showReport(parseDiagnosticReport(report)) }
  catch(error) { message(error.message,true,'report-message') }
}

async function importReport(event) {
  const file = event.target.files?.[0]
  if (!file) return
  try {
    if (file.size > 2 * 1024 * 1024) throw Error('报告文件超过 2 MB，请重新生成精简诊断报告。')
    const report = parseDiagnosticReport(JSON.parse(await file.text()))
    showReport(report)
  } catch (error) { message(`无法导入报告：${error.message}`, true, 'report-message') }
  event.target.value = ''
}

document.addEventListener('input', event => { if (event.target.id !== 'report-file') dirty() })
document.addEventListener('change', event => { if (event.target.id !== 'report-file') dirty() })
$('save').addEventListener('click', save)
$('reload').addEventListener('click', () => {
  // Reload is explicit: the user can replace their unsaved draft from here.
  load()
})
if (!panel) {
  for (const tab of document.querySelectorAll('[data-tab]')) tab.addEventListener('click', () => setTab(tab.dataset.tab))
  $('add-reference').addEventListener('click', () => { addReference(); dirty() })
  $('refresh-bots').addEventListener('click', () => DucoroResources.refresh())
  for (const key of ['modelScope','mcpScope','skillsScope']) $(key).addEventListener('change', () => { DucoroResources.scopes({[key]:$(key).value}); dirty() })
  $('refresh-report').addEventListener('click',refreshReport)
  $('retry-sync').addEventListener('click',async () => { try { await ducoroApi('retry',{}); message('已请求重新同步，请稍后刷新报告。',false,'report-message') } catch(error) { message(error.message,true,'report-message') } })
  $('report-file').addEventListener('change', importReport)
}

if (!globalThis.magpie?.ready || !globalThis.magpie?.options) {
  message('请从 Magpie 中打开 Ducoro，以读取和保存插件设置。', true)
  $('connection-state').textContent = '尚未连接 Magpie 页面接口'
  $('dirty-state').textContent = '未读取配置'
} else {
  try {
    await globalThis.magpie.ready
    if (!panel && typeof globalThis.magpie.onAction === 'function') globalThis.magpie.onAction(action => { if (action.id === 'diagnostics') setTab('diagnostics') })
    await load()
  } catch (error) {
    message(`Magpie 页面接口暂不可用：${error.message}`, true)
    $('connection-state').textContent = '页面接口未就绪'
  }
}

})().catch(error => {
  const el = document.getElementById('message')
  if (el) { el.hidden = false; el.classList.add('error'); el.textContent = `页面暂不可用：${error.message}` }
})
