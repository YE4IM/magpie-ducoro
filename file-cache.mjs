import { readFile, stat } from 'node:fs/promises';
// Bounded byte cache preserves the existing bundle digest and ownership format.
const cache = new Map(); let size = 0;
const LIMIT = 16 * 1024 * 1024;
export const fileMetrics = { reads: 0, bytes: 0, hits: 0 };
export function clearFileCache() { cache.clear(); size = 0; }
export async function readCachedFile(path) {
  const info = await stat(path, { bigint: true });
  const stamp = [info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs, info.mode].join(':');
  const old = cache.get(path);
  if (old?.stamp === stamp) { fileMetrics.hits++; cache.delete(path); cache.set(path,old); return old.bytes; }
  const bytes = await readFile(path); fileMetrics.reads++; fileMetrics.bytes += bytes.length;
  if (old) { size -= old.bytes.length; cache.delete(path); }
  const after = await stat(path,{bigint:true});
  if (stamp !== [after.dev,after.ino,after.size,after.mtimeNs,after.ctimeNs,after.mode].join(':')) throw Error('Skill changed during reading');
  if (bytes.length <= LIMIT) {
    while (size + bytes.length > LIMIT && cache.size) { const key = cache.keys().next().value; size -= cache.get(key).bytes.length; cache.delete(key); }
    cache.set(path,{stamp,bytes}); size += bytes.length;
  }
  return bytes;
}
