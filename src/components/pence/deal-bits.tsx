import { useState } from "react";
import { toast } from "sonner";

/** Deal boards and forums: places that talk about a deal but are not where you get it. */
const BOARDS =
  /(^|\.)(hotukdeals\.com|reddit\.com|latestdeals\.co\.uk|moneysavingexpert\.com|vouchercodes\.co\.uk|myvouchercodes\.co\.uk|voucherbox\.co\.uk|quidco\.com|topcashback\.co\.uk|facebook\.com|x\.com|twitter\.com)$/;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

type Linkable = { url: string; shopUrl?: string; merchant?: string; code?: string; source?: string };

/** Where to send the person: the shop's own page whenever it is known. */
export function goUrl(deal: Linkable): string {
  return deal.shopUrl || deal.url;
}

export function goLabel(deal: Linkable): string {
  const target = goUrl(deal);
  const host = hostOf(target);
  if (BOARDS.test(host)) return deal.code ? `Where to use it, on ${host}` : `See the deal on ${host}`;
  const name = deal.merchant || host || "the shop";
  return deal.code ? `Use it at ${name}` : `Get it at ${name}`;
}

/** A discount code shown in full, with a button that copies it. */
export function CodeChip({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast(`Code ${code} copied`);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Press and hold the code to copy it.");
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="min-w-0 truncate rounded-md border border-dashed border-forest bg-mist px-3 py-2 font-mono text-sm tracking-wide text-forest-deep select-all">
        {code}
      </span>
      <button
        type="button"
        className="min-h-11 shrink-0 rounded-md bg-forest px-4 text-sm font-medium text-foam"
        onClick={() => void copy()}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** The code, ready to copy, then a link to where the deal is used. */
export function DealAction({ deal }: { deal: Linkable }) {
  return (
    <>
      {deal.code ? <CodeChip code={deal.code} /> : null}
      <a
        href={goUrl(deal)}
        className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-forest"
        target="_blank"
        rel="noreferrer"
      >
        {goLabel(deal)}
      </a>
    </>
  );
}
