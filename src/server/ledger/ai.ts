

/*
 * The one call to the language model, shared by receipts, alerts and advice.
 */

export async function askModel(messages: unknown[], maxTokens: number): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0,
          reasoning_effort: "low",
          max_tokens: maxTokens,
          messages,
        }),
      });
      if (!res.ok) {
        if (attempt === 0 && res.status >= 500) continue;
        return null;
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = body.choices?.[0]?.message?.content;
      if (text) return text;
    } catch {
      if (attempt === 0) continue;
      return null;
    }
  }
  return null;
}

export function parseModelJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("empty");
  return JSON.parse(body.slice(start, end + 1));
}

export const CATEGORY_LIST = [
  "groceries",
  "household",
  "fashion",
  "entertainment",
  "dining",
  "transport",
  "health",
  "bills",
  "subscriptions",
  "personal",
  "travel",
  "gifts",
  "other",
].join(", ");
