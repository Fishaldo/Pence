import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { sentNotBought } from "@/lib/core/habits";
import { categoryLabel, countsAsSpending, formatGBP, type Tx } from "@/lib/core/model";
import { refileSpends } from "@/server/ledger";
import { useRefreshLedger } from "./data";
import { errorText } from "./error-text";

const KEPT = "pence.keptAsFiled";

function readKept(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEPT);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeKept(ids: Set<string>) {
  try {
    window.localStorage.setItem(KEPT, JSON.stringify([...ids].slice(-1000)));
  } catch {
    // Without storage the card simply asks again next time.
  }
}

/**
 * Payments filed as Gifts or Other that went to people or a transfer app, not
 * to a shop. Pence already leaves them out of offers; this asks once whether
 * to file them as Money sent, so Insights and the budget show them apart too.
 */
export function MoneySentCard({ rows }: { rows: Tx[] }) {
  const refresh = useRefreshLedger();
  const client = useQueryClient();
  // Read after the first render, so the page drawn on the server and in the browser match.
  const [kept, setKept] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setKept(readKept()), []);

  const found = useMemo(
    () =>
      rows.filter(
        (tx) => !tx.isSample && tx.category !== "sent" && countsAsSpending(tx.category) && !kept?.has(tx.id) && sentNotBought(tx),
      ),
    [rows, kept],
  );
  if (!kept || found.length === 0) return null;

  const total = found.reduce((sum, tx) => sum + tx.amountPence, 0);
  const from = [...new Set(found.map((tx) => tx.category))].map((id) => categoryLabel(id)).join(" and ");
  const payees = [...new Set(found.map((tx) => tx.merchant.trim()).filter(Boolean))];

  async function move() {
    setBusy(true);
    try {
      const result = await refileSpends({ data: { ids: found.map((tx) => tx.id), category: "sent", remember: true } });
      await refresh();
      void client.invalidateQueries({ queryKey: ["forYou"] });
      void client.invalidateQueries({ queryKey: ["forYouWide"] });
      toast(`${result.moved} payment${result.moved === 1 ? "" : "s"} moved to Money sent`);
    } catch (err) {
      toast(errorText(err, "Couldn’t move them just now."));
    } finally {
      setBusy(false);
    }
  }

  function keep() {
    const next = new Set(kept);
    for (const tx of found) next.add(tx.id);
    writeKept(next);
    setKept(next);
  }

  return (
    <section className="panel flex flex-col gap-2.5 p-[1.125rem]" aria-label="Money sent to people">
      <h2 className="section-title">Money sent, not shopping</h2>
      <p className="text-sm leading-[1.45] text-ink-soft">
        {found.length} payment{found.length === 1 ? "" : "s"} in {from} went to people, not shops: {formatGBP(total)} in all
        {payees.length > 0 ? `, to ${payees.slice(0, 2).join(" and ")}${payees.length > 2 ? ` and ${payees.length - 2} more` : ""}` : ""}.
      </p>
      <p className="text-sm leading-[1.45] text-muted">
        Pence no longer looks for gift deals because of them. Move them to Money sent so they show apart here and in your budget?
        Future payments to the same people go there too.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn btn-primary sm:w-auto" disabled={busy} onClick={() => void move()}>
          {busy ? "Moving…" : "Move to Money sent"}
        </button>
        <button type="button" className="btn btn-quiet sm:w-auto" disabled={busy} onClick={keep}>
          Keep as they are
        </button>
      </div>
    </section>
  );
}
