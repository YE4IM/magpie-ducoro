{
  const { t } = globalThis.DucoroI18n;
  (() => {
    const $ = (id) => document.getElementById(id);
    const el = (tag, text, cls) => {
      const n = document.createElement(tag);
      if (text !== undefined) DucoroI18n.setText(n, text);
      if (cls) n.className = cls;
      return n;
    };
    let baseline = {}, issues = [],
      draft = {},
      data = null,
      refreshBusy = false,
      activeDrawer = null,
      comparison = null;
    let comparisonState="idle",comparisonTime=null;
    let requestId = 0,
      draftRevision = 0,
      refreshController = null;
    document.addEventListener("input", event => {
      if(event.target.type==='search'||event.target.closest?.('.resource-search'))return;
      ++draftRevision;
    });
    document.addEventListener("change", event => {
      if(event.target.id==='bot-filter'||event.target.closest?.('.resource-search'))return;
      ++draftRevision;
    });
    const equipmentCounts = new Map();
    const notify = () => {
      ++draftRevision;
      comparisonState="stale";
      applyFilters();
      for (const note of document.querySelectorAll(".comparison-freshness"))
        DucoroI18n.setText(note, t("草稿已变化，可点击「预览变化」重新核对。"));
      document.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const option = (select, value, text) => {
      const n = el("option", text);
      n.value = value;
      select.append(n);
    };
    const labelFor = (text, input) => {
      const n = el("label", text);
      n.append(input);
      return n;
    };
    const select = (entries, value) => {
      const n = el("select");
      for (const [k, v] of entries) option(n, k, v);
      n.value = value;
      return n;
    };
    const picked = (parent, title, checked, onChange) => {
      const row = el("label", undefined, "choice");
      const check = el("input");
      check.type = "checkbox";
      check.checked = checked;
      check.addEventListener("change", () => {
        onChange(check.checked);
        notify();
      });
      row.append(check, el("span", title));
      parent.append(row);
      return check;
    };
    function libraryField(bot, key, title, scopeKey) {
      const box = el("div", undefined, "resource-field");
      box.append(el("h3", title), el("span", t("来自 Magpie"), "source-label"));
      const supported = bot.runtime === "pi-agent";
      if (!supported) {
        box.append(
          el("p", t("此 Bot 的运行方式暂不支持资源库分配。"), "muted"),
        );
        return box;
      }
      if (
        draft[scopeKey] === "agents" &&
        data?.capabilities?.[key === "mcp" ? "botMcp" : "botSkills"] ===
          "unavailable"
      ) {
        box.append(
          el(
            "p",
            t("当前宿主缺少按 Bot 分配此资源的命令，现有设置已保留。"),
            "muted",
          ),
        );
        return box;
      }
      const all = data?.library?.[key];
      if (!all) {
        box.append(el("p", t("资源库暂不可读，保留现有分配。"), "muted"));
        return box;
      }
      const assignment = draft.resourceAssignments[bot.id] ?? {};
      const values = assignment[key];
      const mode = select(
        [
          ["inherit", draft.botPlans?.[bot.id] ? t("继承配置方案") : t("继承资源库勾选")],
          ["custom", t("单独选择")],
          ["none", t("不分配")],
        ],
        values === undefined ? "inherit" : values.length ? "custom" : "none",
      );
      DucoroI18n.setAttribute(
        mode,
        "aria-label",
        t`${bot.name} ${title}分配方式`,
      );
      const details = el("details", undefined, "resource-picker");
      details.dataset.resourceKind=key;
      details.append(el("summary", t`选择${title}`));
      const choices = el("div", undefined, "choices");
      details.append(choices);
      const names = [
        ...new Set([...all.map((x) => x.name), ...(values ?? [])]),
      ];
      for (const name of names)
        picked(
          choices,
          `${name}${all.some((x) => x.name === name) ? "" : t("（当前不可用）")}`,
          (values ?? []).includes(name),
          (checked) => {
            const assignment = (draft.resourceAssignments[bot.id] ??= {});
            const set = new Set(assignment[key] ?? []);
            checked ? set.add(name) : set.delete(name);
            assignment[key] = [...set];
            summary();
          },
        );
      if (!names.length)
        choices.append(el("p", t("资源库中尚无可分配资源。"), "muted"));
      DucoroComponents.searchable(choices,title);
      const effectiveNote=el('p',undefined,'effective-summary');box.append(effectiveNote);
      function summary() {
        DucoroI18n.setText(details.querySelector('summary'),t`已选择 ${draft.resourceAssignments[bot.id]?.[key]?.length??0} 项`);
        const resolved=DucoroPlans.resolve(draft),effective=draft[scopeKey]==='global'?all.map(x=>x.name):resolved.resourceAssignments?.[bot.id]?.[key]??all.map(x=>x.name),source=DucoroPlans.source(draft,bot.id,key),enabled=draft[key==='mcp'?'syncMcp':'syncSkills'];
        DucoroI18n.setText(effectiveNote,`${enabled?'已启用':'已关闭，配置保留'} · ${enabled?'有效资源':'保留选择'} ${effective.length} 项 · 来源：${source.type==='plan'?source.plan:source.type==='override'?'单项指定':'全局设置'}`);
      }
      const sync = () => {
        const global = draft[scopeKey] === "global";
        mode.disabled = global;
        mode.dataset.locked = String(global);
        details.hidden = global || mode.value !== "custom";
        box.querySelector(".inherit-note").hidden = !global;
      };
      mode.addEventListener("change", () => {
        const assignment = (draft.resourceAssignments[bot.id] ??= {});
        if (mode.value === "inherit") delete assignment[key];
        else
          assignment[key] =
            mode.value === "none"
              ? []
              : [...choices.querySelectorAll("input")].flatMap((n, i) =>
                  n.checked ? [names[i]] : [],
                );
        if (!Object.keys(assignment).length)
          delete draft.resourceAssignments[bot.id];
        sync();
        summary();
        notify();
      });
      const notes = el("div", undefined, "resource-notes");
      notes.append(
        el("p", t`全局同步 · ${all.length} 项资源库勾选`, "inherit-note muted"),
        details,
      );
      box.append(mode, notes);
      sync();
      summary();
      return box;
    }
    function modelField(bot) {
      const box = el("div", undefined, "resource-field");
      box.append(
        el("h3", t("模型")),
        el("span", t("来自 Magpie"), "source-label"),
      );
      const inTargets =
        !draft.targetAgents?.length || draft.targetAgents.includes(bot.id);
      const eligible =
        bot.runtime === "pi-agent" &&
        bot.connectionSlug === draft.connectionSlug &&
        inTargets;
      const expectedText=value=>draft.pausedModels?.includes(bot.id)?t("模型管理已暂停，保持当前模型"):!eligible||!draft.syncAgentModels||!draft.syncConnection?t("保持当前模型"):data.gatewayStatus==='disconnected'?t("尚未接入 Magpie，保持当前模型"):data.gatewayStatus==='unknown'?t("接入信息暂不可读，模型同步暂缓"):value||t("已接入，模型目录待更新");
      const model = select(
        [
          ["", draft.botPlans?.[bot.id] ? t("继承配置方案") : t("跟随全局模型")],
          ...(data?.models ?? []).map((x) => [x.id, x.name]),
        ],
        draft.botModels[bot.id] ?? "",
      );
      if (
        draft.botModels[bot.id] &&
        !data?.models?.some((x) => x.id === draft.botModels[bot.id])
      ) {
        option(
          model,
          draft.botModels[bot.id],
          t`${draft.botModels[bot.id]}（当前不可用）`,
        );
        model.value = draft.botModels[bot.id];
      }
      DucoroI18n.setAttribute(model, "aria-label", t`${bot.name} 模型`);
      model.disabled =
        !eligible ||
        draft.modelScope === "global" ||
        !data.models.length ||
        data.capabilities?.botModelWrite === "unavailable";
      model.dataset.locked = String(model.disabled);
      model.addEventListener("change", () => {
        if (model.value) draft.botModels[bot.id] = model.value;
        else delete draft.botModels[bot.id];
        DucoroI18n.setText(
          expectedNote,
          t`Magpie 期望：${expectedText(model.value || draft.botPlansCatalog?.[draft.botPlans?.[bot.id]]?.model || data.defaultModel)}`,
        );
        notify();
      });
      const expected =
        draft.modelScope === "agents"
          ? (draft.botModels[bot.id] ?? draft.botPlansCatalog?.[draft.botPlans?.[bot.id]]?.model ?? data.defaultModel)
          : data.defaultModel;
      const expectedNote = el(
        "p",
        t`Magpie 期望：${expectedText(expected)}`,
        "muted",
      );
      const notes = el("div", undefined, "resource-notes");
      const modelSource=DucoroPlans.source(draft,bot.id,"model");
      notes.append(expectedNote,el("p",`来源：${modelSource.type==='plan'?modelSource.plan:modelSource.type==='override'?'单项指定':'全局设置'} · ${draft.syncAgentModels?'已启用':'已关闭，配置保留'}`));
      if (data.capabilities?.botModelWrite !== "available")
        notes.append(
          el(
            "p",
            t("模型写入命令不可用或未确认，其他资源可独立同步。"),
            "muted",
          ),
        );
      if (!inTargets)
        notes.append(
          el("p", t("此 Bot 不在目标列表中，模型设置保持不变。"), "muted"),
        );
      notes.append(
        el(
          "p",
          eligible
            ? t`全局模型：${data.defaultModel || t("尚不可用")}；当前：${bot.model || t("未配置")}`
            : t`当前：${bot.model || t("未配置")}。仅管理绑定本插件连接的 Pi Agent 模型。`,
          "muted",
        ),
      );
      box.append(model, notes);
      return box;
    }
    function updateAccountSummary(botId) {
      for (const card of $("assignments").children) {
        if (card.dataset.botId !== botId) continue;
        const summary = card.querySelector(".account-summary");
        if (!summary) continue;
        if (Object.hasOwn(draft.accountConnectors, botId)) {
          const count = Object.keys(draft.accountConnectors[botId]).length;
          DucoroI18n.setText(
            summary,
            count ? t`已选择 ${count} 项` : t("不分配"),
          );
        } else
          DucoroI18n.setText(
            summary,
            equipmentCounts.has(botId)
              ? t`已配备 ${equipmentCounts.get(botId)} 项`
              : t("配备待查看"),
          );
      }
    }

    function closeAccountDrawer() {
      if (activeDrawer) activeDrawer.dialog.close();
    }

    function accountField(bot, parent) {
      const title = parent.querySelector("h3");
      const heading = el("div", undefined, "resource-heading");
      title.replaceWith(heading);
      heading.append(title);
      if (!["pi-agent", "claude-code", "codex"].includes(bot.runtime)) return;
      if (data.capabilities?.accountPolicy === "unavailable") {
        heading.append(el("span", t("账户工具命令不可用"), "muted"));
        return;
      }
      const actions = el("div", undefined, "account-actions");
      const summary = el("span", "", "account-summary");
      const button = el("button", t("账户配置"), "text-button");
      button.type = "button";
      DucoroI18n.setAttribute(button, "aria-label", t`${bot.name} 账户配置`);
      DucoroI18n.setAttribute(button, "aria-haspopup", "dialog");
      actions.append(summary, button);
      heading.append(actions);
      button.addEventListener("click", () => openAccountDrawer(bot, button));
    }

    function openAccountDrawer(bot, opener) {
      closeAccountDrawer();
      const dialog = el("dialog", undefined, "account-drawer");
      DucoroI18n.setAttribute(
        dialog,
        "aria-labelledby",
        "account-drawer-title",
      );
      DucoroI18n.setAttribute(
        dialog,
        "aria-describedby",
        "account-drawer-description",
      );
      const header = el("header", undefined, "drawer-header");
      const copy = el("div");
      const title = el("h2", t("账户连接器"));
      title.id = "account-drawer-title";
      const description = el(
        "p",
        t`${bot.name} · 来自 Ducoro · 按 Bot 配备`,
        "muted",
      );
      description.id = "account-drawer-description";
      copy.append(title, description);
      const close = el("button", "×", "drawer-close");
      close.type = "button";
      DucoroI18n.setAttribute(close, "aria-label", t("关闭账户配置"));
      close.autofocus = true;
      close.addEventListener("click", () => dialog.close());
      header.append(copy, close);
      const body = el("div", undefined, "drawer-body");
      const footer = el("footer", undefined, "drawer-footer");
      const done = el("button", t("完成"), "primary");
      done.type = "button";
      done.addEventListener("click", () => dialog.close());
      footer.append(
        el("p", t("关闭后保留草稿，点击「预览并保存」后生效。"), "muted"),
        done,
      );
      dialog.append(header, body, footer);
      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          dialog.close();
      });
      dialog.addEventListener(
        "close",
        () => {
          if (activeDrawer?.dialog === dialog) activeDrawer = null;
          dialog.remove();
          if (!activeDrawer) document.body.classList.remove("drawer-open");
          updateAccountSummary(bot.id);
          if (!activeDrawer && opener.isConnected) opener.focus();
        },
        { once: true },
      );
      document.body.append(dialog);
      activeDrawer = { dialog, botId: bot.id };
      document.body.classList.add("drawer-open");
      dialog.showModal();

      async function load() {
        body.replaceChildren(el("p", t("正在读取当前配备…"), "muted"));
        DucoroI18n.setAttribute(body, "aria-busy", "true");
        try {
          if (!data.catalog || data.catalog.sourceStatus !== "ok")
            throw DucoroI18n.error(
              t(
                "账户目录暂不可用，请关闭抽屉并刷新 Bot 列表后重试。现有配备已保留。",
              ),
            );
          const current = await ducoroApi(
            `equipment?id=${encodeURIComponent(bot.id)}`,
          );
          if (!dialog.open || !dialog.isConnected) return;
          equipmentCounts.set(bot.id, current.length);
          updateAccountSummary(bot.id);
          body.replaceChildren();
          const state = el(
            "p",
            t`当前配备 ${current.length} 项。仅已连接的账户可同步；请先在 Ducoro 中连接需要的服务。`,
            "drawer-state muted",
          );
          DucoroI18n.setAttribute(state, "role", "status");
          const mode = select(
            [
              ["keep", t("保持现有配备")],
              ["custom", t("单独指定")],
              ["none", t("不分配插件管理的连接器")],
            ],
            !Object.hasOwn(draft.accountConnectors, bot.id)
              ? "keep"
              : Object.keys(draft.accountConnectors[bot.id]).length
                ? "custom"
                : "none",
          );
          DucoroI18n.setAttribute(
            mode,
            "aria-label",
            t`${bot.name} 账户连接器分配方式`,
          );
          const choices = el("div", undefined, "account-choices");
          const renderChoices = () => {
            choices.replaceChildren();
            choices.hidden = mode.value !== "custom";
            const policies = draft.accountConnectors[bot.id] ?? {};
            const entries = data.catalog.items.filter(
              (x) => x.status === "connected",
            );
            for (const slug of Object.keys(policies))
              if (!entries.some((x) => x.slug === slug))
                entries.push({ slug, name: slug, status: "unavailable" });
            for (const item of entries) {
              const details = el("details", undefined, "resource-picker");
              const summary = el(
                "summary",
                t`${item.name}${item.status === "connected" ? "" : t("（当前未连接）")} · 已选择 ${policies[item.slug]?.allow?.length ?? 0} 项工具`,
              );
              details.append(summary);
              const content = el("div", undefined, "choices");
              details.append(content);
              const loadTools = el(
                "button",
                t("选择允许使用的工具"),
                "secondary",
              );
              loadTools.type = "button";
              content.append(loadTools);
              loadTools.addEventListener("click", async () => {
                loadTools.disabled = true;
                try {
                  const tools = await ducoroApi(
                    `tools?slug=${encodeURIComponent(item.slug)}`,
                  );
                  if (!content.isConnected) return;
                  content.replaceChildren();
                  const policy = draft.accountConnectors[bot.id]?.[item.slug];
                  const all = [...tools];
                  for (const slug of policy?.allow ?? [])
                    if (!all.some((x) => x.slug === slug))
                      all.push({ slug, name: t`${slug}（当前不可用）` });
                  for (const tool of all) {
                    const check = picked(
                      content,
                      tool.name || tool.slug,
                      (policy?.allow ?? []).includes(tool.slug),
                      (checked) => {
                        const policies = (draft.accountConnectors[bot.id] ??=
                          {});
                        const next = policies[item.slug] ?? {
                          allow: [],
                          deny: [],
                        };
                        const allow = new Set(next.allow);
                        checked
                          ? allow.add(tool.slug)
                          : allow.delete(tool.slug);
                        if (allow.size)
                          policies[item.slug] = {
                            allow: [...allow],
                            deny: (next.deny ?? []).filter(
                              (x) => !allow.has(x),
                            ),
                          };
                        else delete policies[item.slug];
                        DucoroI18n.setText(
                          summary,
                          t`${item.name} · 已选择 ${allow.size} 项工具`,
                        );
                        updateAccountSummary(bot.id);
                      },
                    );
                    check.parentElement.title = tool.description || tool.slug;
                    if(tool.description)check.parentElement.append(el("small",tool.description));
                  }
                  DucoroComponents.searchable(content,"账户工具");
                  if (!all.length)
                    content.append(el("p", t("当前没有可分配工具。"), "muted"));
                } catch (error) {
                  DucoroI18n.setText(
                    state,
                    t(error.localizedMessage ?? error.message),
                  );
                  loadTools.disabled = false;
                }
              });
              choices.append(details);
            }
            if (!entries.length)
              choices.append(
                el(
                  "p",
                  t(
                    "尚无已连接的账户连接器。请先在 Ducoro 连接服务，再刷新列表。",
                  ),
                  "muted",
                ),
              );
          };
          mode.addEventListener("change", () => {
            if (mode.value === "keep") delete draft.accountConnectors[bot.id];
            else if (mode.value === "none")
              draft.accountConnectors[bot.id] = {};
            else
              draft.accountConnectors[bot.id] ??= Object.fromEntries(
                current
                  .filter((x) => x.allow.length)
                  .map((x) => [x.slug, { allow: x.allow, deny: x.deny }]),
              );
            renderChoices();
            updateAccountSummary(bot.id);
            notify();
          });
          body.append(labelFor(t("分配方式"), mode), state, choices);
          renderChoices();
        } catch (error) {
          if (!dialog.open || !dialog.isConnected) return;
          const message = el(
            "p",
            t(error.localizedMessage ?? error.message),
            "notice error",
          );
          DucoroI18n.setAttribute(message, "role", "alert");
          const retry = el("button", t("重试读取"), "secondary");
          retry.type = "button";
          retry.addEventListener("click", load);
          body.replaceChildren(message, retry);
        } finally {
          body.removeAttribute("aria-busy");
        }
      }
      void load();
    }

    const fingerprint = (value) => JSON.stringify(value ?? null);
    function changedBot(id) {
      return ["botModels", "resourceAssignments", "accountConnectors", "accountResolutions", "botPlans", "botInstructions", "modelGuards"].some(key => fingerprint(draft[key]?.[id]) !== fingerprint(baseline[key]?.[id])) || fingerprint(draft.botPlansCatalog?.[draft.botPlans?.[id]]) !== fingerprint(baseline.botPlansCatalog?.[baseline.botPlans?.[id]]) || (draft.pausedModels??[]).includes(id)!==(baseline.pausedModels??[]).includes(id);
    }
    function applyFilters() {
      const query = $("bot-search").value.trim().toLowerCase(), filter = $("bot-filter").value;
      const botsById = new Map((data?.bots ?? []).map(bot => [bot.id, bot]));
      const rowsById = new Map((comparison?.rows ?? []).map(row => [row.id, row]));
      const failedIds = new Set(issues.flatMap(issue => issue.targets ?? []));
      const awaiting=["conflict","unavailable"].includes(filter)&&comparisonState!=="ready";
      let visible = 0;
      for (const card of $("assignments").children) {
        const id = card.dataset.botId, bot = botsById.get(id);
        const row = rowsById.get(id);
        const flags = { changed: changedBot(id), conflict: row?.accounts?.some(x => x.action === "conflict"), unavailable: row?.model?.status === "unavailable", failed: failedIds.has(id) || row?.accountsUnknown };
        const badge=card.querySelector(".bot-dirty");if(badge)DucoroI18n.setText(badge,flags.changed?"有单项草稿":"无单项草稿");
        card.hidden = !(`${bot?.name} ${id}`.toLowerCase().includes(query) && (filter === "all" || awaiting || flags[filter]));
        if (!card.hidden) visible++;
      }
      $("filter-empty").hidden=visible>0||!data?.bots?.length;
      DucoroI18n.setText($("filter-empty"),query?"没有匹配名称或 ID 的 Bot。":"当前筛选没有匹配结果。");
      DucoroI18n.setText($("comparison-state"),awaiting?"差异尚未检查或已过期，暂显示符合名称的 Bot，不能据此确认零冲突。":comparisonState==="ready"?`差异检查于 ${DucoroI18n.render(DucoroI18n.dateTime(comparisonTime),"zh")}；全局设置的有效影响请查看预览。`:comparisonState==="failed"?"名册可用，差异检查失败。请重新检查；原有草稿已保留。":comparisonState==="stale"?"草稿已变化，差异检查已过期。":"差异正在读取或尚未检查。");
      DucoroI18n.setText($("bot-count"), t`显示 ${visible} / ${data?.bots?.length ?? 0} 个 Bot · ${data?.bots?.filter(x => changedBot(x.id)).length ?? 0} 个 Bot 有单项草稿${filter === "failed" ? t("（依据最近报告与预览，先刷新诊断确认）") : ""}`);
    }
    $("bot-search").addEventListener("input", applyFilters);
    $("bot-filter").addEventListener("change", applyFilters);
    $("copy-bots").addEventListener("click", () => {
      const bots = data?.bots?.filter(x => x.runtime === "pi-agent") ?? [];
      const dialog = el("dialog", undefined, "preview-dialog");
      dialog.append(el("h2", t("复制与批量分配")), el("p", t("复制到草稿后仍需预览并保存；模型与资源需开启按 Bot 分配。账户权限需逐 Bot 配置。")));
      const source = select(bots.map(x => [x.id, x.name]), bots[0]?.id ?? "");
      dialog.append(labelFor(t("来源 Bot"), source));
      const keys = new Set(["model", "mcp", "skills"]), targets = new Set();
      for (const [key, title] of [["model", t("模型")], ["mcp", t("资源库连接器")], ["skills", t("技能")]]) picked(dialog, title, true, checked => checked ? keys.add(key) : keys.delete(key));
      dialog.append(el("h3", t("受影响 Bot（请勾选目标）")));
      for (const bot of bots) picked(dialog, `${bot.name} · ${bot.id}`, false, checked => checked ? targets.add(bot.id) : targets.delete(bot.id));
      const notice = el("p", ""), preview = el("button", t("查看应用预览"), "secondary"), apply = el("button", t("确认写入草稿"), "primary"), cancel = el("button", t("关闭"), "secondary");
      apply.disabled = true;
      let plan = null;
      dialog.addEventListener("change", () => { plan = null; apply.disabled = true; });
      preview.onclick = () => {
        plan = { source: source.value, targets: [...targets].filter(id => id !== source.value), keys: [...keys] };
        DucoroI18n.setText(notice, t`来源：${bots.find(x => x.id === plan.source)?.name ?? t("未选择")}；内容：${DucoroI18n.joinMessages(plan.keys.map(key => ({model:t("模型"),mcp:t("资源库连接器"),skills:t("技能")})[key]))}；将覆盖这些 Bot 的对应草稿：${plan.targets.length ? DucoroI18n.joinMessages(plan.targets.map(id => bots.find(x => x.id === id)?.name)) : t("无")}`);
        apply.disabled = !plan.source || !plan.targets.length || !plan.keys.length;
      };
      apply.onclick = () => {
        if (!plan) return;
        const next=DucoroPlans.copyEffective(DucoroWorkspace.collect(),plan.source,plan.targets,plan.keys,data);
        DucoroWorkspace.stage(next); dialog.close();
      };
      cancel.onclick = () => dialog.close();
      dialog.append(notice, DucoroBackupFiles.actions(preview,apply,cancel)); dialog.addEventListener("close", () => dialog.remove(), { once: true }); document.body.append(dialog); dialog.showModal();
    });
    $("check-comparison").onclick=async()=>{const button=$("check-comparison");button.disabled=true;comparisonState="loading";applyFilters();try{const result=await ducoroApi("preview",globalThis.DucoroResources.getDraft?.()??draft);globalThis.DucoroResources.showComparison(result);}catch{comparisonState="failed";applyFilters();}finally{button.disabled=false;}};
    const botCards=new Map();
    function render() {
      const openDetails = new Set([...$("assignments").querySelectorAll("details[open]")].map(node => `${node.closest('[data-bot-id]')?.dataset.botId}:${node.dataset.resourceKind??node.className}`));
      if (
        activeDrawer &&
        data?.bots &&
        !data.bots.some((bot) => bot.id === activeDrawer.botId)
      )
        closeAccountDrawer();
      const roster=new Set((data?.bots??[]).map(bot=>bot.id));
      for(const [id,cached] of botCards)if(!roster.has(id)){cached.node.remove();botCards.delete(id);}
      const comparisons=new Map((comparison?.rows??[]).map(row=>[row.id,row]));
      const shared=JSON.stringify([data?.library,data?.models,data?.capabilities,data?.defaultModel,draft.targetAgents,draft.connectionSlug,draft.syncAgentModels,draft.syncConnection,draft.modelScope,draft.mcpScope,draft.skillsScope,draft.botPlansCatalog,draft.pausedModels,draft.syncMcp,draft.syncSkills,data?.gatewayStatus,document.documentElement.lang]);
      $("assignment-empty").hidden = !data?.bots || data.bots.length > 0;
      if (!data?.bots) return;
      let cursor=$('assignments').firstElementChild;
      const place=node=>{if(node===cursor)cursor=cursor.nextElementSibling;else $('assignments').insertBefore(node,cursor);};
      for (const bot of data.bots) {
        const signature=shared+JSON.stringify([bot,draft.botModels?.[bot.id],draft.botInstructions?.[bot.id],draft.botPlans?.[bot.id],draft.resourceAssignments?.[bot.id],draft.accountConnectors?.[bot.id],draft.accountResolutions?.[bot.id],comparisons.get(bot.id)]);
        const cached=botCards.get(bot.id);
        if(cached?.signature===signature){place(cached.node);const freshness=cached.node.querySelector('.comparison-freshness');if(freshness&&comparison)DucoroI18n.setText(freshness,t`读取于 ${DucoroI18n.render(DucoroI18n.dateTime(comparison.updatedAt,true),"zh")}`);updateAccountSummary(bot.id);continue;}
        const card = el("section", undefined, "assignment-row");
        card.dataset.botId = bot.id;
        const heading = el("div", undefined, "bot-heading");
        heading.append(el("h3", bot.name), el("span", bot.id, "bot-id"),el("span",changedBot(bot.id)?"有单项草稿":"无单项草稿","pill bot-dirty"));
        if(draft.pausedModels?.includes(bot.id)){const resume=el("button","恢复模型管理","secondary");resume.onclick=()=>{const next=DucoroWorkspace.collect();next.pausedModels=next.pausedModels.filter(id=>id!==bot.id);DucoroWorkspace.stage(next);};heading.append(el("strong","模型管理已暂停"),resume);}
        card.append(heading);
        const inherited = draft.botPlans?.[bot.id];
        if (inherited) {
          card.append(el('p', t`继承方案：${draft.botPlansCatalog?.[inherited]?.name ?? inherited}`));
          const reset = el('button', t('清除单项覆盖，跟随方案'));
          reset.type = 'button'; reset.className = 'secondary';
          reset.onclick = () => { DucoroWorkspace.stage(DucoroPlans.clearOverrides(DucoroWorkspace.collect(),bot.id)); };
          card.append(reset);
        }
        const grid = el("div", undefined, "resource-grid");
        const connectors = libraryField(bot, "mcp", t("连接器"), "mcpScope");
        accountField(bot, connectors);
        grid.append(
          modelField(bot),
          connectors,
          libraryField(bot, "skills", t("技能"), "skillsScope"),
        );
        card.append(grid);
        const row = comparisons.get(bot.id);
        if (row) {
          const details = el("details", undefined, "bot-comparison");
          details.append(
            el("summary", t("期望与当前状态")),
            el(
              "p",
              t`读取于 ${DucoroI18n.render(DucoroI18n.dateTime(comparison.updatedAt, true),"zh")}`,
              "comparison-freshness muted",
            ),
          );
          details.append(
            DucoroPreview.renderRow(row, (id, item, mode) =>
              globalThis.DucoroResources.resolveConflict(id, item, mode),
            ),
          );
          card.append(details);
        }
        if(cached){DucoroComponents.preserveFocus(cached.node,()=>cached.node.replaceChildren(...card.childNodes));cached.signature=signature;place(cached.node);}
        else {botCards.set(bot.id,{node:card,signature});place(card);}
        updateAccountSummary(bot.id);
        if (document.body.dataset.busy === "true")
          for (const input of card.querySelectorAll("input,select,button"))
            input.disabled = true;
      }
      for (const node of $("assignments").querySelectorAll("details")) node.open = openDetails.has(`${node.closest('[data-bot-id]')?.dataset.botId}:${node.dataset.resourceKind??node.className}`);
      applyFilters();
    }
    globalThis.DucoroResources = {
      set(options, preserveBaseline = false) {
        ++requestId;
        ++draftRevision;
        refreshController?.abort();
        refreshBusy = false;
        closeAccountDrawer();
        if (!preserveBaseline) baseline = structuredClone(options);
        draft = structuredClone(options);
        comparison = null;
        comparisonState="idle";
        render();
      },
      updateSettings(options){const keys=['syncConnection','syncAgentModels','syncMcp','syncSkills','syncInstructions','syncSubagents','targetAgents','connectionSlug','modelScope','mcpScope','skillsScope'];if(keys.some(k=>JSON.stringify(options[k])!==JSON.stringify(draft[k]))){for(const k of keys)draft[k]=structuredClone(options[k]);comparisonState='stale';render();}},
      setIssues(value) { issues = value; applyFilters(); },
      focusBot(id,reason) { $("bot-search").value = id; $("bot-filter").value = "all"; applyFilters();const card=botCards.get(id)?.node;if(card){if(reason){let note=card.querySelector(".jump-reason");if(!note){note=el("p",undefined,"jump-reason notice");card.prepend(note);}DucoroI18n.setText(note,reason);}DucoroComponents.reveal(card.querySelector("h3"));} },
      showComparison(value) {
        ++draftRevision;
        comparison = value;comparisonState="ready";comparisonTime=value.updatedAt;
        render();
      },
      resolveConflict(id, item, mode) {
        draft.accountResolutions ??= {};
        draft.accountResolutions[id] ??= {};
        draft.accountResolutions[id][item.slug] = {
          mode,
          revision: item.revision,
          actual: item.current,
        };
        if (mode === "keep") {
          draft.accountConnectors[id] ??= {};
          if (item.current?.allow.length)
            draft.accountConnectors[id][item.slug] = structuredClone(
              item.current,
            );
          else delete draft.accountConnectors[id][item.slug];
        }
        notify();
        for (const note of document.querySelectorAll(".comparison-freshness"))
          DucoroI18n.setText(note, t("冲突处理已加入草稿，请重新预览后保存。"));
      },
      collect() {
        const assignments = Object.fromEntries(
          Object.entries(draft.resourceAssignments ?? {}).filter(
            ([, x]) => Object.keys(x).length,
          ),
        );
        return {
          accountResolutions: draft.accountResolutions ?? {},
          resourceAssignments: assignments,
          botModels: draft.botModels ?? {},
          accountConnectors: draft.accountConnectors ?? {},
        };
      },
      scopes(values) {
        ++draftRevision;
        Object.assign(draft, values);
        render();
      },
      get inventory() { return structuredClone(data); },
      get bots() { return data?.bots ?? []; },
      get refreshing() {
        return refreshBusy;
      },
      async refresh() {
        if (refreshBusy) return;
        refreshBusy = true;
        const request = ++requestId;
        refreshController = new AbortController();
        const signal = refreshController.signal;
        $("refresh-bots").disabled = true;
        DucoroI18n.setText($("inventory-state"), t("正在刷新 Bot 和资源…"));
        try {
          const next = await ducoroApi("inventory", undefined, { signal });
          if (request !== requestId) return;
          // A failed source is not an empty source. Preserve a successful roster
          // and all draft assignments until the source can be read again.
          data = {
            ...next,
            bots: next.bots ?? data?.bots ?? null,
            library: next.library ?? data?.library ?? null,
          };
          if (next.bots) {
            const ids = new Set(next.bots.map((x) => x.id));
            for (const key of [
              "resourceAssignments",
              "botModels",
              "accountConnectors",
            ])
              for (const id of Object.keys(draft[key] ?? {}))
                if (!ids.has(id)) delete draft[key][id];
          }
          comparison = null;
        comparisonState="idle";
          render();
          document.dispatchEvent(new Event("ducoro-inventory"));
          document.dispatchEvent(new Event("ducoro-controls"));
          DucoroI18n.setText(
            $("inventory-message"),
            t(
              DucoroI18n.joinMessages(
                (next.warningMessages ?? next.warnings).map((x) => t(x)),
                " ",
              ),
            ),
          );
          $("inventory-message").hidden = !next.warnings.length;
          DucoroI18n.setText(
            $("inventory-state"),
            next.bots
              ? t`${next.bots.length} 个 Bot · 刷新于 ${DucoroI18n.render(DucoroI18n.dateTime(next.updatedAt, true),"zh")} · 未保存的选择已保留`
              : t("Bot 列表读取失败，现有选择已保留。"),
          );
          const revision = draftRevision;
          const snapshot = structuredClone(
            globalThis.DucoroResources.getDraft?.() ?? draft,
          );
          try {
            const nextComparison = await ducoroApi("preview", snapshot, {
              inventoryToken: next.inventoryToken, signal,
            });
            if (request !== requestId) return;
            if(revision!==draftRevision){comparisonState="stale";applyFilters();return;}
            comparison = nextComparison;comparisonState="ready";comparisonTime=nextComparison.updatedAt;
            render();
          document.dispatchEvent(new Event("ducoro-inventory"));
            document.dispatchEvent(new Event("ducoro-controls"));
          } catch {
            if(request===requestId){comparisonState="failed";applyFilters();}
          }
        } catch (error) {
          if (request === requestId)
            DucoroI18n.setText(
              $("inventory-state"),
              t(error.localizedMessage ?? error.message),
            );
        } finally {
          if (request === requestId) {
            refreshBusy = false;
            $("refresh-bots").disabled = document.body.dataset.busy === "true";
            document.dispatchEvent(new Event("ducoro-controls"));
          }
        }
      },
    };
  })();
}
