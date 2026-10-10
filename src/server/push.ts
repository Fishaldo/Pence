import { getSql } from "@/lib/db";

/*
 * Phone alerts through the browser's own push service (Web Push).
 *
 * The push carries no message: the phone wakes Pence's service worker, which
 * shows "Pence found a price" and opens the price watch when tapped. A push
 * without a message only needs the server to sign who it is (VAPID), so the
 * signing key is made once and kept in the database. Nothing to configure.
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

/** Wake every phone this person turned alerts on for. Returns how many were reached. */
export async function pushUser(userId: string): Promise<number> {
  const sql = await getSql();
  const subs = await sql<{ endpoint: string }>`select endpoint from push_subs where user_id = ${userId}`;
  let reached = 0;
  for (const { endpoint } of subs) {
    if (!isPushEndpoint(endpoint)) continue;
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: await vapidHeader(endpoint),
          TTL: String(24 * 3600),
          Urgency: "high",
          "Content-Length": "0",
        },
        signal: AbortSignal.timeout(10_000),
      });
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
