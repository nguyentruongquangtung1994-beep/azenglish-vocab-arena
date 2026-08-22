const CACHE_NAME = "az-vocab-arena-v1";

self.addEventListener("install", function(){
  self.skipWaiting();
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function(event){
  if(event.request.method !== "GET") return;
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache){
      return fetch(event.request).then(function(response){
        if(response && response.status === 200){
          cache.put(event.request, response.clone());
        }
        return response;
      }).catch(function(){
        return cache.match(event.request);
      });
    })
  );
});
