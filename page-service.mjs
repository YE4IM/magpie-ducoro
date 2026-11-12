import {readJsonBody,apiFailure} from './page-http.mjs';
import {readDraft,saveDraft,withDraftLock} from './draft-store.mjs';
import {failureAdvice,readOperationControls,setOperationControl} from './operation-controls.mjs';
import { inspectSyncLock } from "./lock-diagnostics.mjs";
import { acquireSyncLock } from "./sync-lock.mjs";
import { previewLocalRecords, cleanLocalRecords } from "./local-records.mjs";
import { backupFileAction, openBackupDirectory, previewBackupImport, importBackupFile, previewBackupDeletion, clearBackupFiles, withBackupLock } from './backup-files.mjs';
import { createCheckpoint, checkpoints, rollbackDraft, inspectDrift, revision, projectOptions } from "./control-center.mjs";
import "./ui/plans.js";
import "./ui/i18n.js";
const { translate, format, localizeReport, languageFor, message } =
  globalThis.DucoroI18n;
// Loopback page service. Inventory is projected explicitly: no raw credentials,
// account records, endpoint URLs, server arguments or skill bodies reach HTML.
import { createServer } from "node:http";
import {validateLibrary} from './library-schema.mjs';
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { readManagedState, stateBackups, previewStateBackup, restoreStateBackup } from "./state-store.mjs";
import { createStateBackup, deleteStateBackup } from "./state-store.mjs";
import { verifyConfiguration } from "./verification.mjs";
import { rm } from "node:fs/promises";
import { validateOptions } from "./options.mjs";
import { buildSyncPreview, detectCapabilities } from "./sync-preview.mjs";

import {
  text,
  list,
  selected,
  policyRows,
  toolRows,
} from "./inventory-shapes.mjs";
export { list, selected, policyRows, toolRows } from "./inventory-shapes.mjs";
const jsonFile=async path=>JSON.parse(await readFile(path,"utf8"));

export function gatewayModelState(value) {
  const object = (x) =>
    x !== null && typeof x === "object" && !Array.isArray(x);
  const gateway = value?.gateway === undefined ? {} : value.gateway;
  if (
    !object(value) ||
    !object(gateway) ||
    !["url", "v1", "key"].every(
      (k) => gateway[k] === undefined || typeof gateway[k] === "string",
    )
  )
    return { status: "unknown", model: "" };
  const url = (gateway.url ?? "").trim(),
    key = (gateway.key ?? "").trim();
  if (Boolean(url) !== Boolean(key)) return { status: "unknown", model: "" };
  const model = typeof value.model === "string" ? value.model : value.model?.id;
  return {
    status: url ? "connected" : "disconnected",
    model: url ? text(model) : "",
  };
}

