import { realpath } from 'node:fs/promises';
import { commandFailure } from './operation-controls.mjs';

/**
 * Verify that the configured Ducoro CLI talks to the same local daemon home.
 */
export async function resolveLocalDucoroHome({
  paths,
  run,
  env = process.env,
  timeoutMs = 5000,
  signal,
  notLocalMessage = 'Ducoro daemon is not local',
  unavailableMessage = 'Ducoro daemon home unavailable',
}) {
  const serverUrl = env.DUCORO_SERVER_URL;
  if (serverUrl) {
    let host = '';
    try {
      host = new URL(serverUrl).hostname;
    } catch {}
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) {
      throw Error(notLocalMessage);
    }
  }
  const info = await run(['info'], { timeoutMs, signal });
  if (!info.ok) {
    throw Object.assign(Error(unavailableMessage), commandFailure(info));
  }
  const reported = info.json?.paths?.ducoroHome;
  if (!reported || !paths?.ducoroHome) {
    throw Error(unavailableMessage);
  }
  const [home, daemonHome] = await Promise.all([
    realpath(paths.ducoroHome),
    realpath(reported),
  ]);
  if (home !== daemonHome) {
    throw Error(notLocalMessage);
  }
  return home;
}
