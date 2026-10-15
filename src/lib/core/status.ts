/*
 * How this pay is going, in one word, so a screen can colour it without
 * guessing: steady (on track), watch (spending faster than last pay, or close
 * to take-home) or over (more than take-home, or more than is safe with the
 * bills still to come).
 */

export type SpendStatus = "steady" | "watch" | "over";

export type SpendStatusInput = {
  /** Spent so far this pay, in pence. */
  spent: number;
  /** This pay's take-home, if known. */
  takeHome: number | null;
  /** What is left to spend after bills still to come; below zero means over. */
  safe?: number | null;
  /** Spent by this day of the last pay, and in the whole of it. */
  lastPaySameDay?: number;
  lastPaySpent?: number;
};

/** Ahead of last pay by more than this share (and at least £20) is worth a look. */
const AHEAD_SHARE = 0.1;
const AHEAD_MIN = 2000;
/** This close to take-home is worth a look whatever last pay did. */
const NEAR_TAKE_HOME = 0.9;

export function spendStatus(input: SpendStatusInput): SpendStatus {
  const { spent, takeHome } = input;
  if (takeHome && spent > takeHome) return "over";
  if (input.safe != null && input.safe < 0) return "over";
  if (takeHome && spent >= takeHome * NEAR_TAKE_HOME) return "watch";
  const last = input.lastPaySameDay ?? 0;
  if ((input.lastPaySpent ?? 0) > 0 && spent - last > Math.max(AHEAD_MIN, last * AHEAD_SHARE)) return "watch";
  return "steady";
}
