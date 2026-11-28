// Loopback page service. Inventory is projected explicitly: no raw credentials,
// account records, endpoint URLs, server arguments or skill bodies reach HTML.
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import "../ui/i18n.js";
import { gatewayModelState, list, selected, text } from "./inventory-shapes.mjs";
import { validateLibrary } from "./library-schema.mjs";
import { apiFailure } from "./page-http.mjs";
import { createBackupRoutes } from "./page-routes-backups.mjs";
import { createControlRoutes } from "./page-routes-control.mjs";
import { createInventoryRoutes } from "./page-routes-inventory.mjs";
import { pluginVersion } from "./version.mjs";

export { gatewayModelState, list, selected, policyRows, toolRows } from "./inventory-shapes.mjs";

const { translate, format, localizeVerificationRow, languageFor, message } =
  globalThis.DucoroI18n;

const ERROR_CODES = {
  400: "INVALID_INPUT",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "REQUEST_TOO_LARGE",
  422: "INVALID_INPUT",
  503: "SERVICE_UNAVAILABLE",
};

const STATIC_ASSETS = [
  "index.html",
  "style.css",
  "app.js",
  "drafts.js",
  "model.js",
  "components.js",
  "defaults.js",
  "service-bridge.js",
  "resources.js",
  "reliability.js",
  "verification-tracker.js",
  "backup-files.js",
  "plans.js",
  "control-center.js",
  "task-center.js",
  "bot-inspector.js",
  "preview.js",
  "i18n.js",
  "ducoro.svg",
];

const STATIC_MIME_TYPES = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
};

const jsonFile = async (path) => JSON.parse(await readFile(path, "utf8"));

export async function inventory({
  options,
  paths,
  run,
  language = "en",
  signal,
}) {
  const warnings = [];
  const warningMessages = [];
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
        ) {
          throw Error();
        }
        return {
          mcp: selected(value.mcp).map((x) => ({ name: text(x.name) })),
          skills: selected(value.skills).map((x) => ({ name: text(x.name) })),
          subagents: (value.subagents ?? [])
            .filter((x) => !x.disabled && x.enabled !== false)
            .map((x) => ({ name: text(x.name) })),
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
  if (!route && routes) {
    warn("尚未找到 Magpie 模型连接，请先在 Magpie 中连接 Ducoro。");
  }
  if (catalog && catalog.sourceStatus !== "ok") {
    warn("Ducoro 账户连接器目录暂不可用，请检查账户配对状态。");
  }
  const gatewayState = gatewayModelState(gateway);
  if (gatewayState.status === "unknown") {
    warn("Magpie 模型导出暂不可读，期望模型尚未确认。");
  } else if (gatewayState.status === "disconnected") {
    warn("Magpie 当前未连接 Ducoro，模型同步将按断开连接设置处理。");
  }
  return {
    bots,
    models,
    defaultModel: gatewayState.model,
    gatewayStatus: gatewayState.status,
    connectionDefaultModel: text(route?.defaultModel),
    connectionPresent: routes ? Boolean(route) : null,
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
  const root = fileURLToPath(new URL("../ui/", import.meta.url));
  let port = options.servicePort ?? 3487;
  let lastVerification = null;

  const routeHandlers = [
    createBackupRoutes({ options, stateDir }),
    createControlRoutes({
      options,
      paths,
      stateDir,
      run,
      trigger,
      getReport,
      getProgress,
      setLastVerification: (value) => {
        lastVerification = value;
      },
      log,
    }),
    createInventoryRoutes({
      options,
      paths,
      stateDir,
      run,
      trigger,
      getReport,
      getModelCatalog,
      getLastVerification: () => lastVerification,
      inventory,
    }),
  ];

  const server = createServer(async (req, res) => {
    const requestController = new AbortController();
    const cancelRequest = () => {
      if (!res.writableEnded) requestController.abort();
    };
    req.once("aborted", cancelRequest);
    res.once("close", cancelRequest);
    const language = languageFor(req.headers["x-ducoro-language"]);
    const reply = (code, body, type = "application/json; charset=utf-8") => {
      if (type.startsWith("application/json") && body?.error) {
        body = {
          ...body,
          errorCode: body.errorCode ?? ERROR_CODES[code] ?? "REQUEST_FAILED",
          error: translate(body.error, language),
          errorMessage: message(body.error),
        };
      }
      if (type.startsWith("application/json") && body?.rows) {
        body = {
          ...body,
          rows: body.rows.map((row) =>
            typeof row.message === "string" ? localizeVerificationRow(row, language) : row,
          ),
        };
      }
      res.writeHead(code, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      });
      res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
    };

    try {
      // Explicit Host checks stop DNS rebinding. Magpie's proxy rewrites Host.
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) {
        return reply(403, { error: "访问地址无效" });
      }
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const path = url.pathname.replace(/^\//, "");
      if (path.startsWith("api/")) {
        const origin = req.headers.origin;
        if (origin && origin !== "null" && origin !== `http://${req.headers.host}`) {
          return reply(403, { error: "请求来源无效" });
        }
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
        if (req.headers["x-ducoro-token"] !== token) {
          return reply(403, { error: "页面连接已更新，请重新读取页面" });
        }
        const context = {
          req,
          path,
          url,
          language,
          signal: requestController.signal,
          reply,
        };
        for (const handleRoute of routeHandlers) {
          if (await handleRoute(context)) return;
        }
        return reply(404, { error: "操作不存在" });
      }
      if (req.method !== "GET") return reply(405, { error: "不支持此操作" });
      const file = path || "index.html";
      if (!STATIC_ASSETS.includes(file)) return reply(404, { error: "文件不存在" });
      let body = await readFile(join(root, file));
      if (file === "index.html") {
        body = Buffer.from(
          body
            .toString()
            .replace("<!--PLUGIN_VERSION-->", pluginVersion)
            .replace(
              "<!--SERVICE_TOKEN-->",
              `<meta name="ducoro-token" content="${token}">`,
            ),
        );
        // Explicit loopback sources work inside WebKit's opaque sandbox.
        const origin = `http://127.0.0.1:${port}`;
        res.setHeader(
          "Content-Security-Policy",
          [
            "sandbox allow-scripts allow-downloads",
            "default-src 'none'",
            `script-src 'self' ${origin}`,
            `style-src 'self' 'unsafe-inline' ${origin}`,
            `img-src 'self' data: ${origin}`,
            `connect-src 'self' ${origin}`,
            "frame-ancestors 'self' wails://localhost http://127.0.0.1:* http://localhost:*",
          ].join("; "),
        );
      }
      reply(200, body, STATIC_MIME_TYPES[file.split(".").pop()]);
    } catch (error) {
      const failure = apiFailure(error);
      reply(failure.status, failure.body);
    }
  });

  // Hosts overlap during reload. Keep trying after the old listener exits,
  // without closing or replacing a listener owned by another process.
  let closed = false;
  let retryTimer = null;
  let listening = false;
  let warned = false;
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
            void listen().catch(() => log("Ducoro page service could not restart"));
          }, retryDelayMs);
          retryTimer.unref?.();
        }
        resolve();
      };
      const onListening = () => {
        server.removeListener("error", onError);
        port = server.address().port;
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
    get url() {
      return `http://127.0.0.1:${port}`;
    },
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
