import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/*
 * Pictures for deals: the image a shop's own page offers for link previews
 * (og:image), the same one WhatsApp or Slack shows when the link is shared.
 * Pence reads only the top of that one page, says who it is, and takes no
 * picture when the shop says no. Deal boards' own pictures are never used.
 */

const AGENT = "Mozilla/5.0 (compatible; PenceLinkPreview/1.0)";
const MAX_BYTES = 400_000;
const PER_PAGE_MS = 4_000;

/** Boards and redirects that would count as a click on someone else's link, or are not the shop. */
const NOT_A_SHOP = /(^|\.)(hotukdeals\.com|reddit\.com|latestdeals\.co\.uk|moneysavingexpert\.com|vouchercodes\.co\.uk|myvouchercodes\.co\.uk|quidco\.com|topcashback\.co\.uk|facebook\.com|x\.com|twitter\.com|google\.com|bit\.ly|awin1\.com|tidd\.ly|go\.skimresources\.com)$/;

function privateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const a = address.toLowerCase();
    return a === "::" || a === "::1" || /^(fc|fd|fe[89ab])/.test(a) || a.startsWith("::ffff:");
  }
  const [p, q] = address.split(".").map(Number);
  return p === 10 || p === 127 || p === 0 || (p === 169 && q === 254) || (p === 172 && q >= 16 && q <= 31) || (p === 192 && q === 168) || (p === 100 && q >= 64 && q <= 127) || p >= 224;
}

/** A public https page on a named host that resolves only to public addresses. */
async function safeUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.port || url.username || isIP(host) || !host.includes(".") || host.endsWith(".local") || host === "localhost") return null;
  if (NOT_A_SHOP.test(host.replace(/^www\./, ""))) return null;
  try {
    const found = await lookup(host, { all: true });
    if (found.length === 0 || found.some((row) => privateAddress(row.address))) return null;
  } catch {
    return null;
  }
  return url;
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[match[1].toLowerCase()] = match[2] ?? match[3] ?? "";
  return out;
}

function decode(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/").replace(/&quot;/g, '"');
}

/** The preview picture a page's head names, as an https address, or "". */
export function previewImage(html: string, base: string): string {
  const wanted = ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"];
  const found = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const row = attrs(match[0]);
    const key = (row.property || row.name || "").toLowerCase();
    if (wanted.includes(key) && row.content && !found.has(key)) found.set(key, decode(row.content.trim()));
  }
  for (const key of wanted) {
    const value = found.get(key);
    if (!value) continue;
    try {
      const image = new URL(value, base);
      if (image.protocol === "https:" && image.href.length <= 1000) return image.href;
    } catch {
      /* try the next one */
    }
  }
  return "";
}

async function readTop(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    parts.push(value);
    size += value.byteLength;
    // The preview tags live in <head>; stop once it has ended.
    if (new TextDecoder().decode(value).includes("</head>")) break;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(parts));
}

const remembered = new Map<string, string>();

/** The preview picture for one shop page, or "" when there is none or the shop says no. */
export async function pageImage(raw: string): Promise<string> {
  if (remembered.has(raw)) return remembered.get(raw) ?? "";
  let image = "";
  try {
    let url = await safeUrl(raw);
    // Redirects are followed by hand, so each hop is checked like the first.
    for (let hop = 0; url && hop < 4; hop += 1) {
      const res = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": AGENT, Accept: "text/html" },
        signal: AbortSignal.timeout(PER_PAGE_MS),
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        url = next ? await safeUrl(new URL(next, url).href) : null;
        continue;
      }
      if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html")) image = previewImage(await readTop(res), url.href);
      break;
    }
  } catch {
    image = "";
  }
  if (remembered.size > 2000) remembered.clear();
  remembered.set(raw, image);
  return image;
}

