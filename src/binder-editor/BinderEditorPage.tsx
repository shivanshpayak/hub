import { useEffect, useState } from "react";
import { TopBar } from "../TopBar";
import { hubPath } from "../paths";
import { TEAM_IDS, TEAM_NAMES, type TeamId } from "../binder/content";
import * as api from "./api";
import type { EditorSeason, EditorTeam } from "./api";
import { SeasonsPanel } from "./SeasonsPanel";
import { SponsorsEditor } from "./SponsorsEditor";
import { TeamEditor } from "./TeamEditor";
import { inputBaseClass, okToLeave, secondaryButtonClass } from "./ui";

/*
 * Edit Binder: where members change the public binder on the hub's front
 * page (src/binder), with no code. Laid out like Settings: Lambda, Gamma,
 * Sponsors and Seasons down the side. Who can open it is the "hub:binder"
 * row in ManuQueue's permissions.ts, which the server checks on every save.
 */

type Tab = TeamId | "sponsors" | "seasons";

const TABS: { tab: Tab; label: string }[] = [
  { tab: "lambda", label: TEAM_NAMES.lambda },
  { tab: "gamma", label: TEAM_NAMES.gamma },
  { tab: "sponsors", label: "Sponsors" },
  { tab: "seasons", label: "Seasons" },
];

function tabFromHash(): Tab {
  const hash = window.location.hash.slice(1);
  return TABS.find((t) => t.tab === hash)?.tab ?? "lambda";
}

/** ?season= in the address, or the live season */
function seasonFromAddress(): number | "live" {
  const raw = new URLSearchParams(window.location.search).get("season");
  return raw && /^\d{4}$/.test(raw) ? Number(raw) : "live";
}

const SEASON_NOTES = {
  live: (season: number) =>
    `${season} is the live season: each save shows on the front page straight away.`,
  draft: (season: number) =>
    `${season} isn't live yet, so only people who can edit the binder see it. Make it live from Seasons when it's ready.`,
  past: (season: number) =>
    `${season} is a past season. Visitors find it under Past seasons on the front page.`,
};

