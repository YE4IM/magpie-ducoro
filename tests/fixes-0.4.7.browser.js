(async()=>{
  const results=[],$=id=>document.getElementById(id);
  const check=(name,value,detail)=>{results.push({name,passed:!!value,detail});if(!value)throw Error(name+': '+JSON.stringify(detail));};
  const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI condition timed out');};
  await wait(()=>window.DucoroPlanEditor&&DucoroResources.bots.length===2&&!DucoroResources.refreshing);
  document.querySelector('[data-tab="resources"]').click();
  document.querySelector('.plan-manager').open=true;
  const base=DucoroWorkspace.collect();base.modelScope=base.mcpScope=base.skillsScope='agents';DucoroWorkspace.stage(base);
  for(const mode of ['inherit','none','custom']){
    const value={selected:'',dirty:true,targets:['agt-review'],values:['Mode '+mode,'openai/example','文档检索','代码审查','Text'],modes:{mcp:mode,skills:mode},modelMode:'inherit'};
    DucoroPlanEditor.restore(value);
    const snapshot=DucoroPlanEditor.snapshot();
    check('restore '+mode+' modes',snapshot.modes.mcp===mode&&snapshot.modes.skills===mode&&snapshot.modelMode==='inherit');
    await DucoroPlanEditor.commit();
    const plan=Object.values(DucoroWorkspace.collect().botPlansCatalog).find(p=>p.name==='Mode '+mode);
    check('commit '+mode+' selections',mode==='inherit'?!Object.hasOwn(plan,'mcp')&&!Object.hasOwn(plan,'skills'):mode==='none'?plan.mcp.length===0&&plan.skills.length===0:plan.mcp[0]==='文档检索'&&plan.skills[0]==='代码审查',plan);
    check('hidden model does not override inheritance',!Object.hasOwn(plan,'model'),plan);
  }
  DucoroPlanEditor.restore({selected:'',dirty:true,targets:['agt-review'],values:['Legacy','','','','']});
  await DucoroPlanEditor.commit();
  const legacy=Object.values(DucoroWorkspace.collect().botPlansCatalog).find(p=>p.name==='Legacy');
  check('legacy empty draft keeps inheritance',!Object.hasOwn(legacy,'mcp')&&!Object.hasOwn(legacy,'skills'),legacy);
  DucoroPlanEditor.reset();
  const api=window.ducoroApi;
  try {
    let release,finished=false;
    window.ducoroApi=async(path,...args)=>path==='preview'?new Promise(resolve=>{release=()=>api(path,...args).then(resolve);}):api(path,...args);
    const first=$('check-comparison').onclick().finally(()=>finished=true);
    await wait(()=>release);
    $('targetAgents').value='agt-review';$('targetAgents').dispatchEvent(new Event('input',{bubbles:true}));
    release();await first;
    check('manual old response stays stale',$('comparison-state').textContent.includes('草稿已变化'),$('comparison-state').textContent);
    window.ducoroApi=api;await $('check-comparison').onclick();
    check('current response is accepted',$('comparison-state').textContent.includes('差异检查于'));
    $('connectionSlug').value='another-route';$('connectionSlug').dispatchEvent(new Event('input',{bubbles:true}));
    check('ordinary text edit expires comparison',$('comparison-state').textContent.includes('草稿已变化'));
    await $('check-comparison').onclick();
    $('bot-search').value='审查';$('bot-search').dispatchEvent(new Event('input',{bubbles:true}));
    check('search does not expire comparison',$('comparison-state').textContent.includes('差异检查于'));
    $('bot-filter').value='conflict';$('bot-filter').dispatchEvent(new Event('change',{bubbles:true}));
    check('filter does not expire comparison',$('comparison-state').textContent.includes('差异检查于'));
    $('bot-search').value='';$('bot-filter').value='all';$('bot-filter').dispatchEvent(new Event('change',{bubbles:true}));
    // An older manual request must not supersede a newer roster refresh.
    let oldRelease;window.ducoroApi=async(path,...args)=>{
      if(path==='preview'&&!oldRelease)return new Promise(resolve=>{oldRelease=()=>api(path,...args).then(data=>resolve({...data,updatedAt:'2001-01-01T00:00:00.000Z'}));});
      return api(path,...args);
    };
    const old=$('check-comparison').onclick();await wait(()=>oldRelease);
    await DucoroResources.refresh();const current=$('comparison-state').textContent;
    oldRelease();await old;
    check('newer refresh wins over older manual response',$('comparison-state').textContent===current,{current,after:$('comparison-state').textContent});
  } finally {window.ducoroApi=api;}
  const before=JSON.stringify(DucoroWorkspace.collect());
  DucoroI18n.applyDocument('en');
  check('English switch preserves draft',before===JSON.stringify(DucoroWorkspace.collect()));
  check('English target scope explains revocation',document.querySelector('#targetAgents').parentElement.textContent.includes('managed resources outside this range are revoked'));
  DucoroI18n.applyDocument('zh-CN');
  check('Chinese target scope explains revocation',document.querySelector('#targetAgents').parentElement.textContent.includes('范围外的托管资源会撤销'));
  check('no runtime errors',!(window.testErrors??[]).length,window.testErrors);
  return results;
})()
