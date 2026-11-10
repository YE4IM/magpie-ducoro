import {inspectSyncLock,recoverSyncLock} from '../lock-diagnostics.mjs';
const [dir,token,ack]=process.argv.slice(2);
if(!dir)throw Error('Usage: node scripts/recover-lock.mjs STATE_DIR [TOKEN --all-hosts-stopped]');
console.log(JSON.stringify(token?await recoverSyncLock(dir,{token,hostsStopped:ack==='--all-hosts-stopped'}):await inspectSyncLock(dir),null,2));
