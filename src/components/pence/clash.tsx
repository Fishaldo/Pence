import { useState } from "react";
import { shortDay } from "@/lib/spend/habits";
import { formatGBP } from "@/lib/spend/model";
import type { Clash } from "@/server/ledger";

export type ClashChoice = "drop" | "replace" | "both";

function whereFrom(source: string, hasReceipt: boolean): string {
  if (hasReceipt) return "a receipt";
  if (source === "bank") return "your bank";
  if (source === "wallet") return "a card alert";
  return "a spend already filed";
}

export function SamePayment({
  clashes,
  busy,
  onResolve,
  onBack,
}: {
  clashes: Clash[];
  busy: boolean;
  onResolve: (choices: ClashChoice[]) => void;
  onBack: () => void;
}) {
  const [choices, setChoices] = useState<(ClashChoice | null)[]>(() => clashes.map(() => null));
  const ready = choices.every((choice) => choice != null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-extrabold tracking-[-0.02em]">Already saved?</h2>
        <p className="text-sm leading-[1.45] text-muted">
          {clashes.length === 1 ? "This new payment matches one you have" : "These new payments match ones you have"}: same shop, same amount,
          same day.
        </p>
      </div>
      {clashes.map((clash, index) => {
        const choice = choices[index];
        const pick = (next: ClashChoice) => setChoices((current) => current.map((item, i) => (i === index ? next : item)));
        return (
          <section key={`${clash.existingId ?? "file"}-${clash.index}`} className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="panel flex flex-col gap-1 p-3.5">
                <span className="text-[0.6875rem] font-extrabold tracking-[0.08em] text-muted uppercase">Saved</span>
                <span className="text-[0.9375rem] leading-snug font-extrabold">
                  {clash.existingMerchant} {formatGBP(clash.existingAmountPence)}
                </span>
                <span className="text-[0.8125rem] text-muted">{shortDay(clash.existingSpentOn)}</span>
                <span className="text-[0.8125rem] text-muted">
                  {clash.inFile ? "Also in this list" : `From ${whereFrom(clash.existingSource, clash.existingHasReceipt)}`}
                </span>
              </div>
              <div className="flex flex-col gap-1 rounded-[1.125rem] border border-forest bg-mist p-3.5">
                <span className="text-[0.6875rem] font-extrabold tracking-[0.08em] text-forest uppercase">New</span>
                <span className="text-[0.9375rem] leading-snug font-extrabold">
                  {clash.existingMerchant} {formatGBP(clash.existingAmountPence)}
                </span>
                <span className="text-[0.8125rem] text-ink-soft">{shortDay(clash.existingSpentOn)}</span>
                <span className="text-[0.8125rem] text-ink-soft">The one you are adding now</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" aria-pressed={choice === "drop"} className={choice === "drop" ? "btn btn-primary" : "btn btn-quiet"} onClick={() => pick("drop")}>
                {clash.inFile ? "Keep one" : "Keep the saved one"}
              </button>
              {clash.existingId ? (
                <button
                  type="button"
                  aria-pressed={choice === "replace"}
                  className={choice === "replace" ? "btn btn-primary" : "btn btn-quiet"}
                  onClick={() => pick("replace")}
                >
                  Replace it with the new one
                </button>
              ) : null}
              <button type="button" aria-pressed={choice === "both"} className={choice === "both" ? "btn btn-primary" : "btn btn-quiet"} onClick={() => pick("both")}>
                Keep both
              </button>
            </div>
          </section>
        );
      })}
      <p className="text-[0.8125rem] text-muted">The same amount on a different day is never treated as a match. Nothing is removed until you continue.</p>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!ready || busy}
        onClick={() => onResolve(choices.filter((choice): choice is ClashChoice => choice != null))}
      >
        {busy ? "Saving…" : "Continue"}
      </button>
      <button type="button" className="btn btn-quiet" onClick={onBack}>
        Back
      </button>
    </div>
  );
}
