import { useEffect, useLayoutEffect, type CSSProperties } from "react";
import { imageSrc, type Look, type PageTheme, type TeamId } from "./content";

/*
 * A page's look: which of the two built-in looks it starts from (binder.css),
 * and the background, colours, fonts and text size editors have changed. The
 * changes become values for binder.css's custom properties, set on the
 * page's .binder element, so every rule follows them.
 */

export const LOOK_NAMES: Record<Look, string> = { lambda: "Lambda's look", gamma: "Gamma's look" };

/** Each look's own colours, as plain colours for the colour pickers */
export const LOOK_COLORS: Record<
  Look,
  { text: string; muted: string; accent: string; card: string; page: string }
> = {
  lambda: { text: "#f3eee7", muted: "#b9b1a6", accent: "#e2475b", card: "#170a0d", page: "#0e0708" },
  gamma: { text: "#15181c", muted: "#4f555d", accent: "#23282e", card: "#ffffff", page: "#e3e0da" },
};

type FontKind = "display" | "text" | "mono";

/**
 * The fonts editors can pick from: all SIL Open Font License, bundled with
 * the hub (the live site only loads fonts from itself), and each one only
 * fetched when a page uses it.
 */
export const FONTS: Record<
  string,
  { label: string; family: string; kind: FontKind; load?: () => Promise<unknown> }
> = {
  // Already part of the two looks
  "big-shoulders": { label: "Big Shoulders", family: "Big Shoulders Variable", kind: "display" },
  unbounded: { label: "Unbounded", family: "Unbounded Variable", kind: "display" },
  geist: { label: "Geist", family: "Geist Variable", kind: "text" },
  "space-grotesk": { label: "Space Grotesk", family: "Space Grotesk Variable", kind: "text" },
  "geist-mono": { label: "Geist Mono", family: "Geist Mono Variable", kind: "mono" },
  // More to pick from
  oswald: { label: "Oswald", family: "Oswald Variable", kind: "display", load: () => import("@fontsource-variable/oswald") },
  orbitron: { label: "Orbitron", family: "Orbitron Variable", kind: "display", load: () => import("@fontsource-variable/orbitron") },
  "exo-2": { label: "Exo 2", family: "Exo 2 Variable", kind: "display", load: () => import("@fontsource-variable/exo-2") },
  "bricolage-grotesque": {
    label: "Bricolage Grotesque",
    family: "Bricolage Grotesque Variable",
    kind: "display",
    load: () => import("@fontsource-variable/bricolage-grotesque"),
  },
  "playfair-display": {
    label: "Playfair Display",
    family: "Playfair Display Variable",
    kind: "display",
    load: () => import("@fontsource-variable/playfair-display"),
  },
  fraunces: { label: "Fraunces", family: "Fraunces Variable", kind: "display", load: () => import("@fontsource-variable/fraunces") },
  inter: { label: "Inter", family: "Inter Variable", kind: "text", load: () => import("@fontsource-variable/inter") },
  "dm-sans": { label: "DM Sans", family: "DM Sans Variable", kind: "text", load: () => import("@fontsource-variable/dm-sans") },
  manrope: { label: "Manrope", family: "Manrope Variable", kind: "text", load: () => import("@fontsource-variable/manrope") },
  outfit: { label: "Outfit", family: "Outfit Variable", kind: "text", load: () => import("@fontsource-variable/outfit") },
  sora: { label: "Sora", family: "Sora Variable", kind: "text", load: () => import("@fontsource-variable/sora") },
  "jetbrains-mono": {
    label: "JetBrains Mono",
    family: "JetBrains Mono Variable",
    kind: "mono",
    load: () => import("@fontsource-variable/jetbrains-mono"),
  },
};

/** Each look's own fonts */
export const LOOK_FONTS: Record<Look, { display: string; body: string; label: string }> = {
  lambda: { display: "big-shoulders", body: "geist", label: "geist-mono" },
  gamma: { display: "unbounded", body: "space-grotesk", label: "space-grotesk" },
};

/** A look with nothing changed */
export const PLAIN_THEME: PageTheme = {
  look: null,
  background: { kind: "look" },
  colors: { text: null, muted: null, accent: null, card: null },
  fonts: { display: null, body: null, label: null },
  scale: 1,
};

