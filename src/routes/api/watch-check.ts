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
  const { runDailyCheck } = await import("@/server/daily");
  return Response.json(await runDailyCheck());
}

export const Route = createFileRoute("/api/watch-check")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
    },
  },
});
