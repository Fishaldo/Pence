import { Link, useNavigate } from "@tanstack/react-router";
import { Camera, ClipboardPaste, FileText, ImagePlus, Images, Keyboard, Landmark, Mic } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fileToImages } from "@/lib/spend/files";
import type { StatementRow } from "@/lib/spend/statement";
import { looksLikePay, type MoneyIn } from "@/lib/spend/payday";
import {
  CATEGORIES,
  categoryLabel,
  formatGBP,
  poundsToPence,
  spokenToAlert,
  todayISO,
  type CategoryId,
  type LineItem,
  type SpendSource,
  type WalletAlert,
} from "@/lib/spend/model";
import { createAlert, deleteSpend, dismissAlert, findClashes, importBank, readReceipt, saveSpend, type Clash } from "@/server/ledger";
import { SamePayment, type ClashChoice } from "./clash";
import { ItemsEditor, type DraftItem } from "./items-editor";
import { useLedger, useRefreshLedger } from "./data";
import { PaySpotted } from "./money-cards";
import { errorText, PageHead } from "./ui";

type Draft = {
  merchant: string;
  /** The name as it came in, before the person or Pence tidied it. */
  description: string;
  amount: string;
  category: CategoryId;
  spentOn: string;
  source: SpendSource;
  hasReceipt: boolean;
  note: string;
  items: DraftItem[];
  imageDataUrl: string | null;
  rawAlert: string;
  alertId: string | null;
  unsure: boolean;
};

type Phase =
  | { kind: "choose" }
  | { kind: "paste"; text: string }
  | { kind: "busy"; label: string }
  | { kind: "ask"; alert: WalletAlert }
  | { kind: "wrong"; note: string; imageDataUrl: string | null; alert?: WalletAlert }
  | { kind: "statement"; rows: StatementRow[]; skippedIn: number; after: number; moneyIn?: MoneyIn[] }
  | { kind: "review"; draft: Draft; remaining: number }
  | { kind: "clash"; clashes: Clash[]; draft: Draft | null; rows: StatementRow[] | null };

const EXAMPLES = [
  "Google Pay · You paid £14.80 to Uber",
  "Apple Pay · Tesco Extra £42.16",
  "Uber · Trip completed £9.60 · No receipt",
];

function moneyField(pence: number | null): string {
  if (pence == null) return "";
  return (pence / 100).toFixed(2);
}

function toDraftItems(items: LineItem[]): DraftItem[] {
  return items.map((item) => ({
    name: item.name,
    amount: item.amountPence > 0 ? (item.amountPence / 100).toFixed(2) : "",
  }));
}

function fromDraftItems(items: DraftItem[]): LineItem[] {
  const out: LineItem[] = [];
  for (const item of items) {
    const name = item.name.trim();
    if (!name) continue;
    out.push({ name: name.slice(0, 80), amountPence: poundsToPence(item.amount) ?? 0 });
    if (out.length >= 40) break;
  }
  return out;
}

