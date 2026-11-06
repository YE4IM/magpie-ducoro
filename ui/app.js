{
const { t } = globalThis.DucoroI18n;
;(async () => {
await globalThis.DucoroUIReady
const { SWITCHES, DEFAULT_OPTIONS, EDITABLE_KEYS, FEATURE_NAMES, STATUS_NAMES, splitList, optionsForDisplay, validateFields, mergeEditedOptions, parseDiagnosticReport } = globalThis.DucoroUI

const $ = id => document.getElementById(id)
const panel = document.body.dataset.panel === 'true'
let baseline = null
let ready = false
let busy = false
let reportRequest = 0
const node = (tag, text, className) => {
  const el = document.createElement(tag)
  if (text !== undefined) DucoroI18n.setText(el, text)
  if (className) el.className = className
  return el
}
const message = (text, error = false, target = 'message') => {
  const el = $(target)
  if (!el) return
  DucoroI18n.setText(el, t(text))
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
  input.className = 'toggle-input'
  DucoroI18n.setAttribute(input, 'role', 'switch')
  DucoroI18n.setAttribute(input, 'aria-label', title)
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
  const routeField = textField(t('发送的模型 / 路由组'), route, 'group/glm-5.3-flash', 'ref-route')
  const refField = textField(t('官方目录参考'), reference ?? '', 'zai/glm-5.3-flash', 'ref-value')
  const remove = node('button', t('移除'), 'remove-row')
  remove.type = 'button'
  DucoroI18n.setAttribute(remove, 'aria-label', t('移除模型映射'))
  const disabled = node('label', undefined, 'disable-ref')
  const check = node('input')
  check.type = 'checkbox'
  check.className = 'ref-disabled'
  check.checked = reference === null
  DucoroI18n.setAttribute(refField.input, 'list', 'catalog-options')
  refField.input.disabled = check.checked
  check.addEventListener('change', () => { refField.input.disabled = check.checked })
  disabled.append(check, node('span', t('禁用自动映射')))
  remove.addEventListener('click', () => { row.remove(); updateEmptyRows(); dirty() })
  row.append(routeField.label, refField.label, remove, disabled)
  $('references').append(row)
  updateEmptyRows()
}

function updateEmptyRows() {
  if (panel) return
  const count = $('references').children.length
  $('reference-empty').hidden = count > 0
  DucoroI18n.setText($('manual-count'), t`${count} 项覆盖`)
}

function updateToggleLabels() {
  DucoroI18n.setText($('disconnect-state'), $('onDisconnect').checked ? t('已开启 · 断开时移除') : t('已关闭 · 断开时保留'))
  for (const key of ['modelScope','mcpScope','skillsScope']) DucoroI18n.setText($(key+'-state'), $(key).checked ? t('已开启 · 按 Bot 单独配置') : t('已关闭 · 全局同步'))
}

let catalogModels = [], catalogBusy = false
function renderCatalog() {
  const query = $('catalog-search').value.trim().toLowerCase()
  const matches = catalogModels.filter(model => `${model.provider}/${model.id} ${model.name}`.toLowerCase().includes(query))
  DucoroI18n.setText($('catalog-count'), t`共 ${catalogModels.length} 个模型${query ? t` · 找到 ${matches.length} 项` : ''}${matches.length > 100 ? t(' · 显示前 100 项，请搜索缩小范围') : ''}`)
  $('catalog-list').replaceChildren()
  for (const model of matches.slice(0, 100)) {
    const row = node('div', undefined, 'catalog-model')
    const copy = node('div')
    copy.append(node('strong', model.name || model.id), node('span', `${model.provider}/${model.id}`, 'catalog-coordinate'))
    const context = model.contextWindow ? t`${new Intl.NumberFormat(document.documentElement.lang).format(model.contextWindow)} 上下文` : t('上下文未提供')
    row.append(copy, node('span', context, 'catalog-context'))
    $('catalog-list').append(row)
  }
  if (!matches.length) $('catalog-list').append(node('p', catalogModels.length ? t('没有匹配的模型。') : t('目录尚未加载，请同步上游模型列表。'), 'empty-inline'))
}
async function refreshCatalog(force = false) {
  if (catalogBusy) return
  catalogBusy = true
  $('sync-catalog').disabled = true
  DucoroI18n.setText($('sync-catalog'), force ? t('正在同步…') : t('正在读取…'))
  try {
    const result = await ducoroApi('model-catalog', force ? {} : undefined)
    if (!Array.isArray(result.models) || !Number.isFinite(Date.parse(result.updatedAt))) throw Error(t('上游模型目录格式无法识别。'))
    catalogModels = result.models
    DucoroI18n.setText($('catalog-state'), t`${catalogModels.length} 个模型 · 最近读取 ${new Date(result.updatedAt).toLocaleString(document.documentElement.lang)}`)
    $('catalog-options').replaceChildren()
    for (const model of catalogModels) {
      const option = node('option')
      option.value = `${model.provider}/${model.id}`
      option.label = model.name || model.id
      $('catalog-options').append(option)
    }
    renderCatalog()
    message(result.stale ? t('上游暂不可用，正在显示上次成功读取的目录。请稍后重新同步。') : force ? t('已重新读取 Ducoro 上游目录，并请求重新匹配模型能力。手动覆盖和未保存设置已保留。') : '', result.stale === true, 'catalog-message')
  } catch (error) {
    DucoroI18n.setText($('catalog-state'), catalogModels.length ? t`${catalogModels.length} 个模型 · 本次更新失败，显示上次目录` : t('上游目录暂不可用'))
    message(error.message, true, 'catalog-message')
  } finally {
    catalogBusy = false
    DucoroI18n.setText($('sync-catalog'), t('↻ 同步上游模型列表'))
    $('sync-catalog').disabled = busy || !ready
  }
}

function setTab(name) {
  if (panel) return
  for (const el of document.querySelectorAll('[data-tab]')) {
    const active = el.dataset.tab === name
    el.classList.toggle('active', active)
    DucoroI18n.setAttribute(el, 'aria-pressed', String(active))
  }
  for (const el of document.querySelectorAll('.tab-content')) el.hidden = el.id !== name
  $('save-bar').hidden = name === 'diagnostics'
  if (name === 'diagnostics' && ready) void refreshReport()
}

function populate(options) {
  for (const [key] of SWITCHES) $(key).checked = options[key]
  if (!panel) {
    $('connectionSlug').value = options.connectionSlug
    $('onDisconnect').checked = options.onDisconnect === 'remove'
    $('subagentNames').value = options.subagentNames.join('\n')
    $('officialProviders').value = options.officialProviders.join('\n')
    for (const key of ['modelScope','mcpScope','skillsScope']) {
      $(key).checked = options[key] !== 'global'
      $(key).dataset.activeValue = options[key] === 'global' ? 'agents' : options[key]
    }
    updateToggleLabels()
    DucoroResources.set(options)
    $('references').replaceChildren()
    for (const [route, ref] of Object.entries(options.modelCapabilityRefs)) addReference(route, ref)
    updateEmptyRows()
  }
  DucoroI18n.setText($('connection-state'), t`连接标识：${options.connectionSlug} · 设置已读取，同步结果请查看同步诊断`)
}

function collect() {
  const options = structuredClone(baseline ?? DEFAULT_OPTIONS)
  for (const [key] of SWITCHES) options[key] = $(key).checked
  if (panel) return options
  options.connectionSlug = $('connectionSlug').value.trim()
  options.onDisconnect = $('onDisconnect').checked ? 'remove' : 'keep'
  options.subagentNames = splitList($('subagentNames').value)
  options.officialProviders = splitList($('officialProviders').value)
  for (const key of ['modelScope','mcpScope','skillsScope']) options[key] = $(key).checked ? $(key).dataset.activeValue : 'global'
  options.modelCapabilityRefs = {}
  for (const row of $('references').children) {
    const route = row.querySelector('.ref-route').value.trim()
    const ref = row.querySelector('.ref-disabled').checked ? null : row.querySelector('.ref-value').value.trim()
    if (Object.hasOwn(options.modelCapabilityRefs, route)) throw Error(t`模型 ${route || t('（空名称）')} 重复，请仅保留一条映射。`)
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
  DucoroI18n.setText($('dirty-state'), changed ? t('有未保存的修改') : t('设置与已读取配置一致'))
  $('save').disabled = !changed
}

function setBusy(value) {
  busy = value
  document.body.dataset.busy = String(value)
  for (const el of document.querySelectorAll('input:not([type="file"]),textarea,select,button:not([data-tab])')) el.disabled = value || !ready
  if (!value && ready) {
    for (const row of document.querySelectorAll('.reference-row')) row.querySelector('.ref-value').disabled = row.querySelector('.ref-disabled').checked
    for (const el of document.querySelectorAll('[data-locked="true"]')) el.disabled = true
    if (!panel && catalogBusy) $('sync-catalog').disabled = true
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
    if (!panel) { await Promise.all([DucoroResources.refresh(), refreshCatalog()]); if (!$('diagnostics').hidden) await refreshReport() }
  } catch (error) {
    message(t`无法读取设置：${error.message}`, true)
    DucoroI18n.setText($('connection-state'), t('配置尚未读取，未执行任何修改'))
    DucoroI18n.setText($('dirty-state'), t('读取失败'))
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
    if (!changed.length) { message(t('没有需要保存的修改。')); return }
    if (!panel) await ducoroApi('validate',options)
    const saved = await globalThis.magpie.options.set(options)
    baseline = optionsForDisplay(saved ?? options)
    populate(baseline)
    message(t('设置已保存，正在同步。稍后刷新报告可查看结果。'))
    if (!panel) setTimeout(async () => { await DucoroResources.refresh(); await refreshReport() }, 3000)
  } catch (error) {
    message(error.message || t('保存失败，请重试。'), true)
  } finally { setBusy(false) }
}

function showReport(report) {
  $('report-empty').hidden = true
  $('report-view').hidden = false
  const date = report.updatedAt ? new Date(report.updatedAt).toLocaleString(document.documentElement.lang) : t('报告未提供时间')
  const synced = report.lastSyncedAt ? new Date(report.lastSyncedAt).toLocaleString(document.documentElement.lang) : t('尚未完成同步')
  DucoroI18n.setText($('report-time'), t`查看时间：${date} · 最近同步：${synced}${report.stale ? t(' · 同步结果待更新') : ''}`)
  $('report-cards').replaceChildren()
  for (const [key, title] of Object.entries(FEATURE_NAMES)) {
    const item = report.features[key]
    const card = node('article', undefined, 'report-card')
    const status = node('strong', item.status === 'skipped' && item.skipReason === 'not-selected' ? t('未选择资源') : STATUS_NAMES[item.status], item.status === 'configured' ? 'status-good' : item.status === 'pending' ? 'status-warning' : '')
    card.append(node('h3', title), status)
    if (item.count !== null) card.append(node('p', t`${item.count} 个记录条目`))
    if (key === 'mcp') card.append(node('p', { passed: t('服务探测通过'), failed: t('服务探测未通过'), unknown: t('服务探测未确认') }[item.probeStatus]))
    if (item.targets.length) card.append(node('p', t`目标：${item.targets.join(document.documentElement.lang === 'en' ? ', ' : '、')}`))
    $('report-cards').append(card)
  }
  $('report-issues').replaceChildren()
  if (!report.issues.length) $('report-issues').append(node('p', t('报告未记录待处理问题；运行中会话的加载状态仍需单独确认。'), 'footnote'))
  for (const issue of report.issues) {
    const el = node('article', undefined, 'issue')
    el.append(node('strong', FEATURE_NAMES[issue.feature] ?? t('同步诊断')), node('p', t(issue.message)))
    if (issue.nextAction) el.append(node('p', t`建议：${t(issue.nextAction)}`))
    if (issue.targets.length) el.append(node('p', t`受影响 Bot：${issue.targets.join(document.documentElement.lang === 'en' ? ', ' : '、')}`))
    $('report-issues').append(el)
  }
  message(t`${report.syncing ? t('正在同步，当前显示最近已完成的结果。') : t('已生成本次诊断报告。')}报告仅在页面中显示，不保存到本机。`, false, 'report-message')
}

async function refreshReport() {
  const request = ++reportRequest
  $('refresh-report').disabled = true
  $('report-view').hidden = true
  $('report-empty').hidden = true
  $('report-cards').replaceChildren()
  $('report-issues').replaceChildren()
  message(t('正在生成实时诊断报告…'), false, 'report-message')
  try {
    const report = parseDiagnosticReport(await ducoroApi('report'))
    if (request === reportRequest) showReport(report)
  } catch(error) {
    if (request === reportRequest) {
      $('report-empty').hidden = false
      message(error.message, true, 'report-message')
    }
  } finally { if (request === reportRequest) $('refresh-report').disabled = busy || !ready }
}

document.addEventListener('input', dirty)
document.addEventListener('change', dirty)
$('save').addEventListener('click', save)
$('reload').addEventListener('click', () => {
  // Reload is explicit: the user can replace their unsaved draft from here.
  load()
})
if (!panel) {
  for (const tab of document.querySelectorAll('[data-tab]')) tab.addEventListener('click', () => setTab(tab.dataset.tab))
  $('add-reference').addEventListener('click', () => { addReference(); dirty() })
  $('refresh-bots').addEventListener('click', () => DucoroResources.refresh())
  $('onDisconnect').addEventListener('change', updateToggleLabels)
  for (const key of ['modelScope','mcpScope','skillsScope']) $(key).addEventListener('change', () => {
    $(key).dataset.activeValue = 'agents'
    updateToggleLabels()
    DucoroResources.scopes({[key]:$(key).checked ? 'agents' : 'global'}); dirty()
  })
  $('sync-catalog').addEventListener('click', () => refreshCatalog(true))
  $('catalog-search').addEventListener('input', renderCatalog)
  $('refresh-report').addEventListener('click',refreshReport)
  $('retry-sync').addEventListener('click',async () => { try { await ducoroApi('retry',{}); message(t('已请求重新同步，请稍后刷新报告。'),false,'report-message') } catch(error) { message(error.message,true,'report-message') } })
}

if (!globalThis.magpie?.ready || !globalThis.magpie?.options) {
  message(t('请从 Magpie 中打开 Ducoro，以读取和保存插件设置。'), true)
  DucoroI18n.setText($('connection-state'), t('尚未连接 Magpie 页面接口'))
  DucoroI18n.setText($('dirty-state'), t('未读取配置'))
} else {
  try {
    await globalThis.magpie.ready
    if (!panel && typeof globalThis.magpie.onAction === 'function') globalThis.magpie.onAction(action => { if (action.id === 'diagnostics') setTab('diagnostics') })
    await load()
  } catch (error) {
    message(t`Magpie 页面接口暂不可用：${error.message}`, true)
    DucoroI18n.setText($('connection-state'), t('页面接口未就绪'))
  }
}

})().catch(error => {
  const el = document.getElementById('message')
  if (el) { el.hidden = false; el.classList.add('error'); DucoroI18n.setText(el, t`页面暂不可用：${error.message}`) }
})

}
