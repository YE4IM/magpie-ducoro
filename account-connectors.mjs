// Account connector assignments are Bot-local, independent of global library
// definitions. Record previous policies so clearing a plugin assignment restores
// user equipment, and stop on edits made outside this plugin.
import { randomUUID } from "node:crypto";
import { list, policyRows, toolRows } from "./inventory-shapes.mjs";
import {
  comparablePolicy as comparable,
  samePolicy as same,
  planAccountConnector,
  accountOrder,
} from "./account-plan.mjs";

export async function syncAccountConnectors({ options, state, run, save, operations }) {
  const desired = options.syncMcp ? (options.accountConnectors ?? {}) : {};
  const owned = (state.accountConnectors ??= {});
  const ids = [...new Set([...Object.keys(desired), ...Object.keys(owned)])];
  if (!ids.length || options.dryRun === true || options.dryRun === "true")
    return;
  const call = async (args) => {
    const response = await run(args, { timeoutMs: 20000 });
    if (!response.ok) throw Error("账户连接器操作未完成；现有分配已保留");
    return response.json;
  };
  const bots = list(await call(["agent", "list"]), ["agents", "bots"]);
  const failures = [];
  const skipped = new Set();
  for (const revoking of [true, false])
    for (const id of ids) {
      if (skipped.has(id)) continue;
      try {
        const bot = bots.find((bot) => bot.id === id);
        if (!bot) {
          delete owned[id];
          await save();
          continue;
        }
        if (
          !["pi-agent", "claude-code", "codex"].includes(
            bot.modelPreference?.runtime,
          )
        )
          throw Error("Bot 不支持账户连接器");
        const current = new Map(
          policyRows(await call(["agent", "connector", "list", id])).map(
            (x) => [x.slug, x],
          ),
        );
        const history = (owned[id] ??= {});
        for (const slug of accountOrder(desired[id], history).filter((slug) =>
          revoking ? !desired[id]?.[slug] : !!desired[id]?.[slug],
        )) {
          const operation = operations ? await operations.begin('accounts',id,slug,{want:desired[id]?.[slug]??null,resolution:options.accountResolutions?.[id]?.[slug]},['account-catalog']) : true;
          if (!operation) continue;
          try {
            const want = desired[id]?.[slug] ?? null;
            const record = history[slug];
            const actual = current.get(slug) ?? null;
            const transition = planAccountConnector(
              actual,
              want,
              record,
              options.accountResolutions?.[id]?.[slug],
            );
            if (transition.conflict) throw Error("连接器配备已由其他页面修改");
            const next = transition.next;
            if (want && !transition.keepExternal) {
              const status = await call(["mcp", "catalog", "status", slug]);
              if ((status.status ?? status.connection?.status) !== "connected")
                throw Error("账户连接器尚未连接");
              const tools = new Set(
                toolRows(await call(["mcp", "catalog", "tools", slug])).map(
                  (x) => x.slug,
                ),
              );
              if (
                !want.allow.length ||
                [...want.allow, ...(want.deny ?? [])].some((x) => !tools.has(x))
              )
                throw Error("工具权限无效或已变化");
            }
            if (!same(actual, next)) {
              const latest =
                policyRows(await call(["agent", "connector", "list", id])).find(
                  (x) => x.slug === slug,
                ) ?? null;
              if (!same(actual, latest))
                throw Error("核对期间工具权限已变化，请刷新后重试");
              // Save the intended transition before the mutation. A lost CLI
              // response is reconciled against pending on the next round.
              history[slug] = {
                ...(record ?? {
                  previous: comparable(actual),
                  applied: comparable(actual),
                }),
                ...(transition.resolved ? { revision: randomUUID() } : {}),
                pending: comparable(next),
              };
              await save();
              if (next) {
                await call([
                  "agent",
                  "connector",
                  actual ? "update" : "add",
                  id,
                  slug,
                  "--allow",
                  next.allow.join(","),
                  ...(next.deny?.length ? ["--deny", next.deny.join(",")] : []),
                ]);
              } else if (actual)
                await call(["agent", "connector", "rm", id, slug]);
              const verified =
                policyRows(await call(["agent", "connector", "list", id])).find(
                  (x) => x.slug === slug,
                ) ?? null;
              if (!same(verified, next)) throw Error("连接器保存结果尚未核实");
            }
            if (want || transition.keepExternal)
              history[slug] = {
                previous: transition.keepExternal
                  ? comparable(actual)
                  : record
                    ? record.previous
                    : comparable(actual),
                applied: comparable(next),
                ...(transition.resolved
                  ? { revision: randomUUID() }
                  : history[slug]?.revision
                    ? { revision: history[slug].revision }
                    : {}),
              };
            else delete history[slug];
            await save();
            await operations?.finish(operation);
          } catch (error) {
            await operations?.finish(operation,false);
            failures.push({ botId: id, slug, reason: error.message });
          }
        }
        if (!Object.keys(history).length) {
          delete owned[id];
          await save();
        }
      } catch (error) {
        skipped.add(id);
        failures.push({ botId: id, slug: null, reason: error.message });
      }
    }
  if (failures.length) {
    const error = Error(`${failures.length} 项账户连接器分配待处理`);
    error.failures = failures;
    throw error;
  }
}