export function BinderEditorPage() {
  const [season, setSeason] = useState<number | "live">(seasonFromAddress);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<EditorSeason | null>(null);
  const [problem, setProblem] = useState<{ status: number; error: string } | null>(null);
  const [tab, setTab] = useState<Tab>(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void api.loadSeason(season).then((answer) => {
      if (cancelled) return;
      if (answer.ok) {
        setData(answer.data);
        setProblem(null);
      } else {
        setProblem({ status: answer.status, error: answer.error });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [season, attempt]);

  /** Opens a season ("live" for the front page's) fresh from the server */
  function open(next: number | "live", { ask = true } = {}) {
    if (ask && !okToLeave()) return;
    const url = new URL(window.location.href);
    if (next === "live") url.searchParams.delete("season");
    else url.searchParams.set("season", String(next));
    history.replaceState(history.state, "", url);
    setData(null);
    setProblem(null);
    setSeason(next);
    setAttempt((n) => n + 1);
  }

  const updateTeam = (team: TeamId, change: (t: EditorTeam) => EditorTeam) =>
    setData((d) => d && { ...d, teams: { ...d.teams, [team]: change(d.teams[team]) } });

  const viewTeam: TeamId = tab === "gamma" ? "gamma" : "lambda";
  const viewHref = data
    ? `${hubPath("/")}?team=${viewTeam}${data.state === "live" ? "" : `&season=${data.season}`}`
    : hubPath("/");

  const itemClass = (active: boolean) =>
    `whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
      active
        ? "bg-lambert-maroon/10 font-semibold text-lambert-maroon dark:bg-lambert-maroon/40 dark:text-white"
        : "font-medium text-black/60 hover:bg-black/[0.04] hover:text-black dark:text-white/60 dark:hover:bg-white/[0.06] dark:hover:text-white"
    }`;

  return (
    <>
      <TopBar />
      <div className="flex min-h-[calc(100vh-64px)] flex-col sm:flex-row">
        <aside className="shrink-0 border-b border-black/10 bg-black/[0.015] sm:w-56 sm:border-b-0 sm:border-r dark:border-white/10 dark:bg-white/[0.02]">
          <div className="px-3 py-3 sm:sticky sm:top-16 sm:px-3 sm:py-6">
            <nav
              aria-label="Binder parts"
              className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-x-visible"
            >
              {TABS.map((item) => (
                <a
                  key={item.tab}
                  href={`#${item.tab}`}
                  aria-current={tab === item.tab ? "page" : undefined}
                  className={itemClass(tab === item.tab)}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-3 py-4 sm:px-8 sm:py-6">
          <div className="max-w-3xl space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">
                Edit Binder
              </h1>
              {data && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-black/60 dark:text-white/60">
                    Season
                    <select
                      className={inputBaseClass}
                      value={data.season}
                      onChange={(event) => open(Number(event.target.value))}
                    >
                      {data.seasons.map(({ season: s, state }) => (
                        <option key={s} value={s}>
                          {s}
                          {state === "live" ? " (live)" : state === "draft" ? " (not live yet)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <a
                    href={viewHref}
                    target="_blank"
                    rel="noopener"
                    className={secondaryButtonClass}
                  >
                    View page
                  </a>
                </div>
              )}
            </div>

            {problem ? (
              <Problem
                problem={problem}
                onRetry={() => setAttempt((n) => n + 1)}
                onOpenLive={() => open("live", { ask: false })}
              />
            ) : !data ? (
              <p className="text-sm text-black/60 dark:text-white/60" aria-busy="true">
                Loading the binder…
              </p>
            ) : (
              <>
                <p
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    data.state === "live"
                      ? "border-lambert-maroon/20 bg-lambert-maroon/5 text-lambert-maroon-deep dark:border-lambert-silver/20 dark:bg-white/5 dark:text-lambert-silver"
                      : "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-300/20 dark:bg-amber-400/10 dark:text-amber-100"
                  }`}
                >
                  {SEASON_NOTES[data.state](data.season)}
                </p>

                {/* Every tab stays drawn (only hidden), so moving between them
                    keeps unsaved changes */}
                {TEAM_IDS.map((team) => (
                  <div key={team} hidden={tab !== team}>
                    <TeamEditor
                      season={data.season}
                      team={data.teams[team]}
                      onDetailsSaved={(details) => updateTeam(team, (t) => ({ ...t, details }))}
                      onSectionsChanged={(update) =>
                        updateTeam(team, (t) => ({ ...t, sections: update(t.sections) }))
                      }
                    />
                  </div>
                ))}
                <div hidden={tab !== "sponsors"}>
                  <SponsorsEditor
                    key={data.season}
                    season={data.season}
                    sponsors={data.sponsors}
                    onSaved={(sponsors) => setData((d) => d && { ...d, sponsors })}
                  />
                </div>
                <div hidden={tab !== "seasons"}>
                  <SeasonsPanel
                    data={data}
                    onOpen={(s) => open(s)}
                    onChanged={(s) => open(s, { ask: false })}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Problem({
  problem,
  onRetry,
  onOpenLive,
}: {
  problem: { status: number; error: string };
  onRetry: () => void;
  onOpenLive: () => void;
}) {
  return (
    <div
      role="alert"
      className="space-y-3 rounded-xl border border-black/10 bg-white p-4 text-sm text-black dark:border-white/10 dark:bg-white/5 dark:text-white"
    >
      <p>{problem.error}</p>
      {problem.status === 404 ? (
        <button type="button" className={secondaryButtonClass} onClick={onOpenLive}>
          Open the live season
        </button>
      ) : problem.status !== 403 ? (
        <button type="button" className={secondaryButtonClass} onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
