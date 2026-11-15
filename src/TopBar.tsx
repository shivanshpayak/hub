import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import "./topbar.css";
// Keeps light or dark current on every page with the bar
import { getTheme } from "./theme";
import { hubPath } from "./paths";
import { rememberMe, rememberedMe, type Me } from "./me";

/**
 * The top bar's buttons, in order. Each names its row in ManuQueue's
 * permission table (manu-orders/src/lib/permissions.ts, the "hub:" rows),
 * which decides who sees it. A new button needs a new row there, or nobody
 * sees it.
 */
const TOP_BAR_BUTTONS: {
  label: string;
  permission: string;
  url: string;
  /** Sign in to the scouting app on the way (see openScouting) */
  scoutingPass?: boolean;
}[] = [
  { label: "ManuQueue", permission: "hub:manuqueue", url: __MANUQUEUE_URL__ },
  { label: "Members", permission: "hub:members", url: hubPath("/members/") },
  { label: "Roles", permission: "hub:roles", url: hubPath("/roles/") },
  {
    label: "Scouting",
    permission: "hub:scouting",
    url: __SCOUTING_URL__,
    scoutingPass: true,
  },
  {
    label: "Membership Toolkit",
    permission: "hub:membership-toolkit",
    url: __MEMTOOLKIT_URL__,
  },
  { label: "Edit Binder", permission: "hub:binder", url: hubPath("/edit-binder/") },
  { label: "Settings", permission: "hub:settings", url: hubPath("/settings/") },
];

/** A link to a part of the page being shown, like the front page's sections */
export type ContentsLink = {
  label: string;
  href: string;
  /** 01, 02, ... in front of the label */
  number?: string;
};

/** 0: everything on the bar. 1: the page's contents in the Menu. 2: all of
 *  it in the Menu */
type Fold = 0 | 1 | 2;

type NavLink = {
  label: string;
  href: string;
  current: boolean;
  onClick?: (event: MouseEvent) => void;
};

function go(url: string) {
  window.location.href = url;
}

/** Whether a link is the page being shown, for the silver bar under it. */
function isCurrent(href: string): boolean {
  const trim = (path: string) => path.replace(/\/+$/, "");
  return trim(href) === trim(window.location.pathname);
}

/**
 * Opens scouting signed in as you. ManuQueue makes a one-hour sign-in pass,
 * which goes after the # so it is never sent to a server; scouting removes it
 * from the address bar straight away. If there is no pass, scouting opens the
 * old way.
 *
 * The light or dark choice goes along too, since scouting is on another site
 * and can't read this one's (scouting's public/theme.js keeps it).
 */
async function openScouting(url: string) {
  const theme = `theme=${getTheme()}`;
  try {
    const res = await fetch("/api/scouting/pass", { method: "POST" });
    if (res.ok) {
      const { pass } = await res.json();
      go(`${url}/#pass=${encodeURIComponent(pass)}&${theme}`);
      return;
    }
  } catch {
    // Opens without a pass below
  }
  go(`${url}/#${theme}`);
}

/** ManuQueue's bug report page, with the page you're on filled in */
function bugReportUrl(): string {
  const { pathname, search, hash } = window.location;
  return `${__MANUQUEUE_URL__}/bugs?page=${encodeURIComponent(pathname + search + hash)}`;
}

/**
 * The bar on every hub page. A page can add its own contents (the front page
 * adds the binder's sections); they sit next to the name.
 */
