import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ElementType,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  imageSrc,
  type CardElement,
  type ImageElement,
  type PageElement,
  type PageImage,
  type Sponsor,
  type SponsorsElement,
  type StatsElement,
  type TextElement,
} from "./content";
import type { Heading } from "./layout";

/*
 * How each kind of thing on a page is drawn: text, pictures, cards, stats
 * and the sponsors. The front page and the editor draw the same way; in the
 * editor (`edit`), a thing opened with a double click can be typed into
 * where it is.
 */

export type ElementEdit = {
  /** Open for typing */
  active: boolean;
  /** Saves a change to this thing (one step for Undo) */
  change: (patch: Partial<PageElement>) => void;
  /** Where the double click that opened it was, to put the cursor there */
  point: { x: number; y: number } | null;
  /** Asks for pictures and uploads them */
  pickImages: (multiple: boolean) => Promise<PageImage[]>;
};

type ViewProps<T extends PageElement> = {
  element: T;
  edit?: ElementEdit;
};

/** Puts the cursor where the double click was, if it was on `node` */
function placeCaret(node: HTMLElement, point: { x: number; y: number }): boolean {
  const rect = node.getBoundingClientRect();
  if (point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) {
    return false;
  }
  node.focus();
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const range = document.createRange();
  const position = doc.caretPositionFromPoint?.(point.x, point.y);
  if (position) {
    range.setStart(position.offsetNode, position.offset);
  } else {
    const fromPoint = doc.caretRangeFromPoint?.(point.x, point.y);
    if (!fromPoint) return true;
    range.setStart(fromPoint.startContainer, fromPoint.startOffset);
  }
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return true;
}

/**
 * What was typed into `node`, as typed. Not innerText: that follows the
 * page's styles, so Lambda's capitals would be saved as capitals.
 */
function readTyped(node: Node): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) out += child.nodeValue ?? "";
    else if (child.nodeName === "BR") out += "\n";
    else {
      // A line the browser wrapped in its own block
      if (["DIV", "P", "LI"].includes(child.nodeName) && out && !out.endsWith("\n")) out += "\n";
      out += readTyped(child);
    }
  });
  return out;
}

/**
 * Text that can be typed into in the editor. Plain text only; what's typed
 * is saved when the cursor leaves it.
 */
