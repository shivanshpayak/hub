import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
// Lambda's lettering is Big Shoulders and Geist; Gamma's is Unbounded and
// Space Grotesk (all SIL Open Font License)
import "@fontsource-variable/big-shoulders";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource-variable/unbounded";
import "@fontsource-variable/space-grotesk";
import "./binder.css";
import {
  TEAM_NAMES,
  cachedBinder,
  loadBinder,
  type Binder,
  type BinderSection,
  type Sponsor,
  type TeamBinder,
  type TeamId,
} from "./content";
import { LambertLogo } from "./LambertLogo";
import { TopBar, type ContentsLink } from "../TopBar";
import { hubPath } from "../paths";

/*
 * The hub's front page: the public technical binder, for judges and
 * sponsors. The team logo at the top (LambertLogo.tsx) picks Lambda's
 * binder or Gamma's. Each has its own look (binder.css): same content shape,
 * different lettering, colour and background. The open binder's
 * sections are links in the top bar.
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
function initialTeam(): TeamId {
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

/** ?season= in the address, or null for this season's */
function seasonFromAddress(): number | null {
  const raw = new URLSearchParams(window.location.search).get("season");
  return raw && /^\d{4}$/.test(raw) ? Number(raw) : null;
}

/** The front page for a season (null for this season's) and team */
function seasonHref(season: number | null, team: TeamId): string {
  return `${hubPath("/")}?team=${team}${season === null ? "" : `&season=${season}`}`;
}

/** 01, 02, ... for the section numbers */
function twoDigits(n: number): string {
  return String(n).padStart(2, "0");
}

/** A plain click on a link, which this page handles itself (not one meant
 *  for a new tab) */
function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

type Problem = { missing: boolean; error: string };

