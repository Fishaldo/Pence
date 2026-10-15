import { createFileRoute } from "@tanstack/react-router";

/*
 * A shop's logo, for the tile on a deal. Pence asks Google's public icon
 * service on the person's behalf, so their phone never tells a third party
 * which deals they are looking at. Only a plain web address is accepted, and
 * only Google is ever called. Logos are kept by the browser and the CDN for a week.
 */
/** A 1×1 clear picture: "no logo", without a failed request in the browser's console. The tile sees its size and shows the letter. */
const BLANK = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), (c) => c.charCodeAt(0));

function none(): Response {
  return new Response(BLANK, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400, s-maxage=86400" } });
}

async function logo(host: string): Promise<Response> {
  const clean = host.toLowerCase().replace(/^www\./, "");
  if (clean.length > 80 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(clean)) return none();
  try {
    const res = await fetch(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(clean)}&sz=128`, {
      signal: AbortSignal.timeout(5_000),
    });
    const type = res.headers.get("content-type") ?? "";
    // No icon found comes back as a generic globe with a 404: Pence answers with a clear picture and the tile shows the letter.
    if (!res.ok || !type.startsWith("image/")) return none();
    const body = await res.arrayBuffer();
    if (body.byteLength > 200_000) return none();
    return new Response(body, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return none();
  }
}

export const Route = createFileRoute("/api/shop-logo/$host")({
  server: {
    handlers: {
      GET: ({ params }) => logo(params.host),
    },
  },
});
