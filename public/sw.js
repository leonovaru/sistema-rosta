self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = data.title || "Система роста";
  const options = {
    body: data.body || "Доброе утро! Ты уже проснулась?",
    tag: data.tag || "morning-wake",
    renotify: false,
    requireInteraction: true,
    data: { url: data.url || "/", wakeUrl: data.wakeUrl || "/?wake=1" },
    actions: [{ action: "wake", title: "Да, я проснулась" }]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const data = event.notification.data || {};
  const confirmed = event.action === "wake";
  const target = confirmed ? (data.wakeUrl || "/?wake=1") : (data.url || "/");
  const url = new URL(target, self.location.origin).href;
  event.waitUntil((async () => {
    if (confirmed) {
      try {
        await fetch("/api/sleep", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "wake", source: "push" })
        });
      } catch {}
    }
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
