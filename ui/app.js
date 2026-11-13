{
  const { t } = globalThis.DucoroI18n;
  (async () => {
    await globalThis.DucoroUIReady;
    const {
      SWITCHES,
      DEFAULT_OPTIONS,
      EDITABLE_KEYS,
      FEATURE_NAMES,
      STATUS_NAMES,
      splitList,
      optionsForDisplay,
      validateFields,
      mergeEditedOptions,
      parseDiagnosticReport,
    } = globalThis.DucoroUI;

    const $ = (id) => document.getElementById(id);
    const panel = document.body.dataset.panel === "true";
    let baseline = null;
    let extensionDraft = {};
    let ready = false;
    let busy = false;
    let reportRequest = 0;
    let syncWatch = 0;
    let hasReport = false;
    let reportBusy = false;
    const node = (tag, text, className) => {
      const el = document.createElement(tag);
      if (text !== undefined) DucoroI18n.setText(el, text);
      if (className) el.className = className;
      return el;
    };
    const message = (text, error = false, target = "message") => {
      const el = $(target);
      if (!el) return;
      DucoroI18n.setText(el, t(text));
      el.classList.toggle("error", error);
      el.hidden = !text;
      if(error&&text&&document.activeElement?.getAttribute("aria-invalid")!=="true")globalThis.DucoroComponents?.reveal(el);
    };

    for (const [key, title, description] of SWITCHES) {
      const label = node("div", undefined, "switch-card");
      const copy = node("span", undefined, "switch-copy");
      copy.append(node("strong", title), node("small", description));
      const input = node("input");
      input.type = "checkbox";
      input.id = key;
      input.className = "toggle-input";
      DucoroI18n.setAttribute(input, "role", "switch");
      DucoroI18n.setAttribute(input, "aria-label", title);
      input.disabled = true;
      label.append(copy, input);
      $("switches").append(label);
    }

    function textField(title, value, placeholder, className) {
      const label = node("label", title);
      const input = node("input");
      input.value = value;
      DucoroI18n.setAttribute(input, 'placeholder', placeholder);
      input.spellcheck = false;
      if (className) input.className = className;
      label.append(input);
      return { label, input };
    }

    function addReference(route = "", reference = "") {
      const row = node("div", undefined, "reference-row");
      const routeField = textField(
        t("发送的模型 / 路由组"),
        route,
        "group/glm-5.3-flash",
        "ref-route",
      );
      const refField = textField(
        t("官方目录参考"),
        reference ?? "",
        "zai/glm-5.3-flash",
        "ref-value",
      );
      const remove = node("button", t("移除"), "remove-row");
      remove.type = "button";
      DucoroI18n.setAttribute(remove, "aria-label", t("移除模型映射"));
      const disabled = node("label", undefined, "disable-ref");
      const check = node("input");
      check.type = "checkbox";
      check.className = "ref-disabled";
      check.checked = reference === null;
      DucoroI18n.setAttribute(refField.input, "list", "catalog-options");
      refField.input.disabled = check.checked;
      check.addEventListener("change", () => {
        refField.input.disabled = check.checked;
      });
      disabled.append(check, node("span", t("禁用自动映射")));
      remove.addEventListener("click", () => {
        row.remove();
        updateEmptyRows();
        dirty();
      });
      row.append(routeField.label, refField.label, remove, disabled);
      $("references").append(row);
      updateEmptyRows();
    }

    function updateEmptyRows() {
      if (panel) return;
      const count = $("references").children.length;
      $("reference-empty").hidden = count > 0;
      DucoroI18n.setText($("manual-count"), t`${count} 项覆盖`);
    }

    function updateToggleLabels() {
      DucoroI18n.setText(
        $("disconnect-state"),
        $("onDisconnect").checked
          ? t("已开启 · 断开时移除")
          : t("已关闭 · 断开时保留"),
      );
      for (const key of ["modelScope", "mcpScope", "skillsScope"])
        DucoroI18n.setText(
          $(key + "-state"),
          $(key).checked
            ? t("已开启 · 按 Bot 单独配置")
            : t("已关闭 · 全局同步"),
        );
    }

    let latestReportTime=null;
    let catalogModels = [],
      catalogBusy = false;
    function renderCatalog() {
      const query = $("catalog-search").value.trim().toLowerCase();
      const matches = catalogModels.filter((model) =>
        `${model.provider}/${model.id} ${model.name}`
          .toLowerCase()
          .includes(query),
      );
      DucoroI18n.setText(
        $("catalog-count"),
        t`共 ${catalogModels.length} 个模型${query ? t` · 找到 ${matches.length} 项` : ""}${matches.length > 100 ? t(" · 显示前 100 项，请搜索缩小范围") : ""}`,
      );
      $("catalog-list").replaceChildren();
      for (const model of matches.slice(0, 100)) {
        const row = node("div", undefined, "catalog-model");
        const copy = node("div");
        copy.append(
          node("strong", model.name || model.id),
          node("span", `${model.provider}/${model.id}`, "catalog-coordinate"),
        );
        const context = model.contextWindow
          ? t`${new Intl.NumberFormat(document.documentElement.lang).format(model.contextWindow)} 上下文`
          : t("上下文未提供");
        row.append(copy, node("span", context, "catalog-context"));
        $("catalog-list").append(row);
      }
      if (!matches.length)
        $("catalog-list").append(
          node(
            "p",
            catalogModels.length
              ? t("没有匹配的模型。")
              : t("目录尚未加载，请同步上游模型列表。"),
            "empty-inline",
          ),
        );
    }
    async function refreshCatalog(force = false) {
      if (catalogBusy) return;
      catalogBusy = true;
      $("sync-catalog").disabled = true;
      DucoroI18n.setText(
        $("sync-catalog"),
        force ? t("正在同步…") : t("正在读取…"),
      );
      try {
        const result = await ducoroApi("model-catalog", force ? {} : undefined);
        if (
          !Array.isArray(result.models) ||
          !Number.isFinite(Date.parse(result.updatedAt))
        )
          throw DucoroI18n.error(t("上游模型目录格式无法识别。"));
        catalogModels = result.models;
        const explanations = $("model-explanations"); explanations.replaceChildren();
        for (const entry of result.entries ?? []) {
          const row = node("article", undefined, "issue");
          const statuses = {matched:t("自动匹配成功"), "capability-mismatch":t("能力存在差异"), "unrecognized-model":t("无法识别模型身份"), "mixed-models":t("组内模型身份不一致"), "no-official-match":t("未找到官方参考"), disabled:t("已禁用"), "catalog-unavailable":t("目录不可用"), "membership-unavailable":t("模型组成员暂不可读"), "cyclic-group":t("模型组存在循环引用"), "empty-group":t("模型组为空")};
          const sources = {option:t("设置中手动覆盖"), manual:t("手动覆盖"), automatic:t("自动匹配"), auto:t("自动匹配"), retained:t("沿用上次参考"), none:t("无参考")};
          row.append(node("strong", entry.id), node("p", t`来源：${sources[entry.source] ?? entry.source}；参考：${entry.reference ?? t("无")}；${statuses[entry.status] ?? entry.status}`));
          if (entry.commonCapabilities) row.append(node("p", t`组内共同能力：上下文 ${entry.commonCapabilities.contextWindow ?? t("未确认")}；思考档位 ${entry.commonCapabilities.thinkingLevels?.length ? DucoroI18n.joinMessages(entry.commonCapabilities.thinkingLevels) : t("未确认")}`));
          const reasons = {"reference-context-exceeds-member-limit":t("参考上下文大于组内模型限制"), "reference-thinking-exceeds-member-levels":t("参考思考档位超过组内共同能力"), "member-capabilities-incomplete":t("组内能力信息不完整"), "reference-model-differs":t("参考模型身份不同"), "manual-reference-not-in-catalog":t("手动参考已不在目录中")};
          for (const warning of entry.warnings ?? []) row.append(node("p", reasons[warning] ?? warning));
          explanations.append(row);
        }
        if (!result.entries?.length) explanations.append(node("p", t("匹配记录尚未生成或正在更新。可只读刷新；如需重新计算，请使用同步上游模型列表。")));
        DucoroI18n.setText(
          $("catalog-state"),
          t`${catalogModels.length} 个模型 · 最近读取 ${DucoroI18n.dateTime(result.updatedAt)}`,
        );
        $("catalog-options").replaceChildren();
        for (const model of catalogModels) {
          const option = node("option");
          option.value = `${model.provider}/${model.id}`;
          option.label = model.name || model.id;
          $("catalog-options").append(option);
        }
        renderCatalog();
        const evidenceStale=!result.entriesUpdatedAt||(latestReportTime&&Date.parse(result.entriesUpdatedAt)<Date.parse(latestReportTime));
        DucoroI18n.setText($("match-context"),t`匹配记录：${result.entriesUpdatedAt?DucoroI18n.dateTime(result.entriesUpdatedAt):t("尚未生成")} · ${result.syncing?t("正在更新"):evidenceStale?t("可能早于最新诊断，请只读刷新确认"):t("已读取")}。目录读取时间不代表匹配记录时间。`);
        message(
          result.stale
            ? t("上游暂不可用，正在显示上次成功读取的目录。请稍后重新同步。")
            : force
              ? t(
                  "已重新读取 Ducoro 上游目录，并请求重新匹配模型能力。手动覆盖和未预览并保存已保留。",
                )
              : "",
          result.stale === true,
          "catalog-message",
        );
      } catch (error) {
        DucoroI18n.setText(
          $("catalog-state"),
          catalogModels.length
            ? t`${catalogModels.length} 个模型 · 本次更新失败，显示上次目录`
            : t("上游目录暂不可用"),
        );
        message(
          DucoroComponents.errorText(error),
          true,
          "catalog-message",
        );
      } finally {
        catalogBusy = false;
        DucoroI18n.setText($("sync-catalog"), t("↻ 同步上游模型列表"));
        $("sync-catalog").disabled = busy || !ready;
      }
    }

    function setTab(name) {
      if (panel) return;
      for (const el of document.querySelectorAll("[data-tab]")) {
        const active = el.dataset.tab === name;
        el.classList.toggle("active", active);
        DucoroI18n.setAttribute(el, "aria-pressed", String(active));
      }
      for (const el of document.querySelectorAll(".tab-content"))
        el.hidden = el.id !== name;
      $("save-bar").hidden = name === "diagnostics";
      if (name === "diagnostics" && ready) void refreshReport();
      if (name === "resources" && ready) void DucoroResources.refresh();
    }

    function populate(options, preserveResourceBaseline = false) {
      extensionDraft = Object.fromEntries(["botPlansCatalog","botPlans","botInstructions","pausedModels","modelGuards"].map(key=>[key,structuredClone(options[key] ?? DEFAULT_OPTIONS[key])]));
      for (const [key] of SWITCHES) $(key).checked = options[key];
      if (!panel) {
        $("connectionSlug").value = options.connectionSlug;
        $("onDisconnect").checked = options.onDisconnect === "remove";
        $("subagentNames").value = options.subagentNames.join("\n");
        $("targetAgents").value = options.targetAgents.join("\n");
        $("officialProviders").value = options.officialProviders.join("\n");
        for (const key of ["modelScope", "mcpScope", "skillsScope"]) {
          $(key).checked = options[key] !== "global";
          $(key).dataset.activeValue =
            options[key] === "global" ? "agents" : options[key];
        }
        updateToggleLabels();
        DucoroResources.set(options, preserveResourceBaseline);
        $("references").replaceChildren();
        for (const [route, ref] of Object.entries(options.modelCapabilityRefs))
          addReference(route, ref);
        updateEmptyRows();
      }
      DucoroI18n.setText(
        $("connection-state"),
        t`连接：${options.connectionSlug} · 配置已读取`,
      );
    }

    function collect() {
      const options = structuredClone(baseline ?? DEFAULT_OPTIONS);
      for (const [key] of SWITCHES) options[key] = $(key).checked;
      if (panel) return options;
      options.connectionSlug = $("connectionSlug").value.trim();
      options.onDisconnect = $("onDisconnect").checked ? "remove" : "keep";
      options.subagentNames = splitList($("subagentNames").value);
      options.targetAgents = splitList($("targetAgents").value);
      options.officialProviders = splitList($("officialProviders").value);
      for (const key of ["modelScope", "mcpScope", "skillsScope"])
        options[key] = $(key).checked ? $(key).dataset.activeValue : "global";
      options.modelCapabilityRefs = {};
      for (const row of $("references").children) {
        const route = row.querySelector(".ref-route").value.trim();
        const ref = row.querySelector(".ref-disabled").checked
          ? null
          : row.querySelector(".ref-value").value.trim();
        if (Object.hasOwn(options.modelCapabilityRefs, route))
          throw DucoroI18n.error(
            t`模型 ${route || t("（空名称）")} 重复，请仅保留一条映射。`,
          );
        Object.defineProperty(options.modelCapabilityRefs, route, {
          value: ref,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      Object.assign(options, structuredClone(DucoroResources.collect()), structuredClone(extensionDraft));
      return options;
    }

    let undoDraft = null;
    let draftWrite=Promise.resolve(),draftTimer,pendingDraft=null,draftTouched=false;
    const draftStatus=document.createElement('span');draftStatus.setAttribute('role','status');
    if(!panel)$('save-bar').append(draftStatus);
    const draftSession=panel?null:globalThis.DucoroDrafts.create({api:ducoroApi,onStatus:(status,error)=>DucoroI18n.setText(draftStatus,status==='error'?t(error.localizedMessage??error.message):t(status==='saving'?t('编辑草稿保存中'):t('编辑草稿已自动保存')))});
    const flushDraft=()=>{
      clearTimeout(draftTimer);
      if(!pendingDraft)return draftWrite;
      const value=pendingDraft;pendingDraft=null;
      draftWrite=draftWrite.catch(()=>{}).then(async()=>{
        try { await draftSession.write(value); } catch(error) { if(!pendingDraft)pendingDraft=value;throw error; }
      });
      draftWrite.catch(error=>DucoroI18n.setText(draftStatus,t('草稿保存失败')+': '+error.message));
      return draftWrite;
    };
    const project = options => Object.fromEntries(EDITABLE_KEYS.map(key => [key, options[key]]));
    const persistDraft = () => {
      if(panel || !ready || busy)return;
      if(!hasChanges()&&!globalThis.DucoroPlanEditor?.snapshot()?.dirty){if(!draftTouched)return;draftTouched=false;pendingDraft={clear:true};clearTimeout(draftTimer);draftTimer=setTimeout(()=>void flushDraft(),350);return;}
      draftTouched=true;
      try{pendingDraft={base:project(baseline),options:project(collect()),editor:globalThis.DucoroPlanEditor?.snapshot()??null};}
      catch(error){DucoroI18n.setText(draftStatus,t('草稿保存失败')+': '+error.message);return;}
      clearTimeout(draftTimer);draftTimer=setTimeout(()=>void flushDraft(),350);
    };
    const restoreButton = document.createElement('button');restoreButton.type='button';DucoroI18n.setText(restoreButton,t('恢复本地草稿'));
    const undoButton = document.createElement('button');undoButton.type='button';DucoroI18n.setText(undoButton,t('撤销最近批量修改'));
    restoreButton.className=undoButton.className='secondary';
    if(!panel){const menu=node('details',undefined,'save-more'),summary=node('summary',t('更多')),items=node('div',undefined,'save-menu');menu.append(summary,items);items.append($('reload'),$('preview'),restoreButton,undoButton);$('save-bar').querySelector('div').prepend(menu);draftStatus.className='draft-status';}
    restoreButton.onclick=async()=>{try{clearTimeout(draftTimer);if(pendingDraft?.clear)await flushDraft();else pendingDraft=null;await draftWrite.catch(()=>{});const saved=await draftSession.read();if(!saved.options)return message(t('没有可恢复的本地草稿'));
      if(JSON.stringify(saved.base)!==JSON.stringify(project(baseline)))return message(t('配置已变化，旧草稿未恢复'));
      DucoroWorkspace.stage({...collect(),...saved.options});globalThis.DucoroPlanEditor?.restore(saved.editor);}catch(error){message(t(error.localizedMessage??error.message),true);}};
    undoButton.onclick=()=>{if(undoDraft){const value=undoDraft;undoDraft=null;populate(optionsForDisplay(value),true);dirty();document.dispatchEvent(new Event('ducoro-workspace'));}};
    addEventListener('pagehide',()=>{persistDraft();void flushDraft();});
    document.addEventListener('ducoro-editor-change',()=>{dirty();persistDraft();});
    globalThis.DucoroWorkspace = { collect, ready: () => ready && !busy, dirty: () => hasChanges(), stage(options) { if (!ready || busy) throw DucoroI18n.error(t("请等待当前操作完成")); undoDraft=collect(); populate(optionsForDisplay(options), true); $("save-bar").hidden = false; dirty(); message(t("修改已加入草稿，请预览并保存。")); document.dispatchEvent(new Event("ducoro-workspace")); } };

    function hasChanges() {
      if (!ready) return false;
      if(globalThis.DucoroPlanEditor?.snapshot()?.dirty)return true;
      let changed = true;
      try {
        const edited = collect();
        changed = (panel ? SWITCHES.map(([key]) => key) : EDITABLE_KEYS).some(
          (key) =>
            JSON.stringify(edited[key]) !== JSON.stringify(baseline[key]),
        );
      } catch {
        /* Duplicate/incomplete rows remain editable and are validated on save. */
      }
      return changed;
    }

    function dirty() {
      if (!ready || busy) return;
      const changed = hasChanges();
      if(!panel){try{DucoroResources.updateSettings(collect());}catch{}}
      undoButton.disabled=!undoDraft;
      const editorDirty=globalThis.DucoroPlanEditor?.snapshot()?.dirty;
      let changeCount;try{const edited=collect();changeCount=EDITABLE_KEYS.filter(key=>JSON.stringify(edited[key])!==JSON.stringify(baseline[key])).length;}catch{changeCount=t("待校验");}
      DucoroI18n.setText(
        $("dirty-state"),
        editorDirty ? t("方案编辑待加入配置；预览时将一并处理") : changed ? t`${changeCount} 类设置待保存 · Bot 影响请预览确认` : t("设置与已读取配置一致"),
      );
      $("save").disabled = !changed;
      persistDraft();
    }

    function setBusy(value) {
      busy = value;
      document.body.dataset.busy = String(value);
      for (const el of document.querySelectorAll(
        'input:not([type="file"]),textarea,select,button:not([data-tab])',
      ))
        el.disabled = value || !ready;
      if (!value && ready) {
        for (const row of document.querySelectorAll(".reference-row"))
          row.querySelector(".ref-value").disabled =
            row.querySelector(".ref-disabled").checked;
        for (const el of document.querySelectorAll('[data-locked="true"]'))
          el.disabled = true;
        if (!panel) {
          $("sync-catalog").disabled = catalogBusy;
          $("refresh-bots").disabled = DucoroResources.refreshing;
          $("refresh-report").disabled = reportBusy;
        }
        dirty();
      }
    }

    async function load() {
      ++syncWatch;
      setBusy(true);
      try {
        const raw = await globalThis.magpie.options.get();
        baseline = optionsForDisplay(raw ?? {});
        populate(baseline);
        ready = true;
        document.dispatchEvent(new Event("ducoro-workspace"));
        message("");
        setBusy(false);
        document.dispatchEvent(new Event("ducoro-workspace"));
        if (!panel) {
          void DucoroResources.refresh();
          void refreshCatalog();
          if (!$("diagnostics").hidden) void refreshReport();
        }
      } catch (error) {
        message(
          t`无法读取设置：${DucoroComponents.errorText(error)}`,
          true,
        );
        DucoroI18n.setText(
          $("connection-state"),
          t("配置尚未读取，未执行任何修改"),
        );
        DucoroI18n.setText($("dirty-state"), t("读取失败"));
      } finally {
        setBusy(false);
        $("reload").disabled = false;
      }
    }

    async function save() {
      try {
        if(!panel) await globalThis.DucoroPlanEditor?.commit();
        const edited = validateFields(collect());
        setBusy(true);
        const current = (await globalThis.magpie.options.get()) ?? {};
        const { options, changed } = mergeEditedOptions(
          current,
          baseline,
          edited,
          panel ? SWITCHES.map(([key]) => key) : EDITABLE_KEYS,
        );
        if (!changed.length) {
          message(t("没有需要保存的修改。"));
          return;
        }
        if (!panel) await ducoroApi("validate", options);
        if (!panel) {
          if (!(await DucoroPreview.show(options, { save: true }))) return;
          const latest = (await globalThis.magpie.options.get()) ?? {};
          if (JSON.stringify(latest) !== JSON.stringify(current))
            throw DucoroI18n.error(
              t("配置在预览期间已变化，请重新读取并再次预览。"),
            );
        }
        if (!panel) await ducoroApi("checkpoints", { before: current, after: options });
        document.dispatchEvent(new Event("ducoro-saving"));
        const savedAt = Date.now();
        const watch = ++syncWatch;
        const saved = await globalThis.magpie.options.set(options);
        await flushDraft().catch(()=>{});
        if(!panel)await draftSession.clear().catch(error=>DucoroI18n.setText(draftStatus,t(error.localizedMessage??error.message)));
        baseline = optionsForDisplay(saved ?? options);
        populate(baseline);
        message(t("设置已保存，正在同步。稍后刷新报告可查看结果。"));
        if (!panel) void followSync(savedAt, watch);
      } catch (error) {
        const text=String(error.localizedMessage??error.message),sourceKey=error.localizedMessage?.key??text;const field=/连接标识/.test(sourceKey)?$("connectionSlug"):/目标 Bot/.test(sourceKey)?$("targetAgents"):/子代理名称/.test(sourceKey)?$("subagentNames"):/模型映射|模型 .*重复/.test(sourceKey)?$("references").querySelector("input"):null;if(field)DucoroComponents.fieldError(field,error.localizedMessage??text);
        message(
          error.localizedMessage ?? (error.message || t("保存失败，请重试。")),
          true,
        );
      } finally {
        setBusy(false);
      }
    }

    async function followSync(savedAt, watch) {
      const deadline = Date.now() + 60000;
      while (watch === syncWatch && Date.now() < deadline) {
        try {
          const report = parseDiagnosticReport(
            await ducoroApi("report", undefined, {
              signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
            }),
          );
          if (watch !== syncWatch) return;
          if (!report.syncing && Date.parse(report.lastSyncedAt) >= savedAt) {
            if (!busy) {
              ++reportRequest;
              reportBusy = false;
              $("refresh-report").disabled = busy || !ready;
              showReport(report);
              message(
                report.status === "pending"
                  ? t(
                      "设置已保存，本轮同步已结束，仍有待处理项，请查看同步状态。",
                    )
                  : t("设置已保存，本轮同步已结束，请查看同步状态确认结果。"),
              );
              void DucoroResources.refresh();
              return;
            }
          }
        } catch {
          /* The plugin host can restart after settings are saved. */
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (watch === syncWatch)
        message(t("设置已保存，同步结果尚未确认，请稍后查看同步状态。"));
    }

    function confirmReload() {
      return new Promise((resolve) => {
        const dialog = node("dialog", undefined, "preview-dialog");
        const title = node("h2", t("放弃未保存的修改？"));
        title.id = "reload-title";
        dialog.setAttribute("aria-labelledby", title.id);
        dialog.append(
          title,
          node("p", t("重新读取会用已预览并保存替换当前草稿。")),
        );
        const footer = node("footer", undefined, "button-group");
        const cancel = node("button", t("返回修改"), "secondary");
        const confirm = node("button", t("放弃修改并重新读取"), "primary");
        cancel.type = confirm.type = "button";
        cancel.addEventListener("click", () => dialog.close());
        confirm.addEventListener("click", () => dialog.close("reload"));
        footer.append(cancel, confirm);
        dialog.append(footer);
        dialog.addEventListener(
          "close",
          () => {
            const accepted = dialog.returnValue === "reload";
            dialog.remove();
            resolve(accepted);
          },
          { once: true },
        );
        document.body.append(dialog);
        dialog.showModal();
        cancel.focus();
      });
    }

    function showReport(report) {
      latestReportTime=report.lastSyncedAt??report.updatedAt;
      DucoroResources.setIssues(report.issues);
      DucoroI18n.setText($("diagnostic-summary"),t`最近同步：${report.lastSyncedAt?DucoroI18n.dateTime(report.lastSyncedAt):t("尚无记录")} · 需处理 ${report.issues.length} 项 · ${report.syncing?t("同步中"):t("本轮未运行")} · 读回核验见下方；会话加载待确认`);
      void globalThis.DucoroRestoreReview?.refresh();
      document.dispatchEvent(new Event("ducoro-report"));
      hasReport = true;
      $("report-empty").hidden = true;
      $("report-view").hidden = false;
      const date = report.updatedAt
        ? DucoroI18n.dateTime(report.updatedAt)
        : t("报告未提供时间");
      const synced = report.lastSyncedAt
        ? DucoroI18n.dateTime(report.lastSyncedAt)
        : t("尚未完成同步");
      DucoroI18n.setText(
        $("report-time"),
        t`查看时间：${date} · 最近同步：${synced}${report.stale ? t(" · 同步结果待更新") : ""}`,
      );
      $("report-cards").replaceChildren();
      for (const [key, title] of Object.entries(FEATURE_NAMES)) {
        const item = report.features[key];
        const card = node("article", undefined, "report-card");
        const status = node(
          "strong",
          item.status === "skipped" && item.skipReason === "not-selected"
            ? t("未选择资源")
            : STATUS_NAMES[item.status],
          item.status === "configured"
            ? "status-good"
            : item.status === "pending"
              ? "status-warning"
              : "",
        );
        card.append(node("h3", title), status);
        if (item.count !== null)
          card.append(node("p", t`${item.count} 个记录条目`));
        if (key === "mcp")
          card.append(
            node(
              "p",
              {
                passed: t("服务探测通过"),
                failed: t("服务探测未通过"),
                unknown: t("服务探测未确认"),
              }[item.probeStatus],
            ),
          );
        if (item.targets.length)
          card.append(
            node("p", t`目标：${DucoroI18n.joinMessages(item.targets)}`),
          );
        $("report-cards").append(card);
      }
      $("report-issues").replaceChildren();
      if (!report.issues.length)
        $("report-issues").append(
          node(
            "p",
            t("报告未记录待处理问题；运行中会话的加载状态仍需单独确认。"),
            "footnote",
          ),
        );
      for (const issue of report.issues) {
        const el = node("article", undefined, "issue");
        el.append(
          node("strong", FEATURE_NAMES[issue.feature] ?? t("同步状态")),
          node("p", t(issue.message)),
        );
        if (issue.nextAction)
          el.append(node("p", t`建议：${t(issue.nextAction)}`));
        if (issue.targets.length)
          el.append(
            node("p", t`受影响 Bot：${DucoroI18n.joinMessages(issue.targets)}`),
          );
        const go = node("button", issue.targets.length ? t("定位 Bot 并重新读取") : t("前往相关设置"), "secondary");
        go.type = "button";
        go.addEventListener("click", () => {
          setTab(issue.targets.length ? "resources" : "settings");
          if (issue.targets.length) { void DucoroResources.refresh().then(()=>DucoroResources.focusBot(issue.targets[0],issue.message)); }
          else if(issue.feature === "models")void openMapping(issue);
          else DucoroComponents.reveal($("switches"));
        });
        const actions = node("div", undefined, "button-group action-row");
        actions.append(go);
        if (issue.feature === "models") { const mapping = node("button", t("调整模型映射"), "secondary"); mapping.onclick = () => { setTab("settings"); void openMapping(issue); }; actions.append(mapping); }
        el.append(actions);
        $("report-issues").append(el);
      }
      message(
        t`${report.syncing ? t("正在同步，当前显示最近已完成的结果。") : t("已生成本次诊断报告。")}报告仅在页面中显示，不保存到本机。`,
        false,
        "report-message",
      );
    }

    async function openMapping(issue){
      const evidence=$("model-explanations");evidence.closest("details").open=true;
      $("references").closest("details").open=true;
      DucoroI18n.setText($("match-context"),t`诊断来源：${issue.message}。正在重新读取对应记录…`);
      await refreshCatalog(false);
      DucoroI18n.setText($("match-context"),t`诊断来源：${issue.message}。${$("match-context").textContent} 没有记录表示证据待更新。`);
      DucoroComponents.reveal(evidence);
    }

    async function refreshReport() {
      const request = ++reportRequest;
      reportBusy = true;
      $("refresh-report").disabled = true;
      $("report-empty").hidden = true;
      message(t("正在生成实时诊断报告…"), false, "report-message");
      try {
        const report = parseDiagnosticReport(await ducoroApi("report"));
        if (request === reportRequest) showReport(report);
      } catch (error) {
        if (request === reportRequest) {
          $("report-empty").hidden = hasReport;
          message(
            DucoroComponents.errorText(error),
            true,
            "report-message",
          );
        }
      } finally {
        if (request === reportRequest) {
          reportBusy = false;
          $("refresh-report").disabled = busy || !ready;
        }
      }
    }

    if (!panel) DucoroResources.getDraft = collect;
    const onEdit=event=>{if(event.target.matches?.('input[type="search"],#bot-filter,#catalog-search')||event.target.closest?.('.resource-search'))return;dirty();};
    document.addEventListener("input", onEdit);
    document.addEventListener("change", onEdit);
    $("save").addEventListener("click", save);
    $("reload").addEventListener("click", async () => {
      if (hasChanges() && !(await confirmReload())) return;
      globalThis.DucoroPlanEditor?.reset();
      void load();
    });
    document.addEventListener("ducoro-controls", () => {
      if (!busy && ready) setBusy(false);
    });
    if (!panel) {
      for (const tab of document.querySelectorAll("[data-tab]"))
        tab.addEventListener("click", () => setTab(tab.dataset.tab));
      $("add-reference").addEventListener("click", () => {
        addReference();
        dirty();
      });
      $("refresh-bots").addEventListener("click", () =>
        DucoroResources.refresh(),
      );
      $("onDisconnect").addEventListener("change", updateToggleLabels);
      for (const key of ["modelScope", "mcpScope", "skillsScope"])
        $(key).addEventListener("change", () => {
          $(key).dataset.activeValue = "agents";
          updateToggleLabels();
          DucoroResources.scopes({
            [key]: $(key).checked ? "agents" : "global",
          });
          dirty();
        });
      $("read-matches").onclick=()=>refreshCatalog(false);
      $("sync-catalog").addEventListener("click", () => refreshCatalog(true));
      $("catalog-search").addEventListener("input", renderCatalog);
      $("preview").addEventListener("click", async () => {
        try {
          if(!panel) await globalThis.DucoroPlanEditor?.commit();
        const edited = validateFields(collect());
          setBusy(true);
          await DucoroPreview.show(edited);
        } catch (error) {
          message(DucoroComponents.errorText(error), true);
        } finally {
          setBusy(false);
        }
      });
      $("retry-state").addEventListener("click", async () => {
        try {
          const state=await ducoroApi("state-status");
          DucoroI18n.setText(
            $("state-message"),
            t(
              state.pending ? t("记录已读取；恢复复核尚未完成，自动同步继续暂停。") : t("管理记录已只读检查；未请求同步。"),
            ),
          );
        } catch (error) {
          DucoroI18n.setText(
            $("state-message"),
            t(DucoroComponents.errorText(error)),
          );
        }
      });
      $("refresh-report").addEventListener("click", refreshReport);
      $("retry-sync").addEventListener("click", async () => {
        try {
          await ducoroApi("retry", {});
          message(
            t("已请求重新同步，请稍后刷新报告。"),
            false,
            "report-message",
          );
        } catch (error) {
          message(
            DucoroComponents.errorText(error),
            true,
            "report-message",
          );
        }
      });
    }

    if (!globalThis.magpie?.ready || !globalThis.magpie?.options) {
      message(t("请从 Magpie 中打开 Ducoro，以读取和保存插件设置。"), true);
      DucoroI18n.setText($("connection-state"), t("尚未连接 Magpie 页面接口"));
      DucoroI18n.setText($("dirty-state"), t("未读取配置"));
    } else {
      try {
        await globalThis.magpie.ready;
        if (!panel && typeof globalThis.magpie.onAction === "function")
          globalThis.magpie.onAction((action) => {
            if (action.id === "diagnostics") setTab("diagnostics");
          });
        await load();
      } catch (error) {
        message(
          t`Magpie 页面接口暂不可用：${DucoroComponents.errorText(error)}`,
          true,
        );
        DucoroI18n.setText($("connection-state"), t("页面接口未就绪"));
      }
    }
  })().catch((error) => {
    const el = document.getElementById("message");
    if (el) {
      el.hidden = false;
      el.classList.add("error");
      DucoroI18n.setText(
        el,
        t`页面暂不可用：${DucoroComponents.errorText(error)}`,
      );
    }
  });
}
