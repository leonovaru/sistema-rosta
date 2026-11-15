import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { onRequestPost, onRequestDelete, onRequestGet } from "../functions/api/push-subscriptions.js";
import { sha256 } from "../functions/_lib/auth.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

async function validSubscription(endpoint = "https://fcm.googleapis.com/fcm/send/device-1") {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const p256dh = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
  return {
    endpoint,
    keys: {
      p256dh: Buffer.from(p256dh).toString("base64url"),
      auth: Buffer.from(webcrypto.getRandomValues(new Uint8Array(16))).toString("base64url")
    }
  };
}

function createEnv(existing = []) {
  const rows = existing.map(row => ({ ...row }));
  const calls = [];
  const DB = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async first() {
          if (sql.includes("FROM sessions s JOIN users")) return { id: "user-1", email: "user@example.test" };
          if (sql.includes("SELECT id FROM push_subscriptions")) {
            return rows.find(row => row.user_id === values[0] && row.endpoint === values[1]) || null;
          }
          return null;
        },
        async run() {
          calls.push({ sql, values });
          if (sql.includes("INSERT INTO push_subscriptions")) {
            const [id, user_id, endpoint, p256dh, auth, user_agent] = values;
            const current = rows.find(row => row.endpoint === endpoint);
            if (current && current.user_id !== user_id) return { meta: { changes: 0 } };
            if (current) Object.assign(current, { p256dh, auth, user_agent });
            else rows.push({ id, user_id, endpoint, p256dh, auth, user_agent });
            return { meta: { changes: 1 } };
          }
          if (sql.includes("DELETE FROM push_subscriptions")) {
            const index = rows.findIndex(row => row.user_id === values[0] && row.endpoint === values[1]);
            if (index >= 0) rows.splice(index, 1);
            return { meta: { changes: index >= 0 ? 1 : 0 } };
          }
          return { meta: { changes: 0 } };
        }
      };
      return statement;
    }
  };
  return { DB, rows, calls, PUSH_VAPID_PUBLIC_KEY: "test-public-key" };
}

function request(method, body) {
  return new Request("https://app.example.test/api/push-subscriptions", {
    method,
    headers: {
      Cookie: "sr_session=test-session",
      "Content-Type": "application/json",
      "User-Agent": "test-browser"
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

test("push subscription cannot be transferred from another account", async () => {
  const subscription = await validSubscription();
  const env = createEnv([{ id: "sub-existing", user_id: "user-2", endpoint: subscription.endpoint }]);
  const response = await onRequestPost({
    request: request("POST", { subscription }),
    env
  });
  assert.equal(response.status, 409);
  assert.equal(env.rows.length, 1);
  assert.equal(env.rows[0].user_id, "user-2");
});

test("push subscription deletion is scoped to the authenticated account", async () => {
  const subscription = await validSubscription();
  const env = createEnv([{ id: "sub-existing", user_id: "user-2", endpoint: subscription.endpoint }]);
  const response = await onRequestDelete({
    request: request("DELETE", { endpoint: subscription.endpoint }),
    env
  });
  assert.equal(response.status, 200);
  assert.equal(env.rows.length, 1);
  assert.equal(env.rows[0].user_id, "user-2");
});

test("push subscription status checks the exact device endpoint", async () => {
  const subscription = await validSubscription();
  const env = createEnv([{ id: "sub-existing", user_id: "user-1", endpoint: subscription.endpoint }]);
  const response = await onRequestGet({
    request: new Request("https://app.example.test/api/push-subscriptions?endpoint=" + encodeURIComponent(subscription.endpoint), {
      headers: { Cookie: "sr_session=test-session" }
    }),
    env
  });
  const data = await response.json();
  assert.equal(data.subscribed, true);
  assert.equal(data.supported, true);
});
