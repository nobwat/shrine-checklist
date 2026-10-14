// オンライン時は常にネットワークから最新を取得してキャッシュを更新し、
// オフライン時（ネットワークエラー時）だけキャッシュを返す（ネットワーク優先）。
const CACHE_NAME = "shrine-app-v3";
const ASSETS = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];
const ASSET_URLS = new Set(ASSETS.map((p) => new URL(p, self.location).href));
const INDEX_URL = new URL("./index.html", self.location).href;
const SCOPE_URL = new URL("./", self.location).href;

// リダイレクトを経たレスポンス（例：/index.html → / ）はページ表示（navigate）に
// そのまま返すとブラウザに拒否される（ERR_FAILED）ため、中身をコピーした新しいResponseにする。
function cleanResponse(response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map(async (p) => {
        const key = new URL(p, self.location).href;
        const response = await fetch(key, { cache: "reload" });
        if (!response.ok) throw new Error(`precache failed: ${key} (${response.status})`);
        await cache.put(key, cleanResponse(response));
      }))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// リクエストをキャッシュ対象のURLに対応づける。対象外なら null（横取りしない）。
function cacheKeyFor(request) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  const path = url.origin + url.pathname;
  if (request.mode === "navigate" && (path === SCOPE_URL || path === INDEX_URL)) return INDEX_URL;
  if (ASSET_URLS.has(path)) return path;
  return null;
}

async function networkFirst(event, key) {
  try {
    // ブラウザのHTTPキャッシュも使わず、サーバーに最新か確認する
    const response = cleanResponse(await fetch(key, { cache: "no-cache" }));
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(key, copy)));
    }
    return response;
  } catch (e) {
    const cached = await caches.match(key);
    if (cached) return cleanResponse(cached);
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const key = cacheKeyFor(event.request);
  if (!key) return;
  event.respondWith(networkFirst(event, key));
});