export function BinderPage() {
  const [team, setTeam] = useState<TeamId>(initialTeam);
  const [season, setSeason] = useState<number | null>(seasonFromAddress);
  // What this device was last shown, until the server answers
  const [binder, setBinder] = useState<Binder | null>(() => cachedBinder(seasonFromAddress()));
  const [problem, setProblem] = useState<Problem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const teamBinder = binder?.binders[team] ?? null;

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

  // The page behind the binder (seen past the ends when scrolling) matches it
  useLayoutEffect(() => {
    document.documentElement.dataset.binderTeam = team;
    const name = TEAM_NAMES[team];
    const past = binder && binder.state !== "live" ? ` ${binder.season}` : "";
    document.title = teamBinder
      ? `${name} ${teamBinder.number}${past} | Lambert Robotics`
      : `${name} | Lambert Robotics`;
  }, [team, binder, teamBinder]);

  // A link to a section (#mechanical) on a first visit: the browser looked
  // for it before the binder arrived, so go there once it's drawn
  const wentToHash = useRef(false);
  useEffect(() => {
    if (!teamBinder || wentToHash.current) return;
    wentToHash.current = true;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [teamBinder]);

  // Switches straight away; the logo's gear is the only thing that moves
  function switchTo(next: TeamId) {
    if (next === team) return;
    try {
      localStorage.setItem(STORED_TEAM, next);
    } catch {
      // Blocked storage: the address still has it
    }
    const url = new URL(window.location.href);
    url.searchParams.set("team", next);
    history.replaceState(history.state, "", url);
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

  const contents: ContentsLink[] = teamBinder
    ? [
        ...teamBinder.sections.map((section, index) => ({
          label: section.title,
          href: `#${section.id}`,
          number: twoDigits(index + 1),
        })),
        ...(binder && binder.sponsors.length > 0 ? [{ label: "Sponsors", href: "#sponsors" }] : []),
      ]
    : [];

  return (
    <>
      <TopBar contents={contents} />
      <div className="binder" data-team={team}>
        {/* The team picker. Outside <main>, so it stays put (and its gear keeps
            turning) when the team changes */}
        <div className="binder-wrap binder-logo-wrap">
          <PastSeasons binder={binder} team={team} onOpen={openSeason} />
          <LambertLogo
            team={team}
            onPick={switchTo}
            numbers={
              binder
                ? { lambda: binder.binders.lambda.number, gamma: binder.binders.gamma.number }
                : undefined
            }
          />
        </div>

        {binder && binder.state !== "live" && (
          <SeasonNote binder={binder} team={team} onOpen={openSeason} />
        )}

        <main>
          {teamBinder && binder ? (
            <>
              <Hero binder={teamBinder} />
              {teamBinder.sections.map((section, index) => (
                <Section key={section.id} section={section} number={index + 1} />
              ))}
              {binder.sponsors.length > 0 && <Sponsors sponsors={binder.sponsors} />}
            </>
          ) : problem ? (
            <ProblemNote
              problem={problem}
              team={team}
              onRetry={() => setAttempt((n) => n + 1)}
              onOpen={openSeason}
            />
          ) : (
            // Waiting for the server on a first visit: the team's name, so
            // the page isn't empty
            <header className="binder-hero" aria-busy="true">
              <div className="binder-wrap binder-hero-grid">
                <div className="binder-hero-text">
                  <h1 className="binder-title">{TEAM_NAMES[team]}</h1>
                </div>
              </div>
            </header>
          )}
        </main>

        <footer className="binder-footer">
          <div className="binder-wrap">
            <p>Lambert Robotics, Lambert High School</p>
            <p>
              {binder
                ? `FRC Teams ${binder.binders.lambda.number} ${TEAM_NAMES.lambda} and ${binder.binders.gamma.number} ${TEAM_NAMES.gamma}`
                : `FRC Teams ${TEAM_NAMES.lambda} and ${TEAM_NAMES.gamma}`}
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}

function Hero({ binder }: { binder: TeamBinder }) {
  const { robot } = binder;
  return (
    <header className="binder-hero">
      <div className="binder-wrap binder-hero-grid">
        <div className="binder-hero-text">
          <h1 className="binder-title">
            {binder.name}
          </h1>
          <p className="binder-robot">
            <span className="binder-robot-label">{binder.season}</span>
            {robot.name && <span className="binder-robot-name">{robot.name}</span>}
          </p>
          {robot.tagline && <p className="binder-tagline">{robot.tagline}</p>}
        </div>

        {robot.image && (
          <div className="binder-hero-art">
            <img src={robot.image.src} alt={robot.image.alt} />
          </div>
        )}

        {robot.stats.length > 0 && (
          <dl className="binder-stats">
            {robot.stats.map((stat, index) => (
              <div key={index} className="binder-stat">
                <dt>{stat.label}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        )}

      </div>
    </header>
  );
}

function Section({ section, number }: { section: BinderSection; number: number }) {
  const titleId = `${section.id}-title`;
  return (
    <section className="binder-section" id={section.id} aria-labelledby={titleId}>
      <div className="binder-wrap">
        <header className="binder-section-head">
          <span className="binder-section-number" aria-hidden="true">
            {twoDigits(number)}
          </span>
          <div>
            <h2 id={titleId}>{section.title}</h2>
            {section.intro && <p className="binder-section-intro">{section.intro}</p>}
          </div>
        </header>

        <div className="binder-entries">
          {section.entries.map((entry) => (
            <article key={entry.id} id={entry.id} className="binder-entry">
              <h3>{entry.title}</h3>
              {entry.summary && <p className="binder-entry-summary">{entry.summary}</p>}
              {entry.features.length > 0 && (
                <>
                  <h4>Features</h4>
                  <ul className="binder-features">
                    {entry.features.map((feature, featureIndex) => (
                      <li key={featureIndex}>{feature}</li>
                    ))}
                  </ul>
                </>
              )}
              {entry.images.length > 0 && (
                <div className="binder-figures">
                  {entry.images.map((image, imageIndex) => (
                    <figure key={imageIndex}>
                      <img src={image.src} alt={image.alt} loading="lazy" />
                      {image.caption && <figcaption>{image.caption}</figcaption>}
                    </figure>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Sponsors({ sponsors }: { sponsors: Sponsor[] }) {
  return (
    <section className="binder-section binder-sponsors" id="sponsors" aria-labelledby="sponsors-title">
      <div className="binder-wrap">
        <header className="binder-section-head">
          <div>
            <h2 id="sponsors-title">Our sponsors</h2>
            <p className="binder-section-intro">
              Thank you to the companies and families who make both robots possible.
            </p>
          </div>
        </header>
        <ul className="binder-sponsor-list">
          {sponsors.map((sponsor, index) => {
            const face = sponsor.logo ? <img src={sponsor.logo.src} alt={sponsor.name} /> : sponsor.name;
            return (
              <li key={index} className="binder-sponsor">
                {sponsor.url ? (
                  <a href={sponsor.url} target="_blank" rel="noopener noreferrer">
                    {face}
                  </a>
                ) : (
                  face
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
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
            <a href={`${hubPath("/edit-binder/")}?season=${binder.season}`}>Edit it</a>
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
    <section className="binder-section binder-problem" role="alert">
      <div className="binder-wrap">
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
      </div>
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
