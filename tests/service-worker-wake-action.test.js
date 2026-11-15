import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

async function loadServiceWorker() {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const handlers = {};
  const opened = [];
  const requests = [];
  const self = {
    location: { origin: "https://app.example.test" },
    registration: { showNotification: async () => {} },
    clients: {
      matchAll: async () => [],
      openWindow: async url => { opened.push(url); return {}; },
      claim: async () => {}
    },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    skipWaiting: async () => {}
  };
  vm.runInNewContext(source, {
    self, URL,
    fetch: async (...args) => { requests.push(args); return new Response(null, { status: 200 }); }
  });
  return { handlers, opened, requests };
}

test("opening notification without pressing action does not confirm wake", async () => {
  const sw = await loadServiceWorker();
  let pending;
  sw.handlers.notificationclick({
    action: "",
    notification: { data: { url: "/", wakeUrl: "/?wake=1" }, close() {} },
    waitUntil: promise => { pending = promise; }
  });
  await pending;
  assert.equal(sw.requests.length, 0);
  assert.deepEqual(sw.opened, ["https://app.example.test/"]);
});

test("explicit wake action records confirmation and opens wake fallback", async () => {
  const sw = await loadServiceWorker();
  let pending;
  sw.handlers.notificationclick({
    action: "wake",
    notification: { data: { url: "/", wakeUrl: "/?wake=1" }, close() {} },
    waitUntil: promise => { pending = promise; }
  });
  await pending;
  assert.equal(sw.requests.length, 1);
  assert.equal(sw.requests[0][0], "/api/sleep");
  assert.deepEqual(sw.opened, ["https://app.example.test/?wake=1"]);
});
