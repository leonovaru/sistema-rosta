import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pub = publicKey.export({ format: "jwk" });
const priv = privateKey.export({ format: "jwk" });
const decode = value => Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const encode = value => Buffer.from(value).toString("base64url");
const publicBytes = Buffer.concat([Buffer.from([4]), decode(pub.x), decode(pub.y)]);

console.log("PUSH_VAPID_PUBLIC_KEY=" + encode(publicBytes));
console.log("VAPID_PUBLIC_KEY=" + encode(publicBytes));
console.log("VAPID_PRIVATE_KEY=" + priv.d);
console.log("\nСохраните приватный ключ только в Cloudflare Worker Secret. Не публикуйте его и не добавляйте в репозиторий.");
