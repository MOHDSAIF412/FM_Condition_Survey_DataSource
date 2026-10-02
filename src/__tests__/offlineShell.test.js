import { test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function worker() {
  const handlers={};
  const saved = new Map();
  const cache={addAll:vi.fn(async(paths)=>{ paths.forEach((path)=>saved.set(path,`cached:${path}`)); }),match:vi.fn(async(path)=>saved.get(path))};
  const fetch=vi.fn(async()=>{ throw new Error('Offline'); });
  const caches={open:vi.fn(async()=>cache),keys:vi.fn(async()=>['other-app','fm-shell-old','fm-shell-test']),delete:vi.fn()};
  const self={location:{origin:'https://app.test'},clients:{claim:vi.fn()},addEventListener:(type,fn)=>{handlers[type]=fn;}};
  const source=readFileSync('scripts/service-worker.js','utf8').replace('__VERSION__','test')
    .replace('__ASSETS__',JSON.stringify(['/index.html','/assets/screen.js']));
  vm.runInNewContext(source,{self,caches,fetch,URL});
  return {handlers,cache,caches,fetch};
}
test('offline restart and a previously unopened lazy screen use the cached build', async()=>{
  const w=worker(); let installed;
  w.handlers.install({waitUntil:(p)=>{installed=p;}}); await installed;
  for(const [path,mode] of [['/','navigate'],['/assets/screen.js','cors']]) {
    let response;
    w.handlers.fetch({request:{url:`https://app.test${path}`,method:'GET',mode},respondWith:(p)=>{response=p;}});
    expect(await response).toBe(`cached:${path==='/'?'/index.html':path}`);
  }
  expect(w.fetch).not.toHaveBeenCalled();
});
test('authentication, survey data, API routes and writes never enter the shell cache',()=>{
  const w=worker();
  for(const [url,method] of [['https://db.test/rest/v1/condition_surveys','GET'],['https://app.test/api/ota','GET'],['https://app.test/','POST']]) {
    const respondWith=vi.fn();
    w.handlers.fetch({request:{url,method,mode:'cors'},respondWith});
    expect(respondWith).not.toHaveBeenCalled();
  }
});
test('activation cleans only old application-shell caches',async()=>{
  const w=worker();let activated;
  w.handlers.activate({waitUntil:(p)=>{activated=p;}});await activated;
  expect(w.caches.delete).toHaveBeenCalledTimes(1);
  expect(w.caches.delete).toHaveBeenCalledWith('fm-shell-old');
});
