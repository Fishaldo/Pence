/*
 * Turning price-watch alerts on and off on this phone or computer.
 * Browser-only: every function checks it is running in a browser first.
 */

export type AlertState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

const WORKER = "/pence-sw.js";

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const text = atob(key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(text.length));
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const left = new Uint8Array(a);
  return left.length === b.length && left.every((byte, index) => byte === b[index]);
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration("/");
}

export async function alertState(): Promise<AlertState> {
  if (typeof window === "undefined") return "unsupported";
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) return isIos() && !isInstalled() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "off";
  }
}

export type PhoneSub = { endpoint: string; p256dh?: string; auth?: string };

function asPhoneSub(sub: PushSubscription): PhoneSub {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  return { endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth };
}

/** This device's alert subscription, if alerts are on, with the keys alerts are encrypted for. */
export async function currentSub(): Promise<PhoneSub | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? asPhoneSub(sub) : null;
  } catch {
    return null;
  }
}

/** Ask permission, then subscribe this device. Returns the address the server pushes to, and its keys. */
export async function turnOnAlerts(key: string): Promise<PhoneSub> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Alerts are off for Pence in this phone’s settings.");
  const reg = await navigator.serviceWorker.register(WORKER, { scope: "/" });
  await navigator.serviceWorker.ready;
  const wanted = keyBytes(key);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, wanted)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
  return asPhoneSub(sub);
}

/** Unsubscribe this device. Returns the old address so the server can forget it. */
export async function turnOffAlerts(): Promise<string | null> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
