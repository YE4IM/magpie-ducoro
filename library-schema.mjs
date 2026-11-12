const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export function validateLibrary(lib) {
  if(!record(lib))throw Error('Invalid Magpie library object');
  for(const kind of ['mcp','skills','subagents']) {
    if(lib[kind]!==undefined && (!Array.isArray(lib[kind]) || lib[kind].some(item=>!record(item)||typeof item.name!=='string'||!item.name.trim()||item.agents!==undefined&&(!Array.isArray(item.agents)||item.agents.some(x=>typeof x!=='string'))||['disabled','enabled','offHere'].some(key=>item[key]!==undefined&&typeof item[key]!=='boolean'))))throw Error('Invalid Magpie library '+kind);
  }
  if(lib.instructions!==undefined && (!record(lib.instructions)||lib.instructions.agents!==undefined&&(!Array.isArray(lib.instructions.agents)||lib.instructions.agents.some(x=>typeof x!=='string'))||['disabled','enabled','offHere'].some(key=>lib.instructions[key]!==undefined&&typeof lib.instructions[key]!=='boolean')))throw Error('Invalid Magpie instructions');
  return lib;
}
