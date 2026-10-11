/*
 * Pence's service worker. It only shows price-watch alerts: it does not cache
 * pages or touch any request, so the app behaves exactly as before.
 *
 * The push from the server carries no message, so the words are fixed here.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title : "Pence found an offer";
  const body =
    typeof data.body === "string"
      ? data.body
      : "Something on your Watchlist has an offer. Tap to see if it’s right for you.";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/__grok/icon-180.png",
      badge: "/__grok/icon-180.png",
      tag: "pence-watch",
      renotify: true,
      data: { url: "/offers#watchlist" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/offers#watchlist", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          if ("navigate" in client) client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
