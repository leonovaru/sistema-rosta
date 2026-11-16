import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { isMorningDeliveryWindow, localClock, vapidToken, encryptPayload } from "../workers/morning-push/index.js";

const crypto = webcrypto;
const b64u = value => Buffer.from(value).toString("base64url");
const fromB64u = value => Buffer.from(value,"base64url");

test("morning push window follows the user's timezone",()=>{
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T03:00:00.000Z"),"Europe/Moscow"),true);
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T03:00:00.000Z"),"Europe/Amsterdam"),false);
});

test("delivery retry window includes 06:00 through 06:10, not later minutes",()=>{
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T03:00:00.000Z"),"Europe/Moscow"),true);
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T03:10:00.000Z"),"Europe/Moscow"),true);
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T03:11:00.000Z"),"Europe/Moscow"),false);
  assert.equal(isMorningDeliveryWindow(new Date("2026-11-15T04:00:00.000Z"),"Europe/Moscow"),false);
});

test("local clock respects daylight-saving offsets",()=>{
  const before=new Date("2026-10-25T00:30:00.000Z");
  const after=new Date("2026-10-25T01:30:00.000Z");
  assert.equal(localClock(before,"Europe/Amsterdam").hour,"02");
  assert.equal(localClock(after,"Europe/Amsterdam").hour,"02");
});

test("local clock skips the nonexistent hour at the spring DST transition",()=>{
  const before=new Date("2026-03-29T00:30:00.000Z");
  const after=new Date("2026-03-29T01:30:00.000Z");
  assert.equal(localClock(before,"Europe/Amsterdam").hour,"01");
  assert.equal(localClock(after,"Europe/Amsterdam").hour,"03");
  assert.equal(isMorningDeliveryWindow(new Date("2026-03-29T04:00:00.000Z"),"Europe/Amsterdam"),true);
});

test("VAPID token is signed by the configured P-256 key",async()=>{
  const pair=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
  const jwk=await crypto.subtle.exportKey("jwk",pair.privateKey);
  const publicJwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
  const publicBytes=Buffer.concat([Buffer.from([4]),fromB64u(publicJwk.x),fromB64u(publicJwk.y)]);
  const token=await vapidToken("https://fcm.googleapis.com/fcm/send/example",{
    VAPID_PUBLIC_KEY:b64u(publicBytes),VAPID_PRIVATE_KEY:jwk.d,VAPID_SUBJECT:"mailto:push@example.test"
  });
  const [head,payload,signature]=token.split(".");
  assert.equal(JSON.parse(fromB64u(head).toString()).alg,"ES256");
  assert.equal(JSON.parse(fromB64u(payload).toString()).aud,"https://fcm.googleapis.com");
  const valid=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},pair.publicKey,fromB64u(signature),new TextEncoder().encode(head+"."+payload));
  assert.equal(valid,true);
});

test("Web Push payload is encrypted and can be decrypted by the subscription key",async()=>{
  const client=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const clientPublic=new Uint8Array(await crypto.subtle.exportKey("raw",client.publicKey));
  const auth=crypto.getRandomValues(new Uint8Array(16));
  const payload={title:"Система роста",body:"Доброе утро!"};
  const encrypted=await encryptPayload({p256dh:b64u(clientPublic),auth:b64u(auth)},payload);
  const salt=encrypted.slice(0,16),recordSize=encrypted.slice(16,20),keyLength=encrypted[20];
  const serverPublic=encrypted.slice(21,21+keyLength),ciphertext=encrypted.slice(21+keyLength);
  assert.equal(keyLength,65);
  assert.deepEqual([...recordSize],[0,0,16,0]);
  const serverKey=await crypto.subtle.importKey("raw",serverPublic,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:serverKey},client.privateKey,256));
  const hmac=async(key,data)=>{
    const imported=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    return new Uint8Array(await crypto.subtle.sign("HMAC",imported,data));
  };
  const expand=async(prk,info,length)=>{
    let previous=new Uint8Array(0),out=new Uint8Array(0),counter=1;
    while(out.length<length){
      const input=new Uint8Array(previous.length+info.length+1);
      input.set(previous);input.set(info,previous.length);input[input.length-1]=counter++;
      previous=await hmac(prk,input);
      const joined=new Uint8Array(out.length+previous.length);joined.set(out);joined.set(previous,out.length);out=joined;
    }
    return out.slice(0,length);
  };
  const authPrk=await hmac(auth,shared);
  const infoPrefix=new TextEncoder().encode("WebPush: info\0");
  const info=new Uint8Array(infoPrefix.length+clientPublic.length+serverPublic.length);
  info.set(infoPrefix);info.set(clientPublic,infoPrefix.length);info.set(serverPublic,infoPrefix.length+clientPublic.length);
  const ikm=await expand(authPrk,info,32);
  const prk=await hmac(salt,ikm);
  const cek=await expand(prk,new TextEncoder().encode("Content-Encoding: aes128gcm\0"),16);
  const nonce=await expand(prk,new TextEncoder().encode("Content-Encoding: nonce\0"),12);
  const key=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["decrypt"]);
  const plaintext=new Uint8Array(await crypto.subtle.decrypt({name:"AES-GCM",iv:nonce,tagLength:128},key,ciphertext));
  assert.equal(plaintext[plaintext.length-1],2);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(plaintext.slice(0,-1))),payload);
});
