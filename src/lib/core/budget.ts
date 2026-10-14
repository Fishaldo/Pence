import { CATEGORIES, type CategoryId, type PaySpan, type Tx } from "./model.ts";

/*
 * A budget made from the person's own pays, that fits their take-home and
 * saves more than they usually do.
 *
 * 1. Start from what they really spent: each category's average over the last
 *    finished pays (up to three).
 * 2. Set a savings goal above what they usually save: at least 10% of take-home
 *    for someone not saving yet, about 5% of take-home more for someone who is,
 *    up to 20%. Someone already saving more than 20% keeps their own level.
 * 3. Never cut rent, bills, health, kids or education.
 * 4. If the rest does not fit, trim the flexible lines, most from the ones that
 *    bend most (eating out, clothes, days out), least from the ones that hardly
 *    bend (the food shop, getting to work). No line is cut by more than its
 *    share: groceries at most 15%, fashion at most 60%.
 * 5. Only if that is still not enough does the savings goal come down, never
 *    below a starter 3% of take-home, and only after that are flexible lines
 *    cut further. A small amount put away every pay starts the habit.
 *
 * The plan is never more than the take-home, unless the never-cut lines alone
 * are more than it.
 */

export type BudgetLine = {
  id: string;
  name: string;
  /** The category it counts, or null for a line the person tracks by hand, such as perfume. */
  category: CategoryId | null;
  amountPence: number;
  /** Never suggested for trimming: rent, bills, health and the like. */
  neverCut: boolean;
};

/** Lines never suggested for trimming, unless the person says otherwise. */
export const NEVER_CUT = new Set<CategoryId>(["housing", "bills", "health", "kids", "education"]);

/** The most a line is trimmed, as a share of what the person usually spends on it. */
const MAX_CUT: Partial<Record<CategoryId, number>> = {
  groceries: 0.15,
  transport: 0.15,
  pets: 0.15,
  sent: 0.2,
  household: 0.25,
  charity: 0.25,
  cash: 0.3,
  personal: 0.35,
  subscriptions: 0.4,
  other: 0.4,
  gifts: 0.5,
  fees: 0.5,
  dining: 0.5,
  entertainment: 0.5,
  fashion: 0.6,
  travel: 0.6,
};
const OWN_LINE_CUT = 0.3;
/** Even a tight plan keeps this share of take-home for savings, unless the never-cut lines leave no room. */
const STARTER = 0.03;
const SAVING = new Set<CategoryId>(["savings", "investments"]);
/** Categories that come out every pay once they start. */
const RECURRING = new Set<CategoryId>(["housing", "bills", "subscriptions"]);
const STEP = 500;

function maxCut(line: { category: CategoryId | null; neverCut: boolean }): number {
  if (line.neverCut) return 0;
  if (!line.category) return OWN_LINE_CUT;
  return MAX_CUT[line.category] ?? 0.3;
}

const up = (pence: number) => Math.ceil(pence / STEP) * STEP;
const down = (pence: number) => Math.floor(pence / STEP) * STEP;
const near = (pence: number) => Math.round(pence / STEP) * STEP;

export type PlannedLine = BudgetLine & {
  /** What the person usually spends or saves here, each pay. */
  usualPence: number;
  kind: "savings" | "fixed" | "flexible";
};

export type BudgetPlan = {
  lines: PlannedLine[];
  takeHomePence: number;
  plannedPence: number;
  /** Take-home left with no line, kept spare for the unexpected. */
  sparePence: number;
  savingsPence: number;
  usualSavingsPence: number;
  fixedPence: number;
  /** Lines trimmed to fit, biggest trim first. */
  trimmed: { name: string; fromPence: number; toPence: number }[];
  /** The savings goal had to come down to fit. */
  savingsCut: boolean;
  /** Flexible lines had to go below their usual floor to fit. */
  tight: boolean;
  /** The never-cut lines alone are more than the take-home. */
  fixedOver: boolean;
};

/** Each category's average a pay over the last finished pays with spends in them, up to three. */
export function usualByCategory(
  txs: Pick<Tx, "amountPence" | "category" | "spentOn" | "isSample">[],
  spans: PaySpan[],
): { spending: Map<CategoryId, number>; savingsPence: number; investmentsPence: number } {
  const real = txs.filter((tx) => !tx.isSample);
  const source = real.length > 0 ? real : txs;
  // Only pays with something logged count, so one pay of history is not averaged over three.
  const used = spans.slice(0, 3).filter((span) => source.some((tx) => tx.spentOn >= span.start && tx.spentOn <= span.end));
  const totals = new Map<CategoryId, number>();
  // How many of the used pays, newest first, reach back to the oldest one with this category in it.
  const reach = new Map<CategoryId, number>();
  used.forEach((span, index) => {
    for (const tx of source) {
      if (tx.spentOn < span.start || tx.spentOn > span.end || tx.category === "transfers") continue;
      totals.set(tx.category, (totals.get(tx.category) ?? 0) + tx.amountPence);
      reach.set(tx.category, Math.max(reach.get(tx.category) ?? 0, index + 1));
    }
  });
  const n = Math.max(1, used.length);
  const spending = new Map<CategoryId, number>();
  for (const [category, total] of totals) {
    if (SAVING.has(category)) continue;
    // Rent, bills and subscriptions come out every pay once they start: a bill that began two pays
    // ago is £20 a pay, not £13.33 averaged over three. Other spending is averaged over every pay.
    const over = RECURRING.has(category) ? (reach.get(category) ?? n) : n;
    spending.set(category, total / over);
  }
  return {
    spending: used.length > 0 ? spending : new Map(),
    savingsPence: (totals.get("savings") ?? 0) / n,
    investmentsPence: (totals.get("investments") ?? 0) / n,
  };
}

