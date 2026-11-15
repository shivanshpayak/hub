import { useEffect, useState, type ReactNode } from "react";

/*
 * Pieces shared by the binder editor's parts, in the hub's ManuQueue look
 * (the Settings page's cards and inputs, with Lambert maroon).
 */

/** An input's look without its width, for inputs sized by their row */
export const inputBaseClass =
  "rounded-md border border-zinc-300/80 bg-white px-3 py-2 text-sm text-black outline-none ring-offset-1 focus:border-lambert-maroon focus:ring-2 focus:ring-lambert-maroon/20 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-white/40 dark:focus:border-lambert-silver/60 dark:focus:ring-lambert-silver/15";

export const inputClass = `w-full ${inputBaseClass}`;

export const cardClass =
  "rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5";

export const primaryButtonClass =
  "rounded-lg bg-lambert-maroon px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-lambert-maroon-deep disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-medium text-black hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10";

export const dangerButtonClass =
  "rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-400/40 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-500/10";

/** A small button's shape, without its text colour */
const smallButtonShape =
  "grid h-8 min-w-8 place-items-center rounded-md border border-black/10 px-2 text-sm hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/15 dark:hover:bg-white/10";

const smallButtonClass = `${smallButtonShape} text-black/70 hover:text-black dark:text-white/70 dark:hover:text-white`;

export const sectionLabelClass =
  "text-sm font-semibold uppercase tracking-wide text-lambert-maroon dark:text-lambert-silver";

export const hintClass = "text-xs text-black/50 dark:text-white/50";

/** A labelled input */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-black dark:text-white">{label}</span>
      {children}
      {hint && <span className={`block ${hintClass}`}>{hint}</span>}
    </label>
  );
}

/** Up and down (or left and right) buttons for moving something in a list */
export function MoveButtons({
  index,
  count,
  name,
  onMove,
  sideways = false,
}: {
  index: number;
  count: number;
  /** What's being moved, for screen readers: "Drivetrain" */
  name: string;
  onMove: (from: number, to: number) => void;
  sideways?: boolean;
}) {
  return (
    <>
      <button
        type="button"
        className={smallButtonClass}
        disabled={index === 0}
        onClick={() => onMove(index, index - 1)}
        aria-label={`Move ${name} ${sideways ? "left" : "up"}`}
        title={sideways ? "Move left" : "Move up"}
      >
        {sideways ? "←" : "↑"}
      </button>
      <button
        type="button"
        className={smallButtonClass}
        disabled={index === count - 1}
        onClick={() => onMove(index, index + 1)}
        aria-label={`Move ${name} ${sideways ? "right" : "down"}`}
        title={sideways ? "Move right" : "Move down"}
      >
        {sideways ? "→" : "↓"}
      </button>
    </>
  );
}

export function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      className={`${smallButtonShape} text-red-700 dark:text-red-300`}
      onClick={onRemove}
      aria-label={`Remove ${name}`}
    >
      Remove
    </button>
  );
}

/** A copy of a list with one item moved */
export function moved<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** "Nov 15, 3:04 PM" */
function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function lastSaved(updatedBy: string, updatedAt: string | null): string {
  if (!updatedAt) return "Not saved yet";
  return updatedBy ? `Saved by ${updatedBy}, ${when(updatedAt)}` : `Saved ${when(updatedAt)}`;
}

/* ------------------------------------------------------------------ */
/*  Unsaved changes                                                   */
/* ------------------------------------------------------------------ */

const unsavedParts = new Set<string>();

function warnBeforeLeaving(event: BeforeUnloadEvent) {
  if (unsavedParts.size === 0) return;
  event.preventDefault();
  event.returnValue = "";
}

if (typeof window !== "undefined") window.addEventListener("beforeunload", warnBeforeLeaving);

/** Marks a part as having unsaved changes, so leaving the page asks first */
export function useUnsaved(id: string, unsaved: boolean) {
  useEffect(() => {
    if (unsaved) unsavedParts.add(id);
    else unsavedParts.delete(id);
    return () => {
      unsavedParts.delete(id);
    };
  }, [id, unsaved]);
}

/** True if leaving what's on screen is fine: nothing unsaved, or the person
 *  said to drop it */
export function okToLeave(): boolean {
  return (
    unsavedParts.size === 0 ||
    window.confirm("Some changes aren't saved yet. Leave without saving them?")
  );
}

/* ------------------------------------------------------------------ */
/*  Saving a part                                                     */
/* ------------------------------------------------------------------ */

/**
 * The draft of one part (a robot, a section, the sponsors) and its saving.
 * `saved` is what the server last said; when it changes (a save, or loading
 * someone else's), the draft starts over from it.
 */
export function usePart<T, S extends T & { rev: number }>(
  id: string,
  saved: S,
  save: (draft: T, rev: number, force: boolean) => Promise<
    { ok: true; value: S } | { ok: false; error: string; current?: S }
  >,
  onSaved: (value: S) => void,
  /** The parts of `saved` that are edited (leaves out rev and who saved) */
  pick: (saved: S) => T,
) {
  const [draft, setDraft] = useState<T>(() => pick(saved));
  const [base, setBase] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theirs, setTheirs] = useState<S | null>(null);

  // A new saved version: start over from it
  if (saved !== base) {
    setBase(saved);
    setDraft(pick(saved));
    setError(null);
    setTheirs(null);
  }

  const unsaved = JSON.stringify(draft) !== JSON.stringify(pick(saved));
  useUnsaved(id, unsaved);

  async function run(force: boolean) {
    setSaving(true);
    const answer = await save(draft, saved.rev, force);
    setSaving(false);
    if (answer.ok) {
      onSaved(answer.value);
    } else {
      setError(answer.error);
      setTheirs(answer.current ?? null);
    }
  }

  return {
    draft,
    setDraft,
    unsaved,
    saving,
    error,
    /** Someone else's newer save, when this one was turned back for it */
    theirs,
    save: () => void run(false),
    saveOverTheirs: () => void run(true),
    loadTheirs: () => theirs && onSaved(theirs),
    undo: () => {
      setDraft(pick(saved));
      setError(null);
      setTheirs(null);
    },
  };
}

/** The bottom of a part: who saved it last, and Save */
export function SaveBar({
  part,
  savedBy,
}: {
  part: Pick<
    ReturnType<typeof usePart>,
    "unsaved" | "saving" | "error" | "theirs" | "save" | "saveOverTheirs" | "loadTheirs" | "undo"
  >;
  savedBy: { updatedBy: string; updatedAt: string | null };
}) {
  return (
    <div className="space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
      {part.error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-200"
        >
          <p>{part.error}</p>
          {part.theirs && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={secondaryButtonClass} onClick={part.loadTheirs}>
                Load their version
              </button>
              <button type="button" className={dangerButtonClass} onClick={part.saveOverTheirs}>
                Save mine over it
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={hintClass} aria-live="polite">
          {part.unsaved ? (
            <span className="font-semibold text-amber-700 dark:text-amber-300">Not saved yet</span>
          ) : (
            lastSaved(savedBy.updatedBy, savedBy.updatedAt)
          )}
        </p>
        <div className="flex gap-2">
          {part.unsaved && (
            <button type="button" className={secondaryButtonClass} onClick={part.undo} disabled={part.saving}>
              Undo changes
            </button>
          )}
          <button
            type="button"
            className={primaryButtonClass}
            onClick={part.save}
            disabled={part.saving || !part.unsaved}
          >
            {part.saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
