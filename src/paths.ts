/**
 * A hub page's address. On the live site the hub is served by ManuQueue at
 * manuqu.com/hub/, so pages live under /hub/; the dev server serves them at
 * the root. Vite sets BASE_URL to match (see vite.config.ts).
 */
export function hubPath(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, "");
}
