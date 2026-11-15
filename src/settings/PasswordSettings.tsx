import { useState, type FormEvent } from "react";
import { hubPath } from "../paths";
import { FormMessage } from "./NotificationSettings";

/*
 * Change the PIN or password you sign in with, through ManuQueue's
 * /api/settings/password. Admin and Leadership can use anything; members keep
 * a 4-digit PIN. ManuQueue checks both (manu-orders/src/lib/password.ts), so
 * the hints here are only to help.
 */

type Answer = { saved: boolean; tone: "success" | "error"; message: string };

const inputClass =
  "w-full rounded-md border border-zinc-300/80 px-3 py-2 text-sm text-black outline-none ring-offset-1 focus:border-lambert-maroon focus:ring-2 focus:ring-lambert-maroon/20 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-white/40 dark:focus:border-lambert-silver/60 dark:focus:ring-lambert-silver/15";

const submitButtonClass =
  "w-full rounded-lg bg-lambert-maroon px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-lambert-maroon-deep disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

const cardClass =
  "rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5";

async function savePassword(currentPassword: string, newPassword: string): Promise<Answer> {
  try {
    const res = await fetch("/api/settings/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
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

export function PasswordSettings({ anyPassword }: { anyPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);

  const newLabel = anyPassword ? "New password" : "New PIN";

  // A member's new PIN gets the number pad and only takes digits
  const pinProps = anyPassword
    ? {}
    : { inputMode: "numeric" as const, maxLength: 4, placeholder: "••••" };
  const keepDigits = (value: string) => (anyPassword ? value : value.replace(/\D/g, ""));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (next !== confirm) {
      setAnswer({
        saved: false,
        tone: "error",
        message: `The two ${anyPassword ? "passwords" : "PINs"} don't match.`,
      });
      return;
    }
    setBusy(true);
    const result = await savePassword(current, next);
    setBusy(false);
    setAnswer(result);
    if (result.saved) {
      setCurrent("");
      setNext("");
      setConfirm("");
    }
  }

  return (
    <div className={cardClass}>
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-black dark:text-white">
            Current PIN or password
          </span>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-black dark:text-white">{newLabel}</span>
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(keepDigits(e.target.value))}
            autoComplete="new-password"
            required
            className={inputClass}
            {...pinProps}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-black dark:text-white">
            Type the new one again
          </span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(keepDigits(e.target.value))}
            autoComplete="new-password"
            required
            className={inputClass}
            {...pinProps}
          />
        </label>

        {answer ? <FormMessage tone={answer.tone} message={answer.message} /> : null}

        <button
          type="submit"
          disabled={busy || !current || !next || !confirm}
          className={submitButtonClass}
        >
          {busy ? "Saving…" : anyPassword ? "Save password" : "Save PIN"}
        </button>
      </form>
    </div>
  );
}
