/*
 * What the front page binder shows: one technical binder per team each
 * season (for judges and sponsors), plus the sponsors both teams share.
 *
 * It comes from ManuQueue's server (GET /api/binder, see
 * manu-orders/src/lib/binder.ts), and members change it from the hub's Edit
 * Binder page (src/binder-editor). The shapes here match what the server
 * sends.
 */

export type TeamId = "lambda" | "gamma";

export const TEAM_IDS: TeamId[] = ["lambda", "gamma"];

export const TEAM_NAMES: Record<TeamId, string> = { lambda: "Lambda", gamma: "Gamma" };

export type BinderImage = {
  src: string;
  /** What the picture shows, for screen readers and if it fails to load */
  alt: string;
  caption?: string;
};

export type BinderStat = { label: string; value: string };

/** One part of the robot or one topic, like the drivetrain or autonomous */
export type BinderEntry = {
  /** For links straight to it (#mechanical-drivetrain), made from its title */
  id: string;
  title: string;
  summary: string;
  features: string[];
  images: BinderImage[];
};

export type BinderSection = {
  /** For links straight to it (#mechanical), made from its title */
  id: string;
  title: string;
  intro: string;
  entries: BinderEntry[];
};

export type TeamBinder = {
  team: TeamId;
  /** Shown big at the top: Lambda or Gamma */
  name: string;
  /** FRC team number */
  number: number;
  season: number;
  robot: {
    name: string;
    tagline: string;
    /** A photo or render of the whole robot */
    image: BinderImage | null;
    stats: BinderStat[];
  };
  sections: BinderSection[];
};

export type Sponsor = { name: string; url?: string; logo?: BinderImage };

/** live: the front page. past: under Past seasons. draft: not up yet, only
 *  for people who can edit the binder */
export type SeasonState = "live" | "past" | "draft";

export type Binder = {
  season: number;
  state: SeasonState;
  liveSeason: number;
  /** Newest first */
  pastSeasons: number[];
  binders: Record<TeamId, TeamBinder>;
  sponsors: Sponsor[];
};

export type BinderLoad =
  | { ok: true; binder: Binder }
  | { ok: false; missing: boolean; error: string };

/** null for the live season */
function cacheKey(season: number | null): string {
  return `hub-binder:${season ?? "live"}`;
}

/**
 * The binder this device was last shown for that season, so the page can
 * draw it straight away while it asks the server for the latest. Drafts are
 * never kept.
 */
export function cachedBinder(season: number | null): Binder | null {
  try {
    const raw = localStorage.getItem(cacheKey(season));
    const binder = raw ? (JSON.parse(raw) as Binder) : null;
    return binder?.binders?.lambda && binder.binders.gamma ? binder : null;
  } catch {
    return null;
  }
}

/** The binder for a season (null for the live one), from the server */
export async function loadBinder(season: number | null): Promise<BinderLoad> {
  try {
    const res = await fetch(season === null ? "/api/binder" : `/api/binder?season=${season}`, {
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        missing: res.status === 404,
        error: data?.error ?? "The binder didn't load. Please try again.",
      };
    }
    const binder = data as Binder;
    if (binder.state !== "draft") {
      try {
        localStorage.setItem(cacheKey(season), JSON.stringify(binder));
      } catch {
        // Blocked or full storage: the next visit waits for the server
      }
    }
    return { ok: true, binder };
  } catch {
    return { ok: false, missing: false, error: "The binder didn't load. Check your connection and try again." };
  }
}
