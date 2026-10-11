export function parseModelObject(text: string): Record<string, unknown> {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("empty");
  return JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
}

export function citedPage(offerUrl: string, sources: string[]): boolean {
  let offer: URL;
  try {
    offer = new URL(offerUrl);
  } catch {
    return false;
  }
  if (offer.protocol !== "https:") return false;
  if (offer.hostname.startsWith("stage.")) return false;
  const host = offer.hostname.replace(/^www\./, "");
  const path = offer.pathname.replace(/\/$/, "");
  return sources.some((raw) => {
    try {
      const cite = new URL(raw);
      if (cite.hostname.replace(/^www\./, "") !== host) return false;
      return cite.pathname.replace(/\/$/, "") === path;
    } catch {
      return false;
    }
  });
}

export function tidyCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim().slice(0, 24) : "";
  return /^[A-Za-z0-9-]{3,24}$/.test(code) ? code : "";
}

function collectSources(body: Record<string, unknown>): string[] {
  const urls: string[] = [];
  if (Array.isArray(body.citations)) {
    for (const item of body.citations) if (typeof item === "string") urls.push(item);
  }
  const output = Array.isArray(body.output) ? body.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      action?: { sources?: { url?: string }[] };
      content?: { annotations?: { url?: string }[] }[];
    };
    for (const source of row.action?.sources ?? []) if (source?.url) urls.push(source.url);
    for (const part of row.content ?? []) {
      for (const ann of part.annotations ?? []) if (ann?.url) urls.push(ann.url);
    }
  }
  return urls;
}

function lastText(body: Record<string, unknown>): string {
  const output = Array.isArray(body.output) ? body.output : [];
  let text = "";
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as { type?: string; content?: { text?: string }[] };
    if (row.type !== "message" || !Array.isArray(row.content)) continue;
    const joined = row.content.map((part) => part.text ?? "").join("\n");
    if (joined.includes("{")) text = joined;
  }
  return text;
}

export async function searchWebText(
  prompt: string,
  maxTokens = 1200,
): Promise<{ text: string; sources: string[] } | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;
  const res = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: "grok-4.5",
      input: [{ role: "user", content: prompt }],
      tools: [{ type: "web_search" }],
      max_output_tokens: maxTokens,
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as Record<string, unknown>;
  const text = lastText(body);
  if (!text) return null;
  return { text, sources: collectSources(body) };
}
