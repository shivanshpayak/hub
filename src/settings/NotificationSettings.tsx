import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { hubPath } from "../paths";

/*
 * ManuQueue's Settings, Notifications page, copied: your Slack (or Teams) ID,
 * your email, which things mention or email you, and for Admins the team's
 * delivery platforms. It loads and saves through ManuQueue's
 * /api/settings/notifications (manu-orders/src/lib/notification-settings.ts),
 * which keeps ManuQueue's rules: a test ping when your chat ID changes and a
 * test email when your address does.
 */

type Provider = "slack" | "msteams";

type Settings = {
  provider: Provider;
  mentionId: string;
  email: string;
  categories: { key: string; label: string; description: string; on: boolean }[];
  webhooks: {
    slackWebhookUrl: string | null;
    msTeamsWebhookUrl: string | null;
    slackEnabled: boolean;
    msTeamsEnabled: boolean;
  } | null;
};

type SaveAnswer = {
  saved: boolean;
  tone: "success" | "error";
  message: string;
  fieldErrors?: Record<string, string>;
};

type Save = (body: Record<string, unknown>) => Promise<SaveAnswer>;

const API = "/api/settings/notifications";

async function patchSettings(body: Record<string, unknown>): Promise<SaveAnswer> {
  try {
    const res = await fetch(API, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      window.location.replace(hubPath("/login/"));
    }
    const data = await res.json().catch(() => null);
    if (data && typeof data.message === "string") return data;
    return {
      saved: false,
      tone: "error",
      message: data?.error ?? "Something went wrong. Please try again.",
    };
  } catch {
    return { saved: false, tone: "error", message: "Could not reach the server. Please try again." };
  }
}

const CHAT_ID = {
  slack: {
    heading: "Slack Notifications",
    label: "Slack Member ID",
    placeholder: "U012ABCDEF",
    uppercase: true,
    steps: [
      "Open slack.com or the desktop app and open Lambda Robotics Workspace.",
      "In the bottom left from your avatar menu, click on your profile",
      "Press Open Profile.",
      "Click on the 3 dots, and then copy your Member ID.",
      "Paste the ID here (it starts with U or W), then save.",
      "If you get a ping from the bot, it worked. If not, check your ID and try again.",
    ],
  },
  msteams: {
    heading: "Teams Notifications",
    label: "Teams User ID",
    placeholder: "00000000-0000-0000-0000-000000000000",
    uppercase: false,
    steps: [
      "Your Teams User ID is your Entra (Azure AD) object ID, which is a GUID. Teams does not show it in your profile.",
      "If you have access: open portal.azure.com, go to Microsoft Entra ID → Users, and search for your name.",
      "Open your user record and copy the value labelled 'Object ID'.",
      "If you cannot access the Entra admin center, ask a ManuQueue admin to look it up for you.",
      "Paste the GUID here exactly, then save. A test ping confirms it worked.",
    ],
  },
} as const;

const CLOSE_MS = 100;

const inputClass =
  "w-full rounded-md border border-zinc-300/80 px-3 py-2 text-sm text-black outline-none ring-offset-1 focus:border-lambert-maroon focus:ring-2 focus:ring-lambert-maroon/20 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-white/40 dark:focus:border-lambert-silver/60 dark:focus:ring-lambert-silver/15";

const smallButtonClass =
  "rounded-md bg-lambert-maroon px-4 py-2 text-sm font-semibold text-white hover:bg-lambert-maroon-deep disabled:cursor-not-allowed disabled:opacity-60";

// ManuQueue's SubmitButton
const submitButtonClass =
  "w-full rounded-lg bg-lambert-maroon px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-lambert-maroon-deep disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const headingClass =
  "mb-3 text-sm font-semibold uppercase tracking-wide text-lambert-maroon dark:text-lambert-silver";

const cardClass =
  "rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5";

