import { getSql } from "@/lib/db";
import { dayNum, isoOf } from "@/lib/spend/habits";
import { countsAsSpending, formatGBP, isCategory } from "@/lib/spend/model";
import { weekOf } from "@/lib/spend/payday";
import { pushUser } from "@/server/push";

/*
 * The weekly check-in nudge. On the day each person chose, one phone message
 * with the week so far. Sent once a week at most, however often the daily check runs.
 */

function londonNow(): { today: string; weekday: number } {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return { today, weekday: new Date(dayNum(today) * 86_400_000).getUTCDay() };
}

export async function sendWeeklyCheckins(options: { budgetMs?: number } = {}): Promise<{ sent: number }> {
  const started = Date.now();
  const budget = options.budgetMs ?? 20_000;
  const sql = await getSql();
  const { today, weekday } = londonNow();
  const week = weekOf(today);
  const users = await sql<{ user_id: string }>`
    select distinct p.user_id from profiles p
    join push_subs s on s.user_id = p.user_id
    where p.weekly_day = ${weekday}`;
  let sent = 0;
  for (const { user_id: userId } of users) {
    if (Date.now() - started > budget) break;
    try {
      const marked = await sql<{ key: string }>`
        insert into reminders_sent (user_id, key, due, days_before)
        values (${userId}, ${"weekly-check-in"}, ${week.start}, ${-2})
        on conflict do nothing
        returning key`;
      if (marked.length === 0) continue;
      const rows = await sql<{ amount_pence: number | string; category: string }>`
        select amount_pence, category from transactions
        where user_id = ${userId} and spent_on >= ${week.start} and spent_on <= ${today} and is_sample = false`;
      const spent = rows
        .filter((row) => !isCategory(row.category) || countsAsSpending(row.category))
        .reduce((sum, row) => sum + Number(row.amount_pence || 0), 0);
      await pushUser(userId, {
        title: "Your weekly check-in",
        body: spent > 0 ? `${formatGBP(spent)} spent since Monday. Two minutes to see where it went.` : "Two minutes to see your week and what is coming up.",
        url: "/week",
        tag: "weekly-check-in",
      });
      sent += 1;
    } catch {
      /* one person failing must not stop the others */
    }
  }
  await sql`delete from reminders_sent where key = ${"weekly-check-in"} and due < ${isoOf(dayNum(today) - 60)}`;
  return { sent };
}
