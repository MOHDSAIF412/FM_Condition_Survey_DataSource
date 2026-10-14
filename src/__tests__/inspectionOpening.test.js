import { expect, test, vi } from 'vitest';
import { loadInitialInspection, canRefreshInspection } from '../utils/inspectionOpening';
test.each([true,false])('cached inspection opens without waiting for a server request (pending=%s)',async pendingSync=>{
 const local={id:'cached',pendingSync};const remote=vi.fn(()=>new Promise(()=>{}));
 const result=await loadInitialInspection('cached',{readLocal:async()=>local,readRemote:remote,cloudEnabled:true,online:true});
 expect(result.local).toBe(local);expect(remote).not.toHaveBeenCalled();
});
test('first-time opening requests only metadata, preserving error and offline outcomes',async()=>{
 const readRemote=vi.fn(async()=>({id:'new'}));
 const result=await loadInitialInspection('new',{readLocal:async()=>null,readRemote,cloudEnabled:true,online:true});
 expect(result.remote.id).toBe('new');expect(readRemote).toHaveBeenCalledWith('new',{}, {includePhotoBytes:false});
 const offline=await loadInitialInspection('new',{readLocal:async()=>null,readRemote,cloudEnabled:true,online:false});
 expect(offline.error.message).toBe('offline');expect(readRemote).toHaveBeenCalledTimes(1);
});
test('background refresh is refused after editing, navigation, switching account or pending work',()=>{
 const base={id:'one'};
 const args={dirty:false,request:1,latestRequest:1,account:'a',currentAccount:'a'};
 expect(canRefreshInspection(base,base,args)).toBe(true);
 expect(canRefreshInspection(base,{...base},args)).toBe(false);
 expect(canRefreshInspection(base,base,{...args,dirty:true})).toBe(false);
 expect(canRefreshInspection(base,base,{...args,latestRequest:2})).toBe(false);
 expect(canRefreshInspection(base,base,{...args,currentAccount:'b'})).toBe(false);
 const unsent={...base,pendingSync:true};expect(canRefreshInspection(unsent,unsent,args)).toBe(false);
});
