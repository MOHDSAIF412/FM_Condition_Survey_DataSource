import { test, expect, vi } from 'vitest';
import { transformSync } from 'esbuild';
import { readFileSync } from 'node:fs';

function runtime({ signedIn = true, permitted = false } = {}) {
  let handler;
  const rpc = vi.fn(async () => ({data:permitted,error:null}));
  const admin = {auth:{getUser:vi.fn(async()=>({data:{user:signedIn?{id:'caller'}:null},error:null}))},from:vi.fn(()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:'caller',role:'super_admin',is_active:true}})}),order:async()=>({data:[{id:'safe-user'}]})})}))};
  const createClient=vi.fn((_url,key)=>key==='service-key'?admin:{rpc});
  const source=readFileSync('supabase/functions/admin-users/index.ts','utf8').replace(/^import .*;$/gm,'');
  const {code}=transformSync(source,{loader:'ts',format:'iife',target:'es2022'});
  const deno={env:{get:key=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-key',SUPABASE_ANON_KEY:'public-key'})[key]},serve:fn=>{handler=fn;}};
  // Execute only repository-owned handler code, with fake clients and no network.
  new Function('Deno','createClient','assertSafePassword',code)(deno,createClient,vi.fn());
  return {handler,admin,rpc,createClient};
}
test.each(['GET','POST','PATCH','DELETE'])('anonymous %s cannot bootstrap or manage users', async method => {
  const r=runtime({signedIn:false});
  const response=await r.handler(new Request('https://test/functions/admin-users',{method}));
  expect(response.status).toBe(403); expect(r.rpc).not.toHaveBeenCalled(); expect(r.admin.from).not.toHaveBeenCalled();
});
test('service-role profile lookup cannot bypass the signed-in permission or MFA check', async () => {
  const r=runtime({signedIn:true,permitted:false});
  const response=await r.handler(new Request('https://test/functions/admin-users',{headers:{Authorization:'Bearer test-user-token'}}));
  expect(response.status).toBe(403);
  expect(r.createClient.mock.calls[1][1]).toBe('public-key');
  expect(r.createClient.mock.calls[1][2].global.headers.Authorization).toBe('Bearer test-user-token');
  expect(r.rpc).toHaveBeenCalledWith('fm_can',{p_permission:'manage_users'});
});
test('authorized administrator can still list users', async () => {
  const r=runtime({permitted:true});
  const response=await r.handler(new Request('https://test/functions/admin-users',{headers:{Authorization:'Bearer verified-user'}}));
  expect(response.status).toBe(200); expect(await response.json()).toEqual({users:[{id:'safe-user'}]});
});
