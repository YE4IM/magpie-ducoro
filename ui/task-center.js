(() => {
  function mount({card,el,button,actions}){
    const {t,dateTime,statusLabel,featureLabel}=DucoroI18n;
    const root=card('diagnostics',t('任务中心')),box=el('div'),filter=el('select');
    DucoroI18n.setAttribute(filter,'aria-label',t('筛选任务'));
    for(const [value,label] of [['pending','待处理'],['attention','需要处理'],['all','全部']]){const option=el('option',t(label));option.value=value;filter.append(option);}
    const failureLabels={temporary:t('临时故障'),permission:t('权限不足'),conflict:t('配置冲突'),unsupported:t('不支持此操作'),corrupt:t('数据损坏'),unknown:t('结果待核实')};
    let busy=false,last=0,signature;
    async function refresh(){if(busy)return;busy=true;try{
      const result=await ducoroApi('operations');const nextSignature=JSON.stringify([filter.value,result]);if(signature===nextSignature)return;signature=nextSignature;box.replaceChildren();
      box.append(el('p',t`全部：${result.summary.total} · 已完成：${result.summary.completed} · 失败：${result.summary.failed}`));
      const rows=result.operations.filter(row=>filter.value==='all'?true:filter.value==='attention'?row.needsAttention:row.status!=='completed'||row.paused);
      if(!rows.length)box.append(el('p',t('暂无待处理任务。')));
      for(const row of rows){const item=el('section');item.className='task-row';
        item.append(el('p',t`${featureLabel(({gateway:'models',accounts:'accountConnectors',total:'instructions'})[row.feature]??row.feature)} · ${row.target} / ${row.resource} · ${row.paused?t('已暂停'):statusLabel(row.status)}`),el('p',t`尝试次数：${row.attempts} · 更新时间：${dateTime(row.updatedAt)}`));
        if(row.failureClass)item.append(el('p',failureLabels[row.failureClass]));
        if(row.advice)item.append(el('p',t(row.advice)));
        if(row.nextRetryAt && !row.paused)item.append(el('p',t`最早自动重试：${dateTime(row.nextRetryAt)}`));
        if(row.status!=='completed')item.append(actions(...[[t('重试此项'),'retry'],[row.paused?t('恢复此项'):t('暂停此项'),row.paused?'resume':'pause']].map(([label,action])=>button(label,async()=>{await ducoroApi('operations',{id:row.id,action});await refresh();}))));
        box.append(item);
      }
    }finally{busy=false;last=Date.now();}}
    filter.onchange=()=>void refresh().catch(()=>{});
    root.append(actions(button(t('刷新任务'),refresh),filter),box);
    setInterval(()=>{if(!document.hidden&&!document.getElementById('diagnostics').hidden&&Date.now()-last>5000)void refresh().catch(()=>{});},1500);
    document.addEventListener('ducoro-report',()=>void refresh().catch(()=>{}));
  }
  globalThis.DucoroTaskCenter={mount};
})();
