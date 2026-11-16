import { randomUUID } from "node:crypto";
// Bounded work and in-flight reads; writes are never cached or replayed.
export async function mapLimit(items, limit, work, { signal } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('Concurrency limit must be a positive integer');
  const results = new Array(items.length); let next = 0, failed = false, failure;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed && !signal?.aborted) {
      const index = next++; if (index >= items.length) break;
      try { results[index] = await work(items[index], index); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }));
  // Keep the caller's mutation lock until every already-started worker settles.
  if (failed) throw failure;
  if (signal?.aborted) throw abortError();
  return results;
}
const abortError = () => Object.assign(new Error('request cancelled'), { name: 'AbortError' });
export function createReadCoordinator(run) {
  const flights = new Map(); let generation = 0;
  const metrics = { calls: 0, shared: 0, durationMs: 0 };
  const isRead = args => args.includes('--help') || args[0] === 'info' ||
    (['list','get','catalog'].includes(args[1]) && ['agent','connections','mcp','skill'].includes(args[0])) ||
    (args[0] === 'agent' && ['connector','mcp','skill'].includes(args[1]) && args[2] === 'list');
  const execute = async (args, options) => { metrics.calls++; const start = performance.now(); try { return await run(args, options); } finally { metrics.durationMs += performance.now() - start; } };
  const coordinated = (args, options = {}) => {
    if (options.signal?.aborted) return Promise.reject(abortError());
    if (!isRead(args)) { generation++; flights.clear(); return execute(args, options); }
    // Unknown execution options must not accidentally share a different read.
    if (options.stdin !== undefined || Object.keys(options).some(k => !['signal','timeoutMs','maxOutputBytes'].includes(k))) return execute(args, options);
    const key = JSON.stringify([generation,args,options.timeoutMs === undefined ? 90_000 : options.timeoutMs,options.maxOutputBytes === undefined ? 8 * 1024 * 1024 : options.maxOutputBytes]);
    let flight = flights.get(key);
    if (flight) metrics.shared++;
    else {
      flight = { controller: new AbortController(), subscribers: 0 };
      flights.set(key, flight);
      const active = flight;
      active.pending = Promise.resolve().then(() => execute(args, { ...options, signal: active.controller.signal })).finally(() => {
        if (flights.get(key) === active) flights.delete(key);
      });
    }
    const active = flight;
    active.subscribers++;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener('abort', cancel);
        if (--active.subscribers === 0) {
          if (flights.get(key) === active) flights.delete(key);
          active.controller.abort();
        }
        if (error) reject(error);
        else { try { resolve(structuredClone(value)); } catch (e) { reject(e); } }
      };
      const cancel = () => finish(abortError());
      active.pending.then(value => finish(null, value), error => finish(error));
      options.signal?.addEventListener('abort', cancel, { once: true });
      if (options.signal?.aborted) cancel();
    });
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
