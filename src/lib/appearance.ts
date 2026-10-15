/*
 * Light or dark: the phone's setting by default, or the choice in Settings,
 * kept on this phone only. The choice is put on <html data-theme> before the
 * page is drawn, so there is no flash of the wrong colours.
 */

export type AppearanceChoice = "system" | "light" | "dark";

const KEY = "pence.appearance";

/** Runs in <head> before the page is drawn. Kept small and self-contained. */
export const APPEARANCE_SCRIPT = `(function(){try{var c=localStorage.getItem("${KEY}");var d=c==="dark"||(c!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;

export function readAppearance(): AppearanceChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

export function applyAppearance(choice: AppearanceChoice = readAppearance()): void {
  if (typeof document === "undefined") return;
  const dark = choice === "dark" || (choice === "system" && systemDark());
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0e1311" : "#f3f4f0");
}

export function saveAppearance(choice: AppearanceChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // Not kept this time; the phone's setting still applies.
  }
  applyAppearance(choice);
}

/** Follow the phone when it switches between light and dark, unless the person chose one. */
export function followPhone(): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (readAppearance() === "system") applyAppearance("system");
  };
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
