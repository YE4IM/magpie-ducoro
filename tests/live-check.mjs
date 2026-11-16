import assert from 'node:assert/strict';
import {DEFAULTS} from '../defaults.mjs';
const root='http://127.0.0.1:3498/';
const html=await (await fetch(root)).text();const token=/<meta name="ducoro-token" content="([a-f0-9]+)"/.exec(html)?.[1];assert.ok(token);
const headers={'X-Ducoro-Token':token,'X-Ducoro-Language':'en','Content-Type':'application/json'};
const counts=async()=>await(await fetch('http://127.0.0.1:3499/counts')).json();
const get=async(path,body,extra={})=>{const r=await fetch(root+'api/'+path,{method:body?'POST':'GET',headers:{...headers,...extra},body:body?JSON.stringify(body):undefined});assert.equal(r.status,200);return r.json();};
await get('preview',DEFAULTS); // First request must succeed without an inventory token.
const before=(await counts()).length;const inv=await get('inventory');assert.ok(inv.bots?.length,'real Bot roster required');
await get('preview',DEFAULTS,{'X-Ducoro-Inventory':inv.inventoryToken});const after=await counts();
const reads=args=>['agent list','connections list --with-status','mcp catalog'].includes(args.join(' '));
assert.equal(after.slice(before).filter(reads).length,3,'refresh+automatic preview share the three inventory reads');
const freshBefore=after.length;await get('preview',DEFAULTS);assert.equal((await counts()).slice(freshBefore).filter(reads).length,3,'explicit/save preview reads fresh inventory');
console.log(JSON.stringify({realBots:inv.bots.length,refreshInventoryReads:3,freshPreviewReads:3,versionInPage:html.includes('0.4.5')},null,2));
