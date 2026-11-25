// Reeden 主题预览器 · 字体永久缓存 Service Worker
// 目的：iOS/安卓「添加到主屏幕」的独立 Web App 不共享浏览器缓存且会被系统清理，
// 导致每次冷启动重新下载 3.4MB 汇文/0.7MB 方正。这里把字体做 cache-first 永久缓存，
// 首次下载后永久命中本地，不再走网络（字体文件不会变，缓存无需失效策略）。
// 更新页面（scan.html）不受影响：本 SW 只接管字体请求，HTML 仍走网络最新版。
const FONT_CACHE = 'reeden-fonts-v1';
const FONT_RE = /\.(woff2?|ttf|otf)$/i;
// install 阶段先预缓存方正屏显雅宋（0.7MB，页面启动即用）：首次打开就落盘，
// 之后主屏幕/离线打开直接命中，不再等网络。汇文 3.4MB 体积大，放到 activate 之后再
// 后台预缓存（见下）：先接管页面保证首屏流畅，再并行下载字体，用户点海报时通常已就绪。
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(FONT_CACHE).then(c => c.addAll(['fangzheng.woff2']).catch(() => {})));
});
self.addEventListener('activate', e => e.waitUntil((async () => {
  await self.clients.claim();   // 先接管页面，下面的字体下载不阻塞渲染
  // 后台预缓存汇文（3.4MB）：主屏幕是独立存储，必然要重新下一次。
  // 在这里就启动下载（与首屏渲染并行），等用户点海报模板时字体多半已落盘，
  // 页面 fetch 直接命中本地缓存，不再出现「图生成完等半天字体才出来」。
  try {
    const c = await caches.open(FONT_CACHE);
    if (!(await c.match('huiwen.woff2'))) {
      await c.add(new Request('huiwen.woff2', { cache: 'reload' })).catch(() => {});
    }
  } catch (err) {}
})()));
const HTML_CACHE = 'reeden-html-v1';
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 页面导航：网络优先（2 秒超时）→ 缓存兜底。
  // 目的：GitHub Pages 在国内首字节就要数秒，482KB 页面每次打开都要重下（很慢）。
  // 缓存后：网络正常时仍拿最新版；慢网/离线时 2 秒后直接用缓存秒开，不再干等。
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(HTML_CACHE);
      const hit = (await cache.match(req)) || (await cache.match(new URL('scan.html', self.registration.scope).href));
      // 网络请求始终启动并写入缓存（即使本次超时先返回缓存，下载完成后也会更新缓存，
      // 避免「慢网用户永远拿到旧版」）。
      const netP = fetch(req).then(r => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
      if (hit) {
        const net = await Promise.race([netP, new Promise(r => setTimeout(() => r(null), 2000))]);
        if (net && net.ok) return net;        // 2 秒内拿到新版：直接显示最新
        e.waitUntil(netP);                    // 超时：先显示缓存，后台继续下载并更新缓存
        return hit;
      }
      const net = await netP;
      return net || Response.error();
    })());
    return;
  }
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
