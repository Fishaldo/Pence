import { ExternalLink } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { shopHostOf, shopLook } from "@/lib/core/deal-look";
import { formatGBP } from "@/lib/core/model";
import { dealImages } from "@/server/page-image";
import { goLabel, goUrl, pictureSource, shopName, type Linkable } from "./deal-links";

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
        className="min-h-11 shrink-0 rounded-md bg-forest px-4 text-sm font-bold text-foam"
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
        className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-forest"
        target="_blank"
        rel="noreferrer"
      >
        {goLabel(deal)}
      </a>
    </>
  );
}

export type CardDeal = Linkable & {
  title: string;
  detail?: string;
  shopHost?: string;
  pricePence?: number | null;
  monthly?: boolean;
  endsOn?: string;
};

/*
 * Pictures for deals, read from each shop's own page in the background. Cards
 * ask one by one; the asks are gathered for a moment and sent together, and
 * each answer is kept for this visit. A card shows the shop's tile until its
 * picture arrives, or for good when the shop gives none.
 */
const pictureCache = new Map<string, string>();
const waiting = new Map<string, Set<(picture: string) => void>>();
let sendTimer: ReturnType<typeof setTimeout> | undefined;

function sendWaiting() {
  sendTimer = undefined;
  const urls = [...waiting.keys()].slice(0, 20);
  if (urls.length === 0) return;
  const answer = (found: Record<string, string>) => {
    for (const url of urls) {
      const picture = found[url] ?? "";
      pictureCache.set(url, picture);
      for (const done of waiting.get(url) ?? []) done(picture);
      waiting.delete(url);
    }
    if (waiting.size > 0) sendTimer = setTimeout(sendWaiting, 0);
  };
  void dealImages({ data: { urls } }).then(answer, () => answer({}));
}

function askPicture(url: string, done: (picture: string) => void): () => void {
  const list = waiting.get(url) ?? new Set();
  list.add(done);
  waiting.set(url, list);
  sendTimer ??= setTimeout(sendWaiting, 80);
  return () => list.delete(done);
}

function usePicture(url: string): string {
  const [picture, setPicture] = useState(() => (url ? (pictureCache.get(url) ?? "") : ""));
  useEffect(() => {
    if (!url || pictureCache.has(url)) return;
    return askPicture(url, setPicture);
  }, [url]);
  return url ? (pictureCache.get(url) ?? picture) : "";
}

/** The picture of the deal, or the shop's coloured tile with its logo or first letter. */
function Thumb({ shop, host, picture }: { shop: string; host: string; picture: string }) {
  const [pictureBroken, setPictureBroken] = useState(false);
  const [logoBroken, setLogoBroken] = useState(false);
  const look = shopLook(shop);
  if (picture && !pictureBroken) {
    return (
      <div className="grid size-[5.5rem] shrink-0 place-items-center overflow-hidden rounded-2xl border border-line bg-white">
        <img
          src={picture}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-full object-contain p-1.5"
          onError={() => setPictureBroken(true)}
        />
      </div>
    );
  }
  return (
    <div className="grid size-[5.5rem] shrink-0 place-items-center rounded-2xl" style={{ backgroundColor: look.colour }} aria-hidden="true">
      {host && !logoBroken ? (
        <span className="grid size-14 place-items-center rounded-xl bg-white shadow-sm">
          <img
            src={`/api/shop-logo/${host}`}
            alt=""
            loading="lazy"
            className="size-9 object-contain"
            onLoad={(event) => {
              if (event.currentTarget.naturalWidth <= 1) setLogoBroken(true);
            }}
            onError={() => setLogoBroken(true)}
          />
        </span>
      ) : (
        <span className="text-[1.75rem] font-extrabold text-white">{look.initial}</span>
      )}
    </div>
  );
}

/**
 * One deal, the same everywhere in Pence: picture or shop tile, the shop, what
 * it is, the price when the page gives one, then the way to get it. Extra lines
 * (why it suits you, what to check) go in as children.
 */
export function DealCard({ deal, badge, children }: { deal: CardDeal; badge?: ReactNode; children?: ReactNode }) {
  const picture = usePicture(pictureSource(deal));
  const shop = shopName(deal);
  const host = deal.shopHost || shopHostOf(pictureSource(deal));
  return (
    <li className="panel flex flex-col gap-3 p-3.5">
      <div className="flex gap-3.5">
        <Thumb shop={shop} host={host} picture={picture} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-bold text-muted">{shop}</span>
            {badge}
          </div>
          <a href={goUrl(deal)} target="_blank" rel="noreferrer" className="line-clamp-3 text-[0.9375rem] leading-snug font-extrabold">
            {deal.title}
          </a>
          {deal.pricePence ? (
            <span className="text-xl leading-tight font-extrabold text-clay tabular-nums">
              {formatGBP(deal.pricePence)}
              {deal.monthly ? <span className="text-sm font-bold"> a month</span> : null}
            </span>
          ) : null}
        </div>
      </div>
      {deal.detail || children || deal.endsOn ? (
        <div className="flex flex-col gap-1">
          {deal.detail ? <p className="text-sm leading-snug text-ink-soft">{deal.detail}</p> : null}
          {children}
          {deal.endsOn ? <p className="text-xs font-semibold text-muted">Ends {endDay(deal.endsOn)}</p> : null}
        </div>
      ) : null}
      {deal.code ? <CodeChip code={deal.code} /> : null}
      <a href={goUrl(deal)} target="_blank" rel="noreferrer" className="btn btn-primary w-full gap-2">
        {goLabel(deal)}
        <ExternalLink className="size-4" strokeWidth={2.2} aria-hidden="true" />
      </a>
    </li>
  );
}

function endDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}
