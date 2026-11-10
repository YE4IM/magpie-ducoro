(async () => {
  await DucoroUIReady;
  const {t,setText,statusLabel,featureLabel,settingLabel,dateTime}=DucoroI18n, $=id=>document.getElementById(id);
  const {actions,mount}=DucoroBackupFiles;
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)setText(node,text);return node;};
  const button=(text,work)=>{const b=el('button',text);b.type='button';b.className='secondary';b.onclick=async()=>{b.disabled=true;try{await work();}catch(e){setText($('control-message'),t(e.localizedMessage??e.message));}finally{b.disabled=false;}};return b;};
  const field=(label,type='input')=>{const wrap=el('label',label),input=el(type);wrap.append(input);return {wrap,input};};
  const card=(parent,title)=>{const c=el('section');c.className='card';c.append(el('h2',title));$(parent).append(c);return c;};
  const plans=card('resources',t('Bot 配置方案'));
  plans.append(el('p',t('方案持续继承；已有单项选择优先。应用方案与修改方案均先进入草稿，预览保存后生效。')));
  $('resources').insertBefore(plans,$('resources').children[2]);
  const choices=el('select');DucoroI18n.setAttribute(choices,'aria-label',t('配置方案'));plans.append(choices);
  const name=field(t('方案名称')),model=field(t('模型 ID（留空跟随全局）')),mcp=field(t('连接器名称（每行一个）'),'textarea'),skills=field(t('技能名称（每行一个）'),'textarea'),instructions=field(t('追加指令'),'textarea');
  const fields=el('div');fields.className='field-grid';fields.append(name.wrap,model.wrap,mcp.wrap,skills.wrap,instructions.wrap);plans.append(fields);
  const targets=el('div');targets.className='plan-targets';plans.append(el('p',t('选择继承此方案的 Bot')),targets);
  // Native searchable model suggestions preserve unknown IDs typed by users.
  const modelChoices=el('datalist');modelChoices.id='plan-model-choices';model.input.setAttribute('list',modelChoices.id);plans.append(modelChoices);
  const resourcePicker=(field,kind)=>{
    const search=el('input');search.type='search';DucoroI18n.setAttribute(search,'placeholder',t('搜索可用资源'));
    const list=el('div');field.wrap.append(search,list);
    const refresh=()=>{list.replaceChildren();const items=DucoroResources.inventory?.library?.[kind]??[];
      for(const item of items){const value=item.name;if(!value.toLowerCase().includes(search.value.toLowerCase()))continue;
        const label=el('label'),check=el('input');check.type='checkbox';check.checked=field.input.value.split('\n').includes(value);
        check.onchange=()=>{const values=new Set(field.input.value.split('\n').filter(Boolean));check.checked?values.add(value):values.delete(value);field.input.value=[...values].join('\n');};label.append(check,el('span',value));list.append(label);}
    };search.oninput=refresh;field.input.oninput=refresh;return refresh;
  };
  const refreshMcp=resourcePicker(mcp,'mcp'),refreshSkills=resourcePicker(skills,'skills');
  let selected='';
  let targetDraft = null;
  let editorDirty=false;
  const editorChanged=()=>{editorDirty=true;document.dispatchEvent(new Event('ducoro-editor-change'));};
  fields.addEventListener('input',editorChanged);fields.addEventListener('change',editorChanged);
  globalThis.DucoroPlanEditor={snapshot:()=>({selected,dirty:editorDirty,targets:targetDraft?[...targetDraft]:null,values:[name,model,mcp,skills,instructions].map(f=>f.input.value)}),restore(value){if(!value||!Array.isArray(value.values)||value.values.length!==5)return;selected=typeof value.selected==='string'?value.selected:'';editorDirty=!!value.dirty;targetDraft=Array.isArray(value.targets)?new Set(value.targets):null;[name,model,mcp,skills,instructions].forEach((f,i)=>{f.input.value=String(value.values[i]??'');});refreshPlans();}};
  addEventListener('beforeunload',event=>{if(editorDirty){event.preventDefault();event.returnValue='';}});
  function refreshPlans(){
    if(!globalThis.DucoroWorkspace?.ready())return;
    refreshMcp();refreshSkills();modelChoices.replaceChildren();
    for(const item of DucoroResources.inventory?.models??[]){const option=el('option');option.value=typeof item==='string'?item:item.id;modelChoices.append(option);}
    const draft=DucoroWorkspace.collect();choices.replaceChildren();const fresh=el('option',t('新建方案'));fresh.value='';choices.append(fresh);
    for(const [id,p] of Object.entries(draft.botPlansCatalog??{})){const option=el('option',p.name??id);option.value=id;choices.append(option);}
    choices.value=selected;
    targets.replaceChildren();for(const bot of DucoroResources.bots??[]){const row=el('label'),check=el('input');check.type='checkbox';check.value=bot.id;check.checked=targetDraft ? targetDraft.has(bot.id) : !!selected&&draft.botPlans?.[bot.id]===selected;check.onchange=()=>{targetDraft=new Set([...targets.querySelectorAll('input:checked')].map(x=>x.value));editorChanged();};row.append(check,el('span',bot.name));targets.append(row);}
  }
  choices.onchange=()=>{if(editorDirty&&!confirm(String(t('放弃尚未提交的方案编辑？')))){choices.value=selected;return;}editorDirty=false;selected=choices.value;targetDraft=null;const plan=DucoroWorkspace.collect().botPlansCatalog?.[selected]??{};name.input.value=plan.name??'';model.input.value=plan.model??'';mcp.input.value=plan.mcp?.join('\n')??'';skills.input.value=plan.skills?.join('\n')??'';instructions.input.value=plan.instructions??'';refreshPlans();};
  plans.append(actions(button(t('更新方案草稿'),()=>{
    if(!name.input.value.trim())throw DucoroI18n.error(t('请填写方案名称'));
    const draft=DucoroWorkspace.collect(),id=selected||`plan-${crypto.randomUUID().slice(0,8)}`;
    const split=input=>[...new Set(input.value.split('\n').map(s=>s.trim()).filter(Boolean))];
    draft.botPlansCatalog??={};draft.botPlansCatalog[id]={name:name.input.value.trim(),...(model.input.value.trim()?{model:model.input.value.trim()}:{}),mcp:split(mcp.input),skills:split(skills.input),instructions:instructions.input.value};
    draft.botPlans??={};for(const check of targets.querySelectorAll('input'))if(check.checked)draft.botPlans[check.value]=id;else if(draft.botPlans[check.value]===id)delete draft.botPlans[check.value];
    if([...targets.querySelectorAll('input')].some(x=>x.checked)){draft.modelScope='agents';draft.mcpScope='agents';draft.skillsScope='agents';}
    editorDirty=false;selected=id;DucoroWorkspace.stage(draft);refreshPlans();
  }),button(t('删除方案草稿'),()=>{
    if(!selected)return;const draft=DucoroWorkspace.collect();if(Object.values(draft.botPlans??{}).includes(selected))throw DucoroI18n.error(t('请先取消所有 Bot 对此方案的继承'));delete draft.botPlansCatalog[selected];selected='';DucoroWorkspace.stage(draft);choices.onchange();
  })));
  plans.append(el('p',t('空资源列表表示不分配；账户权限不会随方案复制。Bot 原有单项覆盖可在资源卡片中清除。')));

  const live=card('diagnostics',t('同步进度与耗时'));const progressBox=el('div');live.append(progressBox);
  let polling=false,nextPoll=0,pollDelay=1500;
  const stepNames={'revoke-skills':t('撤销旧技能'),mcp:t('连接器'),skills:t('技能'),'instructions-subagents':t('指令与子代理'),accounts:t('账户权限'),models:t('模型')};
  async function progress(){if(polling||document.hidden)return;polling=true;try{const report=await ducoroApi('progress');progressBox.replaceChildren();const row=report.current;pollDelay=row?.running?1500:10000;if(!row){progressBox.append(el('p',t('暂无同步记录')));return;}progressBox.append(el('p',row.running?t('正在同步'):t('本轮已结束')));for(const step of row.steps)progressBox.append(el('p',t`${stepNames[step.name]??step.name} · ${statusLabel(step.status)} · ${step.durationMs??0} ms`));if(row.metrics)progressBox.append(el('p',t`CLI：${row.metrics.calls} · 合并读取：${row.metrics.shared} · 文件读取：${row.metrics.reads??0} · 总耗时：${row.durationMs} ms`));const history=el('details');history.append(el('summary',t('最近同步记录')));for(const item of report.history??[])history.append(el('p',t`${dateTime(item.startedAt)} · ${item.durationMs} ms`));progressBox.append(history);}catch{}finally{polling=false;}}
  live.append(actions(button(t('刷新进度'),progress),button(t('重试待处理部分'),async()=>{await ducoroApi('retry-failed',{});await progress();})));
  setInterval(()=>{if(!$('diagnostics').hidden&&!document.hidden&&Date.now()>=nextPoll){nextPoll=Date.now()+pollDelay;void progress();}},1500);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){nextPoll=0;if(!$('diagnostics').hidden)void progress();}});
  document.addEventListener('ducoro-saving',()=>{void progress();});

  const operationsCard=card('diagnostics',t('单项失败与暂停')),operationsBox=el('div');
  const failureLabels={temporary:t('临时故障'),permission:t('权限不足'),conflict:t('配置冲突')};
  const refreshOperations=async()=>{const result=await ducoroApi('operations');operationsBox.replaceChildren();for(const row of result.operations){const item=el('div');item.append(el('p',`${row.target} / ${row.resource} · ${failureLabels[row.failureClass]??row.failureClass} · ${row.attempts} · ${row.paused?t('已暂停'):statusLabel(row.status)}`));for(const [label,action] of [[t('重试此项'),'retry'],[row.paused?t('恢复此项'):t('暂停此项'),row.paused?'resume':'pause']])item.append(button(label,async()=>{await ducoroApi('operations',{id:row.id,action});await refreshOperations();}));operationsBox.append(item);}};
  operationsCard.append(button(t('查看失败项'),refreshOperations),operationsBox);
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
  async function refreshCheckpoints(){
    const listing=await ducoroApi('checkpoints');checkpointBox.replaceChildren();if(!listing.checkpoints.length)checkpointBox.append(el('p',t('暂无配置检查点')));
    for(const c of listing.checkpoints){const details=el('details');details.append(el('summary',t`${c.name||dateTime(c.createdAt)} · ${c.changes.length}`),DucoroBackupFiles.details('checkpoints',c,refreshCheckpoints));
      for(const [index,row] of c.changes.entries()){const label=el('label'),check=el('input');label.className='choice';check.type='checkbox';check.value=index;check.dataset.rollback='true';label.append(check,el('span',t`${settingLabel(row.key)} · ${row.target}`));details.append(label);details.append(el('p',t('保存前')),el('pre',JSON.stringify(row.before,null,2)),el('p',t('保存后')),el('pre',JSON.stringify(row.after,null,2)));}
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
