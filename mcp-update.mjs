// Empty list flags are rejected by current Ducoro CLIs. Omit absent fields only
// after a full read proves there is no old value that would be left behind.
export function mcpServerArgs(def, patch = false, current) {
  if (patch) {
    const before=current?.transport;
    if(!before || typeof before!=='object')throw Error('MCP configuration conflict: full definition readback is required');
    if(before.type!==def.transport)throw Error('MCP configuration conflict: transport changes require explicit re-creation');
    const populated=value=>Array.isArray(value)?value.length:Object.keys(value??{}).length;
    for(const key of def.transport==='stdio'?['args','env']:['headers']) {
      if(populated(before[key])&&!populated(def[key]))throw Error('MCP configuration conflict: this CLI cannot clear an empty '+key+' list; inspect the owned definition before re-creating it');
    }
  }
  const args=[];
  if(def.transport==='stdio') {
    args.push('--command',def.command);
    if(def.args?.length)args.push('--args',def.args.join(','));
    if(def.env?.length)args.push('--env',def.env.map(([k,v])=>k+'='+v).join(','));
  } else {
    args.push('--url',def.url);
    if(def.headers?.length)args.push('--header',def.headers.map(([k,v])=>k+'='+v).join(','));
  }
  for(const ref of def.credentialRefs??[])args.push('--credential-ref',ref);
  if(patch&&!def.credentialRefs?.length)args.push('--credential-ref','');
  if(patch||def.disabledTools?.length)args.push('--tool-deny',(def.disabledTools??[]).join(','));
  return args;
}