export function fontStack(id: string): string {
  const font = FONTS[id];
  if (!font) return "system-ui, sans-serif";
  const fallback = font.kind === "mono" ? "ui-monospace, monospace" : "system-ui, sans-serif";
  return `"${font.family}", ${fallback}`;
}

/** Fetches a font's stylesheet (the font itself follows when it's used) */
export function loadFont(id: string | null | undefined): void {
  if (id) void FONTS[id]?.load?.();
}

/** `color` let through by `percent` */
function see(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/** Which look a page uses: its own team's, unless an editor picked the other */
export function lookOf(theme: PageTheme | undefined, team: TeamId): Look {
  return theme?.look ?? team;
}

/**
 * A page's look as binder.css's custom properties, for the .binder
 * element's style. `pageColor` is the colour behind it all, when it's
 * changed (for the page's own background past the ends).
 */
export function themeStyle(
  theme: PageTheme | undefined,
  team: TeamId,
): { look: Look; style: CSSProperties; pageColor: string | null } {
  const look = lookOf(theme, team);
  if (!theme) return { look, style: {}, pageColor: null };
  const vars: Record<string, string> = {};
  const { colors, fonts, background } = theme;

  if (colors.text) {
    vars["--b-text"] = colors.text;
    vars["--b-line"] = see(colors.text, 14);
    vars["--logo-line"] = see(colors.text, 55);
    vars["--logo-gear"] = see(colors.text, 42);
  }
  if (colors.muted) vars["--b-muted"] = colors.muted;
  if (colors.accent) {
    vars["--b-accent"] = colors.accent;
    // Lambda's look has a deeper second accent, its maroon
    vars["--b-accent-deep"] =
      look === "lambda" ? `color-mix(in srgb, ${colors.accent} 62%, black)` : colors.accent;
  }
  if (colors.card) {
    // Gamma's cards are frosted: see through
    vars["--b-card"] = look === "gamma" ? see(colors.card, 55) : colors.card;
    vars["--b-panel"] = look === "gamma" ? see(colors.card, 96) : colors.card;
  }

  let pageColor: string | null = null;
  if (background.kind === "color") {
    pageColor = background.color;
    vars["--b-page"] = background.color;
  } else if (background.kind === "image") {
    pageColor = background.color;
    const url = `url("${imageSrc(background.image.file)}")`;
    const fade = see(background.color, background.fade);
    const picture =
      background.fit === "screen"
        ? `${url} center / cover no-repeat fixed`
        : background.fit === "top"
          ? `${url} center top / 100% auto no-repeat`
          : `${url} 0 0 / auto repeat`;
    vars["--b-page"] = `linear-gradient(${fade}, ${fade}) ${background.fit === "screen" ? "fixed" : ""}, ${picture}, ${background.color}`;
  }
  if (pageColor) {
    vars["--b-page-color"] = pageColor;
    vars["--logo-page"] = pageColor;
  }

  if (fonts.display) vars["--b-font-display"] = fontStack(fonts.display);
  if (fonts.body) vars["--b-font-body"] = fontStack(fonts.body);
  if (fonts.label) vars["--b-font-label"] = fontStack(fonts.label);
  if (theme.scale !== 1) vars["--b-scale"] = String(theme.scale);

  return { look, style: vars as CSSProperties, pageColor };
}

/**
 * Puts a page's look on the document: which look (for the page's own
 * background past the ends, binder.css), that background's colour when it's
 * changed, and any fonts it uses.
 */
export function useLook(theme: PageTheme | undefined, team: TeamId) {
  const { look, style, pageColor } = themeStyle(theme, team);
  const fonts = theme?.fonts;
  // Before the first paint, so the page past the ends never flashes
  useLayoutEffect(() => {
    document.documentElement.dataset.binderLook = look;
    document.documentElement.style.backgroundColor = pageColor ?? "";
  }, [look, pageColor]);
  useEffect(() => {
    loadFont(fonts?.display);
    loadFont(fonts?.body);
    loadFont(fonts?.label);
  }, [fonts?.display, fonts?.body, fonts?.label]);
  return { look, style };
}
