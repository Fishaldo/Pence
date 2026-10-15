/** Words from the system that mean "it took too long" or "the connection dropped", never shown as they are. */
const SLOW = /abort|time ?out|timed out|failed to fetch|networkerror|network request failed|load failed|fetch failed|econnreset|socket hang up/i;

/** A server error's own words for the person, or a plain fallback when it is a programming or network error. */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && SLOW.test(`${error.name} ${error.message}`)) {
    return "That took too long, or the connection dropped. Try again in a moment.";
  }
  if (error instanceof Error && error.message && !/cannot read propert|is not a function|undefined|unexpected token/i.test(error.message)) return error.message;
  return fallback;
}
