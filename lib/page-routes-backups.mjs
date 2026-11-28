import { join } from "node:path";
import { writeFileAtomic } from "./fs-atomic.mjs";
import {
  backupFileAction,
  clearBackupFiles,
  importBackupFile,
  openBackupDirectory,
  previewBackupDeletion,
  previewBackupImport,
  withBackupLock,
} from "./backup-files.mjs";
import { createCheckpoint } from "./control-center.mjs";
import { cleanLocalRecords, previewLocalRecords } from "./local-records.mjs";
import { readJsonBody } from "./page-http.mjs";
import {
  createStateBackup,
  deleteStateBackup,
  previewStateBackup,
  restoreStateBackup,
  stateBackups,
} from "./state-store.mjs";
import { acquireSyncLock } from "./sync-lock.mjs";

const { translate, message } = globalThis.DucoroI18n;

const LOCAL_RECORD_PUBLIC_ERRORS = {
  "本地记录已变化，请重新预览后清理。": 409,
  "本地记录目录必须是普通目录。": 422,
  "管理记录正在更新，请稍后重试。": 409,
  "管理记录已损坏；原文件已保留，请恢复备份后重新读取。": 409,
  "管理记录版本未知，请恢复兼容的备份后重新读取。": 409,
};

export async function withBackupAction(stateDir, reply, work) {
  try {
    return await withBackupLock(stateDir, work);
  } catch (error) {
    if (error.backupStatus) {
      reply(error.backupStatus, { error: error.message });
      return undefined;
    }
    throw error;
  }
}

export function createBackupRoutes({ options, stateDir }) {
  return async ({ req, path, language, reply }) => {
    if (
      (req.method === "GET" && path === "api/local-records") ||
      (req.method === "POST" && path === "api/local-records/clean")
    ) {
      const value = req.method === "POST" ? await readJsonBody(req, 4096) : null;
      const release = await acquireSyncLock(stateDir);
      if (!release) {
        reply(409, { error: "正在同步，请完成后再清理本地记录。" });
        return true;
      }
      let result;
      let failure;
      try {
        result =
          req.method === "GET"
            ? await previewLocalRecords(stateDir)
            : await cleanLocalRecords(stateDir, value.token);
      } catch (error) {
        failure = error;
      } finally {
        await release();
      }
      if (failure) {
        // Only authored public messages may cross the page API boundary.
        if (Object.hasOwn(LOCAL_RECORD_PUBLIC_ERRORS, failure.message)) {
          reply(LOCAL_RECORD_PUBLIC_ERRORS[failure.message], { error: failure.message });
          return true;
        }
        throw failure;
      }
      if (result.groups) {
        result = {
          ...result,
          groups: result.groups.map((key) => translate(key, language)),
          groupMessages: result.groups.map((key) => message(key)),
        };
      }
      reply(200, result);
      return true;
    }

    const backupAction =
      /^api\/backup-files\/(state|checkpoints)\/(import-preview|import|clear-preview|clear|open-directory|create|metadata|export)$/.exec(
        path,
      );
    if (backupAction && req.method === "POST") {
      const [, kind, action] = backupAction;
      const maxBytes = ["import", "import-preview"].includes(action)
        ? 16 * 1024 * 1024
        : 64 * 1024;
      const value = await readJsonBody(req, maxBytes);
      if (action === "open-directory") {
        try {
          reply(200, await openBackupDirectory(stateDir, kind));
        } catch (error) {
          if (error.backupStatus) {
            reply(error.backupStatus, { error: error.message });
            return true;
          }
          throw error;
        }
        return true;
      }
      if (action === "import-preview") {
        try {
          reply(200, previewBackupImport(kind, value.content));
        } catch (error) {
          if (error.backupStatus) {
            reply(error.backupStatus, { error: error.message });
            return true;
          }
          throw error;
        }
        return true;
      }
      const result = await withBackupAction(stateDir, reply, () => {
        if (["metadata", "export"].includes(action)) {
          return backupFileAction(stateDir, kind, value.id, action, value);
        }
        if (action === "create") {
          return kind === "state"
            ? createStateBackup(join(stateDir, "state.json"))
            : createCheckpoint(stateDir, options, options, true);
        }
        if (action === "import") {
          return importBackupFile(stateDir, kind, value.content, value.token);
        }
        if (action === "clear-preview") {
          return previewBackupDeletion(stateDir, kind);
        }
        return clearBackupFiles(stateDir, kind, value.token);
      });
      if (result !== undefined) reply(200, result);
      return true;
    }

    if (path === "api/state-backups" && req.method === "GET") {
      reply(200, { backups: await stateBackups(join(stateDir, "state.json")) });
      return true;
    }

    if (
      ["api/state-backups/preview", "api/state-backups/restore", "api/state-backups/delete"].includes(
        path,
      ) &&
      req.method === "POST"
    ) {
      const { id, checksum } = await readJsonBody(req, 4096);
      const file = join(stateDir, "state.json");
      if (path.endsWith("preview")) {
        const { state: _state, ...preview } = await previewStateBackup(file, id);
        reply(200, preview);
        return true;
      }
      // Share the writer lock with normal synchronization.
      const release = await acquireSyncLock(stateDir);
      if (!release) {
        reply(409, { error: "正在同步，请完成后再操作备份。" });
        return true;
      }
      try {
        if (path.endsWith("delete")) {
          reply(200, await deleteStateBackup(file, id, checksum));
          return true;
        }
        await restoreStateBackup(file, id, checksum, {
          beforeRestore: () =>
            writeFileAtomic(
              join(stateDir, "restore-review.json"),
              JSON.stringify({ pending: true, at: new Date().toISOString() }),
              { mode: 0o600 },
            ),
        });
      } finally {
        await release();
      }
      reply(200, { restored: true });
      return true;
    }

    return false;
  };
}
