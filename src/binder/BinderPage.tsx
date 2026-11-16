import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
// Lambda's lettering is Big Shoulders and Geist; Gamma's is Unbounded and
// Space Grotesk (all SIL Open Font License)
import "@fontsource-variable/big-shoulders";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/unbounded";
import "@fontsource-variable/space-grotesk";
import "./binder.css";
import { TEAM_NAMES, cachedBinder, loadBinder, type Binder, type PageContent, type TeamId } from "./content";
import { Canvas } from "./Canvas";
import { numberedHeadings } from "./layout";
import { useLook } from "./look";
import { LambertLogo } from "./LambertLogo";
import { TopBar, type ContentsLink } from "../TopBar";
import { hubPath } from "../paths";

/*
 * The hub's front page: the public technical binder, for judges and
 * sponsors. The team logo at the top (LambertLogo.tsx) picks Lambda's page
 * or Gamma's. Each team's look (lettering, colour, background) is in
 * binder.css; what's on the page and where is up to the editors (Edit
 * Binder, src/binder-editor), drawn by Canvas.tsx. The page's numbered
 * headings are links in the top bar.
 *
 * The content comes from ManuQueue's server (content.ts). ?season= in the
 * address opens a past season; Past seasons lists them.
 */

const STORED_TEAM = "hub-binder-team";

function isTeam(value: unknown): value is TeamId {
  return value === "lambda" || value === "gamma";
}

/** ?team= in the address wins (so a link can open either), then the last
 *  one picked on this device, then Lambda */
export function initialTeam(): TeamId {
  const fromAddress = new URLSearchParams(window.location.search).get("team");
  if (isTeam(fromAddress)) return fromAddress;
  try {
    const stored = localStorage.getItem(STORED_TEAM);
    if (isTeam(stored)) return stored;
  } catch {
    // Blocked storage: falls through
  }
  return "lambda";
}

/** Remembers the team picked, and puts it in the address */
export function rememberTeam(team: TeamId) {
  try {
    localStorage.setItem(STORED_TEAM, team);
  } catch {
    // Blocked storage: the address still has it
  }
  const url = new URL(window.location.href);
  url.searchParams.set("team", team);
  history.replaceState(history.state, "", url);
}

/** ?season= in the address, or null for this season's */
function seasonFromAddress(): number | null {
  const raw = new URLSearchParams(window.location.search).get("season");
  return raw && /^\d{4}$/.test(raw) ? Number(raw) : null;
}

/** The front page for a season (null for this season's) and team */
function seasonHref(season: number | null, team: TeamId): string {
  return `${hubPath("/")}?team=${team}${season === null ? "" : `&season=${season}`}`;
}

/** The top bar's links to a page's numbered headings, and its sponsors */
export function pageContents(page: PageContent | null): ContentsLink[] {
  if (!page) return [];
  return [
    ...numberedHeadings(page.elements).map((heading) => ({
      label: heading.title,
      href: `#${heading.anchor}`,
      number: heading.number,
    })),
    ...(page.elements.some((e) => e.type === "sponsors")
      ? [{ label: "Sponsors", href: "#sponsors" }]
      : []),
  ];
}

/** A plain click on a link, which this page handles itself (not one meant
 *  for a new tab) */
function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export function BinderFooter({ numbers }: { numbers?: Record<TeamId, number> }) {
  return (
    <footer className="binder-footer">
      <div className="binder-wrap">
        <p>Lambert Robotics, Lambert High School</p>
        <p>
          {numbers
            ? `FRC Teams ${numbers.lambda} ${TEAM_NAMES.lambda} and ${numbers.gamma} ${TEAM_NAMES.gamma}`
            : `FRC Teams ${TEAM_NAMES.lambda} and ${TEAM_NAMES.gamma}`}
        </p>
      </div>
    </footer>
  );
}

/** Each team's number, from whichever pages have one */
export function teamNumbers(pages: Record<TeamId, PageContent | null>): Record<TeamId, number> | undefined {
  if (!pages.lambda || !pages.gamma) return undefined;
  return { lambda: pages.lambda.number, gamma: pages.gamma.number };
}

type Problem = { missing: boolean; error: string };

