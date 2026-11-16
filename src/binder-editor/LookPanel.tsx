import { useEffect, useRef } from "react";
import { imageSrc, TEAM_NAMES, type Look, type PageImage, type PageTheme, type TeamId } from "../binder/content";
import {
  FONTS,
  LOOK_COLORS,
  LOOK_FONTS,
  LOOK_NAMES,
  PLAIN_THEME,
  fontStack,
  loadFont,
  lookOf,
} from "../binder/look";

/*
 * The Look panel: a page's background, colours, fonts and text size, on
 * top of the look it starts from. Changes show on the page straight away and
 * save with the rest of the draft; Publish puts them up.
 */

type ThemeUpdate = (update: (theme: PageTheme) => PageTheme, remember: boolean) => void;

const COLOR_ROWS: { key: keyof PageTheme["colors"]; label: string; hint: string }[] = [
  { key: "text", label: "Text", hint: "Titles, headings and most text" },
  { key: "muted", label: "Soft text", hint: "Intros, write ups and labels" },
  { key: "accent", label: "Accent", hint: "Numbers, lines and highlights" },
  { key: "card", label: "Cards", hint: "Behind cards, stats and menus" },
];

const FONT_ROWS: { key: keyof PageTheme["fonts"]; label: string }[] = [
  { key: "display", label: "Titles and headings" },
  { key: "body", label: "Text" },
  { key: "label", label: "Small labels" },
];

const FIT_LABELS = { screen: "Fill the screen", top: "Across the top", tile: "Repeat" } as const;

const KIND_GROUPS = [
  { kind: "display", label: "Display" },
  { kind: "text", label: "Text" },
  { kind: "mono", label: "Monospace" },
] as const;