/** ManuQueue's open and close animation for its dropdown panels */
function useCollapse(startOpen: boolean) {
  const [open, setOpen] = useState(startOpen);
  const [visible, setVisible] = useState(startOpen);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const toggle = useCallback(() => {
    clearTimeout(closeTimer.current);
    if (open) {
      setClosing(true);
      closeTimer.current = setTimeout(() => {
        setOpen(false);
        setVisible(false);
        setClosing(false);
      }, CLOSE_MS);
    } else {
      setClosing(false);
      setVisible(true);
      setOpen(true);
    }
  }, [open]);

  return { visible, closing, expanded: open && !closing, toggle };
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-black/50 transition-transform duration-200 dark:text-white/50 ${
        expanded ? "rotate-180" : ""
      }`}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The summary row (what's saved, with a chevron) that opens the form. With
 * nothing saved the form shows on its own.
 */
function SavedRow({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  const panelId = useId();
  const toggleId = `${panelId}-toggle`;
  const { visible, closing, expanded, toggle } = useCollapse(false);

  return (
    <>
      <button
        id={toggleId}
        type="button"
        onClick={toggle}
        aria-expanded={expanded ? "true" : "false"}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="text-sm font-medium text-black dark:text-white">{label}</p>
          <p className="text-xs text-black/55 dark:text-white/55">{value}</p>
        </div>
        <Chevron expanded={expanded} />
      </button>

      {visible ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={toggleId}
          className={`mt-3 border-t border-black/10 pt-3 dark:border-white/10 ${
            closing ? "animate-dropdown-out" : "animate-dropdown-in"
          }`}
        >
          {children}
        </div>
      ) : null}
    </>
  );
}

function HelpDropdown({ title, steps }: { title: string; steps: readonly string[] }) {
  const panelId = useId();
  const toggleId = `${panelId}-toggle`;
  const { visible, closing, expanded, toggle } = useCollapse(false);

  return (
    <div className="rounded-lg border border-black/10 bg-black/[0.02] text-sm dark:border-white/10 dark:bg-white/[0.02]">
      <button
        id={toggleId}
        type="button"
        onClick={toggle}
        aria-expanded={expanded ? "true" : "false"}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left font-medium text-black/80 dark:text-white/80"
      >
        <span>{title}</span>
        <Chevron expanded={expanded} />
      </button>

      {visible ? (
        <div
          id={panelId}
          role="region"
          aria-labelledby={toggleId}
          className={`border-t border-black/10 px-3 pb-3 pt-2 dark:border-white/10 ${
            closing ? "animate-dropdown-out" : "animate-dropdown-in"
          }`}
        >
          <ol className="list-decimal space-y-1 pl-5 text-black/65 dark:text-white/65">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/** Your Slack Member ID, or Teams User ID when ManuQueue posts to Teams */
function ChatIdSettings({
  provider,
  initialId,
  save,
}: {
  provider: Provider;
  initialId: string;
  save: Save;
}) {
  const text = CHAT_ID[provider];
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mentionId = new FormData(event.currentTarget).get("mentionId") ?? "";
    setBusy(true);
    await save({ mentionId });
    setBusy(false);
  }

  const form = (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-black dark:text-white">{text.label}</span>
        <input
          type="text"
          name="mentionId"
          defaultValue={initialId}
          placeholder={text.placeholder}
          className={`${inputClass} ${text.uppercase ? "uppercase" : ""}`}
        />
      </label>
      <HelpDropdown title={`How to find your ${text.label}`} steps={text.steps} />
      <button type="submit" disabled={busy} className={smallButtonClass}>
        Save {text.label}
      </button>
    </form>
  );

  return (
    <section>
      <h2 className={headingClass}>{text.heading}</h2>
      <div className={cardClass}>
        {initialId.trim() ? (
          <SavedRow label={text.label} value={initialId}>
            {form}
          </SavedRow>
        ) : (
          form
        )}
      </div>
    </section>
  );
}

/** Your notification email, open when nothing is saved like the chat ID */
function EmailSettings({ initialEmail, save }: { initialEmail: string; save: Save }) {
  const [busy, setBusy] = useState(false);
  const hasSavedEmail = initialEmail.length > 0;

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    await save(body);
    setBusy(false);
  }

  const form = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void send({ email: new FormData(event.currentTarget).get("email") ?? "" });
      }}
      className="space-y-3"
    >
      <label className="block space-y-1">
        <span className="text-sm font-medium text-black dark:text-white">Email address</span>
        <input
          type="email"
          name="email"
          defaultValue={initialEmail}
          placeholder="you@example.com"
          autoComplete="email"
          className={inputClass}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={smallButtonClass}>
          Save Email
        </button>
        {hasSavedEmail ? (
          // Not a submit button, so a half typed address can't block removal
          <button
            type="button"
            disabled={busy}
            onClick={() => void send({ email: "", remove: true })}
            className="rounded-md border border-black/15 px-4 py-2 text-sm font-semibold text-black hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
          >
            Remove
          </button>
        ) : null}
      </div>
    </form>
  );

  return (
    <section>
      <h2 className={headingClass}>Email Notifications</h2>
      <div className={cardClass}>
        {hasSavedEmail ? (
          <SavedRow label="Email address" value={initialEmail}>
            {form}
          </SavedRow>
        ) : (
          form
        )}
      </div>
    </section>
  );
}

/**
 * Which things mention or email you. Worded "mention or email me" on purpose:
 * turning one off stops your mention and your email, not the channel post.
 */
function PrefsForm({ categories, save }: { categories: Settings["categories"]; save: Save }) {
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const prefs = Object.fromEntries(
      categories.map((c) => [c.key, form.get(`category:${c.key}`) !== null]),
    );
    setBusy(true);
    await save({ prefs });
    setBusy(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-sm dark:border-white/10 dark:bg-white/5"
    >
      <div>
        <h3 className="text-sm font-semibold text-black dark:text-white">Mention or email me for</h3>
      </div>

      <div className="space-y-2">
        {categories.map((category) => (
          <label
            key={category.key}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-black/5 p-3 transition hover:bg-black/[0.02] dark:border-white/5 dark:hover:bg-white/[0.03]"
          >
            <input
              type="checkbox"
              name={`category:${category.key}`}
              defaultChecked={category.on}
              className="mt-0.5 accent-lambert-maroon"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-black dark:text-white">
                {category.label}
              </span>
              <span className="block text-xs text-black/55 dark:text-white/55">
                {category.description}
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={busy} className={submitButtonClass}>
          {busy ? "Saving..." : "Save Preferences"}
        </button>
      </div>
    </form>
  );
}

// ManuQueue's FormMessage
export function FormMessage({ tone, message }: { tone: "success" | "error"; message: string }) {
  const toneClass =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700 shadow-sm dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300"
      : "border-black/15 bg-black/5 text-black/70 shadow-sm dark:border-white/15 dark:bg-white/5 dark:text-white/70";
  return (
    <p className={`rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${toneClass}`}>{message}</p>
  );
}

/**
 * The team's delivery platforms and their webhooks (Admins only). Both can be
 * on at once, and every notification then goes to both.
 */
function WebhookForm({ initial }: { initial: NonNullable<Settings["webhooks"]> }) {
  const [slackEnabled, setSlackEnabled] = useState(initial.slackEnabled);
  const [msTeamsEnabled, setMsTeamsEnabled] = useState(initial.msTeamsEnabled);
  const [answer, setAnswer] = useState<SaveAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const fieldErrors = answer?.fieldErrors ?? {};

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setAnswer(
      await patchSettings({
        webhooks: {
          slackEnabled,
          msTeamsEnabled,
          // An unticked platform's URL box is disabled, so it sends nothing
          // and that URL is cleared, as in ManuQueue
          slackWebhookUrl: form.get("slackWebhookUrl") ?? "",
          msTeamsWebhookUrl: form.get("msTeamsWebhookUrl") ?? "",
        },
      }),
    );
    setBusy(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5"
    >
      <div>
        <h3 className="text-sm font-semibold text-black dark:text-white">Delivery platforms</h3>
      </div>

      {answer ? <FormMessage tone={answer.tone} message={answer.message} /> : null}

      {fieldErrors.slackEnabled ? (
        <p className="text-xs text-red-600">{fieldErrors.slackEnabled}</p>
      ) : null}

      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name="slackEnabled"
            className="accent-lambert-maroon"
            checked={slackEnabled}
            onChange={(e) => setSlackEnabled(e.currentTarget.checked)}
          />
          <span className="text-sm font-medium text-black dark:text-white">Slack</span>
        </label>
        <label className="block pl-6">
          <span className="mb-1 block text-xs font-medium text-black/70 dark:text-white/70">
            Webhook URL{" "}
            <span className="font-normal text-black/40 dark:text-white/40">(optional)</span>
          </span>
          <input
            name="slackWebhookUrl"
            defaultValue={initial.slackWebhookUrl ?? ""}
            placeholder="https://hooks.slack.com/services/..."
            disabled={!slackEnabled}
            onFocus={(e) => e.currentTarget.select()}
            className={`${inputClass} bg-white disabled:cursor-not-allowed disabled:opacity-50`}
          />
          {fieldErrors.slackWebhookUrl ? (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.slackWebhookUrl}</p>
          ) : null}
        </label>
      </div>

      <div className="space-y-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            name="msTeamsEnabled"
            className="accent-lambert-maroon"
            checked={msTeamsEnabled}
            onChange={(e) => setMsTeamsEnabled(e.currentTarget.checked)}
          />
          <span className="text-sm font-medium text-black dark:text-white">
            Microsoft Teams (for next year)
          </span>
        </label>
        {msTeamsEnabled ? (
          <p className="pl-6 text-xs text-amber-700 dark:text-amber-400">
            Teams delivery has not been confirmed working on this deployment. Send a test before
            relying on it.
          </p>
        ) : null}
        <label className="block pl-6">
          <span className="mb-1 block text-xs font-medium text-black/70 dark:text-white/70">
            Webhook URL{" "}
            <span className="font-normal text-black/40 dark:text-white/40">(optional)</span>
          </span>
          <input
            name="msTeamsWebhookUrl"
            defaultValue={initial.msTeamsWebhookUrl ?? ""}
            placeholder="https://prod-00.westus.logic.azure.com:443/workflows/..."
            disabled={!msTeamsEnabled}
            onFocus={(e) => e.currentTarget.select()}
            className={`${inputClass} bg-white disabled:cursor-not-allowed disabled:opacity-50`}
          />
          {fieldErrors.msTeamsWebhookUrl ? (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.msTeamsWebhookUrl}</p>
          ) : null}
        </label>
      </div>
      <div className="pt-1">
        <button type="submit" disabled={busy} className={submitButtonClass}>
          {busy ? "Saving…" : "Save delivery settings"}
        </button>
      </div>
    </form>
  );
}

// ManuQueue's ToastBanner: the green or red line after a save, gone in 4s
function ToastBanner({ tone, message }: { tone: "success" | "error"; message: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timeout);
  }, []);

  if (!visible) return null;
  const toneClass =
    tone === "success"
      ? "border-green-300 bg-green-50 text-green-900 dark:border-green-500/30 dark:bg-green-900/20 dark:text-green-200"
      : "border-red-300 bg-red-50 text-red-900 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-200";
  return <div className={`rounded-lg border px-4 py-3 text-sm ${toneClass}`}>{message}</div>;
}

// ManuQueue's settings loading look, for the notification part
function NotificationsLoading() {
  return (
    <section className="animate-pulse space-y-3">
      <div className="h-3 w-36 rounded bg-zinc-200 dark:bg-zinc-700" />
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-white/95 p-4 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="h-4 w-40 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-9 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="h-9 w-24 rounded-lg bg-zinc-200 dark:bg-zinc-700" />
      </div>
    </section>
  );
}

/** The Notifications section of the hub's Settings page */
export function NotificationSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; tone: "success" | "error"; message: string } | null>(
    null,
  );
  // Goes up after each save, so the forms start over from what's saved, like
  // ManuQueue's page did after saving
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(API);
      if (res.status === 401) return window.location.replace(hubPath("/login/"));
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadError(data?.error ?? "Could not load notification settings. Please try again.");
        return;
      }
      setSettings(data);
      setLoadError(null);
    } catch {
      setLoadError("Could not reach the server. Please try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save: Save = useCallback(
    async (body) => {
      const answer = await patchSettings(body);
      setToast({ id: Date.now(), tone: answer.tone, message: answer.message });
      if (answer.saved) {
        await load();
        setVersion((v) => v + 1);
      }
      return answer;
    },
    [load],
  );

  if (loadError && !settings) return <FormMessage tone="error" message={loadError} />;
  if (!settings) return <NotificationsLoading />;

  return (
    <>
      {toast ? <ToastBanner key={toast.id} tone={toast.tone} message={toast.message} /> : null}

      <ChatIdSettings
        key={`id-${version}`}
        provider={settings.provider}
        initialId={settings.mentionId}
        save={save}
      />

      <EmailSettings key={`email-${version}`} initialEmail={settings.email} save={save} />

      <PrefsForm key={`prefs-${version}`} categories={settings.categories} save={save} />

      {settings.webhooks ? <WebhookForm initial={settings.webhooks} /> : null}
    </>
  );
}
