import { useEffect, useState, type MouseEvent } from "react";
import "./topbar.css";
// Keeps light or dark current on every page with the bar
import "./theme";
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
  { label: "Settings", permission: "hub:settings", url: hubPath("/settings/") },
];

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
 */
async function openScouting(url: string) {
  try {
    const res = await fetch("/api/scouting/pass", { method: "POST" });
    if (res.ok) {
      const { pass } = await res.json();
      go(`${url}/#pass=${encodeURIComponent(pass)}`);
      return;
    }
  } catch {
    // Opens without a pass below
  }
  go(url);
}

export function TopBar() {
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
    <header className={me ? "hub-top-bar is-signed-in" : "hub-top-bar"}>
      <div className="hub-top-bar-inner">
        <a className="hub-brand" href={hubPath("/")}>
          {/* Team 9477's FRC avatar (from The Blue Alliance), 40 by 40. Swap
              public/lambert-icon.png for the team's new icon when it is ready */}
          <img className="hub-brand-icon" src={hubPath("/lambert-icon.png")} alt="" />
          Lambert Robotics
        </a>

        {links.length > 0 && (
          <nav className="hub-nav" aria-label="Main">
            <ul>{linkList}</ul>
          </nav>
        )}

        <div className="hub-account">
          {/* Not on the sign in page itself */}
          {me === null && !isCurrent(hubPath("/login/")) && (
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

        {me && (
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

      {me && menuOpen && (
        <nav id="hub-mobile-menu" className="hub-mobile-menu" aria-label="Main">
          <p className="hub-mobile-signed-in">Signed in as {me.name}</p>
          <ul>
            {linkList}
            <li>
              <button type="button" onClick={signOut}>
                Sign out
              </button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
