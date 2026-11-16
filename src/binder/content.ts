/*
 * What the front page binder shows: each team's page for a season (things
 * placed freely on a canvas) plus the sponsors both teams share.
 *
 * It comes from ManuQueue's server (GET /api/binder, see
 * manu-orders/src/lib/binder.ts, which has the same shapes), and editors
 * change it on the page itself in the hub's Edit Binder page
 * (src/binder-editor).
 */

export type TeamId = "lambda" | "gamma";

export const TEAM_IDS: TeamId[] = ["lambda", "gamma"];

export const TEAM_NAMES: Record<TeamId, string> = { lambda: "Lambda", gamma: "Gamma" };

/** A picture uploaded through /api/binder/images */
export type PageImage = {
  file: string;
  /** What it shows, for screen readers and if it fails to load */
  alt: string;
  caption: string;
};

export function imageSrc(file: string): string {
  return `/api/binder/images/${file}`;
}

export type TextVariant = "title" | "heading" | "subheading" | "lead" | "body" | "label";
export type Align = "left" | "center" | "right";

/** Where a thing sits, in canvas units (the canvas is CANVAS_WIDTH wide, see
 *  layout.ts). Text, cards, stats and sponsors grow to fit what's in them;
 *  their h is how tall they were when last arranged */
export type Placement = { id: string; x: number; y: number; w: number; h: number };

export type TextElement = Placement & {
  type: "text";
  variant: TextVariant;
  text: string;
  /** Small text in front, like the season before the robot's name */
  kicker: string;
  /** Font size in canvas units */
  size: number;
  align: Align;
  /** A heading with a number (01, 02, ...) that's also a link in the top bar */
  numbered: boolean;
};

export type ImageElement = Placement & {
  type: "image";
  image: PageImage | null;
  fit: "contain" | "cover";
  frame: boolean;
};

export type CardElement = Placement & {
  type: "card";
  title: string;
  text: string;
  features: string[];
  images: PageImage[];
  imagePlace: "below" | "above" | "left" | "right";
  imageSize: "small" | "medium" | "large";
};

export type StatsElement = Placement & {
  type: "stats";
  stats: { label: string; value: string }[];
};

export type SponsorsElement = Placement & { type: "sponsors"; title: string; text: string };

export type PageElement = TextElement | ImageElement | CardElement | StatsElement | SponsorsElement;

/** One of the two built-in looks (binder.css) */
export type Look = "lambda" | "gamma";

/**
 * How a page looks, set by editors (look.ts). Anything null keeps the look's
 * own.
 */
export type PageTheme = {
  /** Which look it starts from; null for the team's own */
  look: Look | null;
  background:
    | { kind: "look" }
    | { kind: "color"; color: string }
    | {
        kind: "image";
        image: PageImage;
        /** screen: fills the screen and stays put. top: across the top.
         *  tile: repeats */
        fit: "screen" | "top" | "tile";
        /** How much of `color` is laid over it, 0 to 90 */
        fade: number;
        /** Under and over the picture */
        color: string;
      };
  colors: { text: string | null; muted: string | null; accent: string | null; card: string | null };
  fonts: { display: string | null; body: string | null; label: string | null };
  /** All text, 0.8 to 1.4 */
  scale: number;
};

export type PageContent = {
  /** FRC team number */
  number: number;
  /** Bottom to top: later ones are drawn over earlier ones */
  elements: PageElement[];
  /** Missing until an editor changes the look */
  theme?: PageTheme;
};

export type Sponsor = { name: string; url: string; logo: PageImage | null };

/** live: the front page. past: under Past seasons. draft: not up yet, only
 *  for people who can edit the binder */
export type SeasonState = "live" | "past" | "draft";

export type Binder = {
  season: number;
  state: SeasonState;
  liveSeason: number;
  /** Newest first */
  pastSeasons: number[];
  /** Null for a page that hasn't been published */
  pages: Record<TeamId, PageContent | null>;
  sponsors: Sponsor[];
};

export type BinderLoad =
  | { ok: true; binder: Binder }
  | { ok: false; missing: boolean; error: string };

/** null for the live season. The 2 is the page editor's shape (2026-11-15) */
function cacheKey(season: number | null): string {
  return `hub-binder2:${season ?? "live"}`;
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
    return binder?.pages && "lambda" in binder.pages && "gamma" in binder.pages ? binder : null;
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
    return {
      ok: false,
      missing: false,
      error: "The binder didn't load. Check your connection and try again.",
    };
  }
}
