import { resolve, dirname } from 'node:path';
import { access } from 'node:fs/promises';
import { withBackupLock } from '../backup-files.mjs';
import { readManagedState, compactManagedState } from '../state-store.mjs';
const args=process.argv.slice(2);
if(args.length!==1)throw Error('Usage: npm run state:compact -- /absolute/path/to/state.json');
const file=resolve(args[0]);
await access(file);
await withBackupLock(dirname(file),async()=>{
 const loaded=await readManagedState(file);
 if(loaded.status!=='ready')throw Error('State snapshot is missing');
 await compactManagedState(file);
});
console.log('State journal compacted successfully.');