function blankDraft(partial: Partial<Draft>): Draft {
  return {
    merchant: "",
    description: "",
    amount: "",
    category: "other",
    spentOn: todayISO(),
    source: "manual",
    hasReceipt: false,
    note: "",
    items: [],
    imageDataUrl: null,
    rawAlert: "",
    alertId: null,
    unsure: false,
    ...partial,
  };
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

/** The browser's speech-to-text, where it has one (Chrome on Android does). */
function speechRecognition(): Recognition | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function CaptureView() {
  const navigate = useNavigate();
  const refresh = useRefreshLedger();
  const { alerts, profile } = useLedger();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const anyRef = useRef<HTMLInputElement>(null);
  const retryAlert = useRef<WalletAlert | undefined>(undefined);
  const later = useRef<Draft[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "choose" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const listener = useRef<Recognition | null>(null);

  useEffect(() => {
    setCanSpeak(speechRecognition() != null);
  }, []);

  function sayIt() {
    const rec = speechRecognition();
    if (!rec) return;
    listener.current = rec;
    rec.lang = "en-GB";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    let heard = "";
    rec.onresult = (event) => {
      heard = event.results[0]?.[0]?.transcript ?? "";
    };
    rec.onerror = (event) => {
      setListening(false);
      setError(event.error === "not-allowed" ? "The microphone is off for Pence. Type it in instead." : "Didn’t catch that. Try again, or type it in.");
    };
    rec.onend = () => {
      setListening(false);
      if (heard.trim()) void submitPaste(spokenToAlert(heard));
    };
    setError("");
    setListening(true);
    rec.start();
  }

  useEffect(() => {
    const id = sessionStorage.getItem("pence-open-alert");
    if (!id || !alerts.data) return;
    const found = alerts.data.find((item) => item.id === id);
    if (!found) return;
    sessionStorage.removeItem("pence-open-alert");
    setPhase({ kind: "ask", alert: found });
  }, [alerts.data]);

  function notify(merchant: string, amount: string) {
    if (!profile.data?.notifyAlerts) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification("Spend spotted", { body: `${merchant} · ${amount}. Do you have a receipt?` });
    } catch {
      /* the in-app question still shows */
    }
  }

  function notifyWrong() {
    toast("Wrong photo. That isn’t a receipt or a payment list.");
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification("Wrong photo", { body: "That isn’t a receipt or a list of payments." });
    } catch {
      /* the screen still says so */
    }
  }

  async function onFiles(list: FileList | File[] | undefined, source: "receipt" | "gallery", alert?: WalletAlert) {
    const chosen = [...(list ?? [])];
    if (chosen.length === 0) return;
    const files = chosen.slice(0, 8);
    setError("");
    const images: { url: string; name: string }[] = [];
    const wrong: string[] = [];
    for (const file of files) {
      setPhase({ kind: "busy", label: files.length > 1 ? `Opening ${file.name}…` : "Opening…" });
      try {
        const pages = await fileToImages(file);
        for (const url of pages) {
          if (images.length >= 8) break;
          images.push({ url, name: file.name });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        wrong.push(message ? `${file.name || "File"}: ${message}` : file.name || "that file");
      }
    }
    const drafts: Draft[] = [];
    const rows: StatementRow[] = [];
    const moneyIn: MoneyIn[] = [];
    let skippedIn = 0;
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      setPhase({
        kind: "busy",
        label: images.length > 1 ? `Reading ${index + 1} of ${images.length}…` : "Reading…",
      });
      try {
        const read = await readReceipt({ data: { imageDataUrl: image.url } });
        moneyIn.push(...(read.moneyIn ?? []));
        if (read.kind === "statement" && read.spends.length > 0) {
          rows.push(...read.spends);
          skippedIn += read.skippedIn;
          continue;
        }
        if (!read.isSpend) {
          // A screen that only shows pay coming in is still useful: it can set this pay's take-home.
          if (looksLikePay(read.moneyIn ?? [], profile.data?.monthlyIncomePence ?? 0).length === 0) wrong.push(image.name);
          continue;
        }
        const useAlert = Boolean(alert) && drafts.length === 0 && rows.length === 0;
        const amountPence = read.amountPence ?? (useAlert ? alert?.amountPence ?? null : null);
        drafts.push(
          blankDraft({
            merchant: read.merchant || (useAlert ? alert?.merchant : "") || "",
            description: read.description || (useAlert ? alert?.description : "") || "",
            amount: moneyField(amountPence),
            category: read.category !== "other" ? read.category : (useAlert ? alert?.category ?? read.category : read.category),
            spentOn: read.spentOn ?? todayISO(),
            source: useAlert ? "wallet" : source,
            hasReceipt: true,
            note: read.note,
            items: toDraftItems(read.items),
            imageDataUrl: image.url,
            rawAlert: useAlert ? alert?.rawText ?? "" : "",
            alertId: useAlert ? alert?.id ?? null : null,
            unsure: amountPence == null || read.confidence < 0.45,
          }),
        );
      } catch {
        wrong.push(image.name);
      }
    }
    retryAlert.current = undefined;
    if (chosen.length > 8) wrong.push("anything after the first 8 files");
    const skipped = [...new Set(wrong)];
    if (skipped.length > 0 && (rows.length > 0 || drafts.length > 0)) {
      toast(`${skipped.length} skipped. ${skipped.slice(0, 2).join(", ")}`);
    }
    if (rows.length > 0 || (drafts.length === 0 && looksLikePay(moneyIn, profile.data?.monthlyIncomePence ?? 0).length > 0)) {
      later.current = drafts;
      setPhase({ kind: "statement", rows, skippedIn, after: drafts.length, moneyIn });
      return;
    }
    if (drafts[0]) {
      later.current = drafts.slice(1);
      setPhase({ kind: "review", draft: drafts[0], remaining: drafts.length - 1 });
      return;
    }
    later.current = [];
    if (images.length > 0) notifyWrong();
    setPhase({
      kind: "wrong",
      note: skipped.length > 0 ? `Couldn’t use ${skipped.join(", ")}.` : "This doesn’t look like a receipt or a list of payments.",
      imageDataUrl: images[0]?.url ?? null,
      alert,
    });
  }

  async function submitPaste(text: string) {
    setError("");
    setPhase({ kind: "busy", label: "Reading the payment alert…" });
    try {
      const alert = await createAlert({ data: { rawText: text } });
      await refresh();
      const amount = alert.amountPence != null ? formatGBP(alert.amountPence) : "an amount";
      notify(alert.merchant, amount);
      setPhase({ kind: "ask", alert });
    } catch (err) {
      setError(errorText(err, "Couldn’t read that alert."));
      setPhase({ kind: "paste", text });
    }
  }

  async function save(draft: Draft, checked = false) {
    const amountPence = poundsToPence(draft.amount);
    if (!draft.merchant.trim()) {
      setError("Add the shop or payee.");
      return;
    }
    if (!amountPence) {
      setError("Enter the amount, like 12.40.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!checked) {
        const clashes = await findClashes({
          data: {
            rows: [
              {
                merchant: draft.merchant.trim(),
                amountPence,
                spentOn: draft.spentOn,
                category: draft.category,
              },
            ],
          },
        });
        if (clashes.length > 0) {
          setBusy(false);
          setPhase({ kind: "clash", clashes, draft, rows: null });
          return;
        }
      }
      await saveSpend({
        data: {
          merchant: draft.merchant.trim(),
          description: draft.description.trim() || draft.merchant.trim(),
          amountPence,
          category: draft.category,
          spentOn: draft.spentOn,
          source: draft.source,
          hasReceipt: draft.hasReceipt,
          note: draft.note,
          items: fromDraftItems(draft.items),
          // The photo stays on this screen only; Pence saves what it read, not the picture.
          rawAlert: draft.rawAlert,
          alertId: draft.alertId,
        },
      });
      await refresh();
      const next = later.current.shift();
      if (next) {
        toast(`Filed ${draft.merchant.trim()}. Next file.`);
        setBusy(false);
        setPhase({ kind: "review", draft: next, remaining: later.current.length });
        return;
      }
      toast(`Filed ${draft.merchant.trim()} under ${categoryLabel(draft.category)}`);
      void navigate({ to: "/" });
    } catch (err) {
      setError(errorText(err, "Couldn’t save that spend."));
      setBusy(false);
    }
  }

  async function fileStatement(rows: StatementRow[], checked = false) {
    if (rows.length === 0) {
      const next = later.current.shift();
      if (next) {
        setPhase({ kind: "review", draft: next, remaining: later.current.length });
        return;
      }
      toast("Kept the payments already in Pence");
      setPhase({ kind: "choose" });
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!checked) {
        const clashes = await findClashes({ data: { rows } });
        if (clashes.length > 0) {
          setBusy(false);
          setPhase({ kind: "clash", clashes, draft: null, rows });
          return;
        }
      }
      const result = await importBank({ data: { rows } });
      await refresh();
      const next = later.current.shift();
      if (result.added > 0 && next) {
        toast(`Filed ${result.added} from the statement. Next file.`);
        setBusy(false);
        setPhase({ kind: "review", draft: next, remaining: later.current.length });
        return;
      }
      toast(
        result.added === 0
          ? "Those spends are already in Pence"
          : `Filed ${result.added} spend${result.added === 1 ? "" : "s"}`,
      );
      if (result.added > 0) void navigate({ to: "/" });
      else if (next) {
        setBusy(false);
        setPhase({ kind: "review", draft: next, remaining: later.current.length });
      } else setBusy(false);
    } catch (err) {
      setError(errorText(err, "Couldn’t file those spends."));
      setBusy(false);
    }
  }

  async function resolveClash(choices: ClashChoice[]) {
    if (phase.kind !== "clash") return;
    setBusy(true);
    setError("");
    try {
      for (let index = 0; index < phase.clashes.length; index += 1) {
        const clash = phase.clashes[index];
        if (choices[index] === "replace" && clash.existingId) {
          await deleteSpend({ data: { id: clash.existingId } });
        }
      }
      if (phase.draft) {
        if (choices[0] === "drop") {
          await refresh();
          const next = later.current.shift();
          setBusy(false);
          if (next) setPhase({ kind: "review", draft: next, remaining: later.current.length });
          else {
            toast("Kept the payment already in Pence");
            void navigate({ to: "/" });
          }
          return;
        }
        await save(phase.draft, true);
        return;
      }
      const drop = new Set(phase.clashes.filter((_, index) => choices[index] === "drop").map((clash) => clash.index));
      const keep = (phase.rows ?? []).filter((_, index) => !drop.has(index));
      await fileStatement(keep, true);
    } catch (err) {
      setError(errorText(err, "Couldn’t update those payments."));
      setBusy(false);
    }
  }

  async function skipAlert(alert: WalletAlert) {
    setBusy(true);
    try {
      await dismissAlert({ data: { id: alert.id } });
      await refresh();
      setPhase({ kind: "choose" });
    } catch (err) {
      setError(errorText(err, "Couldn’t dismiss that."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead
        close="/"
        title={
          phase.kind === "choose"
            ? "Add a spend"
            : phase.kind === "ask"
              ? "Receipt?"
              : phase.kind === "wrong"
                ? "Wrong photo"
                : phase.kind === "statement"
                  ? "Money out"
                  : phase.kind === "paste"
                    ? "Paste a payment message"
                    : "New spend"
        }
      />
      <input
        ref={cameraRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void onFiles(file ? [file] : [], "receipt", retryAlert.current);
        }}
      />
      <input
        ref={galleryRef}
        className="sr-only"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void onFiles(files, "gallery", retryAlert.current);
        }}
      />
      <input
        ref={filesRef}
        className="sr-only"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void onFiles(files, "gallery", retryAlert.current);
        }}
      />
      <input
        ref={anyRef}
        className="sr-only"
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])].slice(0, 8);
          event.target.value = "";
          void onFiles(files, "gallery", retryAlert.current);
        }}
      />
      <input
        ref={attachRef}
        className="sr-only"
        type="file"
        accept="image/*,application/pdf,.pdf"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void onFiles(files, "receipt", retryAlert.current);
        }}
      />

      {phase.kind === "choose" ? (
        <div className="flex flex-col gap-4">
          {canSpeak ? (
            <section className="flex items-center gap-4 rounded-[1.25rem] border border-line bg-card p-[1.125rem]" aria-label="Say it">
              <button
                type="button"
                aria-label={listening ? "Listening. Tap to stop" : "Tap and speak"}
                aria-pressed={listening}
                className={`grid size-[72px] shrink-0 place-items-center rounded-full text-white ${listening ? "bg-clay" : "bg-forest"}`}
                onClick={() => (listening ? listener.current?.stop() : sayIt())}
              >
                <Mic className="size-8" strokeWidth={1.9} />
              </button>
              <div className="flex flex-col gap-1">
                <span className="text-[1.0625rem] font-extrabold">{listening ? "Listening…" : "Say it"}</span>
                <span className="text-sm leading-[1.45] text-muted">
                  “About £20 at ASDA, groceries.” Pence matches it with the bank line later.
                </span>
              </div>
            </section>
          ) : null}

          <section className="grid grid-cols-2 gap-3" aria-label="Other ways to add">
            {[
              { label: "Scan a receipt", line: "Shop, items and total", icon: Camera, run: () => { retryAlert.current = undefined; cameraRef.current?.click(); } },
              { label: "Photos, screenshots or PDF", line: "Receipts or bank screenshots, up to 8", icon: Images, run: () => { retryAlert.current = undefined; anyRef.current?.click(); } },
              { label: "Paste a payment message", line: "Text copied from Google Pay, Apple Pay, a bank or Uber", icon: ClipboardPaste, run: () => setPhase({ kind: "paste", text: "" }) },
              { label: "Type it in", line: "Shop, amount, date", icon: Keyboard, run: () => setPhase({ kind: "review", draft: blankDraft({ unsure: true }), remaining: 0 }) },
            ].map((way) => {
              const Icon = way.icon;
              return (
                <button
                  key={way.label}
                  type="button"
                  className="flex min-h-[108px] flex-col items-start gap-2 rounded-[1.125rem] border border-line bg-card p-3.5 text-left"
                  onClick={way.run}
                >
                  <Icon className="size-6 text-forest" strokeWidth={1.9} aria-hidden="true" />
                  <span className="text-[0.9375rem] leading-snug font-extrabold">{way.label}</span>
                  <span className="text-[0.8125rem] leading-snug text-muted">{way.line}</span>
                </button>
              );
            })}
          </section>

          <section className="flex flex-col gap-3 rounded-[1.25rem] bg-mist p-[1.125rem]" aria-label="Bank statement">
            <div className="flex items-start gap-3">
              <Landmark className="mt-0.5 size-6 shrink-0 text-forest" strokeWidth={1.9} aria-hidden="true" />
              <div className="flex flex-col gap-1">
                <span className="text-base font-extrabold">Upload a bank statement</span>
                <span className="text-sm leading-[1.45] text-ink-soft">
                  A CSV from your banking app. Pence files the money going out and leaves money coming in. It never sees your bank password.
                </span>
              </div>
            </div>
            <Link to="/bank" className="btn-pill self-start">
              Upload
            </Link>
          </section>
        </div>
      ) : null}

      {phase.kind === "paste" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Pence can’t see Google Pay or Apple Pay by itself. Paste the notification. You’ll be asked if a receipt exists, then the spend is filed — as Other if it can’t be sorted.
          </p>
          <textarea
            className="control min-h-28 py-3"
            placeholder="Google Pay · You paid £14.80 to Uber"
            value={phase.text}
            onChange={(event) => setPhase({ kind: "paste", text: event.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                className="chip h-auto min-h-11 py-2 text-left whitespace-normal"
                onClick={() => void submitPaste(example)}
              >
                {example}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => void submitPaste(phase.text)}>
            Read this alert
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setPhase({ kind: "choose" })}>
            Back
          </button>
        </div>
      ) : null}

      {phase.kind === "busy" ? (
        <div className="panel px-5 py-10 text-center">
          <p className="text-xl font-extrabold">{phase.label}</p>
          <div className="mx-auto mt-4 h-1.5 w-40 overflow-hidden rounded-full bg-sand">
            <div className="h-full w-1/2 animate-pulse bg-forest" />
          </div>
        </div>
      ) : null}

      {phase.kind === "ask" ? (
        <div className="panel p-5">
          <p className="text-sm text-muted">Spend spotted</p>
          <h2 className="mt-1 text-[1.75rem] leading-tight font-extrabold">{phase.alert.merchant}</h2>
          <p className="mt-1 text-lg font-bold tabular-nums">
            {phase.alert.amountPence != null ? formatGBP(phase.alert.amountPence) : "Amount missing"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {phase.alert.category === "other"
              ? "This doesn’t look like a known shop, so it will be filed as Other unless you pick a category."
              : `This looks like ${categoryLabel(phase.alert.category)}.`}
          </p>
          <p className="mt-4 font-extrabold">Do you have a receipt?</p>
          <div className="mt-3 flex flex-col gap-2">
            <button type="button" className="btn btn-primary" onClick={() => { retryAlert.current = phase.alert; attachRef.current?.click(); }}>
              Yes — add a photo or PDF
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() =>
                setPhase({
                  kind: "review",
                  draft: blankDraft({
                    merchant: phase.alert.merchant,
                    description: phase.alert.description,
                    amount: moneyField(phase.alert.amountPence),
                    category: phase.alert.category,
                    source: "wallet",
                    rawAlert: phase.alert.rawText,
                    alertId: phase.alert.id,
                    note: "No receipt",
                    unsure: phase.alert.category === "other" || phase.alert.amountPence == null,
                  }),
                  remaining: 0,
                })
              }
            >
              No receipt — file it
            </button>
            <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => void skipAlert(phase.alert)}>
              Not a spend
            </button>
          </div>
        </div>
      ) : null}

      {phase.kind === "wrong" ? (
        <div className="panel p-5" role="alert">
          <p className="text-sm font-bold text-clay">Not a receipt</p>
          <h2 className="mt-1 text-[1.75rem] font-extrabold">Wrong photo</h2>
          <p className="mt-3 text-sm text-ink">{phase.note}</p>
          <p className="mt-2 text-sm text-muted">Nothing was filed. Use a till receipt, a PDF, or a list of payments.</p>
          {phase.imageDataUrl ? (
            <img src={phase.imageDataUrl} alt="Photo that isn’t a receipt" className="mt-4 max-h-40 w-full rounded-lg bg-sand object-contain" />
          ) : null}
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => (phase.alert ? attachRef.current?.click() : cameraRef.current?.click())}
            >
              <Camera className="size-5" /> Scan again
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => galleryRef.current?.click()}>
              <ImagePlus className="size-5" /> Gallery
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => filesRef.current?.click()}>
              <FileText className="size-5" /> Files
            </button>
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                retryAlert.current = undefined;
                setPhase(phase.alert ? { kind: "ask", alert: phase.alert } : { kind: "choose" });
              }}
            >
              Back
            </button>
          </div>
        </div>
      ) : null}

      {phase.kind === "statement" && (phase.moneyIn?.length ?? 0) > 0 ? (
        <div className="mb-4">
          <PaySpotted rows={phase.moneyIn ?? []} usualPence={profile.data?.monthlyIncomePence ?? 0} />
        </div>
      ) : null}

      {phase.kind === "statement" && phase.rows.length === 0 ? (
        <button type="button" className="btn btn-quiet w-full" onClick={() => setPhase({ kind: "choose" })}>
          Done
        </button>
      ) : null}

      {phase.kind === "statement" && phase.rows.length > 0 ? (
        <StatementReview
          rows={phase.rows}
          skippedIn={phase.skippedIn}
          after={phase.after}
          busy={busy}
          onChange={(rows) => setPhase({ kind: "statement", rows, skippedIn: phase.skippedIn, after: phase.after, moneyIn: phase.moneyIn })}
          onSave={() => void fileStatement(phase.rows)}
          onBack={() => {
            later.current = [];
            setPhase({ kind: "choose" });
          }}
        />
      ) : null}

      {phase.kind === "clash" ? (
        <SamePayment
          clashes={phase.clashes}
          busy={busy}
          onResolve={(choices) => void resolveClash(choices)}
          onBack={() => setPhase(phase.draft ? { kind: "review", draft: phase.draft, remaining: later.current.length } : { kind: "statement", rows: phase.rows ?? [], skippedIn: 0, after: later.current.length })}
        />
      ) : null}

      {phase.kind === "review" ? (
        <Review
          draft={phase.draft}
          remaining={phase.remaining}
          busy={busy}
          onChange={(draft) => setPhase({ kind: "review", draft, remaining: phase.remaining })}
          onSave={() => void save(phase.draft)}
          onBack={() => {
            later.current = [];
            setPhase({ kind: "choose" });
          }}
        />
      ) : null}

      {error ? <p className="mt-3 text-sm text-clay">{error}</p> : null}
    </div>
  );
}

