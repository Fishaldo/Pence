/** A server error's own words for the person, or a plain fallback when it is a programming error. */
export function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message && !/cannot read propert/i.test(error.message)) return error.message;
  return fallback;
}
