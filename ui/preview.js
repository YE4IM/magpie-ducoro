// Localized authored messages stay bound to text nodes; external names stay literal.
(() => {
  const {t,setText,joinMessages,dateTime}=DucoroI18n
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)setText(n,text);if(cls)n.className=cls;return n}
  const names=items=>items.length?joinMessages(items):t('无')
  const policy=p=>p===null?t('未配备'):t`允许：${names(p.allow)}；拒绝：${names(p.deny)}`
  const actions={add:t('新增'),update:t('更新'),remove:t('撤销'),restore:t('恢复原权限'),keep:t('保持'),conflict:t('外部修改冲突'),unmanaged:t('由 Ducoro 管理')}
  const status={disconnected:t('Magpie 尚未连接，保持当前模型'),'source-unknown':t('Magpie 导出暂不可读，模型同步暂缓'),same:t('已一致'),change:t('等待同步'),unavailable:t('目标模型当前不可用'),unknown:t('写入能力尚未确认'),unmanaged:t('此 Bot 模型不在同步范围')}
  const sourceLabel=source=>source?.type==='plan'?t`继承方案：${source.plan}`:source?.type==='override'?t('Bot 单项覆盖'):t('全局设置');
  function renderRow(row,onResolve) {
    const block=el('section',undefined,'preview-bot')
    block.append(el('h3',row.id==='global'?t('全局资源'):row.name),el('p',row.id,'muted'))
    for(const [kind,source] of Object.entries(row.sources??{}))block.append(el('p',t`${DucoroI18n.featureLabel(kind==='model'?'models':kind)} · ${sourceLabel(source)}${source.additive?' · '+t('追加到全局指令'):''}`,'muted'));
    if(row.model){
      const table=el('div',undefined,'comparison-grid')
      table.append(el('div',t`上次同步模型\n${row.model.applied??t('尚无记录')}`),el('div',t`Ducoro 当前模型\n${row.model.current||t('未配置')}`),el('div',t`Magpie 期望模型\n${row.model.desired||t('保持当前模型')}`))
      block.append(table,el('p',status[row.model.status],'muted'));if(row.model.status==='change')block.append(el('p',t('变化原因：有效模型选择与 Ducoro 当前模型不同。'),'muted'))
    }
    for(const item of row.resources) {
      const name=t(({skills:'技能',instructions:'指令',subagents:'子代理'})[item.kind]??'资源库连接器')
      const resourceName=item.nameMessage?t(item.nameMessage):item.name
      block.append(el('p',item.action==='effective'?t`${name} · 预计获得：${names(item.gained)}；预计失去插件提供的资源：${names(item.lost)}`:t`${name} · ${actions[item.action]??t('待核实')} · ${resourceName}`))
      if(['add','remove','effective','update'].includes(item.action))block.append(el('p',t(item.action==='update'?'变化原因：源内容或权限与上次同步记录不同。':'变化原因：同步开关、分配范围或继承设置改变了有效资源。'),'muted'));
      if(item.summaryMessage||item.summary)block.append(el('p',t(item.summaryMessage??item.summary),'muted'))
    }
    for(const item of row.accounts) {
      const section=el('div',undefined,item.action==='conflict'?'notice error':'account-diff')
      section.append(el('strong',t`${item.slug} · ${actions[item.action]}`))
      const table=el('div',undefined,'comparison-grid')
      table.append(el('div',t`上次同步权限\n${item.applied===undefined?t('尚无记录'):policy(item.applied)}`),el('div',t`Ducoro 当前权限\n${policy(item.current)}`),el('div',t`Magpie 期望 / 撤销后恢复\n${item.action==='unmanaged'?t('保持当前权限'):policy(item.desired)}`))
      section.append(table)
      if(item.reason)section.append(el('p',t(item.reasonMessage??item.reason)))
      if(item.action==='conflict'&&onResolve)for(const [mode,title] of [['keep',t('采用 Ducoro 当前权限')],['reapply',t('重新应用 Magpie 权限')]]){
        const button=el('button',title,'secondary');button.type='button';button.addEventListener('click',()=>onResolve(row.id,item,mode));section.append(button)
      }
      block.append(section)
    }
    if(row.accountsUnknown)block.append(el('p',t('账户工具当前权限读取失败，无法确认差异；现有权限会保留。'),'notice'))
    if(!row.resources.length&&!row.accounts.length&&!row.model)block.append(el('p',t('没有分配范围变化。'),'muted'))
    return block
  }
  async function show(options,{save=false}={}) {
    const data=await ducoroApi('preview',options)
    globalThis.DucoroResources?.showComparison(data)
    return new Promise(resolve=>{
      const dialog=el('dialog',undefined,'preview-dialog');dialog.setAttribute('aria-labelledby','preview-title')
      const title=el('h2',save?t('保存前预览'):t('逐 Bot 变更预览'));title.id='preview-title'
      dialog.append(title,el('p',t`读取时间：${dateTime(data.updatedAt)}。同步前会再次校验当前状态。`,'muted'))
      const body=el('div',undefined,'preview-body')
      for(const warning of data.warningMessages??data.warnings)body.append(el('p',t(warning),'notice'))
      if(data.blocked)body.append(el('p',t('请先恢复管理记录或数据来源，再重新预览。同步诊断中可重新读取管理记录。'),'notice error'))
      const changed = row => ['change','unavailable','unknown'].includes(row.model?.status) || row.accountsUnknown || row.resources.some(x => !['keep','unmanaged'].includes(x.action)) || row.accounts.some(x => !['keep','unmanaged'].includes(x.action));
      const conflicted = row => row.accountsUnknown || row.accounts.some(x => x.action === 'conflict');
      const affected = data.rows.filter(changed).length;
      dialog.append(el('p',t`受影响 Bot：${affected}`));
      const additions=data.rows.reduce((n,row)=>n+[...row.resources,...row.accounts].filter(x=>x.action==='add').length,0);
      const removals=data.rows.reduce((n,row)=>n+[...row.resources,...row.accounts].filter(x=>['remove','restore'].includes(x.action)).length,0);
      dialog.append(el('p',t`新增：${additions} · 撤销：${removals}`));
      if(['modelScope','mcpScope','skillsScope'].some(key=>options[key]==='agents'))dialog.append(el('p',t('按 Bot 分配会替换插件的全局分配，请检查所有受影响 Bot。'),'notice'));
      const filter=el('select');
      for(const [value,label] of [['all','全部'],['changed','只看变化'],['conflict','只看冲突']]) {const option=el('option',t(label));option.value=value;filter.append(option);}
      DucoroI18n.setAttribute(filter,'aria-label',t('筛选变更'));
      dialog.append(filter);
      const rendered=[];
      for(const row of data.rows){const node=renderRow(row,(id,item,mode)=>{
        globalThis.DucoroResources.resolveConflict(id,item,mode)
        dialog.close('resolved')
      });rendered.push({row,node});body.append(node);}
      filter.onchange=()=>{for(const {row,node} of rendered)node.hidden=filter.value==='changed'?!changed(row):filter.value==='conflict'?!conflicted(row):false;};
      const caps=el('details');caps.append(el('summary',t('宿主能力检测')))
      const labels={modelCatalog:t('上游模型目录'),botModelWrite:t('Bot 模型命令'),accountPolicy:t('账户权限读取'),accountAdd:t('账户配备命令'),accountUpdate:t('账户权限更新命令'),accountRemove:t('账户撤销命令'),botMcp:t('按 Bot 连接器'),botSkills:t('按 Bot 技能')}
      for(const [key,value]of Object.entries(data.capabilities))caps.append(el('p',t`${labels[key]??key}：${value==='available'?t('本地命令可用，执行权限仍需同步时核实'):value==='unavailable'?t('当前不可用，其他功能可独立同步'):t('尚未确认')}`))
      body.append(caps);dialog.append(body)
      const footer=el('footer',undefined,'button-group'),cancel=el('button',save?t('返回修改'):t('关闭'),'secondary');cancel.type='button';cancel.addEventListener('click',()=>dialog.close())
      footer.append(cancel)
      if(save){const confirm=el('button',t('确认保存并同步'),'primary');confirm.type='button';confirm.disabled=!!data.blocked;confirm.addEventListener('click',()=>dialog.close('save'));footer.append(confirm)}
      dialog.append(footer)
      dialog.addEventListener('close',()=>{const saved=dialog.returnValue==='save';dialog.remove();resolve(saved)},{once:true})
      document.body.append(dialog);dialog.showModal();cancel.focus()
    })
  }
  globalThis.DucoroPreview={show,renderRow}
})()
