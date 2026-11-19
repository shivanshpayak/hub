import { Fragment, type ReactNode } from "react";

/*
 * Bold, italic and underline in the binder's text. They're kept as marks in
 * the text itself, so the server and every page keep treating it as plain
 * text:
 *
 *   **bold**   *italic*   __underline__   \* and \_ for a real * or _
 *
 * Each mark switches its style on or off, so they can come in any order
 * (***both*** is bold and italic). A new line switches everything off; the
 * editor writes marks that way, so a card's features can be split into
 * lines safely. Editors never see the marks: they use Ctrl+B, I and U or
 * the toolbar's buttons, and the editor turns what's on screen back into
 * marks (writeMarks).
 */

export type Run = { text: string; bold: boolean; italic: boolean; underline: boolean };

/** `marked` as runs of text that share a style */
export function readMarks(marked: string): Run[] {
  const runs: Run[] = [];
  let bold = false;
  let italic = false;
  let underline = false;
  let text = "";
  const flush = () => {
    if (text) runs.push({ text, bold, italic, underline });
    text = "";
  };
  for (let i = 0; i < marked.length; i++) {
    const c = marked[i];
    if (c === "\\" && i + 1 < marked.length) {
      text += marked[++i];
    } else if (c === "*") {
      flush();
      if (marked[i + 1] === "*") {
        bold = !bold;
        i++;
      } else {
        italic = !italic;
      }
    } else if (c === "_" && marked[i + 1] === "_") {
      flush();
      underline = !underline;
      i++;
    } else if (c === "\n" && (bold || italic || underline)) {
      flush();
      bold = italic = underline = false;
      text = "\n";
    } else {
      text += c;
    }
  }
  flush();
  return runs;
}

/** The words alone, for places that can't show styles (the top bar) */
export function plainText(marked: string): string {
  return readMarks(marked)
    .map((run) => run.text)
    .join("");
}

/** Marked text, drawn with its styles */
export function Formatted({ text }: { text: string }) {
  return (
    <>
      {readMarks(text).map((run, index) => {
        let node: ReactNode = run.text;
        if (run.underline) node = <u>{node}</u>;
        if (run.italic) node = <em>{node}</em>;
        if (run.bold) node = <strong>{node}</strong>;
        return <Fragment key={index}>{node}</Fragment>;
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  In the editor                                                     */
/* ------------------------------------------------------------------ */

/** Puts `marked` into an element being typed into, as b, i and u elements */
export function fillMarks(node: HTMLElement, marked: string) {
  node.replaceChildren(
    ...readMarks(marked).map((run) => {
      let child: Node = document.createTextNode(run.text);
      for (const [on, tag] of [
        [run.underline, "u"],
        [run.italic, "i"],
        [run.bold, "b"],
      ] as const) {
        if (!on) continue;
        const wrap = document.createElement(tag);
        wrap.append(child);
        child = wrap;
      }
      return child;
    }),
  );
}

type Style = { bold: boolean; italic: boolean; underline: boolean };

/** A text node's style, from the elements around it inside `root`: b, i
 *  and u (and strong, em) or what a browser put in a style attribute. The
 *  closest one that says something about a style wins */
function styleOf(text: Node, root: Node): Style {
  let bold: boolean | undefined;
  let italic: boolean | undefined;
  let underline: boolean | undefined;
  for (let el = text.parentElement; el && el !== root; el = el.parentElement) {
    const tag = el.tagName;
    const { fontWeight, fontStyle, textDecorationLine, textDecoration } = el.style;
    if (bold === undefined) {
      if (tag === "B" || tag === "STRONG") bold = true;
      else if (fontWeight) bold = fontWeight === "bold" || fontWeight === "bolder" || Number(fontWeight) >= 600;
    }
    if (italic === undefined) {
      if (tag === "I" || tag === "EM") italic = true;
      else if (fontStyle) italic = fontStyle === "italic" || fontStyle === "oblique";
    }
    if (underline === undefined) {
      if (tag === "U") underline = true;
      else if (textDecorationLine || textDecoration) {
        underline = `${textDecorationLine} ${textDecoration}`.includes("underline");
      }
    }
  }
  return { bold: bold ?? false, italic: italic ?? false, underline: underline ?? false };
}

const escapeMarks = (text: string) => text.replace(/[\\*_]/g, (c) => `\\${c}`);

/**
 * What's been typed into `root`, as marked text. Line breaks come from new
 * lines, <br> and the blocks a browser makes for a new line; every style is
 * switched off before each one.
 */
export function writeMarks(root: HTMLElement): string {
  const off: Style = { bold: false, italic: false, underline: false };
  let out = "";
  let on = off;
  const switchTo = (next: Style) => {
    if (next.bold !== on.bold) out += "**";
    if (next.italic !== on.italic) out += "*";
    if (next.underline !== on.underline) out += "__";
    on = next;
  };
  const newLine = () => {
    switchTo(off);
    out += "\n";
  };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        (child.nodeValue ?? "").split("\n").forEach((part, index) => {
          if (index > 0) newLine();
          if (!part) return;
          switchTo(styleOf(child, root));
          out += escapeMarks(part);
        });
      } else if (child.nodeName === "BR") {
        newLine();
      } else {
        // A line the browser wrapped in its own block
        if (["DIV", "P", "LI"].includes(child.nodeName) && out && !out.endsWith("\n")) newLine();
        walk(child);
      }
    });
  };
  walk(root);
  switchTo(off);
  return out;
}
