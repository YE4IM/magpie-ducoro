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
