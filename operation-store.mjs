import {classifyFailure} from './operation-controls.mjs';
import { createHash } from 'node:crypto';
const revision = value => createHash('sha256').update(JSON.stringify(value,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x)??'null').digest('hex');
// Persist intent before work; uncertain outcomes are reconciled by each resource
// adapter against Ducoro, never blindly replayed from a saved CLI command.
export function createOperationStore({getState,save}) {
  const seen=new Set();let controls={},selection=null;
  const key=(feature,target,resource)=>revision([feature,target,resource]);
  return {
    reset(settings={}){seen.clear();controls=settings.controls??{};selection=settings.selection??null;},
    async begin(feature,target,resource,desired,dependencies=[],unchanged=false) {
      const id=key(feature,target,resource);seen.add(id);
      const state=getState();state.operations??={};
      const old=state.operations[id],hash=revision(desired);
      if(controls[id]?.paused || selection && id!==selection)return null;
      if(!unchanged && !selection && old?.revision===hash && old.status==='failed' && ['permission','conflict'].includes(old.failureClass))return null;
      if(unchanged && (!old || (old.status==='completed' && old.revision===hash)))return null;
      state.operations[id]={feature,target,resource,revision:hash,dependencies,status:'running',attempts:old?.revision===hash?(old.attempts??0)+1:1,updatedAt:new Date().toISOString()};
      await save([['operations',id]]);return id;
    },
    async finish(id,success=true,paths=[],error){if(!id)return;const row=getState().operations?.[id];if(!row)return;row.status=success?'completed':'failed';if(!success)row.failureClass=classifyFailure(error);else delete row.failureClass;row.updatedAt=new Date().toISOString();await save([['operations',id],...paths]);},
    async retire(features) {
      const state=getState();let changed=false;
      for(const [id,row] of Object.entries(state.operations??{}))if((!features||features.has(row.feature))&&!seen.has(id)&&!controls[id]?.paused){delete state.operations[id];changed=true;}
      if(changed)await save();
    }
  };
}
