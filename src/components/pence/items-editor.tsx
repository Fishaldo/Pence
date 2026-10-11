import { useState } from "react";
import { formatGBP, poundsToPence } from "@/lib/spend/model";

export type DraftItem = { name: string; amount: string };

function itemSum(items: DraftItem[]): number | null {
  let sum = 0;
  let any = false;
  for (const item of items) {
    const pence = poundsToPence(item.amount);
    if (pence == null) continue;
    any = true;
    sum += pence;
  }
  return any ? sum : null;
}

/**
 * What was bought on one payment: a name and, if known, a price for each.
 * Used for receipts and, more often, for payments with no receipt at all.
 */
export function ItemsEditor({
  items,
  onChange,
  label,
  hint,
  totalPence,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  label: string;
  hint?: string;
  totalPence: number | null;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const sum = itemSum(items);
  const mismatch = sum != null && totalPence != null && sum - totalPence > 2;

  function add() {
    const clean = name.trim();
    if (!clean) return;
    // Several at once: "bread, milk, nappies".
    const names = amount.trim() ? [clean] : clean.split(/\s*,\s*/).filter(Boolean);
    const added = names.map((item) => ({ name: item.slice(0, 80), amount: names.length === 1 ? amount.trim() : "" }));
    onChange([...items, ...added].slice(0, 40));
    setName("");
    setAmount("");
  }

  function patch(index: number, change: Partial<DraftItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...change } : item)));
  }

  return (
    <div className="panel px-3 py-3">
      <p className="field-label">{label}</p>
      {hint ? <p className="-mt-1 mb-2 text-sm text-muted">{hint}</p> : null}
      {items.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-center gap-2">
              <input
                className="control min-w-0 flex-1"
                aria-label={`Item ${index + 1}`}
                value={item.name}
                onChange={(event) => patch(index, { name: event.target.value })}
              />
              <input
                className="control w-20 shrink-0 tabular-nums"
                aria-label={`Price for item ${index + 1}`}
                inputMode="decimal"
                placeholder="£"
                value={item.amount}
                onChange={(event) => patch(index, { amount: event.target.value })}
              />
              <button
                type="button"
                className="grid size-11 shrink-0 place-items-center rounded-md text-muted"
                aria-label={`Remove ${item.name || `item ${index + 1}`}`}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center gap-2">
        <input
          className="control min-w-0 flex-1"
          aria-label="Add an item"
          placeholder={items.length > 0 ? "Add another" : "Bread, milk…"}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <input
          className="control w-20 shrink-0 tabular-nums"
          aria-label="Price, if you know it"
          inputMode="decimal"
          placeholder="£"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          className="h-12 shrink-0 rounded-md bg-forest px-4 text-sm font-medium text-foam disabled:opacity-50"
          disabled={!name.trim()}
          onClick={add}
        >
          Add
        </button>
      </div>
      {sum != null ? (
        <p className="mt-2 text-sm text-muted">
          Prices so far add up to {formatGBP(sum)}
          {mismatch ? ", more than the total paid." : "."}
        </p>
      ) : null}
    </div>
  );
}