export function BinderPage() {
  const [team, setTeam] = useState<TeamId>(initialTeam);
  const [season, setSeason] = useState<number | null>(seasonFromAddress);
  // What this device was last shown, until the server answers
  const [binder, setBinder] = useState<Binder | null>(() => cachedBinder(seasonFromAddress()));
  const [problem, setProblem] = useState<Problem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const page = binder?.pages[team] ?? null;

  useEffect(() => {
    let cancelled = false;
    void loadBinder(season).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setBinder(result.binder);
        setProblem(null);
      } else {
        setProblem(result);
        // No such season: don't leave another one up
        if (result.missing) setBinder(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [season, attempt]);

  // Back and Forward between seasons
  useEffect(() => {
    const onPopState = () => {
      const fromAddress = new URLSearchParams(window.location.search).get("team");
      if (isTeam(fromAddress)) setTeam(fromAddress);
      setSeason(seasonFromAddress());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // The page's look, and the page behind it (seen past the ends when
  // scrolling) to match
  const { look, style } = useLook(page?.theme, team);

  useLayoutEffect(() => {
    const name = TEAM_NAMES[team];
    const past = binder && binder.state !== "live" ? ` ${binder.season}` : "";
    document.title = page
      ? `${name} ${page.number}${past} | Lambert Robotics`
      : `${name} | Lambert Robotics`;
  }, [team, binder, page]);

  // A link to a section (#mechanical) on a first visit: the browser looked
  // for it before the binder arrived, so go there once it's drawn
  const wentToHash = useRef(false);
  useEffect(() => {
    if (!page || wentToHash.current) return;
    wentToHash.current = true;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, [page]);

  // Switches straight away; the logo's gear is the only thing that moves
  function switchTo(next: TeamId) {
    if (next === team) return;
    rememberTeam(next);
    setTeam(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  /** Opens another season (null for this season's) without leaving the page.
   *  The one on screen stays until the new one arrives */
  function openSeason(next: number | null) {
    history.pushState(history.state, "", seasonHref(next, team));
    const cached = cachedBinder(next);
    if (cached) setBinder(cached);
    setProblem(null);
    setSeason(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  return (
    <>
      <TopBar contents={pageContents(page)} />
      <div className="binder" data-look={look} style={style}>
        {/* The team picker. Outside <main>, so it stays put (and its gear keeps
            turning) when the team changes */}
        <div className="binder-wrap binder-logo-wrap">
          <PastSeasons binder={binder} team={team} onOpen={openSeason} />
          <LambertLogo
            team={team}
            onPick={switchTo}
            numbers={binder ? teamNumbers(binder.pages) : undefined}
          />
        </div>

        {binder && binder.state !== "live" && (
          <SeasonNote binder={binder} team={team} onOpen={openSeason} />
        )}

        <main className="binder-wrap binder-main">
          {page && binder ? (
            <Canvas page={page} sponsors={binder.sponsors} />
          ) : problem ? (
            <ProblemNote
              problem={problem}
              team={team}
              onRetry={() => setAttempt((n) => n + 1)}
              onOpen={openSeason}
            />
          ) : binder ? (
            <p className="binder-unpublished">
              {TEAM_NAMES[team]}'s page for {binder.season} isn't up yet.
            </p>
          ) : (
            // Waiting for the server on a first visit: the team's name, so
            // the page isn't empty
            <h1 className="bp-text bp-title bp-waiting" aria-busy="true">
              {TEAM_NAMES[team]}
            </h1>
          )}
        </main>

        <BinderFooter numbers={binder ? teamNumbers(binder.pages) : undefined} />
      </div>
    </>
  );
}

type OpenSeason = (season: number | null) => void;

/** A link to a season that opens it in place */
function SeasonLink({
  season,
  team,
  onOpen,
  current,
  children,
}: {
  season: number | null;
  team: TeamId;
  onOpen: OpenSeason;
  current?: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={seasonHref(season, team)}
      aria-current={current ? "page" : undefined}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        onOpen(season);
      }}
    >
      {children}
    </a>
  );
}

/** Under the logo when the binder shown isn't this season's */
function SeasonNote({ binder, team, onOpen }: { binder: Binder; team: TeamId; onOpen: OpenSeason }) {
  return (
    <div className="binder-wrap">
      <p className="binder-season-note" role="status">
        {binder.state === "draft" ? (
          <>
            <span>
              The {binder.season} season isn't up yet. Only people who can edit the binder see it.
            </span>
            <a href={`${hubPath("/edit-binder/")}?season=${binder.season}&team=${team}`}>Edit it</a>
          </>
        ) : (
          <>
            <span>This is the {binder.season} season.</span>
            <SeasonLink season={null} team={team} onOpen={onOpen}>
              See {binder.liveSeason}
            </SeasonLink>
          </>
        )}
      </p>
    </div>
  );
}

function ProblemNote({
  problem,
  team,
  onRetry,
  onOpen,
}: {
  problem: Problem;
  team: TeamId;
  onRetry: () => void;
  onOpen: OpenSeason;
}) {
  return (
    <section className="binder-problem" role="alert">
      <p>{problem.error}</p>
      {problem.missing ? (
        <p className="binder-problem-action">
          <SeasonLink season={null} team={team} onOpen={onOpen}>
            See this season's binder
          </SeasonLink>
        </p>
      ) : (
        <button type="button" className="binder-past-button binder-problem-action" onClick={onRetry}>
          Try again
        </button>
      )}
    </section>
  );
}

/** Older seasons' binders, newest first */
function PastSeasons({
  binder,
  team,
  onOpen,
}: {
  binder: Binder | null;
  team: TeamId;
  onOpen: OpenSeason;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const seasons = binder?.pastSeasons ?? [];
  const pick = (season: number | null) => {
    setOpen(false);
    onOpen(season);
  };

  return (
    <div className="binder-past" ref={ref}>
      <button
        type="button"
        className="binder-past-button"
        aria-expanded={open}
        aria-controls="binder-past-panel"
        onClick={() => setOpen((isOpen) => !isOpen)}
      >
        Past seasons
      </button>
      {open && (
        <div id="binder-past-panel" className="binder-past-panel">
          {seasons.length === 0 ? (
            <p className="binder-past-empty">There aren't any yet.</p>
          ) : (
            <ul className="binder-past-list">
              {binder && binder.state !== "live" && (
                <li>
                  <SeasonLink season={null} team={team} onOpen={pick}>
                    {binder.liveSeason}, this season
                  </SeasonLink>
                </li>
              )}
              {seasons.map((season) => (
                <li key={season}>
                  <SeasonLink
                    season={season}
                    team={team}
                    onOpen={pick}
                    current={binder?.season === season}
                  >
                    {season}
                  </SeasonLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
