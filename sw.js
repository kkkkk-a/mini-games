const CACHE_NAME = 'neo-tactics-v2';
const ASSETS =[
    './',
    './index.html',
    './common/shared.css',
    './common/shared-sys.js',
    './game/smash-breaker.js',
    './game/graph-tactics.js',
    './game/line-vanish.js',
    './game/calc-crash.js',
    './game/snake-tactics.js'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// ネットワーク優先、繋がらなければキャッシュを返す
self.addEventListener('fetch', e => {
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});