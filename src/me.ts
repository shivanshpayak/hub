/** Who is signed in, as ManuQueue's /api/auth/me answers */
export type Me = {
  id: string;
  name: string;
  /** Which top bar buttons and settings sections this person sees */
  permissions: Record<string, boolean>;
};

const KEY = "hub-me";

/**
 * The last /api/auth/me answer in this tab (null for signed out), or
 * undefined when there isn't one yet. Kept so the top bar can draw the right
 * buttons in a page's first frame instead of popping them in. It's only for
 * drawing: every page still asks the server, and the server checks
 * everything.
 */
export function rememberedMe(): Me | null | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw === null ? undefined : (JSON.parse(raw) as Me | null);
  } catch {
    return undefined;
  }
}

export function rememberMe(me: Me | null): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(me));
  } catch {
    // Blocked storage: the bar draws its buttons once the server answers
  }
}
