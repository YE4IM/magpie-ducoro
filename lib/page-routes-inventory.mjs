import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { inspectBots } from "./bot-inspection.mjs";
import { projectOptions, revision } from "./control-center.mjs";
import { policyRows, toolRows } from "./inventory-shapes.mjs";
import { validateOptions } from "./options.mjs";
import { readJsonBody } from "./page-http.mjs";
import * as Plans from "./plan-rules.mjs";
import { readManagedState } from "./state-store.mjs";
import { acquireSyncLock } from "./sync-lock.mjs";
import { buildSyncPreview, detectCapabilities } from "./sync-preview.mjs";

const { localizeReport } = globalThis.DucoroI18n;

export function createInventoryRoutes({
  options,
  paths,
  stateDir,
  run,
  trigger,
  getReport,
  getModelCatalog,
  getLastVerification,
  inventory,
}) {
  let inventorySnapshot = null;
  let resumePreview = null;
  let capabilityFlight = null;
  let capabilityCache = null;
  let capabilityTime = 0;

  const call = async (args) => {
    const result = await run(args, { timeoutMs: 20000 });
    if (!result.ok) {
      throw Error("Ducoro 暂不可用，或不支持此操作。请检查后台及账户状态。");
    }
    return result.json;
  };

  const getCapabilities = async () => {
    if (!capabilityCache || Date.now() - capabilityTime > 30000) {
      capabilityFlight ??= detectCapabilities(run).finally(() => {
        capabilityFlight = null;
      });
      capabilityCache = await capabilityFlight;
      capabilityTime = Date.now();
    }
    return capabilityCache;
  };

  return async ({ req, path, url, language, signal, reply }) => {
    if (req.method === "GET" && path === "api/state-status") {
      let loaded;
      try {
        loaded = await readManagedState(join(stateDir, "state.json"));
      } catch (error) {
        loaded = { status: error.code ?? "unreadable" };
      }
      let review;
      try {
        review = JSON.parse(await readFile(join(stateDir, "restore-review.json"), "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      reply(200, {
        pending: Boolean(review),
        readable: loaded.status === "ready",
        status: loaded.status,
        at: review?.at ?? null,
      });
      return true;
    }

    if (req.method === "POST" && path === "api/resume-reviewed") {
      const value = await readJsonBody(req, 4096);
      const release = await acquireSyncLock(stateDir);
      if (!release) {
        reply(409, { error: "正在同步，请稍后重试。" });
        return true;
      }
      try {
        const review = JSON.parse(
          await readFile(join(stateDir, "restore-review.json"), "utf8"),
        );
        const state = (await readManagedState(join(stateDir, "state.json"))).state;
        if (
          !resumePreview ||
          value.token !== resumePreview.token ||
          Date.now() - resumePreview.at > 120000 ||
          resumePreview.options !== revision(projectOptions(options)) ||
          resumePreview.state !== revision(state) ||
          review.at !== resumePreview.reviewAt
        ) {
          reply(409, { error: "记录或配置已变化，请重新预览影响。" });
          return true;
        }
        await writeFile(
          join(stateDir, "restore-review.json"),
          JSON.stringify({ ...review, approved: true }),
          { mode: 0o600 },
        );
        resumePreview = null;
      } finally {
        await release();
      }
      trigger("page-resume-reviewed", 0);
      reply(200, { queued: true });
      return true;
    }

    if (req.method === "GET" && path === "api/inventory") {
      const [data, capabilities] = await Promise.all([
        inventory({ options, paths, run, language, signal }),
        getCapabilities(),
      ]);
      const inventoryToken = randomBytes(16).toString("hex");
      inventorySnapshot = {
        token: inventoryToken,
        data: structuredClone(data),
        language,
        slug: options.connectionSlug,
        at: Date.now(),
      };
      reply(200, { ...data, capabilities, inventoryToken });
      return true;
    }

    if (path === "api/bot-inspection" && req.method === "GET") {
      const [data, loaded, report] = await Promise.all([
        inventory({ options, paths, run, language, signal }),
        readManagedState(join(stateDir, "state.json")),
        getReport(),
      ]);
      if (!data.bots) {
        reply(503, { error: "暂时无法读取 Bot 列表，请刷新后重试。" });
        return true;
      }
      const lastVerification = getLastVerification();
      const evidence =
        !report?.syncing &&
        Date.parse(lastVerification?.startedAt) >= (Date.parse(report?.lastSyncedAt) || 0)
          ? lastVerification
          : null;
      reply(
        200,
        await inspectBots({ options, data, paths, state: loaded.state, verification: evidence, signal }),
      );
      return true;
    }

    if (req.method === "GET" && path === "api/report") {
      reply(200, localizeReport(await getReport(), language));
      return true;
    }

    if (path === "api/model-catalog" && ["GET", "POST"].includes(req.method)) {
      try {
        const force = req.method === "POST";
        const catalog = await getModelCatalog(force);
        if (force) trigger("page-model-catalog", 0);
        reply(200, catalog);
      } catch (error) {
        reply(503, { error: error.message });
      }
      return true;
    }

    if (req.method === "GET" && path === "api/tools") {
      const slug = url.searchParams.get("slug");
      if (!/^[a-zA-Z0-9_-]+$/.test(slug ?? "")) {
        reply(400, { error: "连接器标识无效" });
        return true;
      }
      reply(200, toolRows(await call(["mcp", "catalog", "tools", slug])));
      return true;
    }

    if (req.method === "GET" && path === "api/equipment") {
      const id = url.searchParams.get("id");
      if (!/^agt-[A-Za-z0-9-]+$/.test(id ?? "")) {
        reply(400, { error: "Bot 标识无效" });
        return true;
      }
      reply(200, policyRows(await call(["agent", "connector", "list", id])));
      return true;
    }

    if (req.method === "POST" && ["api/validate", "api/preview"].includes(path)) {
      const value = await readJsonBody(req);
      const requested = { ...options, ...value };
      if (validateOptions(requested).length) {
        reply(400, { error: "设置格式无效，请检查分配和工具权限。" });
        return true;
      }
      if (
        options.planTrial &&
        requested.planTrial &&
        revision(requested.botPlansCatalog?.[options.planTrial.planId]) !==
          revision(options.botPlansCatalog?.[options.planTrial.planId])
      ) {
        reply(409, { error: "请先推广或结束此方案的试用，再编辑方案。" });
        return true;
      }
      if (path === "api/validate") {
        reply(200, { valid: true });
        return true;
      }

      resumePreview = null;
      const next = Plans.resolve(requested);
      const deadline = Date.now() + 40000;
      const previewSignal = AbortSignal.any([signal, AbortSignal.timeout(40000)]);
      const canUseSnapshot =
        inventorySnapshot &&
        req.headers["x-ducoro-inventory"] === inventorySnapshot.token &&
        Date.now() - inventorySnapshot.at < 15000 &&
        inventorySnapshot.language === language &&
        inventorySnapshot.slug === next.connectionSlug;
      const [data, capabilities] = await Promise.all([
        canUseSnapshot
          ? Promise.resolve(structuredClone(inventorySnapshot.data))
          : inventory({ options: next, paths, run, language, signal: previewSignal }),
        getCapabilities(),
      ]);
      if (previewSignal.aborted) {
        reply(503, { error: "预览读取超时，请稍后重试。" });
        return true;
      }
      let reviewBefore;
      try {
        reviewBefore = await readFile(join(stateDir, "restore-review.json"), "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const stateBefore = revision(
        await readManagedState(join(stateDir, "state.json"))
          .then((x) => x.state)
          .catch(() => null),
      );
      const result = await buildSyncPreview({
        options: next,
        currentOptions: Plans.resolve(options),
        sourceOptions: requested,
        currentSourceOptions: options,
        data,
        stateDir,
        paths,
        run,
        capabilities,
        language,
        signal: previewSignal,
        budgetMs: Math.max(1, Math.min(25000, deadline - Date.now() - 500)),
      });
      // Review grants apply only to a successful preview of saved settings.
      if (
        !result.blocked &&
        revision(projectOptions(requested)) === revision(projectOptions(options))
      ) {
        try {
          const reviewRaw = await readFile(join(stateDir, "restore-review.json"), "utf8");
          const review = JSON.parse(reviewRaw);
          const state = (await readManagedState(join(stateDir, "state.json"))).state;
          if (reviewBefore !== reviewRaw || stateBefore !== revision(state)) {
            reply(409, { error: "管理记录已变化，请重新预览。" });
            return true;
          }
          resumePreview = {
            token: randomBytes(24).toString("hex"),
            at: Date.now(),
            reviewAt: review.at,
            state: revision(state),
            options: revision(projectOptions(options)),
          };
          result.resumeToken = resumePreview.token;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      reply(200, result);
      return true;
    }

    return false;
  };
}
