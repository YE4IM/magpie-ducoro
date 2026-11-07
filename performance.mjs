import { randomUUID } from "node:crypto";
// Bounded work and in-flight reads; writes are never cached or replayed.
export async function mapLimit(items, limit, work, { signal } = {}) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!signal?.aborted) { const index = next++; if (index >= items.length) break; results[index] = await work(items[index], index); }
  }));
  return results;
}
export function createReadCoordinator(run) {
  const flights = new Map(); let generation = 0;
  const metrics = { calls: 0, shared: 0, durationMs: 0 };
  const isRead = args => args.includes('--help') || args[0] === 'info' ||
    (['list','get','catalog'].includes(args[1]) && ['agent','connections','mcp','skill'].includes(args[0])) ||
    (args[0] === 'agent' && ['connector','mcp','skill'].includes(args[1]) && args[2] === 'list');
  const execute = async (args, options) => { metrics.calls++; const start = performance.now(); try { return await run(args, options); } finally { metrics.durationMs += performance.now() - start; } };
  const coordinated = (args, options = {}) => {
    // Signals belong to individual consumers: do not let one cancel another.
    if (!isRead(args)) { generation++; flights.clear(); return execute(args, options); }
    if (options.signal || options.stdin !== undefined) return execute(args, options);
    const key = JSON.stringify([generation,args,options.timeoutMs]);
    if (flights.has(key)) { metrics.shared++; return flights.get(key).then(structuredClone); }
    const pending = execute(args, options).finally(() => { if (flights.get(key) === pending) flights.delete(key); });
    flights.set(key, pending); return pending.then(structuredClone);
  };
  coordinated.metrics = () => ({ ...metrics });
  return coordinated;
}
export function createProgress() {
  let current = null; const history = [];
  return {
    begin(reason, metrics) { current = { id: randomUUID(), reason, startedAt: new Date().toISOString(), running: true, steps: [], initialMetrics: metrics }; },
    async step(name, work) {
      if (!current) return work();
      const row = { name, status: 'running', startedAt: new Date().toISOString() }; current.steps.push(row); const start = performance.now();
      try { const value = await work(); if(row.status==='running')row.status = 'completed'; return value; }
      catch (e) { row.status = 'failed'; throw e; }
      finally { row.durationMs = Math.round(performance.now() - start); }
    },
    fail() { const step=current?.steps.findLast(x=>x.status==='running'); if(step)step.status='pending'; },
    end(metrics) { if (!current?.running) return; current.running = false; current.finishedAt = new Date().toISOString(); current.durationMs = Date.parse(current.finishedAt)-Date.parse(current.startedAt); current.metrics = Object.fromEntries(Object.keys(metrics).map(k => [k, Math.round(metrics[k] - (current.initialMetrics[k] ?? 0))])); delete current.initialMetrics; history.unshift(structuredClone(current)); history.splice(20); },
    read() { const value = current ? structuredClone(current) : null; if(value)delete value.initialMetrics; return { current: value, history }; }
  };
}
