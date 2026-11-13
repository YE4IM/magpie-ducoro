(async()=>{
 const results=[];const assert=(name,value,detail)=>{results.push({name,passed:!!value,...(detail===undefined?{}:{detail})});};
 const $=id=>document.getElementById(id),wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('UI condition timed out');};
 const change=(node,value)=>{if(node.type==='checkbox')node.checked=value;else node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));};
 const clickText=(root,text)=>{const button=[...root.querySelectorAll('button')].find(x=>x.textContent===text);if(!button)throw Error('Missing button '+text);button.click();return button;};
 await wait(()=>window.DucoroPlanEditor&&DucoroResources.bots.length===2);
 assert('no runtime errors',!window.testErrors?.length,window.testErrors);
 document.querySelector('[data-tab="resources"]').click();
 assert('Bot list precedes collapsed plan editor',document.querySelector('.plan-manager').compareDocumentPosition($('assignments'))&Node.DOCUMENT_POSITION_PRECEDING);
 assert('scope settings start collapsed',!document.querySelector('#resources>details:not(.plan-manager)').open);
 document.querySelector('.plan-manager').open=true;
 const name=document.querySelector('.plan-editor .field-grid>div:first-child input');name.value='仅编辑方案';name.dispatchEvent(new Event('input',{bubbles:true}));
 assert('plan-only edit enables save',!$('save').disabled&&DucoroWorkspace.dirty());
 const saving=clickText(document,'预览并保存');await wait(()=>document.getElementById('preview-title'));
 const payload=auditCalls.filter(x=>x.path==='preview').at(-1).body;
 assert('preview includes pending plan',Object.values(payload.botPlansCatalog).some(x=>x.name==='仅编辑方案'));
 assert('global change excluded from Bot count',document.querySelector('dialog').textContent.includes('受影响 Bot：0')&&document.querySelector('dialog').textContent.includes('全局资源变化：有'));
 document.querySelector('dialog footer button').click();await wait(()=>!document.querySelector('dialog'));
 change(document.querySelector('[aria-label="方案连接器分配方式"]'),'custom');
 assert('checkbox has compact dimensions',[...document.querySelectorAll('.plan-editor .choice input')].filter(x=>x.getBoundingClientRect().width>0).every(x=>x.getBoundingClientRect().width===17&&x.getBoundingClientRect().height===17));
 assert('no nested labels',!document.querySelector('label label'));
 // Canceling scope changes keeps the edit and avoids hidden global changes.
 change(document.querySelector('.plan-targets input'),true);const pending=DucoroPlanEditor.commit().then(()=>false,()=>true);await wait(()=>document.querySelector('dialog'));
 assert('plan application discloses all Bot scope impact',document.querySelector('dialog').textContent.includes('全部 2 个 Bot'));
 document.querySelector('dialog button').click();assert('scope cancel preserves pending editor',await pending&&DucoroPlanEditor.snapshot().dirty&&DucoroWorkspace.collect().modelScope==='global');
 DucoroPlanEditor.reset();
 const next=DucoroWorkspace.collect();next.modelScope=next.mcpScope=next.skillsScope='agents';DucoroWorkspace.stage(next);
 const card=$('assignments').firstElementChild,details=[...card.querySelectorAll('details.resource-picker')];details[0].open=true;details[1].open=false;
 await DucoroResources.refresh();const renewed=[...$('assignments').firstElementChild.querySelectorAll('details.resource-picker')];assert('connector and skill expansion remain independent',renewed[0].open&&!renewed[1].open);
 // Optional preview read failure must remain distinct from zero known conflicts.
 faults.preview=true;await DucoroResources.refresh();change($('bot-filter'),'conflict');
 assert('preview failure explicitly remains unchecked',$('comparison-state').textContent.includes('不能据此确认零冲突'));
 assert('failed conflict check preserves visible Bots',[...$('assignments').children].filter(x=>!x.hidden).length===2);
 delete faults.preview;change($('bot-filter'),'all');
 // Loading dialog is visible before data resolves and cancellation cannot write settings.
 const api=window.ducoroApi;window.ducoroApi=async(path,body,opts)=>{if(path==='preview')return new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(Error('aborted'))));return api(path,body,opts);};
 const waiting=DucoroPreview.show(DucoroWorkspace.collect());await wait(()=>document.querySelector('dialog'));
 assert('preview waiting provides visible cancel',document.querySelector('dialog').textContent.includes('取消等待'));
 document.querySelector('dialog button').click();assert('cancel preview resolves without saving',await waiting===false);window.ducoroApi=api;
 assert('idle verification does not claim completion',!$('verification-results').textContent.includes('核验已完成')&&$('verification-results').textContent.includes('尚未核验'));
 // Pause/resume status survives a fresh read, and read-only state check never retries sync.
 window.ducoroApi=async(path,body,opts)=>path==='state-status'?{pending:true,readable:true}:api(path,body,opts);
 await DucoroRestoreReview.refresh();assert('persistent restore pause banner',!$('restore-banner').hidden);
 const retries=auditCalls.filter(x=>x.path==='retry').length;$('retry-state').click();await wait(()=>$('state-message').textContent.length>0);assert('read-only management check never retries sync',auditCalls.filter(x=>x.path==='retry').length===retries);
 window.ducoroApi=api;await DucoroRestoreReview.refresh();
 document.querySelector('[data-tab="diagnostics"]').click();await wait(()=>auditCalls.some(x=>x.path==='operations'));
 faults.operations=true;clickText(document,'刷新任务');await wait(()=>document.querySelector('#diagnostics .notice.error:not([hidden])'));assert('task read failure retains stale notice',[...document.querySelectorAll('#diagnostics p')].some(x=>x.textContent.includes('最后读取于')));delete faults.operations;
 // Filter-only searches are independent of the editor dirty flag.
 DucoroPlanEditor.reset();const search=document.querySelector('[aria-label="搜索方案连接器"]');search.value='文档';search.dispatchEvent(new Event('input',{bubbles:true}));assert('resource search does not dirty plan',!DucoroPlanEditor.snapshot().dirty);
 assert('no object descriptors leak into text',!document.body.textContent.includes('[object Object]'));
 // Stable focus while a Bot card is rebuilt.
 document.querySelector('[data-tab="resources"]').click();await DucoroResources.refresh();
 const focusedModel=$('assignments').querySelector('select');focusedModel.focus();const same=DucoroWorkspace.collect();same.syncSkills=!same.syncSkills;DucoroResources.updateSettings(same);assert('Bot control keeps focus on rebuild',document.activeElement.getAttribute('aria-label')===focusedModel.getAttribute('aria-label'));
 // Empty roster and long/untrusted names remain text, with an honest empty state.
 await wait(()=>!DucoroResources.refreshing);const originalApi=window.ducoroApi;let scenario='empty';window.ducoroApi=async(path,body,opts)=>{if(path==='inventory'){const inv=await originalApi(path,body,opts);if(scenario==='empty')inv.bots=[];else inv.bots=[{...inv.bots[0],name:'<img src=x onerror=alert(1)> 很长的中文名称'.repeat(8)}];return inv;}return originalApi(path,body,opts);};
 await DucoroResources.refresh();assert('empty roster shows explicit empty state',!$('assignment-empty').hidden&&!$('assignments').children.length);
 scenario='long';await DucoroResources.refresh();assert('long and special Bot names stay literal text',$('assignments').textContent.includes('<img src=x')&&!$('assignments').querySelector('img'));
 window.ducoroApi=originalApi;await DucoroResources.refresh();
 return results;
})()
