import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { onRequestPost } from "../functions/api/sleep.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function createEnv() {
  const sessions = [{
    id: "sleep-1", user_id: "user-1", sleep_date: "2026-11-14",
    timezone: "Europe/Moscow", went_to_bed_at: "2026-11-14T23:00",
    fell_asleep_at: "2026-11-14T23:30", woke_at: null, wake_date: null
  }];
  let wakeUpdates = 0;
  const DB = {
    prepare(sql) {
      let values = [];
      const statement = {
        bind(...args) { values = args; return statement; },
        async first() {
          if (sql.includes("FROM sessions s JOIN users")) return { id: "user-1", email: "test@example.test" };
          if (sql.includes("SELECT timezone FROM settings")) return { timezone: "Europe/Moscow" };
          if (sql.includes("wake_date=? AND woke_at IS NOT NULL")) {
            return sessions.find(row => row.user_id === values[0] && row.wake_date === values[1] && row.woke_at) || null;
          }
          if (sql.includes("woke_at IS NULL AND sleep_date IN")) {
            return sessions.find(row => row.user_id === values[0] && !row.woke_at && [values[1], values[2]].includes(row.sleep_date)) || null;
          }
          if (sql.includes("WHERE id=? AND user_id=?")) return sessions.find(row => row.id === values[0] && row.user_id === values[1]) || null;
          return null;
        },
        async run() {
          if (sql.includes("UPDATE sleep_sessions SET woke_at=")) {
            const row = sessions.find(item => item.id === values[4] && item.user_id === values[5]);
            if (!row || row.woke_at) return { meta: { changes: 0 } };
            row.woke_at = values[0]; row.wake_date = values[1]; row.wake_source = values[2];
            wakeUpdates++;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
      };
      return statement;
    }
  };
  return { DB, sessions, get wakeUpdates() { return wakeUpdates; } };
}

test("repeated wake confirmations on one local day return the first record", async () => {
  const env = createEnv();
  const makeRequest = () => new Request("https://app.example.test/api/sleep", {
    method: "POST",
    headers: { "Cookie": "sr_session=test-session", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "wake", source: "push", at: "2026-11-15T08:15" })
  });
  const RealDate = globalThis.Date;
  const fixedNow = new RealDate("2026-11-15T05:15:00.000Z").getTime();
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow; }
  };
  let firstBody, secondBody;
  try {
    const first = await onRequestPost({ request: makeRequest(), env });
    firstBody = await first.json();
    const second = await onRequestPost({ request: makeRequest(), env });
    secondBody = await second.json();
  } finally {
    globalThis.Date = RealDate;
  }
  assert.equal(firstBody.ok, true);
  assert.equal(firstBody.session.woke_at, "2026-11-15T08:15");
  assert.equal(secondBody.duplicate, true);
  assert.equal(secondBody.session.id, firstBody.session.id);
  assert.equal(env.wakeUpdates, 1);
  assert.equal(env.sessions.length, 1);
});
