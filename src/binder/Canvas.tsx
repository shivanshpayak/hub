import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type { PageContent, PageElement, PageImage, Placement, Sponsor } from "./content";
import { ElementView } from "./Elements";
import {
  CANVAS_WIDTH,
  STACK_BELOW,
  byPlace,
  canvasHeight,
  growsToFit,
  layoutElements,
  numberedHeadings,
  type Box,
} from "./layout";

/*
 * A team's page: everything drawn where it was placed, on a canvas
 * CANVAS_WIDTH units wide that's scaled to fit, or stacked in one column on
 * a phone (layout.ts). The editor (src/binder-editor) passes `editor` to
 * make it editable: click to pick something, drag it or its handles, double
 * click to type into it.
 */

export type CanvasEditor = {
  selectedId: string | null;
  /** The one open for typing */
  editingId: string | null;
  /** Where the double click that opened it was */
  point: { x: number; y: number } | null;
  select: (id: string | null) => void;
  open: (id: string, point: { x: number; y: number }) => void;
  close: () => void;
  /** A finished move or resize (one step for Undo) */
  place: (id: string, place: Partial<Placement>) => void;
  /** A change made by typing into something (one step for Undo) */
  change: (id: string, patch: Partial<PageElement>) => void;
  /** Saves where things really ended up and how tall, after pushing down
   *  (not a step for Undo) */
  settle: (places: Map<string, { y: number; h: number }>) => void;
  pickImages: (multiple: boolean) => Promise<PageImage[]>;
  editSponsors: () => void;
  /** The buttons over the picked thing */
  toolbar: (element: PageElement) => ReactNode;
  /** Room under the last thing, to drop new ones into */
  room: number;
};

type Drag = { id: string; x: number; y: number; w: number; h: number };
type Guide = { axis: "x" | "y"; at: number };
type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_W = 40;
const MIN_H = 24;
/** How close, in screen pixels, an edge has to come to snap */
const SNAP_PX = 6;

/** Moves `start` (with `size`) so one of its edges or its middle lands on a
 *  target, if one is within `reach` */
function snapTo(start: number, size: number, targets: number[], reach: number) {
  let best: { delta: number; at: number } | null = null;
  for (const edge of [start, start + size / 2, start + size]) {
    for (const target of targets) {
      const delta = target - edge;
      if (Math.abs(delta) <= reach && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, at: target };
      }
    }
  }
  return best;
}

/** One edge landing on a target */
function snapEdge(edge: number, targets: number[], reach: number) {
  let best: { value: number; at: number } | null = null;
  for (const target of targets) {
    if (Math.abs(target - edge) <= reach && (!best || Math.abs(target - edge) < Math.abs(best.value - edge))) {
      best = { value: target, at: target };
    }
  }
  return best;
}

