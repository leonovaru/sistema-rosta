import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../workers/morning-push/index.js";

const nativeDate = Date;
const nativeFetch = globalThis.fetch;
const nativeCrypto = globalThis.crypto;
const b64u = value => Buffer.from(value).toString("base64url");

async function makeEnv(fetchImpl, subscriptionCount = 1, timezone = "Europe/Moscow") {
  let currentTimezone = timezone;
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const privateJwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
  const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const client = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const clientPublic = new Uint8Array(await webcrypto.subtle.exportKey("raw", client.publicKey));
  const publicBytes = Buffer.concat([Buffer.from([4]), Buffer.from(publicJwk.x, "base64url"), Buffer.from(publicJwk.y, "base64url")]);
  const deliveries = new Map();
  const subscriptions = Array.from({ length: subscriptionCount }, (_, index) => ({
    id: "sub-" + (index + 1), user_id: "user-1",
    endpoint: "https://fcm.googleapis.com/fcm/send/test-" + (index + 1),
    p256dh: b64u(clientPublic), auth: b64u(webcrypto.getRandomValues(new Uint8Array(16))),
    timezone: "Europe/Moscow"
  }));
  const DB = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async all() { return { results: subscriptions.map(row => ({ ...row, timezone: currentTimezone })) }; },
        async first() {
          if (sql.includes("SELECT id,status FROM push_deliveries")) {
            const row = deliveries.get(values[0] + "|" + values[1]);
            return row ? { id: row.id, status: row.status } : null;
          }
          return null;
        },
        async run() {
          if (sql.includes("INSERT OR IGNORE INTO push_deliveries")) {
            const [id, userId, subscriptionId, localDate, timezone, scheduledAt] = values;
            const key = subscriptionId + "|" + localDate;
            if (!deliveries.has(key)) deliveries.set(key, { id, userId, subscriptionId, localDate, timezone, scheduledAt, status: "pending", updated: 0 });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("SET status='sending'")) {
            const row = [...deliveries.values()].find(item => item.id === values[0]);
            if (!row || row.status === "sent" || row.status === "sending") return { meta: { changes: 0 } };
            row.status = "sending"; row.updated++;
            return { meta: { changes: 1 } };
          }
          if (sql.includes("SET status='sent'")) {
            const row = [...deliveries.values()].find(item => item.id === values[1]);
            if (row) row.status = "sent";
            return { meta: { changes: row ? 1 : 0 } };
          }
          if (sql.includes("SET status='failed'")) {
            const row = [...deliveries.values()].find(item => item.id === values[1]);
            if (row) row.status = "failed";
            return { meta: { changes: row ? 1 : 0 } };
          }
          if (sql.includes("DELETE FROM push_subscriptions")) {
            const index = subscriptions.findIndex(item => item.id === values[0]);
            if (index >= 0) subscriptions.splice(index, 1);
            return { meta: { changes: index >= 0 ? 1 : 0 } };
          }
          return { meta: { changes: 0 } };
        }
      };
      return statement;
    }
  };
  return {
    DB,
    VAPID_PUBLIC_KEY: b64u(publicBytes),
    VAPID_PRIVATE_KEY: privateJwk.d,
    VAPID_SUBJECT: "mailto:push@example.test",
    _deliveries: deliveries,
    _subscriptions: subscriptions,
    _setTimezone(value) { currentTimezone = value; },
    _fetch: fetchImpl
  };
}

async function withFixedTime(iso, fn) {
  const fixed = new nativeDate(iso).getTime();
  globalThis.Date = class extends nativeDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
    static now() { return fixed; }
  };
  try { await fn(); } finally { globalThis.Date = nativeDate; }
}

test("scheduled worker sends only once per subscription and local date", async () => {
  let sends = 0;
  const env = await makeEnv(async () => { sends++; return new Response(null, { status: 201 }); });
  globalThis.fetch = env._fetch;
  try {
    await withFixedTime("2026-11-15T03:00:00.000Z", async () => {
      await worker.scheduled({}, env, {});
      await worker.scheduled({}, env, {});
    });
    assert.equal(sends, 1);
    assert.equal([...env._deliveries.values()][0].status, "sent");
  } finally { globalThis.fetch = nativeFetch; }
});

test("failed delivery can be retried during the morning retry window", async () => {
  let sends = 0;
  const env = await makeEnv(async () => {
    sends++;
    return new Response(null, { status: sends === 1 ? 503 : 201 });
  });
  globalThis.fetch = env._fetch;
  try {
    await withFixedTime("2026-11-15T03:00:00.000Z", async () => {
      await worker.scheduled({}, env, {});
      await worker.scheduled({}, env, {});
    });
    assert.equal(sends, 2);
    assert.equal([...env._deliveries.values()][0].status, "sent");
  } finally { globalThis.fetch = nativeFetch; }
});


