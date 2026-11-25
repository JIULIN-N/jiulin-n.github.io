// Reeden 主题预览器 · 字体永久缓存 Service Worker
// 目的：iOS/安卓「添加到主屏幕」的独立 Web App 不共享浏览器缓存且会被系统清理，
// 导致每次冷启动重新下载 3.4MB 汇文/0.7MB 方正。这里把字体做 cache-first 永久缓存，
// 首次下载后永久命中本地，不再走网络（字体文件不会变，缓存无需失效策略）。
// 更新页面（scan.html）不受影响：本 SW 只接管字体请求，HTML 仍走网络最新版。
const FONT_CACHE = 'reeden-fonts-v1';
const FONT_RE = /\.(woff2?|ttf|otf)$/i;
// install 阶段先预缓存方正屏显雅宋（0.7MB，页面启动即用）：首次打开就落盘，
// 之后主屏幕/离线打开直接命中，不再等网络。汇文 3.4MB 体积大，等真正选中时由
// 页面主动写入缓存（见 registerFontOnce），避免不选汇文的用户白下 3.4MB。
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(FONT_CACHE).then(c => c.addAll(['fangzheng.woff2','manifest.webmanifest','icon-192.png','icon-512.png']).catch(() => {})));
});
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!FONT_RE.test(url.pathname)) return;
  e.respondWith((async () => {
    const cache = await caches.open(FONT_CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req, { cache: 'force-cache' });
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (err) {
      return hit || Response.error();
    }
  })());
});