/** How much to aim to save each pay: more than usual, within reach. */
export function savingsGoal(takeHomePence: number, usualSavingsPence: number): number {
  if (takeHomePence <= 0) return Math.max(0, usualSavingsPence);
  const usual = Math.max(0, usualSavingsPence);
  const goal = Math.max(usual + 0.05 * takeHomePence, 0.1 * takeHomePence);
  return Math.min(goal, Math.max(usual, 0.2 * takeHomePence));
}

type Wanted = { id: string; name: string; category: CategoryId | null; usualPence: number; neverCut: boolean };

/**
 * Fits lines into a take-home with a savings goal. `wanted` holds what the
 * person usually spends on each line; savings and investments are not in it.
 */
export function planBudget(input: {
  wanted: Wanted[];
  takeHomePence: number;
  usualSavingsPence: number;
  usualInvestmentsPence?: number;
  /** Savings already planned that should not go down, such as a line the person set. */
  minSavingsPence?: number;
}): BudgetPlan {
  const T = Math.max(0, Math.round(input.takeHomePence));
  const invest = input.usualInvestmentsPence ?? 0;
  const usualSaving = input.usualSavingsPence + invest;
  const wanted = input.wanted.filter((line) => line.usualPence > 0 && !(line.category && SAVING.has(line.category)));
  const fixed = wanted.filter((line) => maxCut(line) === 0);
  const flex = wanted.filter((line) => maxCut(line) > 0);
  // Never-cut lines keep their real amount: rounding rent up to £5 could push a plan that fits over the take-home.
  const fixedPence = fixed.reduce((sum, line) => sum + Math.round(line.usualPence), 0);

  let goal = T > 0 ? Math.max(savingsGoal(T, usualSaving), input.minSavingsPence ?? 0) : 0;
  const flexUsual = flex.reduce((sum, line) => sum + line.usualPence, 0);
  const cut = new Map<string, number>(flex.map((line) => [line.id, 0]));
  let savingsCut = false;
  let tight = false;
  const fixedOver = T > 0 && fixedPence > T;

  if (T > 0) {
    const room = T - fixedPence - goal;
    let need = flexUsual - room;
    if (need > 0) {
      // Trim where spending bends most, never past each line's floor.
      const capacity = flex.reduce((sum, line) => sum + line.usualPence * maxCut(line), 0);
      const share = capacity > 0 ? Math.min(1, need / capacity) : 0;
      for (const line of flex) cut.set(line.id, line.usualPence * maxCut(line) * share);
      need -= capacity * share;
      if (need > 0) {
        // Still over: the savings goal gives way before the essentials do, down to a starter amount.
        const starter = Math.min(goal, STARTER * T);
        const lower = Math.min(goal - starter, need);
        goal -= lower;
        need -= lower;
        savingsCut = lower > 0;
      }
      if (need > 0) {
        // Still over with nothing saved: cut the rest evenly so the plan fits the take-home.
        const left = flex.reduce((sum, line) => sum + line.usualPence - (cut.get(line.id) ?? 0), 0);
        if (left > 0) {
          const ratio = Math.min(1, need / left);
          for (const line of flex) {
            const now = cut.get(line.id) ?? 0;
            cut.set(line.id, now + (line.usualPence - now) * ratio);
          }
        }
        tight = true;
      }
    }
  }

  const lines: PlannedLine[] = [];
  for (const line of fixed) {
    lines.push({ id: line.id, name: line.name, category: line.category, amountPence: Math.round(line.usualPence), neverCut: true, usualPence: line.usualPence, kind: "fixed" });
  }
  const flexLines: PlannedLine[] = [];
  for (const line of flex) {
    // With no take-home to fit, round up as before; otherwise to the nearest £5.
    const amount = T > 0 ? near(line.usualPence - (cut.get(line.id) ?? 0)) : up(line.usualPence);
    if (amount <= 0) continue;
    flexLines.push({ id: line.id, name: line.name, category: line.category, amountPence: amount, neverCut: false, usualPence: line.usualPence, kind: "flexible" });
  }

  if (T > 0) {
    // Rounding must not push the plan over the take-home: take £5 at a time from the line that bends most.
    let over = fixedPence + flexLines.reduce((sum, line) => sum + line.amountPence, 0) + down(goal) - T;
    while (over > 0) {
      const pick = flexLines
        .filter((line) => line.amountPence >= STEP)
        .sort((a, b) => b.amountPence * maxCut(b) - a.amountPence * maxCut(a))[0];
      if (!pick) break;
      pick.amountPence -= STEP;
      over -= STEP;
    }
  }
  const kept = flexLines.filter((line) => line.amountPence > 0);
  const flexPence = kept.reduce((sum, line) => sum + line.amountPence, 0);

  // Savings: the goal, rounded down to £5, and never more than what is left.
  // When savings had to come down to fit, whatever rounding leaves over goes to savings too.
  const room = down(T - fixedPence - flexPence);
  let savingsPence = T > 0 ? Math.max(0, savingsCut || tight ? room : Math.min(down(goal), room)) : down(usualSaving);
  const investLine = invest >= STEP ? Math.min(near(invest), savingsPence) : 0;
  const saveLine = savingsPence - investLine;
  const savingLines: PlannedLine[] = [];
  if (saveLine >= STEP) {
    savingLines.push({ id: "c:savings", name: "", category: "savings", amountPence: saveLine, neverCut: false, usualPence: input.usualSavingsPence, kind: "savings" });
  }
  if (investLine >= STEP) {
    savingLines.push({ id: "c:investments", name: "", category: "investments", amountPence: investLine, neverCut: false, usualPence: invest, kind: "savings" });
  }
  savingsPence = savingLines.reduce((sum, line) => sum + line.amountPence, 0);

  lines.sort((a, b) => b.amountPence - a.amountPence);
  kept.sort((a, b) => b.amountPence - a.amountPence);
  const all = [...savingLines, ...lines, ...kept];
  const plannedPence = all.reduce((sum, line) => sum + line.amountPence, 0);
  const trimmed = kept
    .map((line) => ({ name: lineLabel(line), fromPence: near(line.usualPence), toPence: line.amountPence }))
    .concat(
      flex
        .filter((line) => !kept.some((k) => k.id === line.id) && near(line.usualPence) > 0)
        .map((line) => ({ name: lineLabel(line), fromPence: near(line.usualPence), toPence: 0 })),
    )
    .filter((row) => row.fromPence - row.toPence >= STEP)
    .sort((a, b) => b.fromPence - b.toPence - (a.fromPence - a.toPence));

  return {
    lines: all,
    takeHomePence: T,
    plannedPence,
    sparePence: T > 0 ? Math.max(0, T - plannedPence) : 0,
    savingsPence,
    usualSavingsPence: usualSaving,
    fixedPence,
    trimmed,
    savingsCut,
    tight,
    fixedOver,
  };
}

