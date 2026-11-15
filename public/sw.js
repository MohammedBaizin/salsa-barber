/*
 * Staff dashboard service worker (spec §11). Scope: /dashboard.
 * - Push + notification click (booking alerts), and a dot on the app icon when an alert arrives.
 * - Offline screen: if a dashboard page can't load because there's no connection, it shows a small built-in
 *   "You're offline" page that retries by itself. Nothing is ever cached: every page still comes from the network.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

const OFFLINE_HTML = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0a0b">
<title>Offline · Salsa Dashboard</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 24px;
    background: radial-gradient(40rem 30rem at 80% -10%, rgba(255,194,14,0.18), transparent 60%), #0a0a0b;
    color: #f5f3ee; font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; text-align: center; }
  main { max-width: 22rem; }
  .icon { width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 20px; display: grid; place-items: center;
    background: rgba(255,194,14,0.15); color: #ffc20e; }
  h1 { margin: 0; font-size: 1.6rem; letter-spacing: -0.02em; }
  p { margin: 10px 0 0; color: #a8a49c; }
  button { margin-top: 24px; min-height: 48px; padding: 0 24px; border: 0; border-radius: 999px; background: #ffc20e;
    color: #0a0a0b; font: inherit; font-weight: 700; cursor: pointer; }
</style>
</head>
<body>
<main>
  <div class="icon" aria-hidden="true">
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M5 12.86a10 10 0 0 1 5.17-2.69"/><path d="M19 12.86a10 10 0 0 0-2-1.43"/><path d="M2 8.82a15 15 0 0 1 4.17-2.65"/><path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76"/><path d="m2 2 20 20"/></svg>
  </div>
  <h1>You're offline</h1>
  <p>The dashboard needs a connection to show today's bookings. It will reload by itself when you're back online.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main>
<script>addEventListener("online", function () { location.reload(); });</script>
</body>
</html>`;

self.addEventListener("fetch", (event) => {
  const request = event.request;
  // Only page loads inside the dashboard; everything else goes straight to the network untouched.
  if (request.mode !== "navigate" || !new URL(request.url).pathname.startsWith("/dashboard")) return;
  event.respondWith(
    fetch(request).catch(
      () => new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }),
    ),
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Salsa Dashboard", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Salsa Dashboard";
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: data.body || "",
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        icon: "/brand/icon-192.png",
        badge: "/brand/icon-192.png",
        data: { url: typeof data.url === "string" && data.url.startsWith("/dashboard") ? data.url : "/dashboard" },
      }),
      // A dot on the app icon until the dashboard is opened (it then shows the real number of requests).
      self.navigator.setAppBadge ? self.navigator.setAppBadge().catch(() => {}) : null,
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/dashboard", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).pathname.startsWith("/dashboard") && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
