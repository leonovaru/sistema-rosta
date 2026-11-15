import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import worker from "../workers/morning-push/index.js";

const nativeDate = Date;
const nativeFetch = globalThis.fetch;
const nativeCrypto = globalThis.crypto;
const b64u = value => Buffer.from(value).toString("base64url");

async function makeEnv(fetchImpl) {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const privateJwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
  const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const client = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const clientPublic = new Uint8Array(await webcrypto.subtle.exportKey("raw", client.publicKey));
  const publicBytes = Buffer.concat([Buffer.from([4]), Buffer.from(publicJwk.x, "base64url"), Buffer.from(publicJwk.y, "base64url")]);
  const deliveries = new Map();
  const subscriptions = [{
    id: "sub-1", user_id: "user-1", endpoint: "https://fcm.googleapis.com/fcm/send/test",
    p256dh: b64u(clientPublic), auth: b64u(webcrypto.getRandomValues(new Uint8Array(16))),
    timezone: "Europe/Moscow"
  }];
  const DB = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async all() { return { results: subscriptions }; },
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
          if (sql.includes("DELETE FROM push_subscriptions")) return { meta: { changes: 1 } };
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
