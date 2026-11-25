// Credential-free CLI projections shared by sync and page code.
export const list = (
  value,
  keys = [
    "items",
    "entries",
    "agents",
    "bots",
    "connections",
    "connectors",
    "toolkits",
    "tools",
  ],
) => {
  if (Array.isArray(value)) return value;
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  throw Error("返回的列表格式无法识别");
};
export const text = (value) =>
  typeof value === "string" ? value.slice(0, 500) : "";
export function gatewayModelState(value) {
  const object = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
  const gateway = value?.gateway === undefined ? {} : value.gateway;
  if (!object(value) || !object(gateway) || !["url", "v1", "key"].every(
    (key) => gateway[key] === undefined || typeof gateway[key] === "string",
  )) return { status: "unknown", model: "" };

  const url = (gateway.url ?? "").trim();
  const key = (gateway.key ?? "").trim();
  if (Boolean(url) !== Boolean(key)) return { status: "unknown", model: "" };
  if (!url) return { status: "disconnected", model: "" };
  const model = typeof value.model === "string" ? value.model : value.model?.id;
  return { status: "connected", model: text(model) };
}
export const selected = (items) =>
  (items ?? []).filter(
    (x) =>
      x &&
      x.offHere !== true &&
      x.disabled !== true &&
      x.enabled !== false &&
      x.agents?.includes("ducoro"),
  );
export const policyRows = (value) =>
  list(value, ["connectors", "equipment", "items"]).map((x) => ({
    slug: text(x.toolkit ?? x.toolkitSlug ?? x.slug),
    allow: x.allow ?? x.toolPolicy?.allow ?? [],
    deny: x.deny ?? x.toolPolicy?.deny ?? [],
  }));
export const toolRows = (value) =>
  list(value, ["tools", "items"])
    .map((x) => ({
      slug: text(x.slug ?? x.name ?? x.function?.name),
      name: text(x.displayName ?? x.title ?? x.name ?? x.slug),
      description: text(x.description ?? x.function?.description),
    }))
    .filter((x) => x.slug);
