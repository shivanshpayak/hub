/*
 * What the front page binder shows: each team's page for a season (things
 * placed freely on a canvas) plus the sponsors both teams share.
 *
 * It comes from ManuQueue's server (GET /api/binder, see
 * manu-orders/src/lib/binder.ts), and editors
 * change it on the page itself in the hub's Edit Binder page
 * (src/binder-editor).
 */

import {
  footerWithDefaults,
  withMissingFields,
  type BinderDocument,
  type BinderImage,
  type BinderModel,
  type ElementOf,
  type FooterContent,
  type MODEL_UPS,
  type PageElement,
} from "../../../manu-orders/src/lib/binder-blocks";

export type TeamId = "lambda" | "gamma";

export const TEAM_IDS: TeamId[] = ["lambda", "gamma"];

export const TEAM_NAMES: Record<TeamId, string> = { lambda: "Lambda", gamma: "Gamma" };

/*
 * What each kind of thing on a page keeps (text, pictures, 3D models, cards,
 * stats, sponsors) is described once, in ManuQueue's
 * src/lib/binder-blocks.ts, which its server checks every save against. The
 * hub is built next to it, so it reads the same file. How each kind looks
 * is in ./blocks/.
 */
export {
  BINDER_FILE_MAX_BYTES,
  BLOCKS,
  CANVAS_WIDTH,
  YOUTUBE_ID,
  parseLink,
  DEFAULT_FOOTER,
  FILE_TEXT_LIMITS,
  FOOTER_MAX_LINKS,
  withMissingFields,
  type FooterContent,
  MODEL_UPS,
  perPageLimit,
  roomFor,
  type BlockFields,
  type BlockType,
  type ElementOf,
  type PageElement,
  type Placement,
} from "../../../manu-orders/src/lib/binder-blocks";

/** A picture uploaded through /api/binder/images */
export type PageImage = BinderImage;

export function imageSrc(file: string): string {
  return `/api/binder/images/${file}`;
}

/** A 3D model uploaded through /api/binder/models: an .stl the editor
 *  packed down first (modelFormat.ts) */
export type PageModel = BinderModel;

export function modelSrc(file: string): string {
  return `/api/binder/models/${file}`;
}

/** A PDF uploaded through /api/binder/files */
export type PageDocument = BinderDocument;

/** Where a PDF opens, saved under the name it was uploaded with */
export function documentSrc(document: PageDocument): string {
  return `/api/binder/files/${document.file}?name=${encodeURIComponent(document.name)}`;
}

/** Which way is up in a model's file. CAD programs differ, so editors pick */
export type ModelUp = (typeof MODEL_UPS)[number];

/** Where a model is first seen from: degrees around it and down from
 *  straight above, and how close (1 just fits it in its box) */
export type ModelAngle = { yaw: number; pitch: number; zoom: number };

/** A little to one side and above. The server's default too */
export const MODEL_START_ANGLE: ModelAngle = { yaw: 35, pitch: 65, zoom: 1 };

export type TextElement = ElementOf<"text">;
export type ImageElement = ElementOf<"image">;
export type ModelElement = ElementOf<"model">;
export type CardElement = ElementOf<"card">;
export type StatsElement = ElementOf<"stats">;
export type SponsorsElement = ElementOf<"sponsors">;

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
  /** Under both pages, in every season: a line about the team, a contact
   *  email and links */
  footer: FooterContent;
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
    return binder?.pages && "lambda" in binder.pages && "gamma" in binder.pages
      ? withDefaults(binder)
      : null;
  } catch {
    return null;
  }
}

/** A binder kept on this device before something was added to it (the
 *  footer, a field on a kind of block), filled in */
function withDefaults(binder: Binder): Binder {
  const fill = (page: PageContent | null) =>
    page && { ...page, elements: withMissingFields(page.elements) };
  return {
    ...binder,
    pages: { lambda: fill(binder.pages.lambda), gamma: fill(binder.pages.gamma) },
    footer: footerWithDefaults(binder.footer),
  };
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
