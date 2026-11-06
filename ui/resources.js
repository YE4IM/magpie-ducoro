{
const { t } = globalThis.DucoroI18n;
(() => {
  const $ = id => document.getElementById(id)
  const el = (tag,text,cls) => {const n=document.createElement(tag);if(text!==undefined)DucoroI18n.setText(n, text);if(cls)n.className=cls;return n}
  let draft = {}, data = null, refreshBusy = false, activeDrawer = null
  const equipmentCounts = new Map()
  const notify = () => document.dispatchEvent(new Event('input',{bubbles:true}))
  const option = (select,value,text) => {const n=el('option',text);n.value=value;select.append(n)}
  const labelFor = (text,input) => {const n=el('label',text);n.append(input);return n}
  const select = (entries,value) => {const n=el('select');for(const [k,v] of entries)option(n,k,v);n.value=value;return n}
  const picked = (parent,title,checked,onChange) => {
    const row=el('label',undefined,'choice');const check=el('input');check.type='checkbox';check.checked=checked
    check.addEventListener('change',()=>{onChange(check.checked);notify()});row.append(check,el('span',title));parent.append(row);return check
  }
  function libraryField(bot,key,title,scopeKey) {
    const box=el('div',undefined,'resource-field');box.append(el('h3',title),el('span',t('来自 Magpie'),'source-label'))
    const supported=bot.runtime==='pi-agent'
    if(!supported){box.append(el('p',t('此 Bot 的运行方式暂不支持资源库分配。'),'muted'));return box}
    const all=data?.library?.[key]
    if(!all){box.append(el('p',t('资源库暂不可读，保留现有分配。'),'muted'));return box}
    const assignment=draft.resourceAssignments[bot.id]??{}
    const values=assignment[key]
    const mode=select([['inherit',t('继承资源库勾选')],['custom',t('单独选择')],['none',t('不分配')]],values===undefined?'inherit':values.length?'custom':'none')
    DucoroI18n.setAttribute(mode, 'aria-label', t`${bot.name} ${title}分配方式`)
    const details=el('details',undefined,'resource-picker');details.append(el('summary',t`选择${title}`))
    const choices=el('div',undefined,'choices');details.append(choices)
    const names=[...new Set([...all.map(x=>x.name),...(values??[])])]
    for(const name of names) picked(choices,`${name}${all.some(x=>x.name===name)?'':t('（当前不可用）')}`,(values??[]).includes(name),checked=>{
      const assignment=draft.resourceAssignments[bot.id]??={};const set=new Set(assignment[key]??[]);checked?set.add(name):set.delete(name);assignment[key]=[...set];summary()
    })
    if(!names.length) choices.append(el('p',t('资源库中尚无可分配资源。'),'muted'))
    function summary(){DucoroI18n.setText(details.querySelector('summary'), t`已选择 ${draft.resourceAssignments[bot.id]?.[key]?.length??0} 项`)}
    const sync=()=>{
      const global=draft[scopeKey]==='global';mode.disabled=global;mode.dataset.locked=String(global)
      details.hidden=global||mode.value!=='custom';box.querySelector('.inherit-note').hidden=!global
    }
    mode.addEventListener('change',()=>{
      const assignment=draft.resourceAssignments[bot.id]??={}
      if(mode.value==='inherit')delete assignment[key]
      else assignment[key]=mode.value==='none'?[]:[...choices.querySelectorAll('input')].flatMap((n,i)=>n.checked?[names[i]]:[])
      if(!Object.keys(assignment).length)delete draft.resourceAssignments[bot.id]
      sync();summary();notify()
    })
    box.append(mode,el('p',t`全局同步 · ${all.length} 项资源库勾选`,'inherit-note muted'),details)
    sync();summary();return box
  }
  function modelField(bot) {
    const box=el('div',undefined,'resource-field');box.append(el('h3',t('模型')),el('span',t('来自 Magpie'),'source-label'))
    const eligible=bot.runtime==='pi-agent'&&bot.connectionSlug===draft.connectionSlug
    const model=select([['',t('跟随全局模型')],...(data?.models??[]).map(x=>[x.id,x.name])],draft.botModels[bot.id]??'')
    if(draft.botModels[bot.id]&&!data?.models?.some(x=>x.id===draft.botModels[bot.id])){option(model,draft.botModels[bot.id],t`${draft.botModels[bot.id]}（当前不可用）`);model.value=draft.botModels[bot.id]}
    DucoroI18n.setAttribute(model, 'aria-label', t`${bot.name} 模型`)
    model.disabled=!eligible||draft.modelScope==='global'||!data.models.length;model.dataset.locked=String(model.disabled)
    model.addEventListener('change',()=>{if(model.value)draft.botModels[bot.id]=model.value;else delete draft.botModels[bot.id];notify()})
    box.append(model,el('p',eligible?t`全局模型：${data.defaultModel||t('尚不可用')}；当前：${bot.model||t('未配置')}`:t`当前：${bot.model||t('未配置')}。仅管理绑定本插件连接的 Pi Agent 模型。`,'muted'))
    return box
  }
  function updateAccountSummary(botId) {
    for (const card of $('assignments').children) {
      if (card.dataset.botId !== botId) continue
      const summary = card.querySelector('.account-summary')
      if (!summary) continue
      if (Object.hasOwn(draft.accountConnectors, botId)) {
        const count = Object.keys(draft.accountConnectors[botId]).length
        DucoroI18n.setText(summary, count ? t`已选择 ${count} 项` : t('不分配'))
      } else DucoroI18n.setText(summary, equipmentCounts.has(botId) ? t`已配备 ${equipmentCounts.get(botId)} 项` : t('配备待查看'))
    }
  }

  function closeAccountDrawer() {
    if (activeDrawer) activeDrawer.dialog.close()
  }

  function accountField(bot, parent) {
    const title = parent.querySelector('h3')
    const heading = el('div', undefined, 'resource-heading')
    title.replaceWith(heading)
    heading.append(title)
    if (!['pi-agent','claude-code','codex'].includes(bot.runtime)) return
    const actions = el('div', undefined, 'account-actions')
    const summary = el('span', '', 'account-summary')
    const button = el('button', t('账户配置'), 'text-button')
    button.type = 'button'
    DucoroI18n.setAttribute(button, 'aria-label', t`${bot.name} 账户配置`)
    DucoroI18n.setAttribute(button, 'aria-haspopup', 'dialog')
    actions.append(summary, button)
    heading.append(actions)
    button.addEventListener('click', () => openAccountDrawer(bot, button))
  }

  function openAccountDrawer(bot, opener) {
    closeAccountDrawer()
    const dialog = el('dialog', undefined, 'account-drawer')
    DucoroI18n.setAttribute(dialog, 'aria-labelledby', 'account-drawer-title')
    DucoroI18n.setAttribute(dialog, 'aria-describedby', 'account-drawer-description')
    const header = el('header', undefined, 'drawer-header')
    const copy = el('div')
    const title = el('h2', t('账户连接器'))
    title.id = 'account-drawer-title'
    const description = el('p', t`${bot.name} · 来自 Ducoro · 按 Bot 配备`, 'muted')
    description.id = 'account-drawer-description'
    copy.append(title, description)
    const close = el('button', '×', 'drawer-close')
    close.type = 'button'
    DucoroI18n.setAttribute(close, 'aria-label', t('关闭账户配置'))
    close.autofocus = true
    close.addEventListener('click', () => dialog.close())
    header.append(copy, close)
    const body = el('div', undefined, 'drawer-body')
    const footer = el('footer', undefined, 'drawer-footer')
    const done = el('button', t('完成'), 'primary')
    done.type = 'button'
    done.addEventListener('click', () => dialog.close())
    footer.append(el('p', t('关闭后保留草稿，点击「保存设置」后生效。'), 'muted'), done)
    dialog.append(header, body, footer)
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return
      const rect = dialog.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close()
    })
    dialog.addEventListener('close', () => {
      if (activeDrawer?.dialog === dialog) activeDrawer = null
      dialog.remove()
      if (!activeDrawer) document.body.classList.remove('drawer-open')
      updateAccountSummary(bot.id)
      if (!activeDrawer && opener.isConnected) opener.focus()
    }, {once:true})
    document.body.append(dialog)
    activeDrawer = {dialog, botId:bot.id}
    document.body.classList.add('drawer-open')
    dialog.showModal()

    async function load() {
      body.replaceChildren(el('p', t('正在读取当前配备…'), 'muted'))
      DucoroI18n.setAttribute(body, 'aria-busy', 'true')
      try {
        if (!data.catalog || data.catalog.sourceStatus !== 'ok') throw Error(t('账户目录暂不可用，请关闭抽屉并刷新 Bot 列表后重试。现有配备已保留。'))
        const current = await ducoroApi(`equipment?id=${encodeURIComponent(bot.id)}`)
        if (!dialog.open || !dialog.isConnected) return
        equipmentCounts.set(bot.id, current.length)
        updateAccountSummary(bot.id)
        body.replaceChildren()
        const state = el('p', t`当前配备 ${current.length} 项。仅已连接的账户可同步；请先在 Ducoro 中连接需要的服务。`, 'drawer-state muted')
        DucoroI18n.setAttribute(state, 'role', 'status')
        const mode = select([['keep',t('保持现有配备')],['custom',t('单独指定')],['none',t('不分配插件管理的连接器')]], !Object.hasOwn(draft.accountConnectors,bot.id) ? 'keep' : Object.keys(draft.accountConnectors[bot.id]).length ? 'custom' : 'none')
        DucoroI18n.setAttribute(mode, 'aria-label', t`${bot.name} 账户连接器分配方式`)
        const choices = el('div', undefined, 'account-choices')
        const renderChoices = () => {
          choices.replaceChildren()
          choices.hidden = mode.value !== 'custom'
          const policies = draft.accountConnectors[bot.id] ?? {}
          const entries = data.catalog.items.filter(x => x.status === 'connected')
          for (const slug of Object.keys(policies)) if (!entries.some(x => x.slug === slug)) entries.push({slug,name:slug,status:'unavailable'})
          for (const item of entries) {
            const details = el('details', undefined, 'resource-picker')
            const summary = el('summary', t`${item.name}${item.status === 'connected' ? '' : t('（当前未连接）')} · 已选择 ${policies[item.slug]?.allow?.length ?? 0} 项工具`)
            details.append(summary)
            const content = el('div', undefined, 'choices')
            details.append(content)
            const loadTools = el('button', t('选择允许使用的工具'), 'secondary')
            loadTools.type = 'button'
            content.append(loadTools)
            loadTools.addEventListener('click', async () => {
              loadTools.disabled = true
              try {
                const tools = await ducoroApi(`tools?slug=${encodeURIComponent(item.slug)}`)
                if (!content.isConnected) return
                content.replaceChildren()
                const policy = draft.accountConnectors[bot.id]?.[item.slug]
                const all = [...tools]
                for (const slug of policy?.allow ?? []) if (!all.some(x => x.slug === slug)) all.push({slug,name:t`${slug}（当前不可用）`})
                for (const tool of all) {
                  const check = picked(content, tool.name || tool.slug, (policy?.allow ?? []).includes(tool.slug), checked => {
                    const policies = draft.accountConnectors[bot.id] ??= {}
                    const next = policies[item.slug] ?? {allow:[],deny:[]}
                    const allow = new Set(next.allow)
                    checked ? allow.add(tool.slug) : allow.delete(tool.slug)
                    if (allow.size) policies[item.slug] = {allow:[...allow],deny:(next.deny ?? []).filter(x => !allow.has(x))}
                    else delete policies[item.slug]
                    DucoroI18n.setText(summary, t`${item.name} · 已选择 ${allow.size} 项工具`)
                    updateAccountSummary(bot.id)
                  })
                  check.parentElement.title = tool.description || tool.slug
                }
                if (!all.length) content.append(el('p', t('当前没有可分配工具。'), 'muted'))
              } catch (error) { DucoroI18n.setText(state, t(error.message)); loadTools.disabled = false }
            })
            choices.append(details)
          }
          if (!entries.length) choices.append(el('p', t('尚无已连接的账户连接器。请先在 Ducoro 连接服务，再刷新列表。'), 'muted'))
        }
        mode.addEventListener('change', () => {
          if (mode.value === 'keep') delete draft.accountConnectors[bot.id]
          else if (mode.value === 'none') draft.accountConnectors[bot.id] = {}
          else draft.accountConnectors[bot.id] ??= Object.fromEntries(current.filter(x => x.allow.length).map(x => [x.slug,{allow:x.allow,deny:x.deny}]))
          renderChoices()
          updateAccountSummary(bot.id)
          notify()
        })
        body.append(labelFor(t('分配方式'), mode), state, choices)
        renderChoices()
      } catch (error) {
        if (!dialog.open || !dialog.isConnected) return
        const message = el('p', t(error.message), 'notice error')
        DucoroI18n.setAttribute(message, 'role', 'alert')
        const retry = el('button', t('重试读取'), 'secondary')
        retry.type = 'button'
        retry.addEventListener('click', load)
        body.replaceChildren(message, retry)
      } finally { body.removeAttribute('aria-busy') }
    }
    void load()
  }

  function render() {
    if (activeDrawer && data?.bots && !data.bots.some(bot => bot.id === activeDrawer.botId)) closeAccountDrawer()
    $('assignments').replaceChildren()
    $('assignment-empty').hidden=!data?.bots||data.bots.length>0
    if(!data?.bots)return
    for(const bot of data.bots){
      const card=el('section',undefined,'assignment-row');card.dataset.botId=bot.id;const heading=el('div',undefined,'bot-heading')
      heading.append(el('h3',bot.name),el('span',bot.id,'bot-id'));card.append(heading)
      const grid=el('div',undefined,'resource-grid');const connectors=libraryField(bot,'mcp',t('连接器'),'mcpScope');accountField(bot,connectors)
      grid.append(modelField(bot),connectors,libraryField(bot,'skills',t('技能'),'skillsScope'));card.append(grid);$('assignments').append(card);updateAccountSummary(bot.id)
      if(document.body.dataset.busy==='true') for(const input of card.querySelectorAll('input,select,button'))input.disabled=true
    }
  }
  globalThis.DucoroResources={
    set(options){closeAccountDrawer();draft=structuredClone(options);render()},
    collect(){const assignments=Object.fromEntries(Object.entries(draft.resourceAssignments??{}).filter(([,x])=>Object.keys(x).length));return {resourceAssignments:assignments,botModels:draft.botModels??{},accountConnectors:draft.accountConnectors??{}}},
    scopes(values){Object.assign(draft,values);render()},
    async refresh(){
      if(refreshBusy)return;refreshBusy=true;$('refresh-bots').disabled=true;DucoroI18n.setText($('inventory-state'), t('正在刷新 Bot 和资源…'))
      try{
        const next=await ducoroApi('inventory')
        // A failed source is not an empty source. Preserve a successful roster
        // and all draft assignments until the source can be read again.
        data={...next,bots:next.bots??data?.bots??null,library:next.library??data?.library??null}
        if(next.bots){const ids=new Set(next.bots.map(x=>x.id));for(const key of ['resourceAssignments','botModels','accountConnectors'])for(const id of Object.keys(draft[key]??{}))if(!ids.has(id))delete draft[key][id]}
        render();notify();DucoroI18n.setText($('inventory-message'), next.warnings.join(' '));$('inventory-message').hidden=!next.warnings.length
        DucoroI18n.setText($('inventory-state'), next.bots?t`${next.bots.length} 个 Bot · 刷新于 ${new Date(next.updatedAt).toLocaleTimeString(document.documentElement.lang)} · 未保存的选择已保留`:t('Bot 列表读取失败，现有选择已保留。'))
      }catch(error){DucoroI18n.setText($('inventory-state'), t(error.message))}
      finally{refreshBusy=false;$('refresh-bots').disabled=false}
    },
  }
})()

}
