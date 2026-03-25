// Research Vault Dashboard — Service Worker
// Strategy: stale-while-revalidate for HTML, cache-first for CDN assets

const CACHE_NAME = 'vault-v1';
const CDN_CACHE = 'vault-cdn-v1';

const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js',
  'https://unpkg.com/lucide@latest'
];

// Install: pre-cache CDN assets and current HTML
self.addEventListener('install', function(event) {
  event.waitUntil(
    Promise.all([
      caches.open(CDN_CACHE).then(function(cache) {
        return cache.addAll(CDN_URLS);
      }),
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.add('/vault-dashboard/').catch(function() {});
      })
    ])
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) {
          return k !== CACHE_NAME && k !== CDN_CACHE;
        }).map(function(k) {
          return caches.delete(k);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: route by request type
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // CDN assets: cache-first (pinned versions, never change)
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'unpkg.com') {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(resp) {
          var clone = resp.clone();
          caches.open(CDN_CACHE).then(function(c) { c.put(event.request, clone); });
          return resp;
        });
      })
    );
    return;
  }

  // Icon/manifest assets: cache-first (static, rarely change)
  if (url.pathname.match(/\.(png|json)$/) && url.hostname === self.location.hostname) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(resp) {
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(event.request, clone); });
          return resp;
        });
      })
    );
    return;
  }

  // HTML navigation: stale-while-revalidate
  if (event.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        var fetchPromise = fetch(event.request).then(function(resp) {
          if (resp.ok) {
            var clone = resp.clone();
            caches.open(CACHE_NAME).then(function(c) { c.put(event.request, clone); });
            // Notify clients that new data is available
            if (cached) {
              self.clients.matchAll().then(function(clients) {
                clients.forEach(function(client) {
                  client.postMessage({ type: 'UPDATE_AVAILABLE' });
                });
              });
            }
          }
          return resp;
        }).catch(function() {
          return cached;
        });

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Everything else: network-first
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});
