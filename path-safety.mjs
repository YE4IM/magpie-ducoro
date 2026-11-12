import {relative,isAbsolute,sep} from 'node:path';
// Physical paths use platform separators; package entry names remain POSIX.
export function within(root,path,{allowRoot=true}={}) {
  const rel=relative(root,path);
  return (!rel && allowRoot) || !!rel && !isAbsolute(rel) && rel!=='..' && !rel.startsWith('..'+sep);
}
