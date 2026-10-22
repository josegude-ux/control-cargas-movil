// Cache versionada. Conserva el localStorage y no interfiere con otras PWA.
const CACHE='control-cargas-movil-v0516';
const ASSETS=['./','./index.html','./core.mjs','./printing.mjs','./version.json','./manifest.webmanifest','./icon.svg','./icon-180.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('control-cargas-movil-v')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
 const request=event.request;if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==self.location.origin)return;
 const mustRefresh=request.mode==='navigate'||/(?:^|\/)(?:index\.html|core\.mjs|version\.json|sw\.js)$/.test(url.pathname);
 if(mustRefresh){
  event.respondWith(fetch(request,{cache:'no-store'}).then(response=>{
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)))}
   return response;
  }).catch(async()=>await caches.match(request,{ignoreSearch:true})||await caches.match('./index.html')));
 }else{
  event.respondWith(caches.match(request,{ignoreSearch:true}).then(cached=>cached||fetch(request)));
 }
});
