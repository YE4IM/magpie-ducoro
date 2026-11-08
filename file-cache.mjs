import { readFile, stat } from 'node:fs/promises';
// Bounded byte cache preserves the existing bundle digest and ownership format.
const cache = new Map(), flights = new Map(); let size = 0, generation = 0;
const LIMIT = 16 * 1024 * 1024;
const MAX_ENTRIES = 2048;
export const fileMetrics = { reads: 0, bytes: 0, hits: 0 };
export function clearFileCache() { generation++; cache.clear(); flights.clear(); size = 0; }
export function readCachedFile(path) {
  if (flights.has(path)) return flights.get(path);
  const pending = readFileBytes(path, generation).finally(() => {
    if (flights.get(path) === pending) flights.delete(path);
  });
  flights.set(path, pending);
  return pending;
}
async function readFileBytes(path, startedGeneration) {
  const info = await stat(path, { bigint: true });
  const stamp = [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs, info.mode].join(':');
  const old = cache.get(path);
  if (old?.stamp === stamp) { fileMetrics.hits++; cache.delete(path); cache.set(path,old); return old.bytes; }
  const bytes = await readFile(path); fileMetrics.reads++; fileMetrics.bytes += bytes.length;
  const after = await stat(path,{bigint:true});
  if (stamp !== [after.dev,after.ino,after.size,after.mtimeNs,after.ctimeNs,after.mode].join(':')) throw Error('Skill changed during reading');
  // Invalidated reads may finish, but must not repopulate the next generation.
  if (startedGeneration !== generation) return bytes;
  const current = cache.get(path);
  if (current) { size -= current.bytes.length; cache.delete(path); }
  if (bytes.length <= LIMIT) {
    while ((size + bytes.length > LIMIT || cache.size >= MAX_ENTRIES) && cache.size) { const key = cache.keys().next().value; size -= cache.get(key).bytes.length; cache.delete(key); }
    cache.set(path,{stamp,bytes}); size += bytes.length;
  }
  return bytes;
}