function lineLabel(line: { name: string; category: CategoryId | null }): string {
  if (line.name) return line.name;
  return CATEGORIES.find((c) => c.id === line.category)?.label ?? "Line";
}

/**
 * A first budget from the person's own pays, fitted to the take-home. Lines
 * under £5 a pay are left out.
 */
export function suggestBudget(
  txs: Pick<Tx, "amountPence" | "category" | "spentOn" | "isSample">[],
  spans: PaySpan[],
  takeHomePence = 0,
): BudgetPlan {
  const usual = usualByCategory(txs, spans);
  const wanted: Wanted[] = [...usual.spending.entries()]
    .filter(([, pence]) => pence >= STEP)
    .map(([category, pence]) => ({ id: `c:${category}`, name: "", category, usualPence: pence, neverCut: NEVER_CUT.has(category) }));
  if (wanted.length === 0 && usual.savingsPence + usual.investmentsPence <= 0) return planBudget({ wanted: [], takeHomePence: 0, usualSavingsPence: 0 });
  return planBudget({
    wanted,
    takeHomePence,
    usualSavingsPence: usual.savingsPence,
    usualInvestmentsPence: usual.investmentsPence,
  });
}

/**
 * Fits a budget the person already has into their take-home, keeping their
 * own lines and their never-cut choices, and not lowering the savings they set.
 */
export function fitBudget(lines: BudgetLine[], takeHomePence: number, usualSavingsPence = 0): BudgetPlan {
  const sum = (category: CategoryId) => lines.filter((line) => line.category === category).reduce((total, line) => total + line.amountPence, 0);
  const savings = sum("savings");
  const investments = sum("investments");
  const wanted: Wanted[] = lines
    .filter((line) => !(line.category && SAVING.has(line.category)))
    .map((line) => ({ id: line.id, name: line.name, category: line.category, usualPence: line.amountPence, neverCut: line.neverCut }));
  return planBudget({
    wanted,
    takeHomePence,
    usualSavingsPence: Math.max(usualSavingsPence - investments, savings),
    usualInvestmentsPence: investments,
    minSavingsPence: savings + investments,
  });
}

/** How far through a budget line this pay is. */
export function lineProgress(line: BudgetLine, txs: Pick<Tx, "amountPence" | "category" | "spentOn">[], span: PaySpan) {
  const spentPence = line.category
    ? txs
        .filter((tx) => tx.category === line.category && tx.spentOn >= span.start && tx.spentOn <= span.end)
        .reduce((sum, tx) => sum + tx.amountPence, 0)
    : 0;
  return { spentPence, leftPence: line.amountPence - spentPence, over: spentPence > line.amountPence };
}
