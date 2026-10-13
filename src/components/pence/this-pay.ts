import { dayNum, shortDay } from "@/lib/spend/habits";
import { formatGBP, paySpan, spanProgress, summarizeSpan, todayISO, type PaySpan, type Profile, type Tx } from "@/lib/spend/model";
import { billsBeforePayday, safeToSpend, type BillToCome, type SafeToSpend } from "@/lib/spend/payday";
import type { Regular } from "@/lib/spend/regular";
import type { PayRecord } from "@/server/money";
import { usePay, useRegulars } from "./data";

/*
 * This pay period worked out for the screens: take-home, spent, bills still to
 * come and what is safe to spend. Plus which bills are worth a look.
 */

export type ThisPay = {
  span: PaySpan;
  today: string;
  /** This pay period's take-home: what the person confirmed, else what they gave in Settings. */
  takeHomePence: number;
  confirmed: PayRecord | null;
  spentPence: number;
  movedPence: number;
  bills: BillToCome[];
  safe: SafeToSpend;
  day: number;
  days: number;
};

/** Everything Home and the weekly check-in need about this pay period. */
export function useThisPay(profile: Profile | null | undefined, txs: Tx[]): ThisPay {
  const pay = usePay();
  const regulars = useRegulars();
  const now = new Date();
  const today = todayISO(now);
  const span = paySpan(now, profile?.payday ?? null, 0);
  const confirmed = (pay.data ?? []).find((row) => row.startsOn === span.start) ?? null;
  const takeHomePence = confirmed?.takeHomePence ?? profile?.monthlyIncomePence ?? 0;
  const summary = summarizeSpan(txs, span);
  const bills = billsBeforePayday(regulars.data?.items ?? [], today, span.end);
  const safe = safeToSpend({ takeHomePence, spentPence: summary.spent, bills, today, end: span.end });
  const progress = spanProgress(span, now);
  return {
    span,
    today,
    takeHomePence,
    confirmed,
    spentPence: summary.spent,
    movedPence: summary.moved,
    bills,
    safe,
    day: progress.day,
    days: progress.days,
  };
}

/** Bills worth a look: one went up, a contract has ended, or ends soon. */
export function billChecks(items: Regular[], today: string): { item: Regular; why: string }[] {
  const out: { item: Regular; why: string }[] = [];
  for (const item of items) {
    if (item.stopped || item.lapsed) continue;
    if (item.rise && dayNum(today) - dayNum(item.rise.on) <= 60) {
      out.push({ item, why: `Up ${formatGBP(item.rise.toPence - item.rise.fromPence)} since ${shortDay(item.rise.on)}` });
    } else if (item.contractEnd && item.contractEnd < today) {
      out.push({ item, why: "Out of contract: you can usually switch without a fee" });
    } else if (item.contractEnd && dayNum(item.contractEnd) - dayNum(today) <= 45) {
      out.push({ item, why: `Contract ends ${shortDay(item.contractEnd)}` });
    }
  }
  return out;
}

export function isBill(item: Regular): boolean {
  return item.subscription || item.category === "bills" || item.category === "housing" || item.category === "subscriptions";
}

