import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  checkpoints,
  createCheckpoint,
  inspectDrift,
  projectOptions,
  revision,
  rollbackDraft,
} from "./control-center.mjs";
import { readDraft, saveDraft, withDraftLock } from "./draft-store.mjs";
import { inspectSyncLock } from "./lock-diagnostics.mjs";
import {
  failureAdvice,
  readOperationControls,
  setOperationControl,
} from "./operation-controls.mjs";
import { readJsonBody } from "./page-http.mjs";
import { withBackupAction } from "./page-routes-backups.mjs";
import * as Plans from "./plan-rules.mjs";
import { readManagedState } from "./state-store.mjs";
import { verifyConfiguration } from "./verification.mjs";

export function createControlRoutes({
  options,
  paths,
  stateDir,
  run,
  trigger,
  getReport,
  getProgress,
  setLastVerification,
  log,
}) {
  let verificationJob = null;

  return async ({ req, path, signal, reply }) => {
    if (path === "api/lock" && req.method === "GET") {
      reply(200, await inspectSyncLock(stateDir));
      return true;
    }

    if (path === "api/draft" && ["GET", "POST"].includes(req.method)) {
      const file = join(stateDir, "page-draft.json");
      if (req.method === "GET") {
        reply(200, await readDraft(file));
        return true;
      }
      const value = await readJsonBody(req, 1024 * 1024);
      reply(200, await withDraftLock(stateDir, () => saveDraft(file, value)));
      return true;
    }

    if (req.method === "GET" && path === "api/checkpoints") {
      reply(200, {
        revision: revision(projectOptions(options)),
        checkpoints: await checkpoints(stateDir, options),
      });
      return true;
    }

    if (req.method === "GET" && path === "api/drift") {
      const loaded = await readManagedState(join(stateDir, "state.json"));
      reply(
        200,
        await inspectDrift({ options, state: loaded.state, paths, run, signal }),
      );
      return true;
    }

    if (req.method === "POST" && ["api/checkpoints", "api/rollback-preview"].includes(path)) {
      const value = await readJsonBody(req);
      if (path === "api/checkpoints") {
        if (
          revision(projectOptions(value.before ?? {})) !==
          revision(projectOptions(options))
        ) {
          reply(409, { error: "Configuration changed; reload before saving" });
          return true;
        }
        const checkpoint = await withBackupAction(stateDir, reply, () =>
          createCheckpoint(stateDir, value.before, value.after),
        );
        if (checkpoint !== undefined) reply(200, { checkpoint });
        return true;
      }

      if (value.revision && value.revision !== revision(projectOptions(options))) {
        reply(409, { error: "Configuration changed; reload before saving" });
        return true;
      }
      const result = await rollbackDraft(stateDir, value.id, value.selections, options);
      const loaded = await readManagedState(join(stateDir, "state.json"));
      const next = Plans.resolve(result.options);
      const current = Plans.resolve(options);
      // Inspect resumed and newly targeted Bots too, even when current
      // settings exclude them from normal drift reporting.
      const drift = await inspectDrift({
        options: {
          ...options,
          connectionSlug: next.connectionSlug,
          pausedModels: [],
          targetAgents: [],
        },
        state: loaded.state,
        paths,
        run,
        signal,
      });
      const manages = (id) =>
        next.syncConnection !== false &&
        next.syncAgentModels !== false &&
        !(next.pausedModels ?? []).includes(id) &&
        (!next.targetAgents?.length || next.targetAgents.includes(id));
      const affectsAll =
        next.syncConnection !== false &&
        next.syncAgentModels !== false &&
        result.changes.some((x) =>
          ["modelScope", "connectionSlug", "syncAgentModels", "syncConnection", "targetAgents"].includes(
            x.key,
          ),
        );
      const targets = new Set(
        [
          ...[
            ...new Set([
              ...Object.keys(next.botModels ?? {}),
              ...Object.keys(current.botModels ?? {}),
            ]),
          ].filter((id) => next.botModels[id] !== current.botModels[id]),
          ...(current.pausedModels ?? []).filter(
            (id) => !(next.pausedModels ?? []).includes(id),
          ),
        ].filter(manages),
      );
      const affectedRows = drift.rows.filter(
        (r) =>
          r.feature === "models" &&
          manages(r.target) &&
          (affectsAll || targets.has(r.target)),
      );
      if (
        (affectsAll || targets.size) &&
        (drift.unknown ||
          [...targets].some(
            (id) => !affectedRows.some((r) => r.target === id && r.status === "same"),
          ) ||
          affectedRows.some((r) => r.status !== "same"))
      ) {
        reply(409, {
          error: "Current model configuration has changed or cannot be verified; resolve drift first",
        });
        return true;
      }
      let source;
      try {
        source = JSON.parse(await readFile(paths.bridge, "utf8"));
      } catch (error) {
        if (error.code !== "ENOENT") {
          log("could not read bridge export for rollback check:", error?.message ?? error);
        }
      }
      const fallback = typeof source?.model === "string" ? source.model : source?.model?.id;
      result.options.modelGuards ??= {};
      for (const row of affectedRows.filter((row) => row.revision)) {
        const model =
          next.modelScope === "agents" ? next.botModels?.[row.target] ?? fallback : fallback;
        if (!model) {
          reply(409, { error: "Cannot verify the restoration model" });
          return true;
        }
        result.options.modelGuards[row.target] = { revision: row.revision, model };
      }
      reply(200, result);
      return true;
    }

    if (req.method === "GET" && path === "api/progress") {
      reply(200, getProgress());
      return true;
    }

    if (path === "api/verification-progress" && req.method === "GET") {
      reply(200, verificationJob ?? { running: false, rows: [] });
      return true;
    }

    if (path === "api/verification-start" && req.method === "POST") {
      if (!verificationJob?.running) {
        verificationJob = { running: true, rows: [], updatedAt: new Date().toISOString() };
        void (async () => {
          try {
            const loaded = await readManagedState(join(stateDir, "state.json"));
            const result = await verifyConfiguration({
              options,
              state: loaded.state,
              run,
              paths,
              report: await getReport(),
              onProgress: (partial) => {
                verificationJob = { ...verificationJob, ...partial };
              },
            });
            setLastVerification(result);
            verificationJob = { ...result, running: false };
          } catch (error) {
            log("verification failed:", error?.message ?? error);
            verificationJob = { running: false, rows: [], error: "Verification unavailable" };
          }
        })();
      }
      reply(200, verificationJob);
      return true;
    }

    if (path === "api/verification" && ["GET", "POST"].includes(req.method)) {
      const loaded = await readManagedState(join(stateDir, "state.json"));
      reply(
        200,
        await verifyConfiguration({
          options,
          state: loaded.state,
          run,
          paths,
          signal,
          report: await getReport(),
        }),
      );
      return true;
    }

    if (path === "api/operations" && req.method === "GET") {
      const [loaded, controls] = await Promise.all([
        readManagedState(join(stateDir, "state.json")),
        readOperationControls(stateDir),
      ]);
      const all = Object.entries(loaded.state.operations ?? {});
      reply(200, {
        summary: {
          total: all.length,
          completed: all.filter(([, r]) => r.status === "completed").length,
          failed: all.filter(([, r]) => r.status === "failed").length,
        },
        operations: all
          .sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
          .map(([id, row]) => ({
            id,
            feature: row.feature,
            target: row.target,
            resource: row.resource,
            status: row.status,
            attempts: row.attempts,
            failureClass: row.failureClass ?? null,
            paused: Boolean(controls[id]?.paused),
            updatedAt: row.updatedAt,
            nextRetryAt: row.nextRetryAt ?? null,
            needsAttention: row.status === "failed" && row.failureClass !== "temporary",
            advice: row.status === "failed" ? failureAdvice(row.failureClass) : null,
          })),
      });
      return true;
    }

    if (path === "api/operations" && req.method === "POST") {
      const value = await readJsonBody(req, 4096);
      if (
        !/^[a-f0-9]{64}$/.test(value.id ?? "") ||
        !["retry", "pause", "resume"].includes(value.action)
      ) {
        reply(422, { error: "Invalid operation control" });
        return true;
      }
      let operationFeature;
      const done = await withBackupAction(stateDir, reply, async () => {
        const loaded = await readManagedState(join(stateDir, "state.json"));
        if (!loaded.state.operations?.[value.id]) {
          throw Object.assign(Error("Operation changed; refresh the list"), {
            backupStatus: 409,
          });
        }
        operationFeature = loaded.state.operations[value.id].feature;
        await setOperationControl(stateDir, value.id, value.action === "pause");
        return true;
      });
      if (done === undefined) return true;
      if (value.action !== "pause") {
        trigger(`page-operation:${value.id}:${operationFeature}`, 0);
      }
      reply(200, { queued: value.action !== "pause" });
      return true;
    }

    if (req.method === "POST" && path === "api/retry-failed") {
      trigger("page-retry-failed", 0);
      reply(200, { queued: true });
      return true;
    }

    if (req.method === "POST" && path === "api/retry") {
      try {
        await readFile(join(stateDir, "restore-review.json"));
        reply(409, {
          error: "恢复后的自动同步已暂停，请先预览影响并继续同步。",
        });
        return true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      trigger("page-retry", 0);
      reply(200, { queued: true });
      return true;
    }

    return false;
  };
}
