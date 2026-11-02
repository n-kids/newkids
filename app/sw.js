// 뉴키즈 주문앱 서비스워커: 홈 화면 설치용. 화면 파일은 새 버전을 먼저 받고, 안 되면 저장해 둔 것을 씀
const CACHE = 'nk-order-v1';
const SHELL = ['./', './index.html', './app.css', './common.js', './data.js', '../config.js', './logo-n.png', './manifest.webmanifest'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;   // Supabase 등 외부 요청은 그대로
  const isImage = /\.(jpg|png)$/.test(url.pathname);
  if (isImage) {   // 사진은 저장해 둔 것 먼저
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })));
    return;
  }
  e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; })
    .catch(() => caches.match(e.request)));
});
