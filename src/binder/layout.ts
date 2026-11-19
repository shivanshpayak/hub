import { uiOf, topBarAnchors } from "./blocks";
import { CANVAS_WIDTH, type PageElement } from "./content";
import { plainText } from "./formatting";

/*
 * How a page's freely placed things are laid out.
 *
 * Each thing has a spot on a canvas CANVAS_WIDTH units wide (the same width
 * on the server, manu-orders/src/lib/binder.ts). On a computer the canvas is
 * drawn at that size and scaled to fit, so everything keeps its place. Below
 * STACK_BELOW pixels it would shrink text too far, so a phone gets
 * everything in one column instead, in reading order.
 *
 * Text, cards, stats and sponsors grow to fit what's in them. When one ends
 * up taller than it was arranged at (a longer write up, another font),
 * whatever was arranged below it moves down by as much, keeping the gap, so
 * nothing ends up underneath it.
 */

export { CANVAS_WIDTH };

/** Narrower than this, the page stacks into one column */
export const STACK_BELOW = 840;

/** Room under the last thing on the page */
export const CANVAS_BOTTOM = 40;

/** Things whose height follows what's in them (text, cards). Pictures and
 *  3D models keep the size they're given. Each kind says (./blocks) */
export function growsToFit(element: PageElement): boolean {
  return uiOf(element).growsToFit;
}

export type Box = { top: number; height: number };

/** Top to bottom, then left to right, by where things were placed */
export function byPlace(a: PageElement, b: PageElement): number {
  return a.y - b.y || a.x - b.x;
}

/**
 * Where each thing really goes, given how tall the ones that grow to fit
 * turned out (`heights`, missing for any not measured yet).
 */
export function layoutElements(
  elements: PageElement[],
  heights: ReadonlyMap<string, number>,
): Map<string, Box> {
  const boxes = new Map<string, Box>();
  const placed: PageElement[] = [];
  for (const element of [...elements].sort(byPlace)) {
    let top = element.y;
    for (const above of placed) {
      const arrangedBottom = above.y + above.h;
      // Only things arranged wholly above this one, and beside it
      if (arrangedBottom > element.y + 0.5) continue;
      if (above.x >= element.x + element.w || element.x >= above.x + above.w) continue;
      const box = boxes.get(above.id)!;
      top = Math.max(top, box.top + box.height + (element.y - arrangedBottom));
    }
    const height = growsToFit(element) ? (heights.get(element.id) ?? element.h) : element.h;
    boxes.set(element.id, { top, height });
    placed.push(element);
  }
  return boxes;
}

/** How tall the canvas needs to be */
export function canvasHeight(boxes: ReadonlyMap<string, Box>): number {
  let bottom = 0;
  for (const box of boxes.values()) bottom = Math.max(bottom, box.top + box.height);
  return Math.ceil(bottom + CANVAS_BOTTOM);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

export type Heading = { id: string; anchor: string; number: string; title: string };

/**
 * The numbered headings, top to bottom: each one's number (01, 02, ...) and
 * the name a link to it uses (#mechanical). These are the top bar's links.
 */
export function numberedHeadings(elements: PageElement[]): Heading[] {
  // The page's own anchors can't be taken
  const used = new Set(["root", "top", ...topBarAnchors()]);
  const headings: Heading[] = [];
  for (const element of [...elements].sort(byPlace)) {
    if (element.type !== "text" || element.variant !== "heading" || !element.numbered) continue;
    // The words alone: the top bar can't show bold or italic
    const title = plainText(element.text);
    const base = slugify(title) || "section";
    let anchor = base;
    for (let n = 2; used.has(anchor); n++) anchor = `${base}-${n}`;
    used.add(anchor);
    headings.push({
      id: element.id,
      anchor,
      number: String(headings.length + 1).padStart(2, "0"),
      title,
    });
  }
  return headings;
}
