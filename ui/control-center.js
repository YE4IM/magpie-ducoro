(async () => {
  await DucoroUIReady;
  const {t,setText,statusLabel,featureLabel,settingLabel,dateTime}=DucoroI18n, $=id=>document.getElementById(id);
  const {actions,mount}=DucoroBackupFiles;
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)setText(node,text);return node;};
  const button=(text,work)=>{const b=el('button',text);b.type='button';b.className='secondary';b.onclick=async()=>{b.disabled=true;try{await work();}catch(e){let note=b.parentElement.querySelector('.local-error');if(!note){note=el('p');note.className='local-error field-error';note.setAttribute('role','alert');b.after(note);}setText(note,t(e.localizedMessage??e.message));}finally{b.disabled=false;}};return b;};
  const field=(label,type='input')=>{const wrap=el('div'),caption=el('label',label),input=el(type);input.id=`plan-field-${crypto.randomUUID()}`;caption.htmlFor=input.id;wrap.append(caption,input);return {wrap,input};};
  const card=(parent,title)=>{const c=el('section');c.className='card';c.append(el('h2',title));$(parent).append(c);return c;};
  const plans=card('resources',t('Bot 配置方案'));
  plans.append(el('p',t('方案持续继承；已有单项选择优先。应用方案与修改方案均先进入草稿，预览保存后生效。')));
  const manager=el('details');manager.className='card plan-manager';manager.append(el('summary','管理方案'),plans);$('resources').append(manager);plans.className='plan-editor';
  const choices=el('select');DucoroI18n.setAttribute(choices,'aria-label',t('配置方案'));plans.append(choices);
  const name=field(t('方案名称')),model=field(t('模型 ID（留空跟随全局）')),mcp=field(t('连接器名称（每行一个）'),'textarea'),skills=field(t('技能名称（每行一个）'),'textarea'),instructions=field(t('追加指令'),'textarea');
  const fields=el('div');fields.className='field-grid';fields.append(name.wrap,model.wrap,mcp.wrap,skills.wrap,instructions.wrap);plans.append(fields);
  const targets=el('div');targets.className='plan-targets';plans.append(el('p',t('选择继承此方案的 Bot')),targets);
  // Native searchable model suggestions preserve unknown IDs typed by users.
  const modelChoices=el('datalist');modelChoices.id='plan-model-choices';model.input.setAttribute('list',modelChoices.id);plans.append(modelChoices);
  const resourcePicker=(field,kind)=>{
    const list=el('div');list.className='choices';const advanced=el('details'),textLabel=el('label','每行一个名称');textLabel.htmlFor=field.input.id;advanced.append(el('summary','高级：按名称输入'),textLabel,field.input);field.wrap.append(list,advanced);
    const searchUpdate=DucoroComponents.searchable(list,kind==='mcp'?'方案连接器':'方案技能');
    const refresh=()=>{list.replaceChildren();const items=DucoroResources.inventory?.library?.[kind]??[],selected=field.input.value.split('\n').filter(Boolean),names=[...new Set([...items.map(x=>x.name),...selected])];
      for(const value of names){const label=el('label'),check=el('input');label.className='choice';check.type='checkbox';check.checked=selected.includes(value);check.onchange=()=>{const values=new Set(field.input.value.split('\n').filter(Boolean));check.checked?values.add(value):values.delete(value);field.input.value=[...values].join('\n');searchUpdate();};label.append(check,el('span',value+(items.some(x=>x.name===value)?'':'（当前不可用）')));list.append(label);}searchUpdate();
    };field.input.oninput=refresh;return refresh;
  };
  const refreshMcp=resourcePicker(mcp,'mcp'),refreshSkills=resourcePicker(skills,'skills');
  const modes={};
  for(const [kind,field] of [['mcp',mcp],['skills',skills]]){const mode=el('select');for(const [value,label] of [['inherit','继承资源库勾选'],['custom','指定资源'],['none','不分配']]){const o=el('option',label);o.value=value;mode.append(o);}mode.setAttribute('aria-label',kind==='mcp'?'方案连接器分配方式':'方案技能分配方式');field.wrap.querySelector('label').after(mode);modes[kind]=mode;mode.onchange=()=>{field.wrap.querySelectorAll('input,textarea,details,.choices,.resource-search').forEach(n=>n.hidden=mode.value!=='custom');editorChanged();};}
  const modelMode=el('select');for(const [value,label]of [['inherit','继承全局模型'],['custom','指定模型']]){const o=el('option',label);o.value=value;modelMode.append(o);}modelMode.setAttribute('aria-label','方案模型分配方式');model.wrap.querySelector('label').after(modelMode);modelMode.onchange=()=>{model.input.hidden=modelMode.value!=='custom';editorChanged();};
  const scopeNotice=el('p','应用到 Bot 前请确认作用域变化。');plans.append(scopeNotice);
  let selected='';
  let targetDraft = null;
  let editorDirty=false;
  const editorChanged=()=>{editorDirty=true;document.dispatchEvent(new Event('ducoro-editor-change'));};
  const onEditorInput=event=>{if(event.target.type!=='search'&&!event.target.closest('.resource-search'))editorChanged();};fields.addEventListener('input',onEditorInput);fields.addEventListener('change',onEditorInput);
  globalThis.DucoroPlanEditor={snapshot:()=>({selected,dirty:editorDirty,targets:targetDraft?[...targetDraft]:null,modes:Object.fromEntries(Object.entries(modes).map(([k,v])=>[k,v.value])),modelMode:modelMode.value,values:[name,model,mcp,skills,instructions].map(f=>f.input.value)}),restore(value){if(!value||!Array.isArray(value.values)||value.values.length!==5)return;for(const [k,v]of Object.entries(modes))v.value=value.modes?.[k]??'custom';modelMode.value=value.modelMode??(value.values[1]?'custom':'inherit');selected=typeof value.selected==='string'?value.selected:'';editorDirty=!!value.dirty;targetDraft=Array.isArray(value.targets)?new Set(value.targets):null;[name,model,mcp,skills,instructions].forEach((f,i)=>{f.input.value=String(value.values[i]??'');});refreshPlans();document.dispatchEvent(new Event('ducoro-editor-change'));}};
  addEventListener('beforeunload',event=>{if(editorDirty||globalThis.DucoroWorkspace?.dirty()){event.preventDefault();event.returnValue='';}});
  function refreshPlans(){
    if(!globalThis.DucoroWorkspace?.ready())return;
    refreshMcp();refreshSkills();modelChoices.replaceChildren();
    const targetPicker=$('target-picker');targetPicker.replaceChildren();for(const bot of DucoroResources.bots){const label=el('label'),check=el('input');label.className='choice';check.type='checkbox';check.checked=$('targetAgents').value.split('\n').includes(bot.id);check.onchange=()=>{const values=new Set($('targetAgents').value.split('\n').filter(Boolean));check.checked?values.add(bot.id):values.delete(bot.id);$('targetAgents').value=[...values].join('\n');$('targetAgents').dispatchEvent(new Event('input',{bubbles:true}));};label.append(check,el('span',bot.name+' · '+bot.id));targetPicker.append(label);}

    const roles=$('subagent-picker');roles.replaceChildren();for(const item of DucoroResources.inventory?.library?.subagents??[]){const label=el('label'),check=el('input');label.className='choice';check.type='checkbox';check.checked=$('subagentNames').value.split('\n').includes(item.name);check.onchange=()=>{const values=new Set($('subagentNames').value.split('\n').filter(Boolean));check.checked?values.add(item.name):values.delete(item.name);$('subagentNames').value=[...values].join('\n');$('subagentNames').dispatchEvent(new Event('input',{bubbles:true}));};label.append(check,el('span',item.name));roles.append(label);}if(!roles.children.length)roles.append(el('p','暂无可枚举子代理，可在上方按名称输入。'));
    for(const item of DucoroResources.inventory?.models??[]){const option=el('option');option.value=typeof item==='string'?item:item.id;modelChoices.append(option);}
    for(const [k,v]of Object.entries(modes)){const field=k==='mcp'?mcp:skills;field.wrap.querySelectorAll('input,textarea,details,.choices,.resource-search').forEach(n=>n.hidden=v.value!=='custom');}model.input.hidden=modelMode.value!=='custom';
    const draft=DucoroWorkspace.collect();choices.replaceChildren();const fresh=el('option',t('新建方案'));fresh.value='';choices.append(fresh);
    for(const [id,p] of Object.entries(draft.botPlansCatalog??{})){const option=el('option',p.name??id);option.value=id;choices.append(option);}
    choices.value=selected;
    targets.replaceChildren();for(const bot of DucoroResources.bots??[]){const row=el('label'),check=el('input');check.type='checkbox';check.value=bot.id;check.checked=targetDraft ? targetDraft.has(bot.id) : !!selected&&draft.botPlans?.[bot.id]===selected;check.onchange=()=>{targetDraft=new Set([...targets.querySelectorAll('input:checked')].map(x=>x.value));editorChanged();};row.append(check,el('span',bot.name));targets.append(row);}
  }
  const discardEditor=()=>new Promise(resolve=>{
    const dialog=el('dialog');dialog.className='preview-dialog';dialog.append(el('h2','切换方案'));const cancel=el('button',t('取消')),accept=el('button',t('确认'));
    cancel.type=accept.type='button';cancel.onclick=()=>dialog.close();accept.onclick=()=>dialog.close('discard');
    dialog.append(el('p',t('放弃尚未提交的方案编辑？')),actions(cancel,accept));
    dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='discard';dialog.remove();resolve(accepted);},{once:true});document.body.append(dialog);dialog.showModal();cancel.focus();
  });
  choices.onchange=async()=>{const next=choices.value;choices.value=selected;if(editorDirty&&!await discardEditor())return;editorDirty=false;selected=next;targetDraft=null;const plan=DucoroWorkspace.collect().botPlansCatalog?.[selected]??{};name.input.value=plan.name??'';model.input.value=plan.model??'';mcp.input.value=plan.mcp?.join('\n')??'';skills.input.value=plan.skills?.join('\n')??'';instructions.input.value=plan.instructions??'';for(const [k,v]of Object.entries(modes))v.value=plan[k]===undefined?'inherit':plan[k].length?'custom':'none';modelMode.value=plan.model?'custom':'inherit';refreshPlans();document.dispatchEvent(new Event('ducoro-editor-change'));};
  const commit=async()=>{
    if(!editorDirty)return;
    if(!name.input.value.trim()){DucoroComponents.fieldError(name.input,'请填写方案名称');throw DucoroI18n.error(t('请填写方案名称'));}
    if(modelMode.value==='custom'&&!model.input.value.trim()){DucoroComponents.fieldError(model.input,'请填写指定模型 ID');throw Error('请填写指定模型 ID');}
    const draft=DucoroWorkspace.collect(),id=selected||`plan-${crypto.randomUUID().slice(0,8)}`;
    const split=input=>[...new Set(input.value.split('\n').map(s=>s.trim()).filter(Boolean))];
    draft.botPlansCatalog??={};draft.botPlansCatalog[id]={name:name.input.value.trim(),...(modelMode.value==='custom'?{model:model.input.value.trim()}:{}),...Object.fromEntries(Object.entries(modes).filter(([,v])=>v.value!=='inherit').map(([k,v])=>[k,v.value==='none'?[]:split(k==='mcp'?mcp.input:skills.input)])),instructions:instructions.input.value};
    draft.botPlans??={};for(const check of targets.querySelectorAll('input'))if(check.checked)draft.botPlans[check.value]=id;else if(draft.botPlans[check.value]===id)delete draft.botPlans[check.value];
    if([...targets.querySelectorAll('input')].some(x=>x.checked)){
      const changed=['modelScope','mcpScope','skillsScope'].filter(k=>draft[k]!=='agents');
      if(changed.length&&!await confirmScopes(changed,draft))return false;
      draft.modelScope='agents';draft.mcpScope='agents';draft.skillsScope='agents';
    }
    editorDirty=false;selected=id;DucoroWorkspace.stage(draft);refreshPlans();return true;
  };
  Object.assign(globalThis.DucoroPlanEditor,{commit:async()=>{if(await commit()===false)throw Error('已取消方案应用；编辑已保留');},reset(){editorDirty=false;selected='';targetDraft=null;modelMode.value='inherit';Object.values(modes).forEach(v=>v.value='inherit');[name,model,mcp,skills,instructions].forEach(f=>f.input.value='');refreshPlans();document.dispatchEvent(new Event('ducoro-editor-change'));}});
  plans.append(actions(button(t('更新方案草稿'),commit),button(t('删除方案草稿'),()=>{
    if(!selected)return;const draft=DucoroWorkspace.collect();if(Object.values(draft.botPlans??{}).includes(selected))throw DucoroI18n.error(t('请先取消所有 Bot 对此方案的继承'));delete draft.botPlansCatalog[selected];selected='';DucoroWorkspace.stage(draft);choices.onchange();
  })));
  plans.append(el('p',t('每类资源可继承、指定或不分配；账户权限不会随方案复制。Bot 单项覆盖优先。')));

  function confirmScopes(keys,draft){return new Promise(resolve=>{const dialog=el('dialog');dialog.className='preview-dialog';dialog.append(el('h2','确认全局作用域变化'),el('p',`将改为按 Bot 分配：${keys.map(k=>({modelScope:'模型',mcpScope:'连接器',skillsScope:'技能'})[k]).join('、')}。会重新计算全部 ${DucoroResources.bots.length} 个 Bot 的有效配置；未选择此方案的 Bot 也可能受影响。`));const cancel=el('button','返回修改'),ok=el('button','确认范围并加入草稿');cancel.onclick=()=>dialog.close();ok.onclick=()=>dialog.close('ok');dialog.append(actions(cancel,ok));dialog.onclose=()=>{resolve(dialog.returnValue==='ok');dialog.remove();};document.body.append(dialog);dialog.showModal();});}

  const live=card('diagnostics',t('同步进度与耗时'));const progressBox=el('div');live.append(progressBox);
  let polling=false,nextPoll=0,pollDelay=1500,progressRead=null;
  const stepNames={'revoke-skills':t('撤销旧技能'),mcp:t('连接器'),skills:t('技能'),'instructions-subagents':t('指令与子代理'),accounts:t('账户权限'),models:t('模型')};
  async function progress(){if(polling||document.hidden)return;polling=true;try{const report=await ducoroApi('progress');live.querySelector('.poll-error')?.remove();const historyOpen=progressBox.querySelector('details')?.open;progressRead=new Date().toISOString();progressBox.replaceChildren();const row=report.current;pollDelay=row?.running?1500:10000;if(!row){progressBox.append(el('p',t('暂无同步记录')));return;}progressBox.append(el('p',row.running?t('正在同步'):t('本轮已结束')));for(const step of row.steps)progressBox.append(el('p',t`${stepNames[step.name]??step.name} · ${statusLabel(step.status)} · ${step.durationMs??0} ms`));if(row.metrics)progressBox.append(el('p',t`CLI：${row.metrics.calls} · 合并读取：${row.metrics.shared} · 文件读取：${row.metrics.reads??0} · 总耗时：${row.durationMs} ms`));const history=el('details');history.open=!!historyOpen;history.append(el('summary',t('最近同步记录')));for(const item of report.history??[])history.append(el('p',t`${DucoroI18n.render(DucoroI18n.dateTime(item.startedAt),"zh")} · ${item.durationMs} ms`));progressBox.append(history);}catch(error){let note=live.querySelector('.poll-error');if(!note){note=el('p');note.className='poll-error notice error';live.prepend(note);}setText(note,`更新失败，最后读取于 ${progressRead?DucoroI18n.render(DucoroI18n.dateTime(progressRead),"zh"):'尚无记录'}：${error.message}；请刷新进度重试。`);}finally{polling=false;}}
  live.append(actions(button(t('刷新进度'),progress),button(t('重试待处理部分'),async()=>{await ducoroApi('retry-failed',{});await progress();})));
  setInterval(()=>{if(!$('diagnostics').hidden&&!document.hidden&&Date.now()>=nextPoll){nextPoll=Date.now()+pollDelay;void progress();}},1500);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){nextPoll=0;if(!$('diagnostics').hidden)void progress();}});
  document.addEventListener('ducoro-saving',()=>{void progress();});

  globalThis.DucoroTaskCenter.mount({card,el,button,actions});
  const drift=card('diagnostics',t('配置漂移中心')),driftBox=el('div');
  drift.append(el('p',t('比较期望配置、当前配置和上次应用记录。内容证据不足的资源保留待核实。')));
  drift.append(button(t('检查配置漂移'),async()=>{
    const result=await ducoroApi('drift');driftBox.replaceChildren();if(result.unknown)driftBox.append(el('p',t('待核实')));
    for(const row of result.rows){const line=el('div');line.className='drift-row';line.append(el('p',t`${row.target} · ${featureLabel(row.feature)} · ${statusLabel(row.status)}`));if(row.feature==='models'&&row.current){line.append(el('p',t`期望：${row.expected??'—'} · 当前：${row.current} · 上次应用：${row.applied??'—'}`));
      for(const [label,mode] of [[t('采用当前模型'),'keep'],[t('重新应用期望模型'),'reapply'],[t('暂停此 Bot 模型管理'),'pause']])line.append(button(label,async()=>{
        const fresh=await ducoroApi('drift'),current=fresh.rows.find(x=>x.feature==='models'&&x.target===row.target);if(current?.revision!==row.revision)throw DucoroI18n.error(t('配置已变化，请重新检查'));
        const draft=DucoroWorkspace.collect();draft.pausedModels=(draft.pausedModels??[]).filter(x=>x!==row.target);
        if(mode==='keep'){draft.modelScope='agents';draft.botModels[row.target]=row.current;}
        if(mode==='pause')draft.pausedModels.push(row.target);
        if(mode==='reapply') { if(!row.expected)throw DucoroI18n.error(t('待核实')); draft.modelGuards??={};draft.modelGuards[row.target]={revision:row.revision,model:row.expected}; }
        DucoroWorkspace.stage(draft);
      }));}
      driftBox.append(line);
    }
  }),driftBox);

  const restore=card('checkpoint-section',t('配置检查点与选择性回退')),checkpointBox=el('div');
  restore.append(el('p',t('手动备份保存已保存的配置，不含草稿；列表显示与当前配置的差异。')));
  restore.append(el('p',t('检查点记录保存前后的期望配置。选定项目会恢复到草稿，仍需预览保存；资源正文及运行中会话不属于配置检查点。')));
  const formatValue=v=>v===null?'无':typeof v==='boolean'?(v?'开启':'关闭'):Array.isArray(v)?(v.join('、')||'不分配'):typeof v==='object'?Object.keys(v).join('、')||'空配置':String(v);
  async function refreshCheckpoints(){
    const listing=await ducoroApi('checkpoints');checkpointBox.replaceChildren();if(!listing.checkpoints.length)checkpointBox.append(el('p',t('暂无配置检查点')));
    for(const c of listing.checkpoints){const details=el('details');details.append(el('summary',t`${c.name||DucoroI18n.render(DucoroI18n.dateTime(c.createdAt),"zh")} · ${c.changes.length}`),DucoroBackupFiles.details('checkpoints',c,refreshCheckpoints));
      for(const [index,row] of c.changes.entries()){const label=el('label'),check=el('input');label.className='choice';check.type='checkbox';check.value=index;check.dataset.rollback='true';label.append(check,el('span',t`${settingLabel(row.key)} · ${row.target}`));details.append(label);details.append(el('p',`变化：${formatValue(row.before)} → ${formatValue(row.after)}`));const raw=el('details');raw.append(el('summary','原始差异'),el('pre',JSON.stringify({before:row.before,after:row.after},null,2)));details.append(raw);}
      details.addEventListener('change',event=>{if(!event.target.matches('input[type=checkbox][data-rollback]'))return;const checks=[...details.querySelectorAll('input[data-rollback]')];let more=true;while(more){more=false;for(const check of checks.filter(x=>x.checked)){const row=c.changes[Number(check.value)];for(const other of checks){const target=c.changes[Number(other.value)];if(!other.checked&&((row.key==='botPlans'&&(target.key==='botPlansCatalog'&&[row.before,row.after].includes(target.target)||['modelScope','mcpScope','skillsScope'].includes(target.key)))||(row.key==='botPlansCatalog'&&target.key==='botPlans'&&[target.before,target.after].includes(row.target)))){other.checked=true;more=true;}}}}});
      details.append(button(t('将选定项目恢复到草稿'),async()=>{const selections=[...details.querySelectorAll('input[data-rollback]:checked')].map(x=>Number(x.value));if(!selections.length)throw DucoroI18n.error(t('请选择要恢复的项目'));if(DucoroWorkspace.dirty())throw DucoroI18n.error(t('请先保存或处理当前草稿'));const result=await ducoroApi('rollback-preview',{id:c.id,selections,revision:listing.revision});DucoroWorkspace.stage(result.options);}));checkpointBox.append(details);
    }
  }
  const checkpointActions=actions(button(t('查看配置检查点'),refreshCheckpoints)),checkpointMessage=el('p');checkpointMessage.setAttribute('role','status');
  restore.append(checkpointActions,checkpointMessage,checkpointBox);
  mount({kind:'checkpoints',toolbar:checkpointActions,messageBox:checkpointMessage,refresh:refreshCheckpoints});
  const diagnostics=$('diagnostics');
  const group=(title,nodes)=>{const section=el('details');section.className='card';section.append(el('summary',t(title)),...nodes);diagnostics.append(section);};
  const state=$('retry-state').closest('section'),verification=$('verify-results').closest('section');
  group('进度与记录',[live]);
  group('配置核验',[verification,drift]);
  group('异常排查',[state]);
  const lockBox=el('pre');state.append(button(t('检查同步锁'),async()=>{const result=await ducoroApi('lock');setText(lockBox,JSON.stringify(result,null,2)+'\nnode scripts/recover-lock.mjs STATE_DIR [TOKEN --all-hosts-stopped]');}),lockBox);
  state.append(button(t('前往备份管理'),()=>document.querySelector('[data-tab="backups"]').click()));
  const note=el('p');note.id='control-message';note.setAttribute('role','status');$('save-bar').before(note);
  document.addEventListener('ducoro-workspace',refreshPlans);document.addEventListener('ducoro-inventory',refreshPlans);refreshPlans();
})();
