import { useEffect, useState, type ReactNode } from "react";
import { TopBar } from "../TopBar";
import { hubPath } from "../paths";
import { getTheme, setTheme, type Theme } from "../theme";
import { NotificationSettings } from "./NotificationSettings";
import { PasswordSettings } from "./PasswordSettings";
import { MemberPins } from "./MemberPins";
import { rememberedMe } from "../me";

/*
 * Copied from ManuQueue's settings (its layout, sidebar, section heading and
 * theme picker). Appearance, Notifications, Password, Confidential (Admins
 * only: everyone's password) and Support live here.
 * Team, Budget and Trash are still ManuQueue's pages, linked from the sidebar
 * until each one moves over.
 */

type Me = { permissions: Record<string, boolean> };

type Section = "appearance" | "notifications" | "password" | "confidential" | "support";

const SECTIONS: Section[] = [
  "appearance",
  "notifications",
  "password",
  "confidential",
  "support",
];

type NavItem =
  | { kind: "here"; section: Section; label: string }
  | { kind: "manuqueue"; path: string; label: string };

function sectionFromHash(): Section {
  const hash = window.location.hash.slice(1);
  return SECTIONS.find((s) => s === hash) ?? "appearance";
}

const THEME_OPTIONS: { value: Theme; label: string; icon: string; description: string }[] = [
  { value: "light", label: "Light", icon: "☀️", description: "Always use the light theme" },
  { value: "dark", label: "Dark", icon: "🌙", description: "Always use the dark theme" },
  {
    value: "system",
    label: "System",
    icon: "💻",
    description: "Follow your device's system theme",
  },
];

/** ManuQueue's theme picker. The choice covers the whole hub (src/theme.ts). */
function ThemeSettings() {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {THEME_OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => {
              setTheme(opt.value);
              setThemeState(opt.value);
            }}
            aria-pressed={active}
            className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${
              active
                ? "border-lambert-maroon bg-lambert-maroon text-white"
                : "border-black/15 bg-white text-black hover:border-black/30 hover:bg-black/5 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30 dark:hover:bg-white/10"
            }`}
          >
            <span className="text-2xl">{opt.icon}</span>
            <div>
              <p className="font-semibold">{opt.label}</p>
              <p
                className={`text-sm ${
                  active ? "text-white/75" : "text-black/50 dark:text-white/50"
                }`}
              >
                {opt.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** ManuQueue's section wrapper: a small heading and an optional line under it. */
function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-lambert-maroon dark:text-lambert-silver">
          {title}
        </h2>
        {description ? (
          <p className="text-sm text-black/60 dark:text-white/60">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsPage() {
  // What this tab last heard, so Team and Trash are there in the first frame
  const [me, setMe] = useState<Me | null>(() => rememberedMe() ?? null);
  const [section, setSection] = useState<Section>(sectionFromHash);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(async (res) => {
        // Like ManuQueue: settings need a signed-in account
        if (res.status === 401) return window.location.replace(hubPath("/login/"));
        setMe(res.ok ? await res.json() : { permissions: {} });
      })
      .catch(() => setMe({ permissions: {} }));

    const onHash = () => setSection(sectionFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Team and Trash only for those who can open them, as in ManuQueue
  const can = (key: string) => Boolean(me?.permissions?.[key]);
  const items: NavItem[] = [
    { kind: "here", section: "appearance", label: "Appearance" },
    { kind: "here", section: "notifications", label: "Notifications" },
    { kind: "here", section: "password", label: "Password" },
    ...(can("password:view-member-pins")
      ? [{ kind: "here", section: "confidential", label: "Confidential" } as const]
      : []),
    ...(can("team:manage")
      ? [{ kind: "manuqueue", path: "/settings/team", label: "Team" } as const]
      : []),
    { kind: "manuqueue", path: "/settings/budget", label: "Budget" },
    ...(can("page:trash")
      ? [{ kind: "manuqueue", path: "/settings/trash", label: "Trash" } as const]
      : []),
    { kind: "here", section: "support", label: "Support" },
  ];

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
              aria-label="Settings sections"
              className="flex gap-1 overflow-x-auto sm:flex-col sm:overflow-x-visible"
            >
              {items.map((item) =>
                item.kind === "here" ? (
                  <a
                    key={item.label}
                    href={`#${item.section}`}
                    aria-current={section === item.section ? "page" : undefined}
                    className={itemClass(section === item.section)}
                  >
                    {item.label}
                  </a>
                ) : (
                  <a
                    key={item.label}
                    href={`${__MANUQUEUE_URL__}${item.path}`}
                    className={itemClass(false)}
                  >
                    {item.label}
                    {/* Still ManuQueue's page, until it moves to the hub */}
                    <span className="ml-1.5 text-xs font-normal text-black/40 dark:text-white/40">
                      ManuQueue
                    </span>
                  </a>
                ),
              )}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 flex-1 px-3 py-4 sm:px-8 sm:py-6">
          <div className="max-w-3xl space-y-6">
            <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">
              Settings
            </h1>
            {section === "appearance" ? (
              <SettingsSection title="Appearance">
                <ThemeSettings />
              </SettingsSection>
            ) : section === "notifications" ? (
              <NotificationSettings />
            ) : section === "password" ? (
              // Waits for the server's answer so a lead isn't shown the PIN rules
              me ? (
                <SettingsSection
                  title="Password"
                  description={
                    can("password:any")
                      ? "Change the password you sign in with. As Admin or Leadership, you can use anything you like."
                      : "Change the PIN you sign in with. It must be 4 digits, not all the same digit, and not a common one like 1234."
                  }
                >
                  <PasswordSettings
                    key={String(can("password:any"))}
                    anyPassword={can("password:any")}
                  />
                </SettingsSection>
              ) : null
            ) : section === "confidential" ? (
              <SettingsSection
                title="Passwords"
                description=""
              >
                <MemberPins canEdit={can("password:edit-any")} />
              </SettingsSection>
            ) : (
              <SettingsSection
                title="Support"
                description="Something broken or missing? Let us know."
              >
                <a
                  href={`${__MANUQUEUE_URL__}/bugs?page=/settings/support`}
                  className="block rounded-xl border border-zinc-200/80 bg-white/95 p-4 text-sm font-semibold text-black shadow-sm transition hover:bg-black/5 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                >
                  Submit a Bug Report
                </a>
              </SettingsSection>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
