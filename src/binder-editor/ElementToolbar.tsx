import { useEffect, useReducer, type ReactNode } from "react";
import { uiOf } from "../binder/blocks";
import { ToolButton, ToolDivider, type ToolActions } from "../binder/blocks/kit";
import type { PageElement } from "../binder/content";

/*
 * The buttons over whatever is picked on the page: bold, italic and
 * underline while its text is open (for kinds with `formatting`), its own
 * (each kind's Tools, in src/binder/blocks), then front, back, duplicate and
 * delete, which every kind has.
 */

const FORMATS: { command: string; label: string; face: ReactNode }[] = [
  { command: "bold", label: "Bold (Ctrl+B)", face: <strong>B</strong> },
  { command: "italic", label: "Italic (Ctrl+I)", face: <em>I</em> },
  { command: "underline", label: "Underline (Ctrl+U)", face: <u>U</u> },
];

/** The text being typed into, if it can have bold, italic and underline
 *  (Editable's `rich`, which is contentEditable "true") */
function richTextInUse(): boolean {
  const active = document.activeElement;
  return active instanceof HTMLElement && active.getAttribute("contenteditable") === "true";
}

/**
 * Bold, italic and underline for the selected words. They act on the text
 * being typed into, so a press mustn't take the cursor out of it. Pressed
 * while the cursor is in text with that style; off in text that can't
 * have styles (like a card's title).
 */
function FormatButtons() {
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, []);
  const usable = richTextInUse();
  return (
    <>
      {FORMATS.map(({ command, label, face }) => (
        <button
          key={command}
          type="button"
          className="be-tool be-format"
          aria-label={label}
          title={label}
          aria-pressed={usable && document.queryCommandState(command)}
          disabled={!usable}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            document.execCommand(command);
            refresh();
          }}
        >
          {face}
        </button>
      ))}
    </>
  );
}

export type CommonActions = {
  remove: () => void;
  duplicate: () => void;
  front: () => void;
  back: () => void;
};

export function ElementToolbar({
  element,
  actions,
  common,
  open,
}: {
  element: PageElement;
  actions: ToolActions;
  common: CommonActions;
  /** Open for typing */
  open: boolean;
}) {
  const { Tools, formatting } = uiOf(element);
  return (
    <div className="be-toolbar" role="toolbar" aria-label="Change this">
      {open && formatting && (
        <>
          <FormatButtons />
          <ToolDivider />
        </>
      )}
      {Tools && (
        <>
          {/* Keyed, so nothing half typed carries over to the next thing picked */}
          <Tools key={element.id} element={element} actions={actions} />
          <ToolDivider />
        </>
      )}
      <ToolButton onClick={common.front} label="Bring to front">
        Front
      </ToolButton>
      <ToolButton onClick={common.back} label="Send to back">
        Back
      </ToolButton>
      <ToolButton onClick={common.duplicate} label="Duplicate">
        Copy
      </ToolButton>
      <ToolButton onClick={common.remove} label="Delete">
        Delete
      </ToolButton>
    </div>
  );
}
