import { useState } from "react";
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
      <p className="text-sm text-muted">
        Same amount, same shop, and the same date. A matching amount on another day is left alone. Nothing is removed until you continue.
      </p>
      {clashes.map((clash, index) => {
        const choice = choices[index];
        return (
          <section key={`${clash.existingId ?? "file"}-${clash.index}`} className="panel p-4">
            <p className="font-medium">
              {formatGBP(clash.existingAmountPence)} · {clash.existingMerchant}
            </p>
            <p className="mt-1 text-sm text-muted">
              {clash.inFile
                ? `Also in this list on ${clash.existingSpentOn}.`
                : `Already in Pence from ${whereFrom(clash.existingSource, clash.existingHasReceipt)}, dated ${clash.existingSpentOn}.`}
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                className={choice === "drop" ? "btn btn-primary" : "btn btn-quiet"}
                onClick={() => setChoices((current) => current.map((item, i) => (i === index ? "drop" : item)))}
              >
                {clash.inFile ? "Keep one" : "Keep the one already saved"}
              </button>
              {clash.existingId ? (
                <button
                  type="button"
                  className={choice === "replace" ? "btn btn-primary" : "btn btn-quiet"}
                  onClick={() => setChoices((current) => current.map((item, i) => (i === index ? "replace" : item)))}
                >
                  Remove the saved one and keep this
                </button>
              ) : null}
              <button
                type="button"
                className={choice === "both" ? "btn btn-primary" : "btn btn-quiet"}
                onClick={() => setChoices((current) => current.map((item, i) => (i === index ? "both" : item)))}
              >
                Keep both
              </button>
            </div>
          </section>
        );
      })}
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
