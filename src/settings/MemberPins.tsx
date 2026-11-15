import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { hubPath } from "../paths";
import { FormMessage } from "./NotificationSettings";

/*
 * The Confidential section: everyone on the team and their password, for
 * when someone forgets theirs. Admins only, and Admins see every password,
 * other Admins' included. With "password:edit-any" (Admins) they can set
 * anyone's password here too. Comes from ManuQueue's
 * /api/settings/member-pins.
 *
 * Locked until the Admin types their own sign in password; the server checks
 * it before sending anything, and again with every change (this page keeps it
 * in memory while unlocked for that). It locks again whenever you leave the
 * section. A password only shows while its button is held down (mouse,
 * finger, or Space or Enter), and hides as soon as it's let go.
 */

type MemberPassword = {
  id: string;
  name: string;
  role: string;
  pending: boolean;
  lead: boolean;
  you: boolean;
  password: string | null;
};

type Loaded = { configured: boolean; members: MemberPassword[] };

type Editing = { id: string; draft: string; busy: boolean; error: string | null };

const API = "/api/settings/member-pins";

const inputClass =
  "w-full rounded-md border border-zinc-300/80 px-3 py-2 text-sm text-black outline-none ring-offset-1 focus:border-lambert-maroon focus:ring-2 focus:ring-lambert-maroon/20 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-white/40 dark:focus:border-lambert-silver/60 dark:focus:ring-lambert-silver/15";

const submitButtonClass =
  "w-full rounded-lg bg-lambert-maroon px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-lambert-maroon-deep disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const saveButtonClass =
  "rounded-md bg-lambert-maroon px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-lambert-maroon-deep disabled:cursor-not-allowed disabled:opacity-60";

const cardClass =
  "rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5";

const smallButtonClass =
  "shrink-0 rounded-md border border-black/15 px-2.5 py-1 text-xs font-semibold text-black/70 hover:bg-black/5 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10";

const holdButtonClass = `${smallButtonClass} touch-none select-none active:bg-black/10 dark:active:bg-white/15`;

const lockButtonClass =
  "shrink-0 rounded-md border border-black/15 px-3 py-2 text-sm font-semibold text-black/70 hover:bg-black/5 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10";

const isHoldKey = (event: KeyboardEvent) => event.key === " " || event.key === "Enter";

