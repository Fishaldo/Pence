import { getSql } from "@/lib/db";

/*
 * Phone alerts through the browser's own push service (Web Push).
 *
 * Each push is signed with Pence's own key (VAPID), made once and kept in the
 * database, so there is nothing to configure. When the phone gave its
 * encryption keys, the push carries the words to show ("Netflix comes out in
 * 3 days"), encrypted for that phone alone (RFC 8291). Without them, the phone
 * shows a general "Pence found an offer".
 */

/** Only real push services, so the server never posts to an address a user made up. */
const PUSH_HOSTS =
  /(^|\.)(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com|push\.services\.mozilla\.com)$/;

export function isPushEndpoint(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && PUSH_HOSTS.test(url.hostname) && value.length <= 1000;
  } catch {
    return false;
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const text = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "="));
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

type Vapid = { publicKey: string; key: CryptoKey };

const cache = globalThis as typeof globalThis & { __penceVapid__?: Promise<Vapid> };

async function loadVapid(): Promise<Vapid> {
  const sql = await getSql();
  let rows = await sql<{ value: string }>`select value from app_keys where name = 'vapid'`;
  if (!rows[0]) {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    await sql`insert into app_keys (name, value) values ('vapid', ${JSON.stringify(jwk)})
              on conflict (name) do nothing`;
    rows = await sql<{ value: string }>`select value from app_keys where name = 'vapid'`;
  }
  const jwk = JSON.parse(rows[0].value) as JsonWebKey;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const point = new Uint8Array(65);
  point[0] = 4;
  point.set(fromBase64Url(jwk.x ?? ""), 1);
  point.set(fromBase64Url(jwk.y ?? ""), 33);
  return { publicKey: toBase64Url(point), key };
}

function vapid(): Promise<Vapid> {
  if (!cache.__penceVapid__) {
    cache.__penceVapid__ = loadVapid().catch((error: unknown) => {
      cache.__penceVapid__ = undefined;
      throw error;
    });
  }
  return cache.__penceVapid__;
}

/** The public half of the key, which the phone needs to subscribe. */
export async function vapidPublicKey(): Promise<string> {
  return (await vapid()).publicKey;
}

function subject(): string {
  const site = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return site ? `https://${site.replace(/^https?:\/\//, "")}` : "mailto:alerts@pence.invalid";
}

export async function vapidHeader(endpoint: string, now = Date.now()): Promise<string> {
  const { publicKey, key } = await vapid();
  const encode = (value: unknown) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ typ: "JWT", alg: "ES256" })}.${encode({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 3600,
    sub: subject(),
  })}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned),
  );
  return `vapid t=${unsigned}.${toBase64Url(new Uint8Array(signature))}, k=${publicKey}`;
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(parts.reduce((sum, part) => sum + part.length, 0)));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return concat(bytes);
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(info) }, key, length * 8);
  return new Uint8Array(bits);
}

/**
 * Encrypt a message for one phone (RFC 8291, "aes128gcm"). `p256dh` and `auth`
 * are the keys the phone handed over when alerts were turned on.
 */
export async function encryptForPhone(p256dh: string, auth: string, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = fromBase64Url(p256dh);
  const authSecret = fromBase64Url(auth);
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", buf(uaPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, pair.privateKey, 256));
  const enc = new TextEncoder();
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["encrypt"]);
  // One record, so the padding delimiter is 2.
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(nonce) }, aes, concat(plaintext, new Uint8Array([2]))),
  );
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, sealed);
}

/** Wake every phone this person turned alerts on for, with words to show when the phone allows. */
export async function pushUser(userId: string, message?: PushMessage): Promise<number> {
  const sql = await getSql();
  const subs = await sql<{ endpoint: string; p256dh: string | null; auth: string | null }>`
    select endpoint, p256dh, auth from push_subs where user_id = ${userId}`;
  let reached = 0;
  for (const { endpoint, p256dh, auth } of subs) {
    if (!isPushEndpoint(endpoint)) continue;
    try {
      const headers: Record<string, string> = {
        Authorization: await vapidHeader(endpoint),
        TTL: String(24 * 3600),
        Urgency: "high",
      };
      let body: Uint8Array<ArrayBuffer> | undefined;
      if (message && p256dh && auth) {
        body = buf(await encryptForPhone(p256dh, auth, new TextEncoder().encode(JSON.stringify(message))));
        headers["Content-Encoding"] = "aes128gcm";
        headers["Content-Type"] = "application/octet-stream";
      } else {
        headers["Content-Length"] = "0";
      }
      const res = await fetch(endpoint, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
      if (res.status === 404 || res.status === 410) {
        await sql`delete from push_subs where endpoint = ${endpoint}`;
      } else if (res.ok) {
        reached += 1;
      }
    } catch {
      /* the phone's push service can be down; the alert still waits in the app */
    }
  }
  return reached;
}
