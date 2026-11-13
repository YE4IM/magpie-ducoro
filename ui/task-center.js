(() => {
  function mount({card,el,button,actions}){
    const {t,dateTime,statusLabel,featureLabel}=DucoroI18n;
    const root=card('diagnostics',t('任务中心')),box=el('div'),filter=el('select');
    DucoroI18n.setAttribute(filter,'aria-label',t('筛选任务'));
    for(const [value,label] of [['pending','待处理'],['attention','需要处理'],['all','全部']]){const option=el('option',t(label));option.value=value;filter.append(option);}
    const failureLabels={temporary:t('临时故障'),permission:t('权限不足'),conflict:t('配置冲突'),unsupported:t('不支持此操作'),corrupt:t('数据损坏'),unknown:t('结果待核实')};
    let busy=false,last=0,signature,lastSuccess=null;const stale=el('p');stale.className='notice error';stale.hidden=true;root.append(stale);
    async function refresh(){if(busy)return;busy=true;try{
      const result=await ducoroApi('operations');stale.hidden=true;lastSuccess=Date.now();const nextSignature=JSON.stringify([filter.value,result]);if(signature===nextSignature)return;signature=nextSignature;const oldRows=new Map([...box.querySelectorAll('[data-task-id]')].map(n=>[n.dataset.taskId,n]));const focused=document.activeElement;const activeId=focused.closest?.('[data-task-id]')?.dataset.taskId;box.replaceChildren();
      box.append(el('p',t`全部：${result.summary.total} · 已完成：${result.summary.completed} · 失败：${result.summary.failed}`));
      const rows=result.operations.filter(row=>filter.value==='all'?true:filter.value==='attention'?row.needsAttention:row.status!=='completed'||row.paused);
      rows.sort((a,b)=>Number(b.needsAttention||b.paused)-Number(a.needsAttention||a.paused));if(!rows.length)box.append(el('p',filter.value==='all'?'暂无任务记录。':filter.value==='attention'?'暂无需要处理的任务。':'暂无待处理任务。'));
      for(const row of rows){const item=el('section');item.className='task-row';item.dataset.taskId=row.id;
        item.append(el('p',t`${featureLabel(({gateway:'models',accounts:'accountConnectors',total:'instructions'})[row.feature]??row.feature)} · ${row.target} / ${row.resource} · ${row.paused?t('已暂停'):statusLabel(row.status)}`),el('p',t`尝试次数：${row.attempts} · 更新时间：${DucoroI18n.render(DucoroI18n.dateTime(row.updatedAt),"zh")}`));
        if(row.failureClass)item.append(el('p',failureLabels[row.failureClass]));
        if(row.advice)item.append(el('p',t(row.advice)));
        if(row.nextRetryAt && !row.paused)item.append(el('p',t`最早自动重试：${DucoroI18n.render(DucoroI18n.dateTime(row.nextRetryAt),"zh")}`));
        if(row.status!=='completed')item.append(actions(...[[t('重试此项'),'retry'],[row.paused?t('恢复此项'):t('暂停此项'),row.paused?'resume':'pause']].map(([label,action])=>button(label,async()=>{await ducoroApi('operations',{id:row.id,action});await refresh();}))));
        const old=oldRows.get(row.id);if(old){if(activeId===row.id&&old.textContent!==item.textContent)signature=null;if(activeId!==row.id&&old.textContent!==item.textContent)old.replaceChildren(...item.childNodes);box.append(old);}else box.append(item);
      }
      if(focused?.isConnected&&activeId)focused.focus({preventScroll:true});
    }catch(error){stale.hidden=false;stale.textContent=`更新失败，最后读取于 ${lastSuccess?DucoroI18n.render(DucoroI18n.dateTime(lastSuccess),"zh"):'尚无成功记录'}。${error.message}；请刷新任务重试。`;}finally{busy=false;last=Date.now();}}
    filter.onchange=()=>void refresh().catch(()=>{});
    root.append(actions(button(t('刷新任务'),refresh),filter),box);
    setInterval(()=>{if(!document.hidden&&!document.getElementById('diagnostics').hidden&&Date.now()-last>5000)void refresh().catch(()=>{});},1500);
    document.addEventListener('ducoro-report',()=>void refresh().catch(()=>{}));
  }
  globalThis.DucoroTaskCenter={mount};
})();
