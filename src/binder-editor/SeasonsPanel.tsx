import { useState } from "react";
import * as api from "./api";
import type { EditorSeason } from "./api";
import {
  cardClass,
  dangerButtonClass,
  hintClass,
  okToLeave,
  primaryButtonClass,
  secondaryButtonClass,
  sectionLabelClass,
} from "./ui";

/*
 * Seasons in the binder editor. One is live (the front page); older ones are
 * under Past seasons; a newer one is being made, and only editors see it
 * until it's made live.
 */

const STATE_LABELS = { live: "Live", past: "Past season", draft: "Not live yet" } as const;

const badgeClass = {
  live: "bg-lambert-maroon text-white",
  past: "bg-black/5 text-black/60 dark:bg-white/10 dark:text-white/60",
  draft: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200",
} as const;

export function SeasonsPanel({
  data,
  onOpen,
  onChanged,
}: {
  data: EditorSeason;
  /** Opens a season in the editor */
  onOpen: (season: number) => void;
  /** Seasons changed: open this one (or the live one) fresh */
  onChanged: (season: number | "live") => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newest = data.seasons[0]?.season ?? data.liveSeason;
  const draftExists = newest > data.liveSeason;
  const next = newest + 1;

  /** Runs a change, then opens `then` fresh. Asks first if anything on
   *  screen is unsaved, since opening fresh drops it */
  async function act<T>(
    run: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    then: (data: T) => number | "live",
  ) {
    if (!okToLeave()) return;
    setBusy(true);
    setError(null);
    const answer = await run();
    setBusy(false);
    if (answer.ok) onChanged(then(answer.data));
    else setError(answer.error);
  }

  function start(from: "copy" | "outline") {
    void act(() => api.startSeason(from), (created) => created.season);
  }

  function makeLive(season: number) {
    const older = season < data.liveSeason;
    const sure = window.confirm(
      older
        ? `Put ${season} back on the front page? ${data.liveSeason} goes back to not being live.`
        : `Put ${season} on the front page? ${data.liveSeason} moves to Past seasons.`,
    );
    if (sure) void act(() => api.makeLive(season), () => season);
  }

  function remove(season: number) {
    const sure = window.confirm(
      `Delete the ${season} season and everything in it? This can't be undone.`,
    );
    if (sure) void act(() => api.deleteSeason(season), () => "live");
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby="seasons-title">
        <div className="space-y-1">
          <h2 id="seasons-title" className={sectionLabelClass}>
            Seasons
          </h2>
          <p className="text-sm text-black/60 dark:text-white/60">
            The live season is the front page. Older ones stay under Past seasons for anyone to see.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        )}
        <ul className="divide-y divide-black/10 rounded-xl border border-black/10 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/5">
          {data.seasons.map(({ season, state }) => (
            <li key={season} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="text-lg font-semibold tabular-nums text-black dark:text-white">
                {season}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass[state]}`}>
                {STATE_LABELS[state]}
              </span>
              <div className="ml-auto flex flex-wrap gap-2">
                {season !== data.season && (
                  <button type="button" className={secondaryButtonClass} onClick={() => onOpen(season)}>
                    Edit
                  </button>
                )}
                {state !== "live" && (
                  <button
                    type="button"
                    className={state === "draft" ? primaryButtonClass : secondaryButtonClass}
                    disabled={busy}
                    onClick={() => makeLive(season)}
                  >
                    Make live
                  </button>
                )}
                {state === "draft" && (
                  <button
                    type="button"
                    className={dangerButtonClass}
                    disabled={busy}
                    onClick={() => remove(season)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="next-season-title">
        <h2 id="next-season-title" className={sectionLabelClass}>
          {draftExists ? "Next season" : `Start the ${next} season`}
        </h2>
        {draftExists ? (
          <p className={hintClass}>
            {newest} is being made. Make it live or delete it before starting another.
          </p>
        ) : (
          <div className={`${cardClass} space-y-3`}>
            <p className="text-sm text-black/70 dark:text-white/70">
              {next} starts hidden, so it can be filled in while {data.liveSeason} stays up. Make it
              live when it's ready, and {data.liveSeason} moves to Past seasons.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryButtonClass}
                disabled={busy}
                onClick={() => start("outline")}
              >
                Start from {data.liveSeason}'s outline
              </button>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={busy}
                onClick={() => start("copy")}
              >
                Copy everything from {data.liveSeason}
              </button>
            </div>
            <p className={hintClass}>
              The outline keeps the team numbers, section names, stat names and sponsors, with no
              cards, robot name or photos. A full copy keeps all of it to edit.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
