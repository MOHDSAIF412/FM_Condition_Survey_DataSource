import { test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function worker() {
  const handlers={};
  const saved = new Map();
  const cache={addAll:vi.fn(async(paths)=>{ paths.forEach((path)=>saved.set(path,`cached:${path}`)); }),match:vi.fn(async(path)=>saved.get(path))};
  const fetch=vi.fn(async()=>{ throw new Error('Offline'); });
  const previous={match:vi.fn(async path=>path==='/assets/old-screen.js'?'old chunk':undefined)};
  const caches={open:vi.fn(async key=>key==='fm-shell-old'?previous:cache),keys:vi.fn(async()=>['other-app','fm-shell-old','fm-shell-test']),delete:vi.fn()};
  const self={location:{origin:'https://app.test'},skipWaiting:vi.fn(),clients:{claim:vi.fn()},addEventListener:(type,fn)=>{handlers[type]=fn;}};
  const source=readFileSync('scripts/service-worker.js','utf8').replace('__VERSION__','test')
    .replace('__ASSETS__',JSON.stringify(['/index.html','/assets/screen.js']));
  vm.runInNewContext(source,{self,caches,fetch,URL,AbortController,setTimeout,clearTimeout});
  return {handlers,cache,caches,fetch,self};
}
test('offline restart and a previously unopened lazy screen use the cached build', async()=>{
  const w=worker(); let installed;
  w.handlers.install({waitUntil:(p)=>{installed=p;}}); await installed;
  for(const [path,mode] of [['/','navigate'],['/assets/screen.js','cors']]) {
    let response;
    w.handlers.fetch({request:{url:`https://app.test${path}`,method:'GET',mode},respondWith:(p)=>{response=p;}});
    expect(await response).toBe(`cached:${path==='/'?'/index.html':path}`);
  }
  expect(w.fetch).toHaveBeenCalledTimes(1);
  expect(w.self.skipWaiting).toHaveBeenCalledOnce();
});
test('authentication, survey data, API routes and writes never enter the shell cache',()=>{
  const w=worker();
  for(const [url,method] of [['https://db.test/rest/v1/condition_surveys','GET'],['https://app.test/api/ota','GET'],['https://app.test/','POST']]) {
    const respondWith=vi.fn();
    w.handlers.fetch({request:{url,method,mode:'cors'},respondWith});
    expect(respondWith).not.toHaveBeenCalled();
  }
});
test('activation preserves old chunks for open survey tabs without deleting data',async()=>{
  const w=worker();let activated;
  w.handlers.activate({waitUntil:(p)=>{activated=p;}});await activated;
  expect(w.caches.delete).not.toHaveBeenCalled();
  expect(w.self.clients.claim).toHaveBeenCalledOnce();
  let result;
  w.handlers.fetch({request:{url:'https://app.test/assets/old-screen.js',method:'GET',mode:'cors'},respondWith:p=>{result=p;}});
  expect(await result).toBe('old chunk');
  expect(w.caches.open).not.toHaveBeenCalledWith('other-app');
});

test('online refresh serves the latest home page instead of the cached deployment',async()=>{
  const w=worker(); let installed;
  w.handlers.install({waitUntil:p=>{installed=p;}}); await installed;
  const latest={ok:true,body:'new QHSE report buttons'};
  w.fetch.mockResolvedValue(latest);
  let result;
  w.handlers.fetch({request:{url:'https://app.test/',method:'GET',mode:'navigate'},respondWith:p=>{result=p;}});
  expect(await result).toBe(latest);
  expect(w.fetch.mock.calls[0][1].cache).toBe('no-store');
});