export async function inventory({
  options,
  paths,
  run,
  language = "en",
  signal,
}) {
  const warnings = [],
    warningMessages = [];
  const warn = (key, values = []) => {
    warnings.push(format(key, values, language));
    warningMessages.push(message(key, values));
  };
  const read = async (args, label, project) => {
    try {
      const result = await run(args, { timeoutMs: 15000, signal });
      if (!result.ok) throw Error();
      return project(result.json);
    } catch {
      warn("{0}读取失败，请确认 Ducoro 已启动并刷新。", [message(label)]);
      return null;
    }
  };
  const [bots, routes, catalog, library, gateway] = await Promise.all([
    read(["agent", "list"], "Bot 列表", (value) =>
      list(value, ["agents", "bots"]).map((x) => ({
        id: text(x.id),
        name: text(x.name) || text(x.id),
        runtime: text(x.modelPreference?.runtime),
        connectionSlug: text(x.modelPreference?.connectionSlug),
        model: text(x.modelPreference?.model),
      })),
    ),
    read(["connections", "list", "--with-status"], "模型列表", (value) =>
      list(value, ["connections"]),
    ),
    read(["mcp", "catalog"], "Ducoro 连接器目录", (value) => ({
      sourceStatus: text(value?.connectorSource ?? "ok"),
      items: list(value, [
        "entries",
        "items",
        "connectors",
        "catalog",
        "toolkits",
      ])
        .filter((x) => x.source !== "local")
        .map((x) => ({
          slug: text(x.slug ?? x.toolkit ?? x.id),
          name: text(x.name ?? x.displayName ?? x.slug),
          status: text(
            x.status ??
              x.connectionStatus ??
              (x.connected === true ? "connected" : "disconnected"),
          ),
          source: text(x.source),
        }))
        .filter(
          (x) =>
            x.slug &&
            !["__proto__", "constructor", "prototype"].includes(x.slug),
        ),
    })),
    jsonFile(paths.library)
      .then((value) => {
        validateLibrary(value);
        if (
          !Array.isArray(value.mcp ?? []) ||
          !Array.isArray(value.skills ?? [])
        )
          throw Error();
        return {
          mcp: selected(value.mcp).map((x) => ({ name: text(x.name) })),
          skills: selected(value.skills).map((x) => ({ name: text(x.name) })),
        };
      })
      .catch(() => {
        warn("Magpie 资源库读取失败，现有分配会保留。");
        return null;
      }),
    jsonFile(paths.bridge).catch(() => null),
  ]);
  const route = routes?.find((x) => x.slug === options.connectionSlug);
  const models = route
    ? (route.availableModelInfos ?? [])
        .filter((x) => !route.models?.length || route.models.includes(x.id))
        .map((x) => ({ id: text(x.id), name: text(x.name ?? x.id) }))
    : [];
  if (!route && routes)
    warn("尚未找到 Magpie 模型连接，请先在 Magpie 中连接 Ducoro。");
  if (catalog && catalog.sourceStatus !== "ok")
    warn("Ducoro 账户连接器目录暂不可用，请检查账户配对状态。");
  const gatewayState = gatewayModelState(gateway);
  if (gatewayState.status === "unknown")
    warn("Magpie 模型导出暂不可读，期望模型尚未确认。");
  else if (gatewayState.status === "disconnected")
    warn("Magpie 当前未连接 Ducoro，模型同步将按断开连接设置处理。");
  return {
    bots,
    models,
    defaultModel: gatewayState.model,
    gatewayStatus: gatewayState.status,
    connectionDefaultModel: text(route?.defaultModel),
    library,
    catalog,
    warnings,
    warningMessages,
    updatedAt: new Date().toISOString(),
  };
}

