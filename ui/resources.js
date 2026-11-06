(() => {
  const $ = id => document.getElementById(id)
  const el = (tag,text,cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
  let draft = {}, data = null, refreshBusy = false
  const notify = () => document.dispatchEvent(new Event('input',{bubbles:true}))
  const option = (select,value,text) => {const n=el('option',text);n.value=value;select.append(n)}
  const labelFor = (text,input) => {const n=el('label',text);n.append(input);return n}
  const select = (entries,value) => {const n=el('select');for(const [k,v] of entries)option(n,k,v);n.value=value;return n}
  const picked = (parent,title,checked,onChange) => {
    const row=el('label',undefined,'choice');const check=el('input');check.type='checkbox';check.checked=checked
    check.addEventListener('change',()=>{onChange(check.checked);notify()});row.append(check,el('span',title));parent.append(row);return check
  }
  function libraryField(bot,key,title,scopeKey) {
    const box=el('div',undefined,'resource-field');box.append(el('h3',title))
    const supported=bot.runtime==='pi-agent'
    if(!supported){box.append(el('p','此 Bot 的运行方式暂不支持资源库分配。','muted'));return box}
    const all=data?.library?.[key]
    if(!all){box.append(el('p','资源库暂不可读，保留现有分配。','muted'));return box}
    const assignment=draft.resourceAssignments[bot.id]??{}
    const values=assignment[key]
    const mode=select([['inherit','继承资源库勾选'],['custom','单独选择'],['none','不分配']],values===undefined?'inherit':values.length?'custom':'none')
    mode.setAttribute('aria-label',`${bot.name} ${title}分配方式`)
    const details=el('details',undefined,'resource-picker');details.append(el('summary',`选择${title}`))
    const choices=el('div',undefined,'choices');details.append(choices)
    const names=[...new Set([...all.map(x=>x.name),...(values??[])])]
    for(const name of names) picked(choices,`${name}${all.some(x=>x.name===name)?'':'（当前不可用）'}`,(values??[]).includes(name),checked=>{
      const assignment=draft.resourceAssignments[bot.id]??={};const set=new Set(assignment[key]??[]);checked?set.add(name):set.delete(name);assignment[key]=[...set];summary()
    })
    if(!names.length) choices.append(el('p','资源库中尚无可分配资源。','muted'))
    function summary(){details.querySelector('summary').textContent=`已选择 ${draft.resourceAssignments[bot.id]?.[key]?.length??0} 项`}
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
    box.append(mode,el('p',`全局同步 · ${all.length} 项资源库勾选`,'inherit-note muted'),details)
    if(key==='mcp')box.querySelector('h3').append(el('span',' · 来自 Magpie','inline-source'))
    sync();summary();return box
  }
  function modelField(bot) {
    const box=el('div',undefined,'resource-field');box.append(el('h3','模型'))
    const eligible=bot.runtime==='pi-agent'&&bot.connectionSlug===draft.connectionSlug
    const model=select([['','跟随全局模型'],...(data?.models??[]).map(x=>[x.id,x.name])],draft.botModels[bot.id]??'')
    if(draft.botModels[bot.id]&&!data?.models?.some(x=>x.id===draft.botModels[bot.id])){option(model,draft.botModels[bot.id],`${draft.botModels[bot.id]}（当前不可用）`);model.value=draft.botModels[bot.id]}
    model.setAttribute('aria-label',`${bot.name} 模型`)
    model.disabled=!eligible||draft.modelScope==='global'||!data.models.length;model.dataset.locked=String(model.disabled)
    model.addEventListener('change',()=>{if(model.value)draft.botModels[bot.id]=model.value;else delete draft.botModels[bot.id];notify()})
    box.append(model,el('p',eligible?`全局模型：${data.defaultModel||'尚不可用'}；当前：${bot.model||'未配置'}`:`当前：${bot.model||'未配置'}。仅管理绑定本插件连接的 Pi Agent 模型。`,'muted'))
    return box
  }
  function accountField(bot,parent) {
    const section=el('div',undefined,'account-field');section.append(el('span','来自 Ducoro · 按 Bot 配备','source-label'))
    if(!['pi-agent','claude-code','codex'].includes(bot.runtime)){section.append(el('p','此 Bot 暂不支持账户连接器。','muted'));parent.append(section);return}
    const button=el('button','配置账户连接器','secondary');button.type='button';section.append(button)
    const state=el('p',Object.hasOwn(draft.accountConnectors,bot.id)?`已保存 ${Object.keys(draft.accountConnectors[bot.id]).length} 项分配`:'保持现有配备','muted');section.append(state)
    if(!data.catalog||data.catalog.sourceStatus!=='ok'){button.disabled=true;button.dataset.locked='true';state.textContent='账户目录暂不可用，保留现有配备。'}
    button.addEventListener('click',async()=>{
      button.disabled=true;state.textContent='正在读取当前配备…'
      try {
        const current=await ducoroApi(`equipment?id=${encodeURIComponent(bot.id)}`)
        if(!section.isConnected)return
        const mode=select([['keep','保持现有配备'],['custom','单独指定'],['none','不分配插件管理的连接器']],!Object.hasOwn(draft.accountConnectors,bot.id)?'keep':Object.keys(draft.accountConnectors[bot.id]).length?'custom':'none')
        mode.setAttribute('aria-label',`${bot.name} 账户连接器分配方式`)
        const choices=el('div',undefined,'account-choices')
        const renderChoices=()=>{
          choices.replaceChildren();choices.hidden=mode.value!=='custom'
          const policies=draft.accountConnectors[bot.id]??{}
          const entries=data.catalog.items.filter(x=>x.status==='connected')
          for(const slug of Object.keys(policies))if(!entries.some(x=>x.slug===slug))entries.push({slug,name:slug,status:'unavailable'})
          for(const item of entries){
            const details=el('details',undefined,'resource-picker');const summary=el('summary',`${item.name}${item.status==='connected'?'':'（当前未连接）'} · ${policies[item.slug]?'已选择工具':'未分配'}`);details.append(summary)
            const content=el('div',undefined,'choices');details.append(content)
            const load=el('button','选择允许使用的工具','secondary');load.type='button';content.append(load)
            load.addEventListener('click',async()=>{
              load.disabled=true
              try{
                const tools=await ducoroApi(`tools?slug=${encodeURIComponent(item.slug)}`)
                if(!content.isConnected)return
                content.replaceChildren()
                const policy=draft.accountConnectors[bot.id]?.[item.slug]
                const all=[...tools];for(const slug of policy?.allow??[])if(!all.some(x=>x.slug===slug))all.push({slug,name:`${slug}（当前不可用）`})
                for(const tool of all){
                  const c=picked(content,tool.name||tool.slug,(policy?.allow??[]).includes(tool.slug),checked=>{
                    const policies=draft.accountConnectors[bot.id]??={};const next=policies[item.slug]??{allow:[],deny:[]};const allow=new Set(next.allow)
                    checked?allow.add(tool.slug):allow.delete(tool.slug)
                    if(allow.size)policies[item.slug]={allow:[...allow],deny:(next.deny??[]).filter(x=>!allow.has(x))};else delete policies[item.slug]
                    summary.textContent=`${item.name} · 已选择 ${allow.size} 项工具`
                  });c.parentElement.title=tool.description||tool.slug
                }
                if(!all.length)content.append(el('p','当前没有可分配工具。','muted'))
              }catch(error){state.textContent=error.message;load.disabled=false}
            })
            choices.append(details)
          }
          if(!entries.length)choices.append(el('p','尚无已连接的账户连接器。请先在 Ducoro 连接服务，再刷新列表。','muted'))
        }
        mode.addEventListener('change',()=>{
          if(mode.value==='keep')delete draft.accountConnectors[bot.id]
          else if(mode.value==='none')draft.accountConnectors[bot.id]={}
          else draft.accountConnectors[bot.id]??=Object.fromEntries(current.filter(x=>x.allow.length).map(x=>[x.slug,{allow:x.allow,deny:x.deny}]))
          renderChoices();notify()
        })
        button.replaceWith(mode);section.append(choices);state.textContent=`当前配备 ${current.length} 项。仅已连接的账户可同步；未连接的服务请先在 Ducoro 完成连接。`;renderChoices()
      }catch(error){state.textContent=error.message;button.disabled=false}
    })
    parent.append(section)
  }
  function render() {
    $('assignments').replaceChildren()
    $('assignment-empty').hidden=!data?.bots||data.bots.length>0
    if(!data?.bots)return
    for(const bot of data.bots){
      const card=el('section',undefined,'assignment-row');card.dataset.botId=bot.id;const heading=el('div',undefined,'bot-heading')
      heading.append(el('h3',bot.name),el('span',bot.id,'bot-id'));card.append(heading)
      const grid=el('div',undefined,'resource-grid');const connectors=libraryField(bot,'mcp','连接器','mcpScope');accountField(bot,connectors)
      grid.append(modelField(bot),connectors,libraryField(bot,'skills','技能','skillsScope'));card.append(grid);$('assignments').append(card)
      if(document.body.dataset.busy==='true') for(const input of card.querySelectorAll('input,select,button'))input.disabled=true
    }
  }
  globalThis.DucoroResources={
    set(options){draft=structuredClone(options);render()},
    collect(){const assignments=Object.fromEntries(Object.entries(draft.resourceAssignments??{}).filter(([,x])=>Object.keys(x).length));return {resourceAssignments:assignments,botModels:draft.botModels??{},accountConnectors:draft.accountConnectors??{}}},
    scopes(values){Object.assign(draft,values);render()},
    async refresh(){
      if(refreshBusy)return;refreshBusy=true;$('refresh-bots').disabled=true;$('inventory-state').textContent='正在刷新 Bot 和资源…'
      try{
        const next=await ducoroApi('inventory')
        // A failed source is not an empty source. Preserve a successful roster
        // and all draft assignments until the source can be read again.
        data={...next,bots:next.bots??data?.bots??null,library:next.library??data?.library??null}
        if(next.bots){const ids=new Set(next.bots.map(x=>x.id));for(const key of ['resourceAssignments','botModels','accountConnectors'])for(const id of Object.keys(draft[key]??{}))if(!ids.has(id))delete draft[key][id]}
        render();notify();$('inventory-message').textContent=next.warnings.join(' ');$('inventory-message').hidden=!next.warnings.length
        $('inventory-state').textContent=next.bots?`${next.bots.length} 个 Bot · 刷新于 ${new Date(next.updatedAt).toLocaleTimeString()} · 未保存的选择已保留`:'Bot 列表读取失败，现有选择已保留。'
      }catch(error){$('inventory-state').textContent=error.message}
      finally{refreshBusy=false;$('refresh-bots').disabled=false}
    },
  }
})()
