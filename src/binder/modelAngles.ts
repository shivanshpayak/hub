import type { ModelAngle } from "./content";

/*
 * Where each model on screen is seen from right now, by its element's id,
 * so the editor's toolbar can save it as where visitors start
 * (the model block's Use this view, blocks/model.tsx). Kept apart from
 * modelScene.ts so the toolbar doesn't load three.js.
 */

const angles = new Map<string, () => ModelAngle | null>();

/** Returns a function that removes it again */
export function watchModelAngle(id: string, read: () => ModelAngle | null): () => void {
  angles.set(id, read);
  return () => {
    if (angles.get(id) === read) angles.delete(id);
  };
}

export function currentModelAngle(id: string): ModelAngle | null {
  return angles.get(id)?.() ?? null;
}
