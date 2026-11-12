(() => {
  const { t, setText, dateTime } = DucoroI18n;
  const $ = id => document.getElementById(id);
  const el = (tag, text) => { const n = document.createElement(tag); setText(n, text); return n; };
  const {actions,mount}=DucoroBackupFiles;
  let verifying = false;
  async function verify(force = false) {
    if (verifying) return;
    verifying = true; $("verify-results").disabled = true;
    const box = $("verification-results"); setText(box, t("正在读取配置并核验…"));
    try {
      const result = await globalThis.DucoroVerificationTracker.track({api:ducoroApi,start:force,onUpdate:partial=>{
        if(!partial.running)return;
        box.replaceChildren(el('p',t(partial.connectionError?'核验连接暂时中断，正在重新连接…':partial.background?'仍在后台核验，将继续跟踪；已完成的条目如下。':'正在读取配置并核验…')),...(partial.rows??[]).map(row=>el('p',t`${row.target} · ${DucoroI18n.statusLabel(row.status)}`)));
      }});
      if(result.error) throw Error(result.error);
      box.replaceChildren(el("p", t`核验时间：${result.updatedAt ? dateTime(result.updatedAt) : t("尚无记录")} · ${t(result.completion==='partial'?'部分完成，仍有待核实条目':'核验已完成')}`));
      box.append(el('p',t('已保存：以 Magpie 设置为准；已写入：以同步任务为准；已核验：以逐项读回为准；会话生效：待核实。')),el('p',t('请在 Ducoro 新建会话或开始下一轮对话，检查模型名称、可用工具、技能和子代理列表；指令请用一条可辨识规则验证。')));
      for (const row of result.rows ?? []) { box.append(el("p", t`${row.target} · ${{connection:t("网关连接"),models:t("模型"),mcp:t("连接器"),skills:t("技能"),instructions:t("指令"),subagents:t("子代理"),accountConnectors:t("账户权限")}[row.feature] ?? row.feature} · ${{verified:t("已写入并核验"),failed:t("核验失败"),unknown:t("待核实"),skipped:t("已跳过")}[row.status] ?? t("待核实")}：${t(row.message ?? "")}${row.digest?' · '+row.digest:''}${row.missingEvidence?' · '+t(row.missingEvidence):''}${row.nextStep?' · '+t(row.nextStep):''}${row.permissionEvidence?' · '+t(row.permissionEvidence):''}`));
        box.append(el('p',t`保存：${t(row.stages?.saved==='confirmed'?'已保存':'待核实')} · 写入：${t(row.stages?.written==='confirmed'?'已确认':'待核实')} · 核验：${DucoroI18n.statusLabel(row.status)} · 会话生效：${t('待核实')}`));
      }
      if (!result.rows?.length) box.append(el("p", t("暂无可核验条目，请先完成一次同步。")));
    } catch (error) { setText(box, t(error.localizedMessage ?? error.message)); }
    finally { verifying = false; $("verify-results").disabled = false; }
  }
  void verify(false);
  $("verify-results").onclick = () => verify(true);
  document.addEventListener("ducoro-report", () => verify(true));
  $("list-backups").onclick = async () => {
    const box = $("backup-results"); setText(box, t("正在校验备份…"));
    try {
      const { backups } = await ducoroApi("state-backups"); box.replaceChildren();
      if (!backups.length) box.append(el("p", t("暂无有效备份。")));
      for (const backup of backups) {
        const row = el("div", "");row.className='backup-row';row.append(el('p',t`${dateTime(backup.createdAt)} · ${backup.id}`));const button = el("button", t("预览恢复")); button.type = "button";button.className='secondary';
        button.onclick = async () => {
          button.disabled = true;
          try {
            const preview = await ducoroApi("state-backups/preview", { id: backup.id });
            const dialog = el("dialog", ""); dialog.className = "preview-dialog";
            dialog.append(el("h2", t("恢复管理记录预览")), el("p", t`备份：${preview.id}`), el("p", t`校验和：${preview.checksum}`), el("p", t`当前记录：${JSON.stringify(preview.currentCounts)}`), el("p", t`备份记录：${JSON.stringify(preview.counts)}`));
            const status = el("p", t("恢复后请先预览差异，再手动同步。")), cancel = el("button", t("取消")), confirm = el("button", t("确认恢复管理记录"));
            cancel.onclick = () => dialog.close();
            confirm.onclick = async () => {
              confirm.disabled = true;
              try { await ducoroApi("state-backups/restore", { id: preview.id, checksum: preview.checksum }); setText(status, t("已恢复管理记录，请重新预览后手动同步。")); confirm.remove(); }
              catch (error) { setText(status, t(error.localizedMessage ?? error.message)); confirm.disabled = false; }
            };
            cancel.type=confirm.type='button';cancel.className='secondary';confirm.className='primary';
            dialog.append(status, actions(cancel,confirm)); dialog.addEventListener("close", () => dialog.remove(), { once:true }); document.body.append(dialog); dialog.showModal();
          } catch (error) { box.append(el("p", t(error.localizedMessage ?? error.message))); }
          finally { button.disabled = false; }
        };
        const remove = el("button", t("删除备份")); remove.type = "button"; remove.className = "secondary";
        remove.onclick = () => {
          const dialog = el("dialog", ""); dialog.className = "preview-dialog";
          dialog.append(el("h2", t("删除此备份？")), el("p", t`备份时间：${dateTime(backup.createdAt)}`), el("p", t`备份：${backup.id}`), el("p", t("删除后无法恢复此备份。当前管理记录和 Bot 配置保持不变。")));
          const status = el("p", ""), cancel = el("button", t("取消")), confirm = el("button", t("确认删除备份"));
          cancel.type = confirm.type = "button";
          cancel.onclick = () => dialog.close();
          confirm.onclick = async () => {
            confirm.disabled = true; cancel.disabled = true; remove.disabled = true;
            try {
              const result = await ducoroApi("state-backups/delete", { id: backup.id, checksum: backup.checksum });
              dialog.close();
              await $("list-backups").onclick();
              box.prepend(el("p", result.deleted ? t("备份已删除。") : t("该备份已不存在，列表已更新。")));
            } catch (error) { setText(status, t(error.localizedMessage ?? error.message)); confirm.disabled = false; cancel.disabled = false; remove.disabled = false; }
          };
          cancel.className='secondary';confirm.className='primary';dialog.append(status, actions(cancel,confirm)); dialog.addEventListener("close", () => dialog.remove(), { once:true }); document.body.append(dialog); dialog.showModal();
        };
        remove.disabled=!!backup.retained;row.append(DucoroBackupFiles.details('state',backup,()=>$("list-backups").onclick()),actions(button,remove)); box.append(row);
      }
    } catch (error) { setText(box, t(error.localizedMessage ?? error.message)); }
  };
  mount({kind:'state',toolbar:$("state-backup-actions"),messageBox:$("state-backup-message"),refresh:()=>$("list-backups").onclick()});
  $("clean-local-records").onclick = async () => {
    const button=$("clean-local-records"),box=$("local-records-results");
    button.disabled=true;setText(box,t('正在核对可清理的本地记录…'));
    const bytes=n=>`${(n/1024).toFixed(1)} KiB`;
    try {
      const preview=await ducoroApi('local-records');
      const dialog=el('dialog','');dialog.className='preview-dialog';
      dialog.append(el('h2',t('清理本地记录')),el('p',t`可删除 ${preview.completed} 条已完成操作记录、${preview.files} 项备份或缓存（${bytes(preview.bytes)}），并合并 ${bytes(preview.journalBytes)} 增量记录。`),el('p',t('历史备份删除后无法恢复。当前管理状态、未完成任务恢复记录和仍在使用的技能会保留。')));
      const status=el('p',''),cancel=el('button',t('取消')),confirm=el('button',t('确认清理'));
      cancel.type=confirm.type='button';confirm.className='primary';cancel.className='secondary';
      cancel.onclick=()=>dialog.close();
      confirm.onclick=async()=>{
        confirm.disabled=true;cancel.disabled=true;
        try {
          const result=await ducoroApi('local-records/clean',{token:preview.token});
          setText(box,t`清理完成：删除 ${result.deletedRecords} 条操作记录、${result.deletedFiles} 项备份或缓存，释放 ${bytes(result.releasedBytes)}。`);
          $("backup-results").replaceChildren();dialog.close();
        }catch(error){setText(status,t(error.localizedMessage??error.message));confirm.disabled=false;cancel.disabled=false;}
      };
      dialog.append(status,actions(cancel,confirm));dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
      setText(box,t('已完成清理预览。'));
    }catch(error){setText(box,t(error.localizedMessage??error.message));}
    finally{button.disabled=false;}
  };
})();
