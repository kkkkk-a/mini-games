const CACHE_NAME = 'neo-tactics-v1';
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
});

// ネットワーク優先、繋がらなければキャッシュを返す
self.addEventListener('fetch', e => {
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});