/**
 * sw.js — Service Worker
 * 戦略:
 *   - 静的アセット (HTML/CSS/JS/アイコン) → Cache First
 *   - API / EPUBファイル               → Network Only（キャッシュしない）
 *   - オフライン時のナビゲーション        → キャッシュ済み index.html を返す
 */

const CACHE_NAME    = 'epub-reader-v36';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/reader.html',
  '/manifest.json',
  '/css/base.css',
  '/css/bookshelf.css',
  '/css/reader.css',
  '/css/login.css',
  '/js/api.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/sync.js',
  '/js/bookshelf.js',
  '/js/highlights.js',
  '/js/reader.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/epub.js/0.3.93/epub.min.js',
];

// ── インストール: 静的アセットをキャッシュ ──────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── アクティベート: 古いキャッシュを削除 ─────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── フェッチ ─────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // API・EPUBファイルはキャッシュしない（Network Only）
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/epub/')) {
    return; // ブラウザのデフォルト動作に委ねる
  }

  // 静的アセット: Cache First
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      // キャッシュになければネットワークから取得してキャッシュ
      return fetch(e.request).then(res => {
        // 有効なレスポンスのみキャッシュ
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // オフライン時のナビゲーションフォールバック
        if (e.request.mode === 'navigate') {
          return caches.match('/index.html');
        }
      });
    })
  );
});