function Editable({
  as: Tag = "span",
  value,
  edit,
  onCommit,
  className,
  placeholder,
  singleLine = false,
  first = false,
}: {
  as?: ElementType;
  value: string;
  edit?: ElementEdit;
  onCommit: (value: string) => void;
  className?: string;
  /** Shown in the editor while it's empty */
  placeholder?: string;
  singleLine?: boolean;
  /** Gets the cursor when the double click wasn't on any text */
  first?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const active = Boolean(edit?.active);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!active || !node) return;
    const point = edit?.point;
    if (point && placeCaret(node, point)) return;
    if (first && !point) {
      node.focus();
      window.getSelection()?.selectAllChildren(node);
    }
    // Only when it opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!active) {
    if (!value && !(edit && placeholder)) return null;
    return (
      <Tag className={className} data-empty={value ? undefined : ""} data-placeholder={placeholder}>
        {value}
      </Tag>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" || (singleLine && event.key === "Enter")) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <Tag
      ref={ref}
      className={`${className ?? ""} bp-editable`}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      onKeyDown={onKeyDown}
      onBlur={(event: { currentTarget: HTMLElement }) => {
        const typed = readTyped(event.currentTarget).replace(/\n+$/, "");
        const next = singleLine ? typed.replace(/\s*\n\s*/g, " ") : typed;
        if (next !== value) onCommit(next);
      }}
    >
      {value}
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/*  Text                                                              */
/* ------------------------------------------------------------------ */

const TEXT_TAGS: Record<TextElement["variant"], ElementType> = {
  title: "h1",
  heading: "h2",
  subheading: "p",
  lead: "p",
  body: "p",
  label: "p",
};

export const TEXT_PLACEHOLDERS: Record<TextElement["variant"], string> = {
  title: "Title",
  heading: "Heading",
  subheading: "Subheading",
  lead: "A line or two of intro",
  body: "Text",
  label: "Label",
};

function TextView({ element, edit, heading }: ViewProps<TextElement> & { heading?: Heading }) {
  const Tag = TEXT_TAGS[element.variant];
  const number = element.variant === "heading" && element.numbered ? heading?.number : undefined;
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
          first
          singleLine={element.variant === "title" || element.variant === "heading"}
          placeholder={TEXT_PLACEHOLDERS[element.variant]}
          onCommit={(text) => edit?.change({ text })}
        />
      </span>
    </Tag>
  );
}

/* ------------------------------------------------------------------ */
/*  Pictures                                                          */
/* ------------------------------------------------------------------ */

/** A picture's description and caption, typed in under it in the editor */
function PictureFields({
  image,
  onChange,
}: {
  image: PageImage;
  onChange: (image: PageImage) => void;
}) {
  return (
    <span className="bp-picture-fields" onPointerDown={(event) => event.stopPropagation()}>
      <input
        className="bp-field"
        defaultValue={image.alt}
        placeholder="What it shows (for screen readers)"
        maxLength={200}
        onBlur={(event) => {
          if (event.currentTarget.value !== image.alt) onChange({ ...image, alt: event.currentTarget.value });
        }}
      />
      <input
        className="bp-field"
        defaultValue={image.caption}
        placeholder="Caption (optional)"
        maxLength={200}
        onBlur={(event) => {
          if (event.currentTarget.value !== image.caption) {
            onChange({ ...image, caption: event.currentTarget.value });
          }
        }}
      />
    </span>
  );
}

function ImageView({ element, edit }: ViewProps<ImageElement>) {
  const { image } = element;
  if (!image) {
    // Nothing for visitors; a spot to fill in the editor
    return edit ? (
      <div className="bp-image bp-image-empty">
        <span>Double click to add a picture</span>
      </div>
    ) : null;
  }
  return (
    <figure className={`bp-image${element.frame ? " bp-framed" : ""}`}>
      <img
        src={imageSrc(image.file)}
        alt={image.alt || image.caption}
        style={{ objectFit: element.fit }}
        draggable={false}
      />
      {image.caption && !edit?.active && <figcaption>{image.caption}</figcaption>}
      {edit?.active && (
        <PictureFields image={image} onChange={(next) => edit.change({ image: next })} />
      )}
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/*  Cards                                                             */
/* ------------------------------------------------------------------ */

function CardView({ element, edit }: ViewProps<CardElement>) {
  const active = Boolean(edit?.active);
  const setImages = (images: PageImage[]) => edit?.change({ images });
  const showFeatures = element.features.length > 0 || active;

  return (
    <article
      className={`bp-card bp-pictures-${element.imagePlace} bp-pictures-${element.imageSize}`}
    >
      <div className="bp-card-body">
        <Editable
          as="h3"
          value={element.title}
          edit={edit}
          first
          singleLine
          placeholder="Card title"
          onCommit={(title) => edit?.change({ title })}
        />
        <Editable
          as="p"
          className="bp-card-text"
          value={element.text}
          edit={edit}
          placeholder="What it does, and why it was built this way"
          onCommit={(text) => edit?.change({ text })}
        />
        {showFeatures && (
          <>
            <h4>Features</h4>
            {active ? (
              <Editable
                as="div"
                className="bp-features bp-features-editing"
                value={element.features.join("\n")}
                edit={edit}
                placeholder="One feature per line"
                onCommit={(text) =>
                  edit?.change({
                    features: text
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
              />
            ) : (
              <ul className="bp-features">
                {element.features.map((feature, index) => (
                  <li key={index}>{feature}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {(element.images.length > 0 || active) && (
        <div className="bp-card-pictures">
          {element.images.map((image, index) => (
            <figure key={`${image.file}-${index}`}>
              <img
                src={imageSrc(image.file)}
                alt={image.alt || image.caption || element.title}
                loading="lazy"
                draggable={false}
              />
              {image.caption && !active && <figcaption>{image.caption}</figcaption>}
              {active && (
                <>
                  <PictureFields
                    image={image}
                    onChange={(next) =>
                      setImages(element.images.map((old, i) => (i === index ? next : old)))
                    }
                  />
                  <span className="bp-picture-actions" onPointerDown={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={index === 0}
                      aria-label="Move picture back"
                      onClick={() => {
                        const next = [...element.images];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        setImages(next);
                      }}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={index === element.images.length - 1}
                      aria-label="Move picture forward"
                      onClick={() => {
                        const next = [...element.images];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        setImages(next);
                      }}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      aria-label="Remove picture"
                      onClick={() => setImages(element.images.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  </span>
                </>
              )}
            </figure>
          ))}
          {active && edit && (
            <button
              type="button"
              className="bp-add-picture"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={async () => {
                const added = await edit.pickImages(true);
                if (added.length > 0) setImages([...element.images, ...added]);
              }}
            >
              Add pictures
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats                                                             */
/* ------------------------------------------------------------------ */

function StatsView({ element, edit }: ViewProps<StatsElement>) {
  const active = Boolean(edit?.active);
  const stats = active ? element.stats : element.stats.filter((s) => s.label && s.value);
  if (stats.length === 0 && !edit) return null;
  const setStat = (index: number, patch: Partial<StatsElement["stats"][number]>) =>
    edit?.change({
      stats: element.stats.map((stat, i) => (i === index ? { ...stat, ...patch } : stat)),
    });

  return (
    <dl className="bp-stats">
      {stats.map((stat, index) => (
        <div key={index} className="bp-stat">
          <Editable
            as="dt"
            value={stat.label}
            edit={edit}
            first={index === 0}
            singleLine
            placeholder="Name"
            onCommit={(label) => setStat(index, { label })}
          />
          <Editable
            as="dd"
            value={stat.value}
            edit={edit}
            singleLine
            placeholder="Value"
            onCommit={(value) => setStat(index, { value })}
          />
          {active && (
            <button
              type="button"
              className="bp-stat-remove"
              aria-label={`Remove ${stat.label || "this stat"}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => edit?.change({ stats: element.stats.filter((_, i) => i !== index) })}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {active && element.stats.length < 12 && (
        <button
          type="button"
          className="bp-stat bp-stat-add"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => edit?.change({ stats: [...element.stats, { label: "", value: "" }] })}
        >
          Add a stat
        </button>
      )}
      {!active && edit && stats.length === 0 && (
        <div className="bp-stat bp-stat-empty">Double click to add stats</div>
      )}
    </dl>
  );
}

/* ------------------------------------------------------------------ */
/*  Sponsors                                                          */
/* ------------------------------------------------------------------ */

function SponsorsView({
  element,
  edit,
  sponsors,
  onEditList,
}: ViewProps<SponsorsElement> & { sponsors: Sponsor[]; onEditList?: () => void }) {
  return (
    <section className="bp-sponsors">
      <Editable
        as="h2"
        value={element.title}
        edit={edit}
        first
        singleLine
        placeholder="Sponsors"
        onCommit={(title) => edit?.change({ title })}
      />
      <Editable
        as="p"
        className="bp-sponsors-text"
        value={element.text}
        edit={edit}
        placeholder="A line of thanks"
        onCommit={(text) => edit?.change({ text })}
      />
      <ul className="bp-sponsor-list">
        {sponsors.map((sponsor, index) => {
          const face = sponsor.logo ? (
            <img src={imageSrc(sponsor.logo.file)} alt={sponsor.name} draggable={false} />
          ) : (
            sponsor.name
          );
          return (
            <li key={index} className="bp-sponsor">
              {sponsor.url && !edit ? (
                <a href={sponsor.url} target="_blank" rel="noopener noreferrer">
                  {face}
                </a>
              ) : (
                face
              )}
            </li>
          );
        })}
        {edit && (
          <li className="bp-sponsor bp-sponsor-edit">
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onEditList}
            >
              {sponsors.length === 0 ? "Add sponsors" : "Edit the list"}
            </button>
          </li>
        )}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ */

export function ElementView({
  element,
  edit,
  heading,
  sponsors,
  onEditSponsors,
}: {
  element: PageElement;
  edit?: ElementEdit;
  /** A numbered heading's number */
  heading?: Heading;
  sponsors: Sponsor[];
  onEditSponsors?: () => void;
}): ReactNode {
  switch (element.type) {
    case "text":
      return <TextView element={element} edit={edit} heading={heading} />;
    case "image":
      return <ImageView element={element} edit={edit} />;
    case "card":
      return <CardView element={element} edit={edit} />;
    case "stats":
      return <StatsView element={element} edit={edit} />;
    case "sponsors":
      return (
        <SponsorsView element={element} edit={edit} sponsors={sponsors} onEditList={onEditSponsors} />
      );
  }
}