export async function createPageService({
  options,
  paths,
  stateDir,
  run,
  trigger,
  getReport,
  getProgress = () => ({ current: null, history: [] }),
  getModelCatalog,
  log = () => {},
  retryDelayMs = 500,
}) {
  await mkdir(stateDir, { recursive: true });
  const tokenFile = join(stateDir, "page-token");
  try {
    await writeFile(tokenFile, randomBytes(32).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const token = (await readFile(tokenFile, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error("页面令牌文件无效");
  const root = fileURLToPath(new URL("./ui/", import.meta.url));
  const port = options.servicePort ?? 3487;
  const call = async (args) => {
    const result = await run(args, { timeoutMs: 20000 });
    if (!result.ok)
      throw Error("Ducoro 暂不可用，或不支持此操作。请检查后台及账户状态。");
    return result.json;
  };
  let verificationJob = null;
  let inventorySnapshot = null;
  let capabilityFlight = null;
  let capabilityCache = null,
    capabilityTime = 0;
  const getCapabilities = async () => {
    if (!capabilityCache || Date.now() - capabilityTime > 30000) {
      capabilityFlight ??= detectCapabilities(run).finally(() => { capabilityFlight = null; });
      capabilityCache = await capabilityFlight;
      capabilityTime = Date.now();
    }
    return capabilityCache;
  };
  const server = createServer(async (req, res) => {
    const requestController = new AbortController();
    const cancelRequest = () => {
      if (!res.writableEnded) requestController.abort();
    };
    req.once("aborted", cancelRequest);
    res.once("close", cancelRequest);
    const language = languageFor(req.headers["x-ducoro-language"]);
    const reply = (code, body, type = "application/json; charset=utf-8") => {
      if (type.startsWith("application/json") && body?.error)
        body = {
          ...body,
          errorCode: body.errorCode ?? ({400:"INVALID_INPUT",403:"FORBIDDEN",404:"NOT_FOUND",409:"CONFLICT",413:"REQUEST_TOO_LARGE",422:"INVALID_INPUT",503:"SERVICE_UNAVAILABLE"})[code] ?? "REQUEST_FAILED",
          error: translate(body.error, language),
          errorMessage: message(body.error),
        };
      if (type.startsWith("application/json") && body?.rows) body = { ...body, rows: body.rows.map(row => typeof row.message === 'string' ? { ...row, message: translate(row.message, language), messageMessage: message(row.message) } : row) };
      res.writeHead(code, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      res.end(
        type.startsWith("application/json") ? JSON.stringify(body) : body,
      );
    };
    try {
      // Explicit Host checks stop DNS rebinding. Magpie's proxy rewrites Host.
      if (
        ![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)
      )
        return reply(403, { error: "访问地址无效" });
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const path = url.pathname.replace(/^\//, "");
      if (path.startsWith("api/")) {
        const origin = req.headers.origin;
        if (
          origin &&
          origin !== "null" &&
          origin !== `http://${req.headers.host}`
        )
          return reply(403, { error: "请求来源无效" });
        if (origin === "null") {
          res.setHeader("Access-Control-Allow-Origin", "null");
          res.setHeader("Vary", "Origin");
        }
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Methods", "GET, POST");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "X-Ducoro-Token, X-Ducoro-Language, X-Ducoro-Inventory, Content-Type",
          );
          return reply(204, "", "text/plain");
        }
        if (req.headers["x-ducoro-token"] !== token)
          return reply(403, { error: "页面连接已更新，请重新读取页面" });
        if(path==='api/lock' && req.method==='GET')return reply(200,await inspectSyncLock(stateDir));
        if(path==='api/draft' && ['GET','POST'].includes(req.method)) {
          const file=join(stateDir,'page-draft.json');
          if(req.method==='GET')return reply(200,await readDraft(file));
          const value=await readJsonBody(req,1024*1024);
          return reply(200,await withDraftLock(stateDir,()=>saveDraft(file,value)));
        }
        if ((req.method === 'GET' && path === 'api/local-records') || (req.method === 'POST' && path === 'api/local-records/clean')) {
          const value=req.method==='POST'?await readJsonBody(req,4096):null;
          const release=await acquireSyncLock(stateDir);
          if(!release)return reply(409,{error:'正在同步，请完成后再清理本地记录。'});
          let result, failure;
          try {
            result=req.method==='GET'?await previewLocalRecords(stateDir):await cleanLocalRecords(stateDir,value.token);
          }catch(error){failure=error;}finally{await release();}
          if(failure) {
            // Only authored public messages may cross the page API boundary.
            const publicErrors={
              '本地记录已变化，请重新预览后清理。':409,
              '本地记录目录必须是普通目录。':422,
              '管理记录正在更新，请稍后重试。':409,
              '管理记录已损坏；原文件已保留，请恢复备份后重新读取。':409,
              '管理记录版本未知，请恢复兼容的备份后重新读取。':409,
            };
            if(Object.hasOwn(publicErrors,failure.message))return reply(publicErrors[failure.message],{error:failure.message});
            throw failure;
          }
          if(result.groups) result={...result,groups:result.groups.map(key=>translate(key,language)),groupMessages:result.groups.map(key=>message(key))};
          return reply(200,result);
        }
        const backupAction = /^api\/backup-files\/(state|checkpoints)\/(import-preview|import|clear-preview|clear|open-directory|create|metadata|export)$/.exec(path);
        if (backupAction && req.method === 'POST') {
          const [,kind,action]=backupAction;
          const value=await readJsonBody(req,16*1024*1024);
          try {
            if(action==='open-directory')return reply(200,await openBackupDirectory(stateDir,kind));
            if(action==='import-preview')return reply(200,previewBackupImport(kind,value.content));
            const result=await withBackupLock(stateDir,()=>{
              if(['metadata','export'].includes(action))return backupFileAction(stateDir,kind,value.id,action,value);
              if(action==='create')return kind==='state'?createStateBackup(join(stateDir,'state.json')):createCheckpoint(stateDir,options,options,true);
              if(action==='import')return importBackupFile(stateDir,kind,value.content,value.token);
              if(action==='clear-preview')return previewBackupDeletion(stateDir,kind);
              return clearBackupFiles(stateDir,kind,value.token);
            });
            return reply(200,result);
          } catch(error) {if(error.backupStatus)return reply(error.backupStatus,{error:error.message});throw error;}
        }
        if (req.method === 'GET' && path === 'api/checkpoints') return reply(200, { revision:revision(projectOptions(options)), checkpoints: await checkpoints(stateDir,options) });
        if (req.method === 'GET' && path === 'api/drift') {
          const loaded = await readManagedState(join(stateDir,'state.json'));
          return reply(200, await inspectDrift({options,state:loaded.state,paths,run,signal:requestController.signal}));
        }
        if (req.method === 'POST' && ['api/checkpoints','api/rollback-preview'].includes(path)) {
          const value=await readJsonBody(req);
          if(path==='api/checkpoints') {
            if(revision(projectOptions(value.before ?? {}))!==revision(projectOptions(options)))return reply(409,{error:'Configuration changed; reload before saving'});
            try {return reply(200, {checkpoint:await withBackupLock(stateDir,()=>createCheckpoint(stateDir,value.before,value.after))});}
            catch(error) {if(error.backupStatus)return reply(error.backupStatus,{error:error.message});throw error;}
          }
          if(value.revision && value.revision!==revision(projectOptions(options)))return reply(409,{error:'Configuration changed; reload before saving'});
          const result=await rollbackDraft(stateDir,value.id,value.selections,options);
          const loaded=await readManagedState(join(stateDir,'state.json'));
          const next=globalThis.DucoroPlans.resolve(result.options),current=globalThis.DucoroPlans.resolve(options);
          // Inspect resumed and newly targeted Bots too, even when current
          // settings exclude them from normal drift reporting.
          const drift=await inspectDrift({options:{...options,connectionSlug:next.connectionSlug,pausedModels:[],targetAgents:[]},state:loaded.state,paths,run,signal:requestController.signal});
          const manages = id => next.syncConnection !== false && next.syncAgentModels !== false
            && !(next.pausedModels ?? []).includes(id)
            && (!(next.targetAgents?.length) || next.targetAgents.includes(id));
          const affectsAll=next.syncConnection !== false && next.syncAgentModels !== false && result.changes.some(x=>['modelScope','connectionSlug','syncAgentModels','syncConnection','targetAgents'].includes(x.key));
          const targets=new Set([
            ...[...new Set([...Object.keys(next.botModels??{}),...Object.keys(current.botModels??{})])].filter(id=>next.botModels[id]!==current.botModels[id]),
            ...(current.pausedModels ?? []).filter(id=>!(next.pausedModels ?? []).includes(id)),
          ].filter(manages));
          const affectedRows=drift.rows.filter(r=>r.feature==='models' && manages(r.target) && (affectsAll||targets.has(r.target)));
          if((affectsAll||targets.size) && (drift.unknown || [...targets].some(id=>!affectedRows.some(r=>r.target===id&&r.status==='same')) || affectedRows.some(r=>r.status!=='same')))return reply(409,{error:'Current model configuration has changed or cannot be verified; resolve drift first'});
          let source;try {source=JSON.parse(await readFile(paths.bridge,'utf8'));}catch{}
          const fallback=typeof source?.model==='string'?source.model:source?.model?.id;
          result.options.modelGuards ??= {};
          for(const row of affectedRows.filter(row=>row.revision)) {
            const model=next.modelScope==='agents' ? next.botModels?.[row.target]??fallback : fallback;
            if(!model)return reply(409,{error:'Cannot verify the restoration model'});
            result.options.modelGuards[row.target]={revision:row.revision,model};
          }
          return reply(200,result);
        }
        if (req.method === 'GET' && path === 'api/progress') return reply(200, getProgress());
        if (path === 'api/verification-progress' && req.method === 'GET') return reply(200, verificationJob ?? { running: false, rows: [] });
        if (path === 'api/verification-start' && req.method === 'POST') {
          if (!verificationJob?.running) {
            verificationJob = { running: true, rows: [], updatedAt: new Date().toISOString() };
            void (async () => {
              try {
                const loaded = await readManagedState(join(stateDir,'state.json'));
                const result = await verifyConfiguration({ options: globalThis.DucoroPlans.resolve(options), state: loaded.state, run, paths, report: await getReport(), onProgress: partial => { verificationJob = { ...verificationJob, ...partial }; } });
                verificationJob = { ...result, running: false };
              } catch { verificationJob = { running: false, rows: [], error: 'Verification unavailable' }; }
            })();
          }
          return reply(200, verificationJob);
        }
        if (req.method === "GET" && path === "api/inventory") {
          const [data, capabilities] = await Promise.all([
            inventory({
              options,
              paths,
              run,
              language,
              signal: requestController.signal,
            }),
            getCapabilities(),
          ]);
          const inventoryToken = randomBytes(16).toString('hex');
          inventorySnapshot = {token:inventoryToken, data:structuredClone(data), language, slug:options.connectionSlug, at:Date.now()};
          return reply(200, { ...data, capabilities, inventoryToken });
        }
        if (path === "api/verification" && ["GET", "POST"].includes(req.method)) {
          const loaded = await readManagedState(join(stateDir, "state.json"));
          return reply(200, await verifyConfiguration({ options: globalThis.DucoroPlans.resolve(options), state: loaded.state, run, paths, signal: requestController.signal, report: await getReport() }));
        }
        if (path === "api/state-backups" && req.method === "GET")
          return reply(200, {backups: await stateBackups(join(stateDir,"state.json"))});
        if (["api/state-backups/preview", "api/state-backups/restore", "api/state-backups/delete"].includes(path) && req.method === "POST") {
          const {id,checksum}=await readJsonBody(req,4096);
          const file=join(stateDir,"state.json");
          if(path.endsWith("preview")) {
            const {state,...preview}=await previewStateBackup(file,id);
            return reply(200,preview);
          }
          // Share the writer lock with normal synchronization.
          const release=await acquireSyncLock(stateDir);
          if(!release)return reply(409,{error:"正在同步，请完成后再操作备份。"});
          try {
            if (path.endsWith("delete")) return reply(200, await deleteStateBackup(file,id,checksum));
            await writeFile(join(stateDir,'restore-review.json'),JSON.stringify({pending:true,at:new Date().toISOString()}),{mode:0o600});
            await restoreStateBackup(file,id,checksum);
          } finally {await release();}
          return reply(200,{restored:true});
        }
        if (req.method === "GET" && path === "api/report")
          return reply(200, localizeReport(await getReport(), language));
        if (
          path === "api/model-catalog" &&
          ["GET", "POST"].includes(req.method)
        ) {
          try {
            const force = req.method === "POST";
            const catalog = await getModelCatalog(force);
            if (force) trigger("page-model-catalog", 0);
            return reply(200, catalog);
          } catch (error) {
            return reply(503, { error: error.message });
          }
        }
        if (req.method === "GET" && path === "api/tools") {
          const slug = url.searchParams.get("slug");
          if (!/^[a-zA-Z0-9_-]+$/.test(slug ?? ""))
            return reply(400, { error: "连接器标识无效" });
          return reply(
            200,
            toolRows(await call(["mcp", "catalog", "tools", slug])),
          );
        }
        if (req.method === "GET" && path === "api/equipment") {
          const id = url.searchParams.get("id");
          if (!/^agt-[A-Za-z0-9-]+$/.test(id ?? ""))
            return reply(400, { error: "Bot 标识无效" });
          return reply(
            200,
            policyRows(await call(["agent", "connector", "list", id])),
          );
        }
        if(path==='api/operations' && req.method==='GET') {
          const loaded=await readManagedState(join(stateDir,'state.json')),controls=await readOperationControls(stateDir);
          const all=Object.entries(loaded.state.operations??{});
          return reply(200,{summary:{total:all.length,completed:all.filter(([,r])=>r.status==='completed').length,failed:all.filter(([,r])=>r.status==='failed').length},operations:all.sort((a,b)=>b[1].updatedAt.localeCompare(a[1].updatedAt)).map(([id,row])=>({id,feature:row.feature,target:row.target,resource:row.resource,status:row.status,attempts:row.attempts,failureClass:row.failureClass??null,paused:!!controls[id]?.paused,updatedAt:row.updatedAt,nextRetryAt:row.nextRetryAt??null,needsAttention:row.status==='failed'&&row.failureClass!=='temporary',advice:row.status==='failed'?failureAdvice(row.failureClass):null}))});
        }
        if(path==='api/operations' && req.method==='POST') {
          const value=await readJsonBody(req,4096);
          if(!/^[a-f0-9]{64}$/.test(value.id??'')||!['retry','pause','resume'].includes(value.action))return reply(422,{error:'Invalid operation control'});
          let operationFeature;
          try {await withBackupLock(stateDir,async()=>{
            const loaded=await readManagedState(join(stateDir,'state.json'));
            if(!loaded.state.operations?.[value.id])throw Object.assign(Error('Operation changed; refresh the list'),{backupStatus:409});
            operationFeature=loaded.state.operations[value.id].feature;
            await setOperationControl(stateDir,value.id,value.action==='pause');
          });}catch(error){if(error.backupStatus)return reply(error.backupStatus,{error:error.message});throw error;}
          if(value.action!=='pause')trigger('page-operation:'+value.id+':'+operationFeature,0);
          return reply(200,{queued:value.action!=='pause'});
        }
        if (req.method === 'POST' && path === 'api/retry-failed') {
          trigger('page-retry-failed',0); return reply(200,{queued:true});
        }
        if (req.method === "POST" && path === "api/retry") {
          trigger("page-retry", 0);
          return reply(200, { queued: true });
        }
        if (
          req.method === "POST" &&
          ["api/validate", "api/preview"].includes(path)
        ) {
          const value=await readJsonBody(req);
          if (validateOptions(value).length)
            return reply(400, {
              error: "设置格式无效，请检查分配和工具权限。",
            });
          if (path === "api/preview") {
            const next = globalThis.DucoroPlans.resolve({ ...options, ...value });
            const deadline = Date.now() + 40000;
            const signal = AbortSignal.any([
              requestController.signal,
              AbortSignal.timeout(40000),
            ]);
            const [data, capabilities] = await Promise.all([
              inventorySnapshot && req.headers['x-ducoro-inventory'] === inventorySnapshot.token && Date.now()-inventorySnapshot.at < 15000 && inventorySnapshot.language===language && inventorySnapshot.slug===next.connectionSlug
                ? Promise.resolve(structuredClone(inventorySnapshot.data)) : inventory({ options: next, paths, run, language, signal }),
              getCapabilities(),
            ]);
            if (signal.aborted)
              return reply(503, { error: "预览读取超时，请稍后重试。" });
            return reply(
              200,
              await buildSyncPreview({
                options: next,
                currentOptions: globalThis.DucoroPlans.resolve(options),
                sourceOptions: {...options,...value},
                data,
                stateDir,
                paths,
                run,
                capabilities,
                language,
                signal,
                budgetMs: Math.max(
                  1,
                  Math.min(25000, deadline - Date.now() - 500),
                ),
              }),
            );
          }
          return reply(200, { valid: true });
        }
        return reply(404, { error: "操作不存在" });
      }
      if (req.method !== "GET") return reply(405, { error: "不支持此操作" });
      const file = path || "index.html";
      if (
        ![
          "index.html",
          "style.css",
          "app.js",
          "drafts.js",
          "model.js",
          "defaults.js",
          "service-bridge.js",
          "resources.js",
          "reliability.js",
          "verification-tracker.js",
          "backup-files.js",
          "plans.js",
          "control-center.js",
          "task-center.js",
          "preview.js",
          "i18n.js",
          "ducoro.svg",
        ].includes(file)
      )
        return reply(404, { error: "文件不存在" });
      let body = await readFile(join(root, file));
      const types = {
        html: "text/html; charset=utf-8",
        js: "text/javascript; charset=utf-8",
        css: "text/css; charset=utf-8",
        svg: "image/svg+xml",
      };
      if (file === "index.html") {
        body = Buffer.from(
          body
            .toString()
            .replace(
              "<!--SERVICE_TOKEN-->",
              `<meta name="ducoro-token" content="${token}">`,
            ),
        );
        // Explicit loopback sources work inside WebKit's opaque sandbox.
        res.setHeader(
          "Content-Security-Policy",
          `sandbox allow-scripts allow-downloads; default-src 'none'; script-src 'self' http://127.0.0.1:${port}; style-src 'self' 'unsafe-inline' http://127.0.0.1:${port}; img-src 'self' data: http://127.0.0.1:${port}; connect-src 'self' http://127.0.0.1:${port}; frame-ancestors 'self' wails://localhost http://127.0.0.1:* http://localhost:*`,
        );
      }
      reply(200, body, types[file.split(".").pop()]);
    } catch (error) {
      const failure=apiFailure(error);
      reply(failure.status,failure.body);
    }
  });
  // Hosts overlap during reload. Keep trying after the old listener exits,
  // without closing or replacing a listener owned by another process.
  let closed = false,
    retryTimer = null,
    listening = false,
    warned = false;
  const listen = () =>
    new Promise((resolve, reject) => {
      const onError = (error) => {
        server.removeListener("listening", onListening);
        if (error.code !== "EADDRINUSE") return reject(error);
        if (!warned) {
          log("Ducoro page service port is busy; waiting to reconnect");
          warned = true;
        }
        if (!closed) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            void listen().catch(() =>
              log("Ducoro page service could not restart"),
            );
          }, retryDelayMs);
          retryTimer.unref?.();
        }
        resolve();
      };
      const onListening = () => {
        server.removeListener("error", onError);
        listening = true;
        if (warned) log("Ducoro page service reconnected");
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port, "127.0.0.1");
    });
  await listen();
  server.unref();
  return {
    get listening() {
      return listening;
    },
    close: () =>
      new Promise((resolve) => {
        closed = true;
        clearTimeout(retryTimer);
        listening = false;
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
