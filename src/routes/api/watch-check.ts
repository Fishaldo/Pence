import { createFileRoute } from "@tanstack/react-router";

/*
 * The daily check, called by the scheduler in vercel.json: reminders for
 * regular payments coming out soon, then the price watches.
 * When CRON_SECRET is set, only a caller with it gets in. Either way a watch
 * is searched at most once in 20 hours, and each reminder is sent once, so
 * calling this more often cannot run up searches or repeat alerts.
 */
async function run(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { sendDueReminders } = await import("@/server/regular");
  const reminders = await sendDueReminders({ budgetMs: 40_000 }).catch(() => ({ users: 0, sent: 0, failed: true }));
  const { checkDue } = await import("@/server/watch-check");
  const result = await checkDue({ limit: 30, budgetMs: 200_000, push: true });
  return Response.json({ ...result, reminders });
}

export const Route = createFileRoute("/api/watch-check")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
    },
  },
});