export function Canvas({
  page,
  sponsors,
  stacked: forceStack = false,
  editor,
}: {
  page: PageContent;
  sponsors: Sponsor[];
  /** Draw it the phone way whatever the width (the editor's phone view) */
  stacked?: boolean;
  editor?: CanvasEditor;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const [heights, setHeights] = useState<ReadonlyMap<string, number>>(new Map());
  const [drag, setDrag] = useState<Drag | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);
  const [fontsReady, setFontsReady] = useState(false);

  const stacked = forceStack || (!editor && frameWidth !== null && frameWidth < STACK_BELOW);
  const scale = Math.min(1, (frameWidth ?? CANVAS_WIDTH) / CANVAS_WIDTH);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    setFrameWidth(frame.clientWidth);
    const observer = new ResizeObserver(() => setFrameWidth(frame.clientWidth));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // How tall the things that grow to fit really are
  const measure = () => {
    const next = new Map<string, number>();
    for (const [id, node] of nodes.current) next.set(id, node.offsetHeight);
    setHeights((prev) => {
      if (prev.size === next.size && [...next].every(([id, h]) => prev.get(id) === h)) return prev;
      return next;
    });
  };
  useLayoutEffect(() => {
    if (!stacked) measure();
  });
  useEffect(() => {
    if (stacked) return;
    const observer = new ResizeObserver(() => measure());
    for (const node of nodes.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, [stacked, page.elements]);

  const elements = useMemo(
    () => page.elements.map((e) => (drag && e.id === drag.id ? { ...e, ...drag } : e)),
    [page.elements, drag],
  );
  const boxes = useMemo(() => layoutElements(elements, heights), [elements, heights]);
  const headings = useMemo(() => numberedHeadings(page.elements), [page.elements]);
  const headingById = new Map(headings.map((h) => [h.id, h]));
  const height = canvasHeight(boxes) + (editor?.room ?? 0);

  // In the editor, save where things ended up once they've settled (fonts
  // loaded, not mid drag or mid typing), so a move starts from what's seen
  useEffect(() => {
    if (!editor || stacked || !fontsReady || drag || editor.editingId) return;
    const places = new Map<string, { y: number; h: number }>();
    for (const element of page.elements) {
      const box = boxes.get(element.id);
      if (!box) continue;
      const h = growsToFit(element) ? Math.round(box.height) : element.h;
      const y = Math.round(box.top);
      if (Math.abs(y - element.y) > 1 || Math.abs(h - element.h) > 1) places.set(element.id, { y, h });
    }
    if (places.size > 0) editor.settle(places);
  }, [editor, stacked, fontsReady, drag, boxes, page.elements]);

  /* ---------------- Moving and resizing ---------------- */

  /** Edges and middles to snap to: the canvas's and everything else's */
  function targets(movingId: string) {
    const xs = [0, CANVAS_WIDTH / 2, CANVAS_WIDTH];
    const ys: number[] = [];
    for (const element of elements) {
      if (element.id === movingId) continue;
      const box = boxes.get(element.id)!;
      xs.push(element.x, element.x + element.w / 2, element.x + element.w);
      ys.push(box.top, box.top + box.height / 2, box.top + box.height);
    }
    return { xs, ys };
  }

  function follow(event: ReactPointerEvent, onMove: (dx: number, dy: number, e: PointerEvent) => void, onEnd: (moved: boolean) => void) {
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;
      if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 3) return;
      moved = true;
      onMove(dx, dy, e);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onEnd(moved);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function startMove(event: ReactPointerEvent, element: PageElement) {
    if (!editor) return;
    // Typing in it: the pointer is for the text (and mustn't reach the
    // canvas, which would close it)
    if (editor.editingId === element.id) {
      event.stopPropagation();
      return;
    }
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    if (editor.editingId) editor.close();
    editor.select(element.id);
    const box = boxes.get(element.id)!;
    const start = { x: element.x, y: box.top, w: element.w, h: growsToFit(element) ? element.h : element.h };
    const { xs, ys } = targets(element.id);
    const reach = SNAP_PX / scale;
    let last: Drag | null = null;
    follow(
      event,
      (dx, dy, e) => {
        let x = Math.round(start.x + dx);
        let y = Math.round(start.y + dy);
        const lines: Guide[] = [];
        if (!e.altKey) {
          const sx = snapTo(x, start.w, xs, reach);
          if (sx) {
            x += Math.round(sx.delta);
            lines.push({ axis: "x", at: sx.at });
          }
          const sy = snapTo(y, box.height, ys, reach);
          if (sy) {
            y += Math.round(sy.delta);
            lines.push({ axis: "y", at: sy.at });
          }
        }
        x = Math.max(0, Math.min(CANVAS_WIDTH - start.w, x));
        y = Math.max(0, y);
        last = { id: element.id, x, y, w: start.w, h: start.h };
        setDrag(last);
        setGuides(lines);
      },
      (moved) => {
        setDrag(null);
        setGuides([]);
        if (moved && last) editor.place(element.id, { x: last.x, y: last.y });
      },
    );
  }

  function startResize(event: ReactPointerEvent, element: PageElement, handle: Handle) {
    if (!editor || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const box = boxes.get(element.id)!;
    const start = { x: element.x, y: box.top, w: element.w, h: box.height };
    const ratio = start.w / Math.max(1, start.h);
    const { xs, ys } = targets(element.id);
    const reach = SNAP_PX / scale;
    let last: Drag | null = null;
    follow(
      event,
      (dx, dy, e) => {
        let { x, y, w, h } = start;
        const lines: Guide[] = [];
        if (handle.includes("e")) {
          let right = start.x + start.w + dx;
          const snap = e.altKey ? null : snapEdge(right, xs, reach);
          if (snap) {
            right = snap.value;
            lines.push({ axis: "x", at: snap.at });
          }
          w = Math.min(CANVAS_WIDTH - x, Math.max(MIN_W, right - x));
        }
        if (handle.includes("w")) {
          let left = start.x + dx;
          const snap = e.altKey ? null : snapEdge(left, xs, reach);
          if (snap) {
            left = snap.value;
            lines.push({ axis: "x", at: snap.at });
          }
          left = Math.max(0, Math.min(start.x + start.w - MIN_W, left));
          x = left;
          w = start.x + start.w - left;
        }
        if (handle.includes("s")) {
          let bottom = start.y + start.h + dy;
          const snap = e.altKey ? null : snapEdge(bottom, ys, reach);
          if (snap) {
            bottom = snap.value;
            lines.push({ axis: "y", at: snap.at });
          }
          h = Math.max(MIN_H, bottom - y);
        }
        if (handle.includes("n")) {
          let top = start.y + dy;
          const snap = e.altKey ? null : snapEdge(top, ys, reach);
          if (snap) {
            top = snap.value;
            lines.push({ axis: "y", at: snap.at });
          }
          top = Math.max(0, Math.min(start.y + start.h - MIN_H, top));
          y = top;
          h = start.y + start.h - top;
        }
        // A picture's corners keep its shape (Shift to stretch)
        if (element.type === "image" && handle.length === 2 && !e.shiftKey) {
          h = w / ratio;
          if (handle.includes("n")) y = start.y + start.h - h;
        }
        last = {
          id: element.id,
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(w),
          h: Math.round(growsToFit(element) ? element.h : h),
        };
        setDrag(last);
        setGuides(lines);
      },
      (moved) => {
        setDrag(null);
        setGuides([]);
        if (moved && last) editor.place(element.id, { x: last.x, y: last.y, w: last.w, h: last.h });
      },
    );
  }

  /* ---------------- Drawing ---------------- */

  function view(element: PageElement) {
    const active = editor?.editingId === element.id;
    return (
      <ElementView
        element={element}
        sponsors={sponsors}
        heading={headingById.get(element.id)}
        onEditSponsors={editor?.editSponsors}
        edit={
          editor
            ? {
                active,
                change: (patch) => editor.change(element.id, patch),
                point: active ? editor.point : null,
                pickImages: editor.pickImages,
              }
            : undefined
        }
      />
    );
  }

  const anchorFor = (element: PageElement) =>
    headingById.get(element.id)?.anchor ?? (element.type === "sponsors" ? "sponsors" : undefined);

  if (stacked) {
    return (
      <div className="bp-frame" ref={frameRef}>
        <div className="bp-stack">
          {[...page.elements].sort(byPlace).map((element) => (
            <div
              key={element.id}
              id={anchorFor(element)}
              data-id={element.id}
              className={`bp-el bp-el-${element.type}`}
              style={
                element.type === "image"
                  ? { aspectRatio: `${element.w} / ${element.h}`, maxWidth: element.w }
                  : undefined
              }
            >
              {view(element)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const selected = editor?.selectedId ? elements.find((e) => e.id === editor.selectedId) : undefined;
  const selectedBox = selected ? boxes.get(selected.id) : undefined;
  const handles: Handle[] = selected
    ? selected.type === "image"
      ? ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
      : ["e", "w"]
    : [];

  return (
    <div
      className={`bp-frame${editor ? " bp-editing" : ""}`}
      ref={frameRef}
      style={{ height: height * scale }}
    >
      <div
        className="bp-canvas"
        style={{ width: CANVAS_WIDTH, height, transform: `scale(${scale})` }}
        onPointerDown={
          editor
            ? (event) => {
                // Only the canvas's own empty space
                if (event.target !== event.currentTarget) return;
                editor.close();
                editor.select(null);
              }
            : undefined
        }
      >
        {elements.map((element, index) => {
          const box = boxes.get(element.id)!;
          const fits = growsToFit(element);
          return (
            <div
              key={element.id}
              data-id={element.id}
              ref={(node) => {
                if (node && fits) nodes.current.set(element.id, node);
                else nodes.current.delete(element.id);
              }}
              className={[
                "bp-el",
                `bp-el-${element.type}`,
                editor?.selectedId === element.id && "is-selected",
                editor?.editingId === element.id && "is-open",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                left: element.x,
                top: box.top,
                width: element.w,
                height: fits ? undefined : element.h,
                zIndex: index + 1,
              }}
              onPointerDown={editor ? (event) => startMove(event, element) : undefined}
              onDoubleClick={
                editor
                  ? (event) => {
                      event.stopPropagation();
                      editor.open(element.id, { x: event.clientX, y: event.clientY });
                    }
                  : undefined
              }
            >
              {view(element)}
            </div>
          );
        })}
      </div>

      {/* Link targets for the top bar, outside the scaled canvas so the top
          bar's height is kept clear */}
      {elements.map((element) => {
        const anchor = anchorFor(element);
        if (!anchor) return null;
        return (
          <span
            key={`anchor-${element.id}`}
            id={anchor}
            className="bp-anchor"
            style={{ top: boxes.get(element.id)!.top * scale }}
          />
        );
      })}

      {editor && (
        <div className="bp-overlay" aria-hidden={selected ? undefined : true}>
          {guides.map((guide, index) =>
            guide.axis === "x" ? (
              <span key={index} className="bp-guide bp-guide-x" style={{ left: guide.at * scale }} />
            ) : (
              <span key={index} className="bp-guide bp-guide-y" style={{ top: guide.at * scale }} />
            ),
          )}
          {selected && selectedBox && (
            <>
              <span
                className="bp-selection"
                style={{
                  left: selected.x * scale,
                  top: selectedBox.top * scale,
                  width: selected.w * scale,
                  height: selectedBox.height * scale,
                }}
              />
              {editor.editingId !== selected.id &&
                handles.map((handle) => (
                  <span
                    key={handle}
                    className={`bp-handle bp-handle-${handle}`}
                    style={{
                      left: (selected.x + (handle.includes("e") ? selected.w : handle.includes("w") ? 0 : selected.w / 2)) * scale,
                      top: (selectedBox.top + (handle.includes("s") ? selectedBox.height : handle.includes("n") ? 0 : selectedBox.height / 2)) * scale,
                    }}
                    onPointerDown={(event) => startResize(event, selected, handle)}
                  />
                ))}
              {!drag && (
                <div
                  className="bp-toolbar-slot"
                  style={{
                    left: Math.min(selected.x * scale, (frameWidth ?? CANVAS_WIDTH) - 8),
                    top: selectedBox.top * scale,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {editor.toolbar(selected)}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
