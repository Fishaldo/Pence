import type { StatementRow } from "@/lib/core/statement";
import { CATEGORIES, formatGBP, type CategoryId } from "@/lib/core/model";

/*
 * Checking the money-out lines read from a bank or card screenshot before filing them.
 */

export function StatementReview({
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
