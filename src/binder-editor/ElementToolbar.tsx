import type { ReactNode } from "react";
import type { PageElement, TeamId, TextElement } from "../binder/content";

/*
 * The buttons over whatever is picked on the page: its own settings (a
 * text's style and size, a picture's fit, where a card's pictures go), then
 * front, back, duplicate and delete.
 */

export const TEXT_STYLES: { variant: TextElement["variant"]; label: string }[] = [
  { variant: "title", label: "Title" },
  { variant: "heading", label: "Heading" },
  { variant: "subheading", label: "Subheading" },
  { variant: "lead", label: "Intro" },
  { variant: "body", label: "Text" },
  { variant: "label", label: "Label" },
];

/** A style's starting size for each team, matching its look */
export function defaultSize(variant: TextElement["variant"], team: TeamId): number {
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

export type ToolbarActions = {
  team: TeamId;
  update: (patch: Partial<PageElement>) => void;
  remove: () => void;
  duplicate: () => void;
  front: () => void;
  back: () => void;
  open: () => void;
  replaceImage: () => void;
  editSponsors: () => void;
};

function Button({
  children,
  onClick,
  pressed,
  label,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  /** For screen readers, when the button shows a symbol */
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="be-tool"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="be-tool-divider" aria-hidden="true" />;
}

function TextTools({ element, actions }: { element: TextElement; actions: ToolbarActions }) {
  const setSize = (size: number) => actions.update({ size: Math.max(8, Math.min(320, Math.round(size))) });
  const step = element.size >= 60 ? 8 : element.size >= 24 ? 2 : 1;
  return (
    <>
      <label className="be-tool-select">
        <span className="be-sr">Style</span>
        <select
          value={element.variant}
          onChange={(event) => {
            const variant = event.target.value as TextElement["variant"];
            actions.update({
              variant,
              size: defaultSize(variant, actions.team),
              numbered: variant === "heading",
            });
          }}
        >
          {TEXT_STYLES.map((style) => (
            <option key={style.variant} value={style.variant}>
              {style.label}
            </option>
          ))}
        </select>
      </label>
      <Button label="Smaller" onClick={() => setSize(element.size - step)}>
        A−
      </Button>
      <label className="be-tool-number">
        <span className="be-sr">Size</span>
        <input
          type="number"
          min={8}
          max={320}
          value={element.size}
          onChange={(event) => setSize(Number(event.target.value) || element.size)}
        />
      </label>
      <Button label="Bigger" onClick={() => setSize(element.size + step)}>
        A+
      </Button>
      <Divider />
      {(["left", "center", "right"] as const).map((align) => (
        <Button
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
        </Button>
      ))}
      {element.variant === "heading" && (
        <Button
          pressed={element.numbered}
          label="Number it and put it in the top bar"
          onClick={() => actions.update({ numbered: !element.numbered })}
        >
          01
        </Button>
      )}
      <Button
        pressed={Boolean(element.kicker)}
        label="A small label in front, like the season"
        onClick={() => actions.update({ kicker: element.kicker ? "" : "Label" })}
      >
        Label
      </Button>
    </>
  );
}

export function ElementToolbar({ element, actions }: { element: PageElement; actions: ToolbarActions }) {
  return (
    <div className="be-toolbar" role="toolbar" aria-label="Change this">
      {element.type === "text" && <TextTools element={element} actions={actions} />}

      {element.type === "image" && (
        <>
          <Button onClick={actions.replaceImage}>{element.image ? "Replace" : "Add picture"}</Button>
          {element.image && (
            <Button onClick={actions.open} label="Describe it and add a caption">
              Caption
            </Button>
          )}
          <Divider />
          <Button pressed={element.fit === "contain"} onClick={() => actions.update({ fit: "contain" })} label="Show all of the picture">
            Fit
          </Button>
          <Button pressed={element.fit === "cover"} onClick={() => actions.update({ fit: "cover" })} label="Fill the box, cropping the edges">
            Fill
          </Button>
          <Button pressed={element.frame} onClick={() => actions.update({ frame: !element.frame })} label="Frame it in the team's style">
            Frame
          </Button>
        </>
      )}

      {element.type === "card" && (
        <>
          <Button onClick={actions.open}>Edit</Button>
          <Divider />
          <span className="be-tool-caption">Pictures</span>
          {(["above", "below", "left", "right"] as const).map((place) => (
            <Button
              key={place}
              pressed={element.imagePlace === place}
              onClick={() => actions.update({ imagePlace: place })}
              label={`Pictures ${place === "above" ? "above the text" : place === "below" ? "below the text" : `on the ${place}`}`}
            >
              {place === "above" ? "Top" : place === "below" ? "Bottom" : place === "left" ? "Left" : "Right"}
            </Button>
          ))}
          <Divider />
          {(["small", "medium", "large"] as const).map((size) => (
            <Button
              key={size}
              pressed={element.imageSize === size}
              onClick={() => actions.update({ imageSize: size })}
              label={`${size[0].toUpperCase()}${size.slice(1)} pictures`}
            >
              {size === "small" ? "S" : size === "medium" ? "M" : "L"}
            </Button>
          ))}
        </>
      )}

      {element.type === "stats" && <Button onClick={actions.open}>Edit stats</Button>}

      {element.type === "sponsors" && (
        <>
          <Button onClick={actions.editSponsors}>Edit the list</Button>
          <Button onClick={actions.open}>Edit text</Button>
        </>
      )}

      <Divider />
      <Button onClick={actions.front} label="Bring to front">
        Front
      </Button>
      <Button onClick={actions.back} label="Send to back">
        Back
      </Button>
      <Button onClick={actions.duplicate} label="Duplicate">
        Copy
      </Button>
      <Button onClick={actions.remove} label="Delete">
        Delete
      </Button>
    </div>
  );
}
