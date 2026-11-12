{
  const { t } = globalThis.DucoroI18n;
  // Magpie's documented page protocol remains available after frame navigation.
  (() => {
    let seq = 0;
    const requests = new Map(),
      actions = [],
      handlers = new Set();
    const call = (method, params) =>
      new Promise((resolve, reject) => {
        const id = ++seq;
        const timer = setTimeout(() => {
          requests.delete(id);
          reject(DucoroI18n.error(t("请从 Magpie 打开此页面，或重新读取。")));
        }, 10000);
        requests.set(id, { resolve, reject, timer });
        parent.postMessage({ magpie: 1, id, method, params }, "*");
      });
    function theme(value) {
      if (
        globalThis.DucoroLanguageInitialized &&
        typeof value.lang === "string"
      )
        globalThis.DucoroI18n.applyDocument(value.lang);
      document.documentElement.style.colorScheme = value.dark
        ? "dark"
        : "light";
      for (const [key, val] of Object.entries(value.tokens ?? {}))
        if (typeof val === "string")
          document.documentElement.style.setProperty(
            key.startsWith("--") ? key : `--magpie-${key}`,
            val,
          );
    }
    addEventListener("message", (event) => {
      if (event.source !== parent || event.data?.magpie !== 1) return;
      const m = event.data;
      if (m.event === "theme") theme(m.data);
      if (m.event === "action") {
        if (handlers.size) for (const fn of handlers) fn(m.data);
        else actions.push(m.data);
      }
      const request = requests.get(m.id);
      if (!request) return;
      clearTimeout(request.timer);
      requests.delete(m.id);
      m.error ? request.reject(Error(m.error)) : request.resolve(m.result);
    });
    globalThis.magpie = {
      ready: call("hello").then((value) => {
        theme(value);
        return value;
      }),
      options: {
        get: () => call("options.get"),
        set: (options) => call("options.set", { options }),
      },
      onAction: (fn) => {
        handlers.add(fn);
        for (const value of actions.splice(0)) fn(value);
      },
    };
    const domReady =
      document.readyState === "loading"
        ? new Promise((resolve) =>
            document.addEventListener("DOMContentLoaded", resolve, {
              once: true,
            }),
          )
        : Promise.resolve();
    globalThis.DucoroLanguageReady = Promise.all([
      magpie.ready.catch(() => ({ lang: "en" })),
      domReady,
    ]).then(([value]) => {
      // Resolve the initial host language before controls are built. Later theme
      // events update text bindings without rebuilding controls or losing drafts.
      globalThis.DucoroI18n.applyDocument(value.lang);
      globalThis.DucoroLanguageInitialized = true;
    });
    globalThis.ducoroApi = async (path, body, { signal, inventoryToken } = {}) => {
      const deadline = Date.now() + (path === "preview" ? 45000 : 25000);
      let response;
      for (let attempt = 0; ; attempt++) {
        try {
          signal?.throwIfAborted();
          response = await fetch(`api/${path}`, {
            method: body === undefined ? "GET" : "POST",
            cache: "no-store",
            keepalive: path === "draft" && body !== undefined && new TextEncoder().encode(JSON.stringify(body)).length < 60000,
            headers: {
              ...(inventoryToken ? {'x-ducoro-inventory':inventoryToken} : {}),
              "X-Ducoro-Language": document.documentElement.lang,
              "X-Ducoro-Token": document.querySelector(
                'meta[name="ducoro-token"]',
              ).content,
              ...(body === undefined
                ? {}
                : { "Content-Type": "application/json" }),
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.any([
              ...(signal ? [signal] : []),
              AbortSignal.timeout(
                Math.max(
                  1,
                  Math.min(
                    path === "preview" ? 45000 : 25000,
                    deadline - Date.now(),
                  ),
                ),
              ),
            ]),
          });
          break;
        } catch {
          // Reloading plugin settings briefly replaces the host. Retry reads
          // only: mutations must never be replayed after an unknown outcome.
          if (signal?.aborted)
            throw Object.assign(Error("Request cancelled"), {
              name: "AbortError",
            });
          if (body !== undefined || attempt >= 1 || Date.now() >= deadline)
            throw DucoroI18n.error(
              t(
                "暂时无法连接 Ducoro 插件页面服务。请稍后重试；若持续失败，请在 Magpie 中重新加载插件并打开 Ducoro 页面。",
              ),
            );
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * (attempt + 1)),
          );
        }
      }
      let value;
      try {
        value = await response.json();
      } catch {
        throw DucoroI18n.error(
          t("页面服务返回内容无效，请重新打开 Ducoro 页面。"),
        );
      }
      if (!response.ok) {
        const localizedMessage = t(
          value?.errorMessage ?? value?.error ?? "读取失败，请重试。",
        );
        throw Object.assign(Error(String(localizedMessage)), {
          localizedMessage, code:value?.errorCode, status:response.status,
        });
      }
      return value;
    };
  })();
}