export function LookPanel({
  theme: saved,
  team,
  onChange,
  pickImage,
  onClose,
}: {
  theme: PageTheme | undefined;
  team: TeamId;
  onChange: ThemeUpdate;
  pickImage: () => Promise<PageImage | null>;
  onClose: () => void;
}) {
  const theme = saved ?? PLAIN_THEME;
  const look = lookOf(saved, team);
  const own = LOOK_COLORS[look];

  // A slider or colour picker being dragged is one step for Undo
  const burst = useRef<{ key: string; at: number } | null>(null);
  const change = (key: string, update: (theme: PageTheme) => PageTheme) => {
    const now = Date.now();
    const remember = !(burst.current && burst.current.key === key && now - burst.current.at < 900);
    burst.current = { key, at: now };
    onChange(update, remember);
  };

  // Previews show in each chosen font
  useEffect(() => {
    for (const row of FONT_ROWS) loadFont(theme.fonts[row.key]);
  }, [theme.fonts]);

  const background = theme.background;

  async function choosePicture() {
    const image = await pickImage();
    if (!image) return;
    change("background-image", (t) => ({
      ...t,
      background: {
        kind: "image",
        image,
        fit: t.background.kind === "image" ? t.background.fit : "screen",
        fade: t.background.kind === "image" ? t.background.fade : 40,
        color: t.background.kind === "image" ? t.background.color : (t.background.kind === "color" ? t.background.color : own.page),
      },
    }));
  }

  return (
    <aside className="be-drawer" aria-label="Look">
      <div className="be-drawer-head">
        <h2>Look</h2>
        <button type="button" className="be-button be-quiet" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="be-drawer-body">
        <p className="be-hint">
          For {TEAM_NAMES[team]}'s page. Changes show straight away and go up with Publish.
        </p>

        <section className="be-look-section">
          <h3>Start from</h3>
          <div className="be-look-swatches">
            {(["lambda", "gamma"] as Look[]).map((option) => (
              <button
                key={option}
                type="button"
                className="be-swatch"
                aria-pressed={look === option}
                onClick={() =>
                  change("look", (t) => ({ ...t, look: option === team ? null : option }))
                }
              >
                <span
                  className="be-swatch-sample"
                  style={{
                    background: LOOK_COLORS[option].page,
                    color: LOOK_COLORS[option].text,
                    fontFamily: fontStack(LOOK_FONTS[option].display),
                  }}
                >
                  <span style={{ color: LOOK_COLORS[option].accent }}>01</span> Aa
                </span>
                {LOOK_NAMES[option]}
              </button>
            ))}
          </div>
        </section>

        <section className="be-look-section">
          <h3>Background</h3>
          <div className="be-segmented" role="group" aria-label="Background">
            <button
              type="button"
              aria-pressed={background.kind === "look"}
              onClick={() => change("background-kind", (t) => ({ ...t, background: { kind: "look" } }))}
            >
              The look's own
            </button>
            <button
              type="button"
              aria-pressed={background.kind === "color"}
              onClick={() =>
                change("background-kind", (t) => ({
                  ...t,
                  background: {
                    kind: "color",
                    color: t.background.kind === "image" ? t.background.color : own.page,
                  },
                }))
              }
            >
              A colour
            </button>
            <button
              type="button"
              aria-pressed={background.kind === "image"}
              onClick={() =>
                background.kind === "image" ? undefined : void choosePicture()
              }
            >
              A picture
            </button>
          </div>

          {background.kind === "color" && (
            <label className="be-look-row">
              <span>Colour</span>
              <input
                type="color"
                value={background.color}
                onChange={(event) => {
                  const color = event.target.value;
                  change("background-color", (t) => ({ ...t, background: { kind: "color", color } }));
                }}
              />
            </label>
          )}

          {background.kind === "image" && (
            <div className="be-look-picture">
              <div className="be-look-thumb" style={{ backgroundImage: `url("${imageSrc(background.image.file)}")` }} />
              <button type="button" className="be-button be-small" onClick={() => void choosePicture()}>
                Replace picture
              </button>
              <div className="be-segmented" role="group" aria-label="How the picture fits">
                {(Object.keys(FIT_LABELS) as (keyof typeof FIT_LABELS)[]).map((fit) => (
                  <button
                    key={fit}
                    type="button"
                    aria-pressed={background.fit === fit}
                    onClick={() =>
                      change("background-fit", (t) =>
                        t.background.kind === "image" ? { ...t, background: { ...t.background, fit } } : t,
                      )
                    }
                  >
                    {FIT_LABELS[fit]}
                  </button>
                ))}
              </div>
              <label className="be-look-row">
                <span>Fade</span>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={5}
                  value={background.fade}
                  onChange={(event) => {
                    const fade = Number(event.target.value);
                    change("background-fade", (t) =>
                      t.background.kind === "image" ? { ...t, background: { ...t.background, fade } } : t,
                    );
                  }}
                />
                <output>{background.fade}%</output>
              </label>
              <label className="be-look-row">
                <span>Fade colour</span>
                <input
                  type="color"
                  value={background.color}
                  onChange={(event) => {
                    const color = event.target.value;
                    change("background-image-color", (t) =>
                      t.background.kind === "image" ? { ...t, background: { ...t.background, color } } : t,
                    );
                  }}
                />
              </label>
              <p className="be-hint">The fade lays the colour over the picture, so text stays easy to read.</p>
            </div>
          )}
        </section>

        <section className="be-look-section">
          <h3>Colours</h3>
          {COLOR_ROWS.map((row) => {
            const value = theme.colors[row.key];
            return (
              <div key={row.key} className="be-look-row">
                <label>
                  <span>{row.label}</span>
                  <small>{row.hint}</small>
                  <input
                    type="color"
                    value={value ?? own[row.key]}
                    onChange={(event) => {
                      const color = event.target.value;
                      change(`color-${row.key}`, (t) => ({ ...t, colors: { ...t.colors, [row.key]: color } }));
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="be-button be-small"
                  disabled={value === null}
                  onClick={() => change(`color-${row.key}-reset`, (t) => ({ ...t, colors: { ...t.colors, [row.key]: null } }))}
                >
                  Reset
                </button>
              </div>
            );
          })}
        </section>

        <section className="be-look-section">
          <h3>Fonts</h3>
          {FONT_ROWS.map((row) => {
            const value = theme.fonts[row.key];
            const shown = value ?? LOOK_FONTS[look][row.key];
            return (
              <label key={row.key} className="be-look-font">
                <span>{row.label}</span>
                <select
                  value={value ?? ""}
                  onChange={(event) => {
                    const font = event.target.value || null;
                    loadFont(font);
                    change(`font-${row.key}`, (t) => ({ ...t, fonts: { ...t.fonts, [row.key]: font } }));
                  }}
                >
                  <option value="">The look's own ({FONTS[LOOK_FONTS[look][row.key]]?.label})</option>
                  {KIND_GROUPS.map((group) => (
                    <optgroup key={group.kind} label={group.label}>
                      {Object.entries(FONTS)
                        .filter(([, font]) => font.kind === group.kind)
                        .map(([id, font]) => (
                          <option key={id} value={id}>
                            {font.label}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
                <span className="be-font-preview" style={{ fontFamily: fontStack(shown) }}>
                  Lambert Robotics 9477
                </span>
              </label>
            );
          })}
        </section>

        <section className="be-look-section">
          <h3>Text size</h3>
          <label className="be-look-row">
            <span>All text</span>
            <input
              type="range"
              min={80}
              max={140}
              step={5}
              value={Math.round(theme.scale * 100)}
              onChange={(event) => {
                const scale = Number(event.target.value) / 100;
                change("scale", (t) => ({ ...t, scale }));
              }}
            />
            <output>{Math.round(theme.scale * 100)}%</output>
          </label>
          <p className="be-hint">Each piece of text also has its own size, in its toolbar.</p>
        </section>

        <button
          type="button"
          className="be-button"
          disabled={!saved || JSON.stringify(saved) === JSON.stringify({ ...PLAIN_THEME, look: saved.look })}
          onClick={() => change("reset", (t) => ({ ...PLAIN_THEME, look: t.look }))}
        >
          Reset to {LOOK_NAMES[look]}
        </button>
      </div>
    </aside>
  );
}
