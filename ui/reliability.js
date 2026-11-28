(() => {
  const { t, setText } = DucoroI18n;
  const $ = (id) => document.getElementById(id);
  const { make: el, openDialog } = globalThis.DucoroComponents;
  const { actions, mount } = DucoroBackupFiles;
  let verifying = false;

  async function verify(force = false) {
    if (verifying) return;
    verifying = true;
    $("verify-results").disabled = true;
    const box = $("verification-results");
    setText(box, t("正在读取配置并核验…"));
    try {
      const result = await globalThis.DucoroVerificationTracker.track({
        api: ducoroApi,
        start: force,
        onUpdate: (partial) => {
          if (!partial.running) return;
          const statusMsg = partial.connectionError
            ? t("核验连接暂时中断，正在重新连接…")
            : partial.background
              ? t("仍在后台核验，将继续跟踪；已完成的条目如下。")
              : t("正在读取配置并核验…");
          const rows = (partial.rows ?? []).map((row) =>
            el("p", t`${row.target} · ${DucoroI18n.statusLabel(row.status)}`),
          );
          box.replaceChildren(el("p", t(statusMsg)), ...rows);
        },
      });
      if (result.error) throw DucoroI18n.error(result.errorMessage ?? result.error);
      if (!result.running && !result.updatedAt && !result.completion && !result.rows?.length) {
        box.replaceChildren(el("p", t("尚未核验；请先完成一次同步，再读取核验。")));
        return;
      }
      const updated = result.updatedAt ? DucoroI18n.dateTime(result.updatedAt) : t("尚无记录");
      const completionText =
        result.completion === "partial"
          ? t("部分完成，仍有待核实条目")
          : result.completion === "completed"
            ? t("核验已完成")
            : t("核验结果待确认");
      box.replaceChildren(el("p", t`核验时间：${updated} · ${t(completionText)}`));
      box.append(
        el(
          "p",
          t("已保存：以 Magpie 设置为准；已写入：以同步任务为准；已核验：以逐项读回为准；会话生效：待核实。"),
        ),
        el(
          "p",
          t("请在 Ducoro 新建会话或开始下一轮对话，检查模型名称、可用工具、技能和子代理列表；指令请用一条可辨识规则验证。"),
        ),
      );
      const states = {
        verified: "已写入并核验",
        failed: "核验失败",
        unknown: "待核实",
        skipped: "已跳过",
      };
      for (const row of result.rows ?? []) {
        const summary = t`${row.target} · ${DucoroI18n.featureLabel(row.feature)} · ${t(states[row.status] ?? "待核实")}：${t(row.messageMessage ?? row.message ?? "")}`;
        const details = [summary];
        if (row.digest) details.push(row.digest);
        for (const field of ["missingEvidence", "nextStep", "permissionEvidence"]) {
          if (row[field]) details.push(t(row[field + "Message"] ?? row[field]));
        }
        box.append(el("p", t(DucoroI18n.joinMessages(details, " · "))));
        const savedText = t(row.stages?.saved === "confirmed" ? t("已保存") : t("待核实"));
        const writtenText = t(row.stages?.written === "confirmed" ? t("已确认") : t("待核实"));
        box.append(
          el(
            "p",
            t`保存：${savedText} · 写入：${writtenText} · 核验：${DucoroI18n.statusLabel(row.status)} · 会话生效：${t("待核实")}`,
          ),
        );
      }
      if (!result.rows?.length) {
        box.append(
          el(
            "p",
            result.completion === "completed"
              ? t("本次没有可核验对象；请检查同步开关和资源选择。")
              : t("暂无可核验条目，记录待确认。"),
          ),
        );
      }
    } catch (error) {
      setText(box, t(error.localizedMessage ?? error.message));
    } finally {
      verifying = false;
      $("verify-results").disabled = false;
    }
  }

  globalThis.DucoroRestoreReview = {
    async refresh() {
      try {
        const state = await ducoroApi("state-status");
        $("restore-banner").hidden = !state.pending;
      } catch (error) {
        $("restore-banner").hidden = false;
        DucoroI18n.setText($("restore-message"), t`暂停状态读取失败：${error.message}`);
      }
    },
  };

  $("resume-review").onclick = async () => {
    const button = $("resume-review");
    button.disabled = true;
    try {
      const options = await magpie.options.get();
      const resumed = await DucoroPreview.show(options, { resume: true });
      await DucoroRestoreReview.refresh();
      if (resumed) {
        DucoroI18n.setText(
          $("restore-message"),
          t("继续同步请求已提交时，请稍后查看同步状态；暂停标记会在同步开始后解除。"),
        );
      }
    } catch (error) {
      DucoroI18n.setText($("restore-message"), error.message);
    } finally {
      button.disabled = false;
    }
  };

  let lastAutoVerifiedKey = null;
  void DucoroRestoreReview.refresh();
  void verify(false);
  $("verify-results").onclick = () => verify(true);
  document.addEventListener("ducoro-report", (event) => {
    const report = event.detail;
    const key = report?.roundId ?? report?.lastSyncedAt ?? null;
    if (!key || report?.syncing || key === lastAutoVerifiedKey) return;
    lastAutoVerifiedKey = key;
    void verify(true);
  });

  const countSummary = (value) =>
    value
      ? t`连接器 ${value.mcp ?? 0} 项 · 技能 ${value.skills ?? 0} 项 · 账户分配 ${value.accountConnectors ?? 0} 个 Bot`
      : t("当前记录不可读");

  $("list-backups").onclick = async () => {
    const box = $("backup-results");
    setText(box, t("正在校验备份…"));
    try {
      const { backups } = await ducoroApi("state-backups");
      box.replaceChildren();
      if (!backups.length) box.append(el("p", t("暂无有效备份。")));
      for (const backup of backups) {
        const row = el("div", "");
        row.className = "backup-row";
        row.dataset.backupId = backup.id;
        const retained = backup.retained ? t(" · 已保留") : "";
        row.append(
          el(
            "p",
            t`${backup.name || t("管理记录备份")} · ${DucoroI18n.dateTime(backup.createdAt)}${retained} · ${countSummary(backup.counts)} · ${backup.id}`,
          ),
        );
        const button = el("button", t("预览恢复"));
        button.type = "button";
        button.className = "secondary";
        button.onclick = async () => {
          button.disabled = true;
          try {
            const preview = await ducoroApi("state-backups/preview", { id: backup.id });
            const dialog = el("dialog", "");
            dialog.className = "preview-dialog";
            dialog.append(
              el("h2", t("恢复管理记录预览")),
              el("p", t`备份：${preview.id}`),
              el("p", t`校验和：${preview.checksum}`),
              el("p", t`当前记录：${countSummary(preview.currentCounts)}`),
              el("p", t`备份记录：${countSummary(preview.counts)}`),
            );
            const status = el("p", t("恢复后请先预览差异，再手动同步。"));
            const cancel = el("button", t("取消"));
            const confirm = el("button", t("确认恢复管理记录"));
            cancel.onclick = () => dialog.close();
            confirm.onclick = async () => {
              confirm.disabled = true;
              try {
                await ducoroApi("state-backups/restore", {
                  id: preview.id,
                  checksum: preview.checksum,
                });
                setText(
                  status,
                  t("已恢复管理记录，自动同步已暂停。请关闭此窗口，使用顶部的预览影响并继续同步。"),
                );
                await DucoroRestoreReview.refresh();
                confirm.remove();
              } catch (error) {
                setText(status, t(error.localizedMessage ?? error.message));
                confirm.disabled = false;
              }
            };
            cancel.type = confirm.type = "button";
            cancel.className = "secondary";
            confirm.className = "primary";
            dialog.append(status, actions(cancel, confirm));
            dialog.addEventListener("close", () => dialog.remove(), { once: true });
            document.body.append(dialog);
            openDialog(dialog, { focusTarget: cancel });
          } catch (error) {
            box.append(el("p", t(error.localizedMessage ?? error.message)));
          } finally {
            button.disabled = false;
          }
        };

        const remove = el("button", t("删除备份"));
        remove.type = "button";
        remove.className = "secondary";
        remove.onclick = () => {
          const dialog = el("dialog", "");
          dialog.className = "preview-dialog";
          dialog.append(
            el("h2", t("删除此备份？")),
            el("p", t`备份时间：${DucoroI18n.dateTime(backup.createdAt)}`),
            el("p", t`备份：${backup.id}`),
            el("p", t("删除后无法恢复此备份。当前管理记录和 Bot 配置保持不变。")),
          );
          const status = el("p", "");
          const cancel = el("button", t("取消"));
          const confirm = el("button", t("确认删除备份"));
          cancel.type = confirm.type = "button";
          cancel.onclick = () => dialog.close();
          confirm.onclick = async () => {
            confirm.disabled = true;
            cancel.disabled = true;
            remove.disabled = true;
            try {
              const result = await ducoroApi("state-backups/delete", {
                id: backup.id,
                checksum: backup.checksum,
              });
              dialog.close();
              await $("list-backups").onclick();
              box.prepend(
                el("p", result.deleted ? t("备份已删除。") : t("该备份已不存在，列表已更新。")),
              );
            } catch (error) {
              setText(status, t(error.localizedMessage ?? error.message));
              confirm.disabled = false;
              cancel.disabled = false;
              remove.disabled = false;
            }
          };
          cancel.className = "secondary";
          confirm.className = "primary danger";
          dialog.append(status, actions(cancel, confirm));
          dialog.addEventListener("close", () => dialog.remove(), { once: true });
          document.body.append(dialog);
          openDialog(dialog, { focusTarget: cancel });
        };

        remove.disabled = Boolean(backup.retained);
        remove.dataset.locked = String(Boolean(backup.retained));
        row.append(
          DucoroBackupFiles.details("state", backup, () => $("list-backups").onclick()),
          actions(button, remove),
        );
        box.append(row);
      }
    } catch (error) {
      setText(box, t(error.localizedMessage ?? error.message));
    }
  };

  mount({
    kind: "state",
    toolbar: $("state-backup-actions"),
    messageBox: $("state-backup-message"),
    refresh: () => $("list-backups").onclick(),
  });

  $("clean-local-records").onclick = async () => {
    const button = $("clean-local-records");
    const box = $("local-records-results");
    button.disabled = true;
    setText(box, t("正在核对可清理的本地记录…"));
    const bytes = (n) => `${(n / 1024).toFixed(1)} KiB`;
    try {
      const preview = await ducoroApi("local-records");
      const dialog = el("dialog", "");
      dialog.className = "preview-dialog";
      dialog.append(
        el("h2", t("清理本地记录")),
        el(
          "p",
          t`可删除 ${preview.completed} 条已完成操作记录、${preview.files} 项备份或缓存（${bytes(preview.bytes)}），并合并 ${bytes(preview.journalBytes)} 增量记录。`,
        ),
        el("p", t("历史备份删除后无法恢复。当前管理状态、未完成任务恢复记录和仍在使用的技能会保留。")),
      );
      const status = el("p", "");
      const cancel = el("button", t("取消"));
      const confirm = el("button", t("确认清理"));
      cancel.type = confirm.type = "button";
      confirm.className = "primary danger";
      cancel.className = "secondary";
      cancel.onclick = () => dialog.close();
      confirm.onclick = async () => {
        confirm.disabled = true;
        cancel.disabled = true;
        try {
          const result = await ducoroApi("local-records/clean", { token: preview.token });
          setText(
            box,
            t`清理完成：删除 ${result.deletedRecords} 条操作记录、${result.deletedFiles} 项备份或缓存，释放 ${bytes(result.releasedBytes)}。`,
          );
          $("backup-results").replaceChildren();
          dialog.close();
        } catch (error) {
          setText(status, t(error.localizedMessage ?? error.message));
          confirm.disabled = false;
          cancel.disabled = false;
        }
      };
      dialog.append(status, actions(cancel, confirm));
      dialog.addEventListener("close", () => dialog.remove(), { once: true });
      document.body.append(dialog);
      openDialog(dialog, { focusTarget: cancel });
      setText(box, t("已完成清理预览。"));
    } catch (error) {
      setText(box, t(error.localizedMessage ?? error.message));
    } finally {
      button.disabled = false;
    }
  };
})();
