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

// ===== Thông báo nhắc học (Web Push) =====
self.addEventListener("push", function(event){
  var d = {};
  try{ d = event.data ? event.data.json() : {}; }catch(e){ d = { body: event.data ? event.data.text() : "" }; }
  event.waitUntil(self.registration.showNotification(d.title || "Lumina réo bạn nè 🦁", {
    body: d.body || "Vô học 5 phút đi bạn ơi!",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: "az-remind",
    renotify: true,
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", function(event){
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(list){
    for(var i = 0; i < list.length; i++){
      if(list[i].url.split("?")[0] === url.split("?")[0] && "focus" in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(url);
  }));
});
