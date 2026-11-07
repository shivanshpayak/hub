/*
 * Light or dark for the whole hub, chosen under Settings, Appearance.
 *
 * Stored under the same "theme" key, with the same values, as ManuQueue
 * (manu-orders/src/components/theme-provider.tsx). Live, the hub and
 * ManuQueue are both on manuqu.com, so one choice covers both.
 *
 * public/theme.js applies it before each page draws; this module changes it
 * and keeps it current. Dark mode is the `dark` class on <html> (which the
 * ManuQueue styled pages' Tailwind `dark:` classes read) plus the page's
 * color-scheme (which gives the plain pages the browser's own dark look).
 */

export type Theme = "light" | "dark" | "system";

const KEY = "theme";
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme = getTheme()): void {
  const dark = theme === "dark" || (theme === "system" && darkQuery.matches);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Blocked storage: applies to this page only
  }
  applyTheme(theme);
}

// "System" follows the device as it changes, and a choice made in another
// tab (or in ManuQueue, on the live site) applies here too
darkQuery.addEventListener("change", () => {
  if (getTheme() === "system") applyTheme();
});
window.addEventListener("storage", (event) => {
  if (event.key === KEY) applyTheme();
});