export function TopBar({ contents = [] }: { contents?: ContentsLink[] }) {
  // undefined while loading, null when signed out. Starts from what this tab
  // last heard (src/me.ts), so the buttons are there in the first frame
  const [me, setMe] = useState<Me | null | undefined>(rememberedMe);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        const fresh: Me | null = res.ok ? await res.json() : null;
        setMe(fresh);
        // Signed in, or plainly signed out; not a passing server error
        if (res.ok || res.status === 401) rememberMe(fresh);
      })
      .catch(() => setMe(null));
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    rememberMe(null);
    go(hubPath("/"));
  }

  const links: NavLink[] = me
    ? TOP_BAR_BUTTONS.filter((button) => me.permissions?.[button.permission]).map(
        (button) => ({
          label: button.label,
          href: button.url,
          current: isCurrent(button.url),
          onClick: button.scoutingPass
            ? (event) => {
                event.preventDefault();
                void openScouting(button.url);
              }
            : undefined,
        }),
      )
    : [];

  // Not on the sign in page itself
  const showSignIn = me === null && !isCurrent(hubPath("/login/"));

  // Everything sits on one row when it fits. When it doesn't, it folds into
  // the Menu in steps: first the page's contents, then the app links and the
  // account too (a phone)
  const rowRef = useRef<HTMLDivElement>(null);
  const [fold, setFold] = useState<Fold>(0);
  // How wide the row needed to be at each step, to unfold when there's room
  const neededWidth = useRef<number[]>([]);
  const rowKey = [
    ...contents.map((link) => link.label),
    ...links.map((link) => link.label),
    me === undefined ? "loading" : (me?.name ?? "signed out"),
  ].join("\n");

  // The links changed: try them all on one row again
  useLayoutEffect(() => setFold(0), [rowKey]);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    // With no contents of its own, a page has nothing to fold first
    const tighter = (step: Fold): Fold => (step === 0 && contents.length > 0 ? 1 : 2);
    const looser = (step: Fold): Fold => (step === 2 && contents.length > 0 ? 1 : 0);
    const fit = () => {
      if (fold < 2 && row.scrollWidth > row.clientWidth) {
        neededWidth.current[fold] = row.scrollWidth;
        setFold(tighter(fold));
      } else if (fold > 0 && row.clientWidth >= neededWidth.current[looser(fold)]) {
        setFold(looser(fold));
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    return () => observer.disconnect();
  }, [fold, rowKey, contents.length]);

  const contentsList = contents.map((link) => (
    <li key={link.href}>
      <a href={link.href} onClick={() => setMenuOpen(false)}>
        {link.number && <span className="hub-contents-number">{link.number}</span>}
        {link.label}
      </a>
    </li>
  ));

  const linkList = links.map((link) => (
    <li key={link.label}>
      <a
        href={link.href}
        aria-current={link.current ? "page" : undefined}
        onClick={link.onClick}
      >
        {link.label}
      </a>
    </li>
  ));

  return (
    <>
      <header
        className={[
          "hub-top-bar",
          me && "is-signed-in",
          fold >= 1 && "is-folded",
          fold === 2 && "is-crowded",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="hub-top-bar-inner" ref={rowRef}>
          <a className="hub-brand" href={hubPath("/")}>
            {/* Team 9477's FRC avatar (from The Blue Alliance), 40 by 40. Swap
                public/lambert-icon.png for the team's new icon when it is ready */}
            <img className="hub-brand-icon" src={hubPath("/lambert-icon.png")} alt="" />
            Lambert Robotics
          </a>

          {contents.length > 0 && (
            <nav className="hub-contents" aria-label="Contents">
              <ul>{contentsList}</ul>
            </nav>
          )}

          {links.length > 0 && (
            <nav className="hub-nav" aria-label="Main">
              <ul>{linkList}</ul>
            </nav>
          )}

          <div className="hub-account">
            {showSignIn && (
              <a className="hub-outline-button" href={hubPath("/login/")}>
                Sign in
              </a>
            )}
            {me && (
              <>
                <span className="hub-account-name">{me.name}</span>
                <button type="button" className="hub-outline-button" onClick={signOut}>
                  Sign out
                </button>
              </>
            )}
          </div>

          {fold >= 1 && (
            <button
              type="button"
              className="hub-outline-button hub-menu-button"
              aria-expanded={menuOpen}
              aria-controls="hub-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="hub-menu-icon" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              Menu
            </button>
          )}
        </div>

        {fold >= 1 && menuOpen && (
          <nav id="hub-mobile-menu" className="hub-mobile-menu" aria-label="Main">
            {fold === 2 && me && <p className="hub-mobile-signed-in">Signed in as {me.name}</p>}
            {contents.length > 0 && <ul>{contentsList}</ul>}
            {fold === 2 && (links.length > 0 || showSignIn || me) && (
              <ul>
                {linkList}
                {showSignIn && (
                  <li>
                    <a href={hubPath("/login/")}>Sign in</a>
                  </li>
                )}
                {me && (
                  <li>
                    <button type="button" onClick={signOut}>
                      Sign out
                    </button>
                  </li>
                )}
              </ul>
            )}
          </nav>
        )}
      </header>
      {/* On every hub page for anyone signed in, like ManuQueue's; reports
          go to ManuQueue's /bugs page with this page filled in */}
      {me && (
        <a
          className="hub-bug-button"
          href={bugReportUrl()}
          // The address can change after drawing (a settings section's #part)
          onClick={(event) => {
            event.currentTarget.href = bugReportUrl();
          }}
        >
          Submit a Bug
        </a>
      )}
    </>
  );
}
