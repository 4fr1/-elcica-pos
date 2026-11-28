const CACHE_NAME = "elcica-pos-v2";

const APP_FILES = [
    "/",
    "/index.html",
    "/kasir.html",
    "/manifest.webmanifest",
    "/css/app.css",
    "/css/dashboard.css",
    "/js/app.js",
    "/js/dashboard.js",
    "/icons/icon.svg"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(APP_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith("elcica-pos-") && key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== "GET" || url.origin !== self.location.origin) {
        return;
    }

    // API tidak boleh dilayani dari cache aplikasi.
    if (url.pathname.startsWith("/api/")) {
        return;
    }

    // Navigasi: coba jaringan, gunakan halaman cache jika offline.
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) =>
                            cache.put("/index.html", copy)
                        );
                    }
                    return response;
                })
                .catch(async () => {
                    return await caches.match("/index.html") ||
                        new Response("Aplikasi belum tersedia offline.", {
                            status: 503,
                            headers: { "Content-Type": "text/plain; charset=utf-8" }
                        });
                })
        );
        return;
    }

    // CSS, JS, ikon, dan manifest: cache-first.
    event.respondWith(
        caches.match(request).then(async (cached) => {
            if (cached) return cached;

            try {
                const response = await fetch(request);

                if (response.ok) {
                    const copy = response.clone();
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, copy);
                }

                return response;
            } catch (error) {
                return new Response("File tidak tersedia offline.", {
                    status: 503
                });
            }
        })
    );
});
