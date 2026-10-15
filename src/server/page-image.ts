import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { pageImage } from "./page-image-read";

/** Pictures for the deals on screen: shop page → picture. At most 20 pages a call, read side by side. */
export const dealImages = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    const raw = input && typeof input === "object" ? (input as { urls?: unknown }).urls : null;
    const urls = Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && item.length <= 1000) : [];
    return { urls: [...new Set(urls)].slice(0, 20) };
  })
  .handler(async ({ data }): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    const queue = [...data.urls];
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        for (let url = queue.shift(); url; url = queue.shift()) out[url] = await pageImage(url);
      }),
    );
    return out;
  });
