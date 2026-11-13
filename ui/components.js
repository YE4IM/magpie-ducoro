// Shared native UI behavior. External labels are always assigned as text.
(() => {
  const {t}=DucoroI18n;
  const make=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)DucoroI18n.setText(n, text);return n;};
  let sequence=0;
  function reveal(node){if(!node)return;const panel=node.closest(".tab-content");if(panel?.hidden)document.querySelector(`[data-tab="${panel.id}"]`)?.click();for(let p=node.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;node.tabIndex=-1;node.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});node.focus({preventScroll:true});node.classList.add('located');setTimeout(()=>node.classList.remove('located'),2500);}
  function fieldError(input,text){input.setAttribute('aria-invalid','true');let error=document.getElementById(input.dataset.errorId);if(!error){error=make('p');error.id=`field-error-${++sequence}`;error.className='field-error';error.setAttribute('role','alert');input.after(error);input.dataset.errorId=error.id;input.setAttribute('aria-describedby',error.id);}DucoroI18n.setText(error, text);input.addEventListener('input',()=>{input.removeAttribute('aria-invalid');error.remove();},{once:true});reveal(input);}
  function searchable(list,title){
    const bar=make('div'),search=make('input'),onlyLabel=make('label'),only=make('input'),count=make('p');bar.className='resource-search';search.type='search';DucoroI18n.setAttribute(search, 'placeholder', t`搜索${title}`);DucoroI18n.setAttribute(search, 'aria-label',t`搜索${title}`);only.type='checkbox';onlyLabel.className='choice';onlyLabel.append(only,make('span',t('只看已选')));bar.append(search,onlyLabel,count);list.before(bar);
    const update=()=>{const rows=[...list.children].filter(x=>x.matches('label.choice'));let visible=0;for(const row of rows){row.hidden=!row.textContent.toLowerCase().includes(search.value.toLowerCase())||(only.checked&&!row.querySelector('input')?.checked);if(!row.hidden)visible++;}DucoroI18n.setText(count, t`已选 ${rows.filter(x=>x.querySelector('input')?.checked).length} / ${rows.length} 项 · 显示 ${visible} 项`);};search.oninput=only.onchange=update;list.addEventListener('change',update);update();return update;
  }
  // Every native dialog gets the same title, initial focus, local status and focus return.
  const show=HTMLDialogElement.prototype.showModal;
  HTMLDialogElement.prototype.showModal=function(){
    const opener=document.activeElement;
    if(!this.className)this.className='preview-dialog';
    const title=this.querySelector('h2,h3');if(title){title.id||=`dialog-title-${++sequence}`;this.setAttribute('aria-labelledby',title.id);}
    for(const button of this.querySelectorAll('button'))if(/确认删除|确认清空|确认清理|Confirm (?:delet|clear|clean)/i.test(button.textContent))button.classList.add('danger');
    this.addEventListener('close',()=>{if(opener?.isConnected)opener.focus({preventScroll:true});},{once:true});
    show.call(this);const first=this.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled)');first?.focus();
  };
  function preserveFocus(root,work){const active=document.activeElement;if(!root.contains(active))return work();const row=active.closest('[data-bot-id],[data-task-id]');const key=row?.dataset.botId??row?.dataset.taskId;const controls=[...row?.querySelectorAll('button,input,select,textarea,summary')??[]];const controlId=active.id,controlName=active.getAttribute('aria-label'),index=controls.indexOf(active),start=active.selectionStart,end=active.selectionEnd;work();const newRow=[...(root.matches('[data-bot-id],[data-task-id]')?[root]:[]),...root.querySelectorAll('[data-bot-id],[data-task-id]')].find(x=>(x.dataset.botId??x.dataset.taskId)===key);const candidates=[...newRow?.querySelectorAll('button,input,select,textarea,summary')??[]];const next=candidates.find(n=>controlId&&n.id===controlId||controlName&&n.getAttribute('aria-label')===controlName)??candidates[index];next?.focus({preventScroll:true});if(typeof start==='number'&&next?.setSelectionRange&&['text','search'].includes(next.type))next.setSelectionRange(start,end);}
  function updateAccent(){const probe=make('span');probe.style.color='var(--accent)';probe.style.position='absolute';probe.style.visibility='hidden';document.body.append(probe);const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle=getComputedStyle(probe).color;ctx.fillRect(0,0,1,1);const rgb=[...ctx.getImageData(0,0,1,1).data].slice(0,3);probe.remove();const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);const bg=luminance(rgb),dark=luminance([16,24,32]),contrast=(a,b)=>(Math.max(a,b)+.05)/(Math.min(a,b)+.05);document.documentElement.style.setProperty('--on-accent',contrast(bg,dark)>=contrast(bg,1)?'#101820':'#ffffff');}
  function errorText(error){return error?.name==='ReferenceError'?t('页面组件加载不完整，请重新打开 Ducoro 页面。'):error?.localizedMessage??error?.message??t('操作未完成，请稍后重试。');}
  globalThis.DucoroComponents={errorText,make,reveal,fieldError,searchable,preserveFocus,updateAccent};
  document.addEventListener('DOMContentLoaded',()=>{
    updateAccent();matchMedia('(prefers-color-scheme: dark)').addEventListener('change',updateAccent);
    const scope=document.querySelector('#resources .scope-grid')?.closest('section');if(scope){const wrapper=make('details'),summary=make('summary',t('同步作用域与分配说明'));wrapper.className='card';scope.before(wrapper);wrapper.append(summary,scope);scope.className='';}
    const tabs=[...document.querySelectorAll('nav.tabs [data-tab]')];
    // Keep existing button-navigation semantics; add predictable arrow traversal.
    tabs.forEach((tab,index)=>tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();tabs[next].focus();tabs[next].click();}}));
  });
})();