export function MemberPins({ canEdit }: { canEdit: boolean }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // What's being held open, if anything: a member's id, or "edit" for the
  // new password being typed
  const [held, setHeld] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  // The Admin's own password, sent again with each change while unlocked
  const unlockedWith = useRef("");

  // Let go when the window loses focus or the tab is hidden, in case the
  // release happens somewhere this page can't see
  useEffect(() => {
    const letGo = () => setHeld(null);
    window.addEventListener("blur", letGo);
    document.addEventListener("visibilitychange", letGo);
    return () => {
      window.removeEventListener("blur", letGo);
      document.removeEventListener("visibilitychange", letGo);
    };
  }, []);

  // "Saved" shows for a few seconds after a change
  useEffect(() => {
    if (!savedId) return;
    const timer = window.setTimeout(() => setSavedId(null), 3000);
    return () => window.clearTimeout(timer);
  }, [savedId]);

  /** Props for a button that shows something only while it's held down */
  function holdProps(key: string) {
    // Each button only lets go of its own. Pressing another button moves
    // focus, and this one's blur would otherwise hide the new one at once,
    // which needed a second press
    const letGo = () => setHeld((current) => (current === key ? null : current));
    return {
      onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setHeld(key);
      },
      onPointerUp: letGo,
      onPointerCancel: letGo,
      onLostPointerCapture: letGo,
      onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => {
        if (!isHoldKey(e)) return;
        e.preventDefault();
        if (!e.repeat) setHeld(key);
      },
      onKeyUp: (e: KeyboardEvent<HTMLButtonElement>) => {
        if (!isHoldKey(e)) return;
        e.preventDefault();
        letGo();
      },
      onBlur: letGo,
      // A long press on a phone would otherwise open a menu
      onContextMenu: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
    };
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!typed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: typed }),
      });
      if (res.status === 401) return window.location.replace(hubPath("/login/"));
      const data = await res.json().catch(() => null);
      if (res.ok && data && Array.isArray(data.members)) {
        unlockedWith.current = typed;
        setLoaded(data);
        setTyped("");
      } else {
        setError(data?.error ?? "Could not load passwords. Please try again.");
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function lock(message: string | null = null) {
    unlockedWith.current = "";
    setLoaded(null);
    setHeld(null);
    setEditing(null);
    setQuery("");
    setError(message);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editing.draft || editing.busy) return;
    const { id, draft } = editing;
    const failed = (message: string) =>
      setEditing((current) =>
        current && current.id === id ? { ...current, busy: false, error: message } : current,
      );
    setEditing({ ...editing, busy: true, error: null });
    try {
      const res = await fetch(API, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        password: unlockedWith.current, memberId: id, newPassword: draft 
          }),
      });
      if (res.status === 401) return window.location.replace(hubPath("/login/"));
      const data = await res.json().catch(() => null);
      if (res.ok && data?.member) {
        const member = data.member as MemberPassword;
        if (member.you) unlockedWith.current = draft;
        setLoaded((current) =>
          current && {
            ...current,
            members: current.members.map((m) => (m.id === id ? member : m)),
          },
        );
        setEditing(null);
        setHeld(null);
        setSavedId(id);
      } else if (data?.locked) {
        lock("Your password has changed since you unlocked. Please type it again.");
      } else {
        failed(data?.error ?? "Could not save. Please try again.");
      }
    } catch {
      failed("Could not reach the server. Please try again.");
    }
  }

  if (!loaded) {
    return (
      <div className={cardClass}>
        <form onSubmit={unlock} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-black dark:text-white">Your password</span>
            <input
              type="password"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="current-password"
              required
              autoFocus
              className={inputClass}
            />
          </label>

          {error ? <FormMessage tone="error" message={error} /> : null}

          <button type="submit" disabled={busy || !typed} className={submitButtonClass}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const members = loaded.members.filter((m) => m.name.toLowerCase().includes(needle));
  const anyMissing = loaded.members.some((m) => m.password === null);

  return (
    <div className="space-y-3">
      {!loaded.configured ? (
        <FormMessage
          tone="error"
          message="The server has no password key set up (PIN_ENCRYPTION_KEY), so most passwords can't be shown."
        />
      ) : null}

      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
          aria-label="Search people by name"
          className={inputClass}
        />
        <button type="button" onClick={() => lock()} className={lockButtonClass}>
          Lock
        </button>
      </div>

      <div className="divide-y divide-black/10 overflow-hidden rounded-xl border border-black/10 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-white/5">
        {members.length === 0 ? (
          <p className="px-4 py-3 text-sm text-black/50 dark:text-white/50">
            {loaded.members.length === 0 ? "No one on the team yet." : "No matches found."}
          </p>
        ) : (
          members.map((m) => {
            const isEditing = editing?.id === m.id;
            return (
              <div key={m.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-black dark:text-white">
                      {m.name}
                    </p>
                    {m.pending ? (
                      <p className="text-xs text-black/50 dark:text-white/50">
                        Waiting for approval
                      </p>
                    ) : m.lead ? (
                      <p className="text-xs text-black/50 dark:text-white/50">{m.role}</p>
                    ) : null}
                  </div>
                  <div className="flex min-w-0 items-center justify-end gap-2">
                    {savedId === m.id ? (
                      <span className="shrink-0 text-xs font-semibold text-black/60 dark:text-white/60">
                        Saved
                      </span>
                    ) : null}
                    {m.password === null ? (
                      <span className="shrink-0 text-xs text-black/45 dark:text-white/45">
                        Not on file
                      </span>
                    ) : (
                      <>
                        <span className="min-w-0 break-all text-right font-mono text-sm tracking-[0.15em] text-black dark:text-white">
                          {held === m.id ? m.password : "••••"}
                        </span>
                        <button
                          type="button"
                          aria-label={`Hold to show ${m.name}'s password`}
                          className={holdButtonClass}
                          {...holdProps(m.id)}
                        >
                          {held === m.id ? "Showing" : "Hold to show"}
                        </button>
                      </>
                    )}
                    {canEdit && !isEditing ? (
                      <button
                        type="button"
                        aria-label={`Change ${m.name}'s password`}
                        className={smallButtonClass}
                        onClick={() => {
                          setHeld(null);
                          setSavedId(null);
                          setEditing({ id: m.id, draft: "", busy: false, error: null });
                        }}
                      >
                        Edit
                      </button>
                    ) : null}
                  </div>
                </div>

                {isEditing && editing ? (
                  <form onSubmit={save} className="mt-2.5 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type={held === "edit" ? "text" : "password"}
                        value={editing.draft}
                        onChange={(e) =>
                          setEditing({ ...editing, draft: e.target.value, error: null })
                        }
                        // Members sign in on the number pad, so theirs stays a PIN
                        inputMode={m.lead ? undefined : "numeric"}
                        maxLength={m.lead ? undefined : 4}
                        placeholder={m.lead ? "New password" : "New 4-digit PIN"}
                        aria-label={`New password for ${m.name}`}
                        autoComplete="new-password"
                        autoFocus
                        className={inputClass}
                      />
                      <button
                        type="button"
                        aria-label="Hold to show what you typed"
                        className={holdButtonClass}
                        {...holdProps("edit")}
                      >
                        {held === "edit" ? "Showing" : "Hold to show"}
                      </button>
                    </div>
                    {editing.error ? <FormMessage tone="error" message={editing.error} /> : null}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={editing.busy || !editing.draft}
                        className={saveButtonClass}
                      >
                        {editing.busy ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className={smallButtonClass}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {anyMissing ? (
        <p className="text-xs text-black/50 dark:text-white/50">
          Not on file means there's no readable copy yet. It's saved the next time that
          person signs in{canEdit ? ", or when you set a new one with Edit" : ""}.
        </p>
      ) : null}
    </div>
  );
}
