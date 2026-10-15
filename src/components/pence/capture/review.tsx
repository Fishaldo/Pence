import { CATEGORIES, poundsToPence, type CategoryId } from "@/lib/core/model";
import { ItemsEditor } from "../items-editor";
import type { Draft } from "./draft";

/*
 * Checking one spend read from a receipt or an alert before saving it.
 */

export function Review({
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
        <p className="rounded-md bg-warn-tint px-3 py-2 text-sm text-ink">
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
