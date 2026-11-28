import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Write a file atomically via a unique sibling temporary file and optional fsync.
 */
export async function writeFileAtomic(
  file,
  body,
  { mode = 0o600, dirMode = 0o700, sync = true, syncDir = false } = {},
) {
  await mkdir(dirname(file), { recursive: true, mode: dirMode });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    const handle = await open(temp, 'wx', mode);
    try {
      await handle.writeFile(body);
      if (sync) await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temp, file);
    if (syncDir) {
      const dir = await open(dirname(file), 'r');
      try {
        await dir.sync();
      } finally {
        await dir.close();
      }
    }
  } finally {
    await unlink(temp).catch(() => {});
  }
}
