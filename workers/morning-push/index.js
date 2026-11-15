const enc = new TextEncoder();
const b64u = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64u = value => {
  const s=String(value).replace(/-/g,"+").replace(/_/g,"/");
  return Uint8Array.from(atob(s+"=".repeat((4-s.length%4)%4)),c=>c.charCodeAt(0));
};
const concat = (...parts) => {
  const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let offset=0;
  for(const part of parts){out.set(part,offset);offset+=part.length;}return out;
};
async function hmac(key,data){
  const imported=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",imported,data));
}
async function hkdfExpand(prk,info,length){
  let prev=new Uint8Array(0),out=new Uint8Array(0),counter=1;
  while(out.length<length){prev=await hmac(prk,concat(prev,info,new Uint8Array([counter++])));out=concat(out,prev);}
  return out.slice(0,length);
}
async function hkdfExtract(salt,ikm){return hmac(salt,ikm);}
async function importVapidPrivateKey(env){
  const publicBytes=unb64u(env.VAPID_PUBLIC_KEY),privateBytes=unb64u(env.VAPID_PRIVATE_KEY);
  if(publicBytes.length!==65||publicBytes[0]!==4||privateBytes.length!==32)throw new Error("Invalid VAPID key material");
  return crypto.subtle.importKey("jwk",{
    kty:"EC",crv:"P-256",x:b64u(publicBytes.slice(1,33)),y:b64u(publicBytes.slice(33,65)),
    d:b64u(privateBytes),ext:true,key_ops:["sign"]
  },{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
}
export async function vapidToken(endpoint,env){
  const audience=new URL(endpoint).origin,now=Math.floor(Date.now()/1000);
  const header=b64u(enc.encode(JSON.stringify({typ:"JWT",alg:"ES256"})));
  const payload=b64u(enc.encode(JSON.stringify({aud:audience,exp:now+12*60*60,sub:env.VAPID_SUBJECT})));
  const unsigned=header+"."+payload;
  const privateKey=await importVapidPrivateKey(env);
  const signature=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},privateKey,enc.encode(unsigned));
  return unsigned+"."+b64u(signature);
}
export async function encryptPayload(subscription,payload){
  const uaPublic=unb64u(subscription.p256dh),authSecret=unb64u(subscription.auth);
  const uaKey=await crypto.subtle.importKey("raw",uaPublic,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const serverKeys=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:uaKey},serverKeys.privateKey,256));
  const serverPublic=new Uint8Array(await crypto.subtle.exportKey("raw",serverKeys.publicKey));
  const authPrk=await hkdfExtract(authSecret,shared);
  const keyInfo=concat(enc.encode("WebPush: info\0"),uaPublic,serverPublic);
  const ikm=await hkdfExpand(authPrk,keyInfo,32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const prk=await hkdfExtract(salt,ikm);
  const cek=await hkdfExpand(prk,enc.encode("Content-Encoding: aes128gcm\0"),16);
  const nonce=await hkdfExpand(prk,enc.encode("Content-Encoding: nonce\0"),12);
  const aes=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["encrypt"]);
  const plaintext=concat(enc.encode(JSON.stringify(payload)),new Uint8Array([2]));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,tagLength:128},aes,plaintext));
  const rs=new Uint8Array([0,0,16,0]);
  const header=concat(salt,rs,new Uint8Array([serverPublic.length]),serverPublic);
  return concat(header,ciphertext);
}
async function sendPush(row,env,payload){
  const jwt=await vapidToken(row.endpoint,env),body=await encryptPayload(row,payload);
  const response=await fetch(row.endpoint,{method:"POST",signal:AbortSignal.timeout(10000),headers:{
    "Authorization":"vapid t="+jwt+", k="+env.VAPID_PUBLIC_KEY,
    "Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream",
    "TTL":"86400","Urgency":"high"
  },body});
  if(!response.ok)throw new Error("Push endpoint returned "+response.status);
}
export function localClock(date,timezone){
  const p=new Intl.DateTimeFormat("en-CA",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(date);
  return Object.fromEntries(p.map(x=>[x.type,x.value]));
}
export function isMorningDeliveryWindow(date,timezone){
  const local=localClock(date,timezone);
  return local.hour==="06"&&Number(local.minute)>=0&&Number(local.minute)<=10;
}
export default {
  async scheduled(controller,env,ctx){
    if(!env.DB||!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY||!env.VAPID_SUBJECT)return;
    const {results}=await env.DB.prepare(`SELECT s.id,s.user_id,s.endpoint,s.p256dh,s.auth,COALESCE(st.timezone,'Europe/Moscow') timezone
      FROM push_subscriptions s LEFT JOIN settings st ON st.user_id=s.user_id`).all();
    const now=new Date();
    for(const row of results||[]){
      const local=localClock(now,row.timezone);
      if(!isMorningDeliveryWindow(now,row.timezone))continue;
      const localDate=local.year+"-"+local.month+"-"+local.day;
      const id=crypto.randomUUID();
      await env.DB.prepare(`INSERT OR IGNORE INTO push_deliveries (id,user_id,subscription_id,local_date,timezone,scheduled_at,status)
        VALUES (?,?,?,?,?,?,'pending')`).bind(id,row.user_id,row.id,localDate,row.timezone,now.toISOString()).run();
      const delivery=await env.DB.prepare("SELECT id,status FROM push_deliveries WHERE subscription_id=? AND local_date=?").bind(row.id,localDate).first();
      if(!delivery||delivery.status==="sent")continue;
      const deliveryId=delivery.id;
      const claimed=await env.DB.prepare("UPDATE push_deliveries SET status='sending',error=NULL,updated_at=datetime('now') WHERE id=? AND (status IN ('pending','failed') OR (status='sending' AND updated_at<=datetime('now','-2 minutes')))").bind(deliveryId).run();
      if(!claimed.meta.changes)continue;
      try{
        await sendPush(row,env,{title:"Система роста",body:"Доброе утро! Ты уже проснулась?",tag:"morning-wake-"+localDate,url:"/?wake=1"});
        await env.DB.prepare("UPDATE push_deliveries SET status='sent',sent_at=?,updated_at=datetime('now') WHERE id=?").bind(new Date().toISOString(),deliveryId).run();
      }catch(error){
        const message=String(error?.message||error).slice(0,500);
        await env.DB.prepare("UPDATE push_deliveries SET status='failed',error=?,updated_at=datetime('now') WHERE id=?").bind(message,deliveryId).run();
        if(message.includes("410")||message.includes("404"))await env.DB.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(row.id).run();
      }
    }
  }
};
