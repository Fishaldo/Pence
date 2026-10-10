import { createFileRoute } from "@tanstack/react-router";

/*
 * The daily price-watch check, called by the scheduler in vercel.json.
 * When CRON_SECRET is set, only a caller with it gets in. Either way a watch
 * is searched at most once in 20 hours, so calling this more often cannot
 * run up searches.
 */
async function run(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { checkDue } = await import("@/server/watch-check");
  const result = await checkDue({ limit: 30, budgetMs: 240_000, push: true });
  return Response.json(result);
}

export const Route = createFileRoute("/api/watch-check")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
    },
  },
});