test("an expired device subscription is removed without blocking other devices", async () => {
  let sends = 0;
  const env = await makeEnv(async () => {
    sends++;
    return new Response(null, { status: sends === 1 ? 410 : 201 });
  }, 2);
  globalThis.fetch = env._fetch;
  try {
    await withFixedTime("2026-11-15T03:00:00.000Z", async () => {
      await worker.scheduled({}, env, {});
    });
    assert.equal(sends, 2);
    assert.equal(env._subscriptions.length, 1);
    assert.equal(env._subscriptions[0].id, "sub-2");
    const rows = [...env._deliveries.values()];
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.subscriptionId === "sub-1").status, "failed");
    assert.equal(rows.find(row => row.subscriptionId === "sub-2").status, "sent");
  } finally { globalThis.fetch = nativeFetch; }
});


test("scheduler waits for 06:00 in the current account timezone", async () => {
  let sends = 0;
  const env = await makeEnv(async () => { sends++; return new Response(null, { status: 201 }); }, 1, "Europe/Amsterdam");
  globalThis.fetch = env._fetch;
  try {
    await withFixedTime("2026-11-15T03:00:00.000Z", async () => {
      await worker.scheduled({}, env, {});
    });
    assert.equal(sends, 0);
    assert.equal(env._deliveries.size, 0);
    await withFixedTime("2026-11-15T05:00:00.000Z", async () => {
      await worker.scheduled({}, env, {});
    });
    assert.equal(sends, 1);
    const delivery = [...env._deliveries.values()][0];
    assert.equal(delivery.localDate, "2026-11-15");
    assert.equal(delivery.timezone, "Europe/Amsterdam");
    assert.equal(delivery.status, "sent");
  } finally { globalThis.fetch = nativeFetch; }
});

test("each registered device receives its own delivery for the same local date", async () => {
  let sends = 0;
  const env = await makeEnv(async () => { sends++; return new Response(null, { status: 201 }); }, 2);
  globalThis.fetch = env._fetch;
  try {
    await withFixedTime("2026-11-15T03:00:00.000Z", async () => {
      await worker.scheduled({}, env, {});
    });
    assert.equal(sends, 2);
    const rows = [...env._deliveries.values()];
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.status === "sent" && row.localDate === "2026-11-15"));
  } finally { globalThis.fetch = nativeFetch; }
});


test("scheduler uses the updated timezone setting on its next run", async () => {
  let sends = 0;
  const env = await makeEnv(async () => { sends++; return new Response(null, { status: 201 }); }, 1, "Europe/Amsterdam");
  globalThis.fetch = env._fetch;
  try {
    await withFixedTime("2026-11-15T03:00:00.000Z", async () => {
      await worker.scheduled({}, env, {});
    });
    assert.equal(sends, 0);
    env._setTimezone("Europe/Moscow");
    await withFixedTime("2026-11-15T03:05:00.000Z", async () => {
      await worker.scheduled({}, env, {});
    });
    assert.equal(sends, 1);
    const delivery = [...env._deliveries.values()][0];
    assert.equal(delivery.timezone, "Europe/Moscow");
    assert.equal(delivery.localDate, "2026-11-15");
  } finally { globalThis.fetch = nativeFetch; }
});


test("network failure is marked failed and can be retried", async () => {
  let sends = 0;
  const env = await makeEnv(async () => {
    sends++;
    if (sends === 1) throw new Error("simulated network timeout");
    return new Response(null, { status: 201 });
  });
  globalThis.fetch = env._fetch;
  try {
    await withFixedTime("2026-11-15T03:00:00.000Z", async () => {
      await worker.scheduled({}, env, {});
      assert.equal([...env._deliveries.values()][0].status, "failed");
      await worker.scheduled({}, env, {});
    });
    assert.equal(sends, 2);
    assert.equal([...env._deliveries.values()][0].status, "sent");
  } finally { globalThis.fetch = nativeFetch; }
});

test("overlapping scheduler runs do not send the same delivery twice", async () => {
  let sends = 0;
  let releaseFetch;
  let notifyFetchStarted;
  const fetchStarted = new Promise(resolve => { notifyFetchStarted = resolve; });
  const fetchGate = new Promise(resolve => { releaseFetch = resolve; });
  const env = await makeEnv(async () => {
    sends++;
    notifyFetchStarted();
    await fetchGate;
    return new Response(null, { status: 201 });
  });
  globalThis.fetch = env._fetch;
  try {
    await withFixedTime("2026-11-15T03:00:00.000Z", async () => {
      const firstRun = worker.scheduled({}, env, {});
      await fetchStarted;
      await worker.scheduled({}, env, {});
      releaseFetch();
      await firstRun;
    });
    assert.equal(sends, 1);
    assert.equal([...env._deliveries.values()][0].status, "sent");
  } finally { globalThis.fetch = nativeFetch; }
});

test("a failed delivery is not retried after the 06:10 local cutoff", async () => {
  let sends = 0;
  const env = await makeEnv(async () => {
    sends++;
    return new Response(null, { status: 503 });
  });
  globalThis.fetch = env._fetch;
  try {
    await withFixedTime("2026-11-15T03:00:00.000Z", async () => {
      await worker.scheduled({}, env, {});
    });
    assert.equal([...env._deliveries.values()][0].status, "failed");
    await withFixedTime("2026-11-15T03:11:00.000Z", async () => {
      await worker.scheduled({}, env, {});
    });
    assert.equal(sends, 1);
  } finally { globalThis.fetch = nativeFetch; }
});
