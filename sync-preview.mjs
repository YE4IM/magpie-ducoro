import "./ui/i18n.js";
const { format, translate, message } = globalThis.DucoroI18n;
// Read-only, projected plan: never return ownership records, endpoints or credentials.
import { contentChanges } from "./content-preview.mjs";
import { join } from "node:path";
import { readManagedState } from "./state-store.mjs";
import {
  planResourceScopes,
  scopedLibrary,
  findUnavailableAssignments,
} from "./resource-scopes.mjs";
import {
  planAccountConnector,
  accountOrder,
  accountRevision,
} from "./account-plan.mjs";
import { modelTarget, modelEligible } from "./model-sync.mjs";
import { policyRows } from "./inventory-shapes.mjs";

const clean = (value) => (typeof value === "string" ? value.slice(0, 500) : "");
const safePolicy = (value) =>
  value == null
    ? null
    : {
        allow: (value.allow ?? []).map(clean),
        deny: (value.deny ?? []).map(clean),
      };
export async function detectCapabilities(run) {
  const commands = {
    modelCatalog: ["connections", "catalog", "--help"],
    botModelWrite: ["agent", "update", "--help"],
    accountPolicy: ["agent", "connector", "list", "--help"],
    accountAdd: ["agent", "connector", "add", "--help"],
    accountUpdate: ["agent", "connector", "update", "--help"],
    accountRemove: ["agent", "connector", "rm", "--help"],
    botMcp: ["agent", "mcp", "list", "--help"],
    botSkills: ["agent", "skill", "list", "--help"],
  };
  return Object.fromEntries(
    await Promise.all(
      Object.entries(commands).map(async ([key, args]) => {
        try {
          return [
            key,
            (await run(args, { timeoutMs: 5000 })).ok
              ? "available"
              : "unavailable",
          ];
        } catch {
          return [key, "unknown"];
        }
      }),
    ),
  );
}
export async function buildSyncPreview({
  options,
  currentOptions,
  paths,
  data,
  stateDir,
  run,
  capabilities,
  language = "zh",
  signal,
  budgetMs = 25000,
}) {
  const result = {
    updatedAt: new Date().toISOString(),
    readOnly: true,
    capabilities,
    rows: [],
    warnings: [...(data.warnings ?? [])],
    stateStatus: "unknown",
  };
  result.warningMessages = [
    ...(data.warningMessages ?? (data.warnings ?? []).map((x) => message(x))),
  ];
  const warn = (key, values = []) => {
    result.warnings.push(format(key, values, language));
    result.warningMessages.push(message(key, values));
  };
  let state;
  try {
    const loaded = await readManagedState(join(stateDir, "state.json"));
    state = loaded.state;
    result.stateStatus = loaded.status;
  } catch (error) {
    result.stateStatus = error.code;
    result.blocked = true;
    warn(error.message);
    return result;
  }
  if (!data.bots) {
    result.blocked = true;
    warn("Bot 列表无法读取，无法确认影响范围。");
    return result;
  }
  const bots = data.bots.map((bot) => ({
    ...bot,
    modelPreference: {
      runtime: bot.runtime,
      connectionSlug: bot.connectionSlug,
      model: bot.model,
    },
  }));
  const rowFor = (id) => {
    let row = result.rows.find((x) => x.id === id);
    if (!row) {
      row = {
        id,
        name:
          id === "global"
            ? translate("全局资源", language)
            : (data.bots.find((x) => x.id === id)?.name ?? id),
        resources: [],
        accounts: [],
        model: null,
      };
      result.rows.push(row);
    }
    return row;
  };
  const plan = planResourceScopes(options, bots);
  if (data.library) {
    const library = Object.fromEntries(
      ["mcp", "skills"].map((kind) => [
        kind,
        data.library[kind].map((x) => ({ ...x, agents: ["ducoro"] })),
      ]),
    );
    for (const issue of findUnavailableAssignments(library, options, plan))
      warn("{0}：指定的{1}当前不可用，相关同步将保留现状或等待重试。", [
        issue.scope,
        message(issue.kind === "skills" ? "技能" : "连接器"),
      ]);
    for (const kind of ["mcp", "skills"]) {
      const scopes =
        kind === "mcp"
          ? options.syncLibraryMcp === false
            ? []
            : plan.mcpScopes
          : plan.skillScopes;
      const wanted = new Map(
        scopes.map((scope) => [
          scope,
          new Set(
            scopedLibrary(library, options, kind, scope)[kind].map(
              (x) => x.name,
            ),
          ),
        ]),
      );
      const owned = new Map();
      for (const [key, value] of Object.entries(state[kind] ?? {})) {
        const scope = value?.scope ?? "global",
          name = value?.sourceName ?? (kind === "skills" ? key : null);
        if (!name) {
          warn(
            "旧版连接器管理记录缺少资源名称，部分移除操作只能在同步时确认。",
          );
          continue;
        }
        const names = owned.get(scope) ?? new Set();
        names.add(name);
        owned.set(scope, names);
      }
      for (const scope of new Set([...wanted.keys(), ...owned.keys()])) {
        const before = owned.get(scope) ?? new Set(),
          after = wanted.get(scope) ?? new Set();
        for (const name of new Set([...before, ...after]))
          if (before.has(name) !== after.has(name))
            rowFor(scope).resources.push({
              kind,
              name,
              action: after.has(name) ? "add" : "remove",
            });
      }
      // Global changes affect Bots with no explicit local assignment too.
      const globalBefore = owned.get("global") ?? new Set(),
        globalAfter = wanted.get("global") ?? new Set();
      for (const bot of bots.filter((x) => x.runtime === "pi-agent")) {
        const before = new Set([...globalBefore, ...(owned.get(bot.id) ?? [])]),
          after = new Set([...globalAfter, ...(wanted.get(bot.id) ?? [])]);
        const gained = [...after].filter((x) => !before.has(x)),
          lost = [...before].filter((x) => !after.has(x));
        if (gained.length || lost.length)
          rowFor(bot.id).resources.push({
            kind,
            action: "effective",
            gained,
            lost,
          });
      }
    }
  } else warn("资源库暂不可读：连接器与技能的变更预览不可用。");
  try {
    for (const change of await contentChanges({ paths, state, options, bots })) {
      const { scope, ...resource } = change;
      rowFor(scope).resources.push(resource);
    }
  } catch { warn("资源内容暂不可读取，内容变化需在同步时核实。"); }
  for (const bot of bots) {
    const row = rowFor(bot.id);
    const target = modelTarget(options, bot.id, data.defaultModel);
    const managed =
      options.syncConnection &&
      options.syncAgentModels &&
      modelEligible(options, bot);
    const sourceReady =
      data.gatewayStatus === undefined || data.gatewayStatus === "connected";
    row.model = {
      current: bot.model,
      desired: managed && sourceReady ? target : null,
      status: !managed
        ? "unmanaged"
        : data.gatewayStatus === "disconnected"
          ? "disconnected"
          : data.gatewayStatus === "unknown"
            ? "source-unknown"
            : !target || !data.models?.some((x) => x.id === target)
              ? "unavailable"
              : capabilities.botModelWrite !== "available"
                ? "unknown"
                : bot.model === target
                  ? "same"
                  : "change",
    };
  }
  const desired = options.syncMcp ? (options.accountConnectors ?? {}) : {};
  const deadline = Date.now() + budgetMs;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  const timer = setTimeout(abort, budgetMs);
  const queue = bots.filter((bot) =>
    ["pi-agent", "claude-code", "codex"].includes(bot.runtime),
  );
  const inspect = async (bot) => {
    const row = rowFor(bot.id),
      history = state.accountConnectors?.[bot.id] ?? {};
    try {
      const response = await run(["agent", "connector", "list", bot.id], {
        timeoutMs: Math.max(1, Math.min(10000, deadline - Date.now())),
        signal: controller.signal,
      });
      if (!response.ok) throw Error();
      const current = policyRows(response.json),
        bySlug = new Map(current.map((x) => [x.slug, x]));
      const slugs = new Set([
        ...accountOrder(desired[bot.id], history),
        ...current.map((x) => x.slug),
      ]);
      for (const slug of slugs) {
        const actual = bySlug.get(slug) ?? null,
          want = desired[bot.id]?.[slug] ?? null,
          record = history[slug];
        if (!want && !record) {
          row.accounts.push({
            slug,
            current: safePolicy(actual),
            desired: null,
            action: "unmanaged",
          });
          continue;
        }
        const transition = planAccountConnector(
          actual,
          want,
          record,
          options.accountResolutions?.[bot.id]?.[slug],
        );
        const connected =
          data.catalog?.items?.find((x) => x.slug === slug)?.status ===
          "connected";
        row.accounts.push({
          slug,
          current: safePolicy(actual),
          desired: safePolicy(transition.next),
          action: transition.action,
          ...(transition.conflict ? { revision: accountRevision(record) } : {}),
          reason: transition.conflict
            ? "工具权限已在 Ducoro 修改，现有权限会保留。"
            : want && !connected
              ? "需要在 Ducoro 连接此账户。"
              : capabilities.accountPolicy !== "available"
                ? "账户工具命令暂不可用。"
                : null,
        });
      }
    } catch {
      row.accountsUnknown = true;
    }
  };
  try {
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (
          queue.length &&
          !controller.signal.aborted &&
          Date.now() < deadline
        ) {
          await inspect(queue.shift());
        }
      }),
    );
    for (const bot of queue) rowFor(bot.id).accountsUnknown = true;
    if (result.rows.some((row) => row.accountsUnknown))
      warn("部分 Bot 的账户权限未能在时限内读取，请刷新后重新预览。");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
  if (signal?.aborted)
    throw Object.assign(Error("预览请求已取消"), { name: "AbortError" });
  // Workers complete out of order; keep the displayed Bot order stable.
  const order = ["global", ...bots.map((bot) => bot.id)];
  result.rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  for (const row of result.rows)
    for (const account of row.accounts)
      if (account.reason) {
        account.reasonMessage = message(account.reason);
        account.reason = translate(account.reason, language);
      }
  for (const id of Object.keys(desired))
    if (!bots.some((x) => x.id === id))
      warn("{0}：Bot 已不存在，账户分配无法执行。", [id]);
  if (options.dryRun === true || options.dryRun === "true")
    warn("已启用试运行：保存后不会执行写入。");
  if (
    options.syncInstructions !== currentOptions.syncInstructions ||
    options.syncSubagents !== currentOptions.syncSubagents ||
    JSON.stringify(options.subagentNames) !==
      JSON.stringify(currentOptions.subagentNames)
  )
    warn(
      "指令与子代理设置也有变化；具体内容及本地运行条件需在同步诊断中核实。",
    );
  warn(
    "此预览核对资源分配范围、模型与账户工具权限。技能与指令已按可读取内容比较；同名冲突、模型能力和运行中会话加载情况仍需在同步时再次校验。",
  );
  return result;
}
