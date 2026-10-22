const CACHE='control-cargas-movil-v05';
const ASSETS=['./','./index.html','./core.mjs','./manifest.webmanifest','./icon.svg','./icon-180.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==self.location.origin)return;const path=new URL(e.request.url).pathname;
if(path.endsWith('/')||path.endsWith('index.html')||path.endsWith('core.mjs')){e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request)));return}
e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))});
