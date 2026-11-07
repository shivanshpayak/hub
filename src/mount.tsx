import { StrictMode, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

/*
 * Each hub page is its own document, so moving between pages used to show
 * the new page for a frame or two before its script drew the top bar: the bar
 * blinked out. Now each page's script tag has blocking="render", so the
 * browser keeps showing the old page until this has run, and this draws the
 * page straight away (flushSync) rather than on React's next tick. The first
 * frame of every page already has the bar.
 */
export function mount(page: ReactNode) {
  const root = createRoot(document.getElementById("root")!);
  flushSync(() => root.render(<StrictMode>{page}</StrictMode>));
}
