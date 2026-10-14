import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { askModel, parseModelJson } from "./ai";

/*
 * A closer read of this pay, from the language model, cached by what it was asked.
 */

export const getAdvice = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("Nothing to review yet.");
    const row = input as Record<string, unknown>;
    const fingerprint = typeof row.fingerprint === "string" ? row.fingerprint.slice(0, 300) : "";
    const brief = typeof row.brief === "string" ? row.brief.slice(0, 2500) : "";
    if (!fingerprint || !brief) throw new Error("Nothing to review yet.");
    return { fingerprint, brief };
  })
  .handler(async ({ context, data }): Promise<{ tips: string[]; source: "cache" | "fresh" | "unavailable" }> => {
    const sql = await getSql();
    const cached = await sql<{ body: string }>`
      select body from advice_cache
      where user_id = ${context.userId} and fingerprint = ${data.fingerprint}`;
    if (cached[0]?.body) {
      try {
        const tips = JSON.parse(cached[0].body) as unknown;
        if (Array.isArray(tips) && tips.every((t) => typeof t === "string")) {
          return { tips: tips.slice(0, 4), source: "cache" };
        }
      } catch {
        /* regenerate */
      }
    }
    const text = await askModel(
      [
        {
          role: "user",
          content: `You are Pence, a UK spending coach. Use only the figures below. Do not invent discount codes, prices, or "this week's" deals. You may name ongoing programmes: Tesco Clubcard Prices, Nectar Prices, Lidl Plus, Aldi Super 6, Too Good To Go, Boots Advantage Card. Reply with JSON only: {"tips":["...","...","..."]}
Each tip is one or two sentences, specific to these numbers, British spelling, no emoji.
${data.brief}`,
        },
      ],
      420,
    );
    if (!text) return { tips: [], source: "unavailable" };
    try {
      const parsed = parseModelJson(text) as { tips?: unknown };
      const tips = Array.isArray(parsed.tips)
        ? parsed.tips.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 4)
        : [];
      if (tips.length === 0) return { tips: [], source: "unavailable" };
      await sql`insert into advice_cache (user_id, fingerprint, body)
                values (${context.userId}, ${data.fingerprint}, ${JSON.stringify(tips)})
                on conflict (user_id, fingerprint) do update set body = excluded.body, created_at = now()`;
      return { tips, source: "fresh" };
    } catch {
      return { tips: [], source: "unavailable" };
    }
  });
