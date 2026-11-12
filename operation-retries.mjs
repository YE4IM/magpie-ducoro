// Keep manual intent outside timer closures so coalescing cannot discard it.
export function createOperationRetries() {
  const pending = new Set();
  let failed = false;
  return {
    add(reason) {
      if (reason === 'page-retry-failed') { failed = true; return true; }
      const match = /^page-operation:([a-f0-9]{64}):(gateway|accounts|total|mcp|skills)$/.exec(reason);
      if (!match) return false;
      pending.add(match[1]);return true;
    },
    take(operations = {}) {
      const ids = new Set([...pending].filter(id => operations[id]));
      if (failed) for (const [id,row] of Object.entries(operations)) if (row.status === 'failed') ids.add(id);
      pending.clear();failed = false;return ids;
    },
    restore(ids) { for (const id of ids) pending.add(id); },
    clear() { pending.clear();failed = false; },
  };
}
