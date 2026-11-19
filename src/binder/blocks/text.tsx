import { useRef, useState, type CSSProperties, type ElementType } from "react";
import { CANVAS_WIDTH, type TeamId, type TextElement } from "../content";
import {
  Editable,
  ToolButton,
  ToolDivider,
  type BlockUI,
  type BlockViewProps,
  type ToolActions,
} from "./kit";

/*
 * Text: a title, heading, subheading, intro, paragraph or label. A heading
 * can be numbered (01, 02, ...), which also makes it a link in the top bar
 * (layout.ts). What it keeps: BLOCKS.text in ManuQueue's
 * src/lib/binder-blocks.ts.
 */

type Variant = TextElement["variant"];

const TAGS: Record<Variant, ElementType> = {
  title: "h1",
  heading: "h2",
  subheading: "p",
  lead: "p",
  body: "p",
  label: "p",
};

const PLACEHOLDERS: Record<Variant, string> = {
  title: "Title",
  heading: "Heading",
  subheading: "Subheading",
  lead: "A line or two of intro",
  body: "Text",
  label: "Label",
};

/** The style menu, in order */
const STYLES: { variant: Variant; label: string }[] = [
  { variant: "title", label: "Title" },
  { variant: "heading", label: "Heading" },
  { variant: "subheading", label: "Subheading" },
  { variant: "lead", label: "Intro" },
  { variant: "body", label: "Text" },
  { variant: "label", label: "Label" },
];

/** A style's starting size for each team, matching its look */
function defaultSize(variant: Variant, team: TeamId): number {
  const gamma = team === "gamma";
  switch (variant) {
    case "title":
      return gamma ? 150 : 200;
    case "heading":
      return gamma ? 52 : 72;
    case "subheading":
      return gamma ? 22 : 28;
    case "label":
      return 13;
    default:
      return 17;
  }
}

/** Lambda's page lines up on the left, Gamma's (its mirror) on the right */
const teamAlign = (team: TeamId) => (team === "gamma" ? ("right" as const) : ("left" as const));

function TextView({ element, edit, page }: BlockViewProps<TextElement>) {
  const Tag = TAGS[element.variant];
  const number =
    element.variant === "heading" && element.numbered ? page.headings.get(element.id)?.number : undefined;
  return (
    <Tag
      className={`bp-text bp-${element.variant} bp-align-${element.align}`}
      // A variable, so a phone can cap it (binder.css)
      style={{ "--size": `${element.size}px` } as CSSProperties}
    >
      {number && (
        <span className="bp-number" aria-hidden="true">
          {number}
        </span>
      )}
      <span className="bp-text-main">
        {element.kicker && (
          <Editable
            className="bp-kicker"
            value={element.kicker}
            edit={edit}
            singleLine
            onCommit={(kicker) => edit?.change({ kicker })}
          />
        )}
        <Editable
          className="bp-text-body"
          value={element.text}
          edit={edit}
          rich
          first
          singleLine={element.variant === "title" || element.variant === "heading"}
          placeholder={PLACEHOLDERS[element.variant]}
          onCommit={(text) => edit?.change({ text })}
        />
      </span>
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar                                                           */
/* ------------------------------------------------------------------ */

// The server's limits (BLOCKS.text's size)
const MIN_SIZE = 8;
const MAX_SIZE = 320;
const clampSize = (size: number) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(size)));

/**
 * A text's size. What's typed stays as typed until the box is left, so the
 * old number can be cleared first; sizes from 8 to 320 show on the page
 * as they're typed, and anything else is brought into that range at the end.
 * One visit to the box is one step for Undo.
 */
function SizeBox({ size, onChange }: { size: number; onChange: (size: number, continued: boolean) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  const changedThisVisit = useRef(false);

  function apply(next: number) {
    onChange(next, changedThisVisit.current);
    changedThisVisit.current = true;
  }

  function finish() {
    if (typed !== null && typed.trim() !== "") {
      const next = clampSize(Number(typed));
      if (Number.isFinite(next) && next !== size) apply(next);
    }
    setTyped(null);
    changedThisVisit.current = false;
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={MIN_SIZE}
      max={MAX_SIZE}
      value={typed ?? String(size)}
      onFocus={(event) => {
        changedThisVisit.current = false;
        event.currentTarget.select();
      }}
      onChange={(event) => {
        const value = event.target.value;
        setTyped(value);
        const next = Math.round(Number(value));
        if (value.trim() !== "" && next >= MIN_SIZE && next <= MAX_SIZE && next !== size) apply(next);
      }}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          // Leaves the box, but keeps the text picked
          event.stopPropagation();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function TextTools({ element, actions }: { element: TextElement; actions: ToolActions<TextElement> }) {
  const setSize = (size: number) => actions.update({ size: clampSize(size) });
  const step = element.size >= 60 ? 8 : element.size >= 24 ? 2 : 1;
  return (
    <>
      <label className="be-tool-select">
        <span className="be-sr">Style</span>
        <select
          value={element.variant}
          onChange={(event) => {
            const variant = event.target.value as Variant;
            actions.update({
              variant,
              size: defaultSize(variant, actions.team),
              numbered: variant === "heading",
            });
          }}
        >
          {STYLES.map((style) => (
            <option key={style.variant} value={style.variant}>
              {style.label}
            </option>
          ))}
        </select>
      </label>
      <ToolButton label="Smaller" onClick={() => setSize(element.size - step)}>
        A−
      </ToolButton>
      <label className="be-tool-number">
        <span className="be-sr">Size</span>
        <SizeBox size={element.size} onChange={(size, continued) => actions.update({ size }, continued)} />
      </label>
      <ToolButton label="Bigger" onClick={() => setSize(element.size + step)}>
        A+
      </ToolButton>
      <ToolDivider />
      {(["left", "center", "right"] as const).map((align) => (
        <ToolButton
          key={align}
          label={`Line up ${align === "center" ? "in the middle" : `on the ${align}`}`}
          pressed={element.align === align}
          onClick={() => actions.update({ align })}
        >
          <span className={`be-align-icon be-align-${align}`} aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </ToolButton>
      ))}
      {element.variant === "heading" && (
        <ToolButton
          pressed={element.numbered}
          label="Number it and put it in the top bar"
          onClick={() => actions.update({ numbered: !element.numbered })}
        >
          01
        </ToolButton>
      )}
      <ToolButton
        pressed={Boolean(element.kicker)}
        label="A small label in front, like the season"
        onClick={() => actions.update({ kicker: element.kicker ? "" : "Label" })}
      >
        Label
      </ToolButton>
    </>
  );
}

export const text: BlockUI<"text"> = {
  View: TextView,
  growsToFit: true,
  formatting: true,
  Tools: TextTools,
  add: [
    {
      label: "Heading",
      hint: "A numbered section, linked in the top bar",
      make: (team) => ({
        variant: "heading",
        text: "",
        kicker: "",
        size: defaultSize("heading", team),
        align: teamAlign(team),
        numbered: true,
        w: CANVAS_WIDTH,
        h: 90,
      }),
    },
    {
      label: "Text",
      hint: "A paragraph",
      make: (team) => ({
        variant: "body",
        text: "",
        kicker: "",
        size: defaultSize("body", team),
        align: teamAlign(team),
        numbered: false,
        w: 560,
        h: 60,
      }),
    },
  ],
};
