// Shared controls for importing and clearing each local backup collection.
(() => {
  const {t,setText,dateTime}=DucoroI18n;
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)setText(node,text);return node;};
  const actions=(...nodes)=>{const row=el('div');row.className='button-group action-row';row.append(...nodes);return row;};
  function mount({kind,toolbar,messageBox,refresh}) {
    const input=el('input');input.type='file';input.accept='.json,application/json';input.hidden=true;
    const upload=el('button',t('导入外部文件')),clear=el('button',t('一键清空本地备份'));
    input.id=`${kind}-backup-file`;upload.id=`${kind}-backup-import`;clear.id=`${kind}-backup-clear`;
    upload.type=clear.type='button';upload.className='secondary';clear.className='secondary danger';
    const openDirectory=el('button',t('打开备份目录'));openDirectory.type='button';openDirectory.className='secondary';openDirectory.id=`${kind}-backup-open`;
    const create=el('button',t('执行备份'));create.type='button';create.className='primary';create.id=`${kind}-backup-create`;
    toolbar.prepend(create);toolbar.append(openDirectory,upload,clear,input);
    create.onclick=async()=>{busy(true);create.disabled=true;try{await api('create',{});notice(t('手动备份已创建。'));try{await refresh();}catch{notice(t('操作已完成，请重新读取列表。'));}}catch(error){notice(t(error.localizedMessage??error.message));}finally{busy(false);create.disabled=false;}};
    openDirectory.onclick=async()=>{openDirectory.disabled=true;try{await api('open-directory',{});notice(t('已请求在文件管理器中打开备份目录。'));}catch(error){notice(t(error.localizedMessage??error.message));}finally{openDirectory.disabled=false;}};
    const api=(action,body)=>ducoroApi(`backup-files/${kind}/${action}`,body);
    const busy=value=>{create.disabled=upload.disabled=clear.disabled=value;};
    const notice=value=>setText(messageBox,value);
    function confirmDialog(title,description,confirmLabel,work,success) {
      const dialog=el('dialog');dialog.className='preview-dialog';
      const status=el('p');status.setAttribute('role','status');
      const cancel=el('button',t('取消')),confirm=el('button',confirmLabel);
      cancel.type=confirm.type='button';cancel.className='secondary';confirm.className='primary';
      let committing=false;
      cancel.onclick=()=>dialog.close();
      dialog.addEventListener('cancel',event=>{if(committing)event.preventDefault();});
      confirm.onclick=async()=>{
        committing=true;confirm.disabled=cancel.disabled=true;
        try {
          const result=await work();dialog.close();notice(success(result));
          try {await refresh();}catch {notice(t('操作已完成，请重新读取列表。'));}
        } catch(error) {setText(status,t(error.localizedMessage??error.message));committing=false;confirm.disabled=cancel.disabled=false;}
      };
      dialog.append(el('h2',title),...description,status,actions(cancel,confirm));
      dialog.addEventListener('close',()=>{dialog.remove();busy(false);},{once:true});
      document.body.append(dialog);dialog.showModal();cancel.focus();
    }
    upload.onclick=()=>{input.value='';input.click();};
    input.onchange=async()=>{
      const file=input.files?.[0];if(!file)return;
      busy(true);notice(t('正在校验外部备份…'));
      try {
        if(file.size>8*1024*1024)throw DucoroI18n.error(t('备份文件过大，最大支持 8 MiB。'));
        const content=await file.text(),preview=await api('import-preview',{content});
        const summary=kind==='state'
          ? t`连接器 ${preview.counts.mcp} 项 · 技能 ${preview.counts.skills} 项 · 账户分配 ${preview.counts.accountConnectors} 个 Bot`
          : t`检查点时间：${dateTime(preview.createdAt)} · ${preview.changes} 项变更`;
        confirmDialog(t('导入备份预览'),[el('p',t`文件：${file.name}`),el('p',summary),el('p',t('导入仅加入本地备份列表，不会替换当前管理记录或应用配置。请再从列表预览恢复。'))],t('确认导入'),
          ()=>api('import',{content,token:preview.token}),result=>result.imported?t('备份已导入，请从列表预览恢复。'):t('相同备份已存在，未重复导入。'));
        notice(t('外部备份已校验，请确认导入。'));
      }catch(error){notice(t(error.localizedMessage??error.message));busy(false);}
      finally {input.value='';}
    };
    clear.onclick=async()=>{
      busy(true);notice(t('正在核对本地备份…'));
      try {
        const preview=await api('clear-preview',{});
        if(!preview.count){notice(t('没有可删除的本地备份文件。'));busy(false);return;}
        const title=kind==='state'?t('清空本地管理记录备份？'):t('清空本地配置检查点？');
        confirmDialog(title,[el('p',t`将删除 ${preview.count} 个本地备份文件（${(preview.bytes/1024).toFixed(1)} KiB）。`),el('p',t('删除后无法恢复这些备份。当前配置、管理记录和另一类备份保持不变。'))],t('确认清空'),
          ()=>api('clear',{token:preview.token}),result=>t`已删除 ${result.deleted} 个本地备份文件。`);
        notice(t('已生成删除预览，请确认。'));
      }catch(error){notice(t(error.localizedMessage??error.message));busy(false);}
    };
  }
  globalThis.DucoroBackupFiles={actions,mount};
})();
