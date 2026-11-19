import {
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type ElementType,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type {
  BlockType,
  ElementOf,
  PageDocument,
  PageElement,
  PageImage,
  PageModel,
  Sponsor,
  TeamId,
} from "../content";
import { Formatted, fillMarks, writeMarks } from "../formatting";
import type { Heading } from "../layout";

/*
 * What a block's file fills in (BlockUI), and the pieces block files share:
 * text that can be typed into where it is (Editable) and toolbar buttons.
 * How to add a kind of block is in README.md here.
 */

/* ------------------------------------------------------------------ */
/*  What a block's file fills in                                      */
/* ------------------------------------------------------------------ */

/** What every block's view can know about the page it's on */
export type PageInfo = {
  /** The sponsors list, shared by both teams */
  sponsors: Sponsor[];
  /** The numbered headings, by id: each one's number and link name */
  headings: ReadonlyMap<string, Heading>;
};

/** In the editor: what a block's view can do while it's open for typing */
export type ElementEdit<E = PageElement> = {
  /** Open for typing (double clicked, or just added) */
  active: boolean;
  /** Saves a change to this thing (one step for Undo) */
  change: (patch: Partial<E>) => void;
  /** Where the double click that opened it was, to put the cursor there */
  point: { x: number; y: number } | null;
  /** Asks for pictures and uploads them */
  pickImages: (multiple: boolean) => Promise<PageImage[]>;
  /** Opens the sponsors list */
  editSponsors: () => void;
};

export type BlockViewProps<E = PageElement> = {
  element: E;
  /** Only in the editor */
  edit?: ElementEdit<E>;
  page: PageInfo;
};

/** What a block's toolbar buttons (and `opening`) can do */
export type ToolActions<E = PageElement> = {
  /** Whose page it is */
  team: TeamId;
  /** Changes it. `continued`: joins the last step for Undo, like the rest of
   *  a colour being dragged around */
  update: (patch: Partial<E>, continued?: boolean) => void;
  /** Its latest copy (an upload takes a while, and it can change or be
   *  deleted meanwhile) */
  latest: () => E | undefined;
  /** Opens it for typing, as a double click does */
  open: () => void;
  /** Asks for pictures and uploads them */
  pickImages: (multiple: boolean) => Promise<PageImage[]>;
  /** Asks for an .stl and uploads it (null if none was picked or it failed,
   *  which the editor has already said) */
  pickModel: () => Promise<PageModel | null>;
  /** Asks for a PDF and uploads it (null the same way) */
  pickFile: () => Promise<PageDocument | null>;
  /** Opens the sponsors list */
  editSponsors: () => void;
};

/** One choice in the editor's Add menu */
export type AddChoice<K extends BlockType> = {
  label: string;
  /** A few words under it */
  hint: string;
  /** A new one for `team`'s page: everything but its id and where it goes,
   *  which the editor picks (the middle of the screen) */
  make: (team: TeamId) => Omit<ElementOf<K>, "id" | "type" | "x" | "y">;
};

/**
 * Everything the hub needs to know about a kind of block, besides what it
 * keeps (that's in ManuQueue's src/lib/binder-blocks.ts).
 */
export type BlockUI<K extends BlockType> = {
  /** How it's drawn, for visitors and in the editor alike */
  View: (props: BlockViewProps<ElementOf<K>>) => ReactNode;
  /** True when its height follows what's in it (text, cards): only its
   *  width can be dragged, and things below move down as it grows. False
   *  when it keeps the size it's given (pictures, models) */
  growsToFit: boolean;
  /** Its choices in the Add menu (text has two: Heading and Text) */
  add: AddChoice<K>[];
  /** Its own buttons, first on the toolbar when it's picked */
  Tools?: (props: { element: ElementOf<K>; actions: ToolActions<ElementOf<K>> }) => ReactNode;
  /**
   * When it's added, double clicked or opened with Enter. Return true when
   * it did something instead of opening for typing, like asking for the
   * picture it doesn't have yet.
   */
  opening?: (element: ElementOf<K>, actions: ToolActions<ElementOf<K>>) => boolean;
  /** A link in the top bar (after the numbered headings) for a block a page
   *  has only one of, and the name the link goes to (#sponsors) */
  topBar?: { anchor: string; label: string };
  /** Some of its text can be bold, italic or underlined (Editable's `rich`):
   *  the toolbar shows B, I and U while it's open */
  formatting?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Typing in place                                                   */
/* ------------------------------------------------------------------ */

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

/** Ctrl (or Cmd on a Mac) with these, while typing into rich text */
const FORMAT_KEYS: Record<string, string> = { b: "bold", i: "italic", u: "underline" };

/**
 * Text that can be typed into in the editor; what's typed is saved when the
 * cursor leaves it. Plain text, unless `rich`: then it can have bold, italic
 * and underline (Ctrl+B, I, U, or the toolbar's buttons), kept as marks in
 * the text (formatting.tsx) and drawn with them for visitors too.
 */
export function Editable({
  as: Tag = "span",
  value,
  edit,
  onCommit,
  className,
  placeholder,
  singleLine = false,
  first = false,
  rich = false,
}: {
  as?: ElementType;
  value: string;
  edit?: { active: boolean; point: { x: number; y: number } | null };
  onCommit: (value: string) => void;
  className?: string;
  /** Shown in the editor while it's empty */
  placeholder?: string;
  singleLine?: boolean;
  /** Gets the cursor when the double click wasn't on any text */
  first?: boolean;
  /** Bold, italic and underline allowed */
  rich?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const active = Boolean(edit?.active);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!active || !node) return;
    if (rich) {
      // Rich text's styles are elements React doesn't know about, so it's
      // filled in here rather than by React
      fillMarks(node, value);
      // b, i and u elements rather than style attributes
      document.execCommand("styleWithCSS", false, "false");
    }
    const point = edit?.point;
    if (point && placeCaret(node, point)) return;
    if (first && !point) {
      node.focus();
      window.getSelection()?.selectAllChildren(node);
    }
    // Only when it opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Rich text React doesn't fill: when what it holds changes while the cursor
  // is elsewhere (a step above it removed, Undo), show the new words
  useLayoutEffect(() => {
    const node = ref.current;
    if (!active || !rich || !node || node === document.activeElement) return;
    if (writeMarks(node) !== value) fillMarks(node, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Keyed, so React starts afresh between showing and typing (rich text's
  // elements are put in by hand while typing)
  if (!active) {
    if (!value && !(edit && placeholder)) return null;
    return (
      <Tag key="shown" className={className} data-empty={value ? undefined : ""} data-placeholder={placeholder}>
        {rich ? <Formatted text={value} /> : value}
      </Tag>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" || (singleLine && event.key === "Enter")) {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (!rich) return;
    const command = FORMAT_KEYS[event.key.toLowerCase()];
    if (command && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
      event.preventDefault();
      document.execCommand(command);
    } else if (event.key === "Enter") {
      // A plain line break, not a new block with the line's styles
      event.preventDefault();
      document.execCommand("insertLineBreak");
    }
  };

  // Pasted text comes in plain, without the styles of where it came from
  const onPaste = (event: ClipboardEvent<HTMLElement>) => {
    if (!rich) return;
    event.preventDefault();
    const pasted = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, singleLine ? pasted.replace(/\s*\n\s*/g, " ") : pasted);
  };

  return (
    <Tag
      key="typing"
      ref={ref}
      className={`${className ?? ""} bp-editable`}
      contentEditable={rich ? "true" : "plaintext-only"}
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onBlur={(event: { currentTarget: HTMLElement }) => {
        const node = event.currentTarget;
        const typed = (rich ? writeMarks(node) : readTyped(node)).replace(/\n+$/, "");
        const next = singleLine ? typed.replace(/\s*\n\s*/g, " ") : typed;
        if (next !== value) onCommit(next);
      }}
    >
      {rich ? null : value}
    </Tag>
  );
}

/** Stops a press on a button inside a block from picking up the block */
export const keepPress = (event: { stopPropagation: () => void }) => event.stopPropagation();

/* ------------------------------------------------------------------ */
/*  Toolbar pieces (styled by the editor's editor.css)                */
/* ------------------------------------------------------------------ */

export function ToolButton({
  children,
  onClick,
  pressed,
  label,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  pressed?: boolean;
  /** For screen readers and as a tooltip, when the button shows a symbol or
   *  a short word */
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

/** A thin line between groups of buttons */
export function ToolDivider() {
  return <span className="be-tool-divider" aria-hidden="true" />;
}

/* ------------------------------------------------------------------ */
/*  Pieces inside an open block                                       */
/* ------------------------------------------------------------------ */

/**
 * A typed field inside an open block, for what isn't shown as text on the
 * page (a link, a caption). Saved when the cursor leaves it or on Enter.
 */
export function BlockField({
  value,
  placeholder,
  onCommit,
  maxLength,
  label,
  autoFocus = false,
  inputMode,
}: {
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
  maxLength?: number;
  /** For screen readers, when the placeholder isn't enough */
  label?: string;
  autoFocus?: boolean;
  inputMode?: "url" | "text";
}) {
  return (
    <input
      className="bp-field"
      defaultValue={value}
      placeholder={placeholder}
      aria-label={label ?? placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      inputMode={inputMode}
      onPointerDown={keepPress}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        const next = event.currentTarget.value.trim();
        if (next !== value) onCommit(next);
      }}
    />
  );
}

/** `list` with the item at `from` moved to `to` */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Move and remove buttons for one of a list inside an open block (a
 *  timeline's steps, a gallery's pictures). `across` for a row of them */
export function RowActions({
  index,
  count,
  name,
  onMove,
  onRemove,
  across = false,
}: {
  index: number;
  count: number;
  /** What one is called, for screen readers ("step") */
  name: string;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  across?: boolean;
}) {
  return (
    <span className="bp-picture-actions bp-row-actions" onPointerDown={keepPress}>
      <button
        type="button"
        disabled={index === 0}
        aria-label={`Move this ${name} ${across ? "back" : "up"}`}
        onClick={() => onMove(index, index - 1)}
      >
        {across ? "←" : "↑"}
      </button>
      <button
        type="button"
        disabled={index === count - 1}
        aria-label={`Move this ${name} ${across ? "forward" : "down"}`}
        onClick={() => onMove(index, index + 1)}
      >
        {across ? "→" : "↓"}
      </button>
      <button type="button" aria-label={`Remove this ${name}`} onClick={() => onRemove(index)}>
        Remove
      </button>
    </span>
  );
}

/** A dashed button at the end of a list inside an open block */
export function AddRow({ children, onAdd }: { children: ReactNode; onAdd: () => void }) {
  return (
    <button type="button" className="bp-row-add" onPointerDown={keepPress} onClick={onAdd}>
      {children}
    </button>
  );
}