function StatementReview({
  rows,
  skippedIn,
  after,
  busy,
  onChange,
  onSave,
  onBack,
}: {
  rows: StatementRow[];
  skippedIn: number;
  after: number;
  busy: boolean;
  onChange: (rows: StatementRow[]) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {rows.length} payment{rows.length === 1 ? "" : "s"} going out.
        {skippedIn > 0 ? ` ${skippedIn} coming in ${skippedIn === 1 ? "was" : "were"} left out.` : ""} Change a category if it’s wrong, or leave Other.
        {after > 0 ? ` ${after} receipt${after === 1 ? "" : "s"} still to check after this.` : ""}
      </p>
      <ul className="panel divide-y divide-line">
        {rows.map((row, index) => (
          <li key={`${row.spentOn}-${row.merchant}-${index}`} className="flex flex-col gap-2 px-4 py-3">
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-bold">{row.merchant}</span>
                <span className="tabular-nums">{formatGBP(row.amountPence)}</span>
              </span>
              <button
                type="button"
                className="text-sm text-muted"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </span>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="control"
                type="date"
                value={row.spentOn}
                onChange={(event) =>
                  onChange(rows.map((item, i) => (i === index ? { ...item, spentOn: event.target.value } : item)))
                }
              />
              <select
                className="control"
                value={row.category}
                aria-label={`Category for ${row.merchant}`}
                onChange={(event) =>
                  onChange(
                    rows.map((item, i) =>
                      i === index ? { ...item, category: event.target.value as CategoryId } : item,
                    ),
                  )
                }
              >
                {CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" disabled={busy || rows.length === 0} onClick={onSave}>
        {busy ? "Filing…" : `File ${rows.length} spend${rows.length === 1 ? "" : "s"}`}
      </button>
      <button type="button" className="btn btn-quiet" onClick={onBack}>
        Back
      </button>
    </div>
  );
}

function Review({
  draft,
  remaining,
  busy,
  onChange,
  onSave,
  onBack,
}: {
  draft: Draft;
  remaining: number;
  busy: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {draft.unsure ? (
        <p className="rounded-md bg-clay-soft px-3 py-2 text-sm text-ink">
          Check the shop, the total, the date, and the items before saving.
          {draft.category !== "other" ? "" : " The category stays Other unless you change it."}
        </p>
      ) : (
        <p className="text-sm text-muted">
          Read from the file
          {draft.items.length > 0 ? ` — ${draft.items.length} item${draft.items.length === 1 ? "" : "s"}` : ""}. Check it, then file it.
          {remaining > 0 ? ` ${remaining} more after this.` : ""}
        </p>
      )}
      {draft.imageDataUrl ? (
        <img src={draft.imageDataUrl} alt="Receipt" className="max-h-40 w-full rounded-lg bg-sand object-contain" />
      ) : null}
      <ItemsEditor
        items={draft.items}
        onChange={(items) => onChange({ ...draft, items })}
        label={draft.hasReceipt ? "Items on the receipt" : "What did you buy? (optional)"}
        hint={
          draft.hasReceipt
            ? ""
            : "No receipt? Add what you bought, like bread or nappies. Pence learns your habits from it. Prices are optional."
        }
        totalPence={poundsToPence(draft.amount)}
      />
      <label className="field">
        <span className="field-label">Amount (£)</span>
        <input
          className="control font-display text-2xl tabular-nums"
          inputMode="decimal"
          value={draft.amount}
          onChange={(event) => onChange({ ...draft, amount: event.target.value })}
        />
      </label>
      <label className="field">
        <span className="field-label">Shop or payee</span>
        <input className="control" value={draft.merchant} onChange={(event) => onChange({ ...draft, merchant: event.target.value })} />
      </label>
      <label className="field">
        <span className="field-label">Category</span>
        <select
          className="control"
          value={draft.category}
          onChange={(event) => onChange({ ...draft, category: event.target.value as CategoryId })}
        >
          {CATEGORIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Date</span>
        <input className="control" type="date" value={draft.spentOn} onChange={(event) => onChange({ ...draft, spentOn: event.target.value })} />
      </label>
      <label className="field">
        <span className="field-label">Note</span>
        <input
          className="control"
          value={draft.note}
          placeholder="Time, card, or anything else on the slip"
          onChange={(event) => onChange({ ...draft, note: event.target.value })}
        />
      </label>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={onSave}>
        {busy ? "Saving…" : "File this spend"}
      </button>
      <button type="button" className="btn btn-quiet" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
