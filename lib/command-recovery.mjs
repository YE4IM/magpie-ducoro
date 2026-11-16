// Read back an interrupted mutation before returning to its resource adapter.
// A read is evidence only: adapters still reconcile desired/current/owned values.
export function reconciliationRead(args) {
  if (args.includes('--help')) return null;
  if(args[0]==='credentials' && ['put','rm'].includes(args[1]))return ['credentials','list'];
  if (args[0] === 'connections' && ['add','update','add-apikey','update-apikey','rm'].includes(args[1])) return ['connections','list','--with-status'];
  if (args[0] === 'skill' && ['rename','remove'].includes(args[1])) return ['skill','list'];
  if (args[0] === 'agent' && args[1] === 'skill' && ['rename','remove'].includes(args[2])) return ['agent','skill','list',args[3]];
  if (args[0] === 'agent' && args[1] === 'update') return ['agent','get',args[2]];
  if (args[0] === 'agent' && ['connector','mcp','skill','subagent'].includes(args[1]) && ['add','update','rm','import'].includes(args[2])) return ['agent',args[1],'list',args[3]];
  if (['mcp','skill'].includes(args[0]) && ['add','update','rm','import'].includes(args[1])) return [args[0],'list'];
  return null;
}
export function withCommandRecovery(run) {
  return async (args, options) => {
    let result, failure;
    try { result = await run(args, options); } catch (error) { failure = error; }
    if (result?.outcomeUnknown || failure?.outcomeUnknown) {
      const read = reconciliationRead(args);
      if (read) {
        let readback;
        try { readback = await run(read, {timeoutMs:5000}); } catch {}
        const evidence = readback?.ok ? 'read-back' : 'unavailable';
        if (result) result.reconciliation = evidence;
        if (failure) failure.reconciliation = evidence;
      }
    }
    if (failure) throw failure;
    return result;
  };
}
