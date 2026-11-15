// Copied from ManuQueue's login form. It signs in with ManuQueue accounts
// through ManuQueue's /api/auth routes

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { hubPath } from "../paths";
import { rememberMe } from "../me";

type MemberOption = {
  id: string;
  name: string;
  /** Signs in with a 4-digit PIN. Never set for Admin and Leadership. */
  numberPad?: boolean;
};

type LoginApiResponse = {
  error?: string;
  redirectTo?: string;
};

const LOGIN_TIMEOUT_MS = 15000;

function NameAutocomplete({
  members,
  loading,
  disabled,
  selectedUserId,
  onSelect,
}: {
  members: MemberOption[];
  loading: boolean;
  disabled: boolean;
  selectedUserId: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filtered = members.filter((m) =>
    m.name.toLowerCase().includes(query.toLowerCase()),
  );

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.children[highlightIndex] as HTMLElement;
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        closeDropdown();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // When a user is already selected, show their name in the input
  useEffect(() => {
    if (selectedUserId) {
      const member = members.find((m) => m.id === selectedUserId);
      if (member) setQuery(member.name);
    }
  }, [selectedUserId, members]);

  function closeDropdown() {
    setClosing(true);
    setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 120);
  }

  function selectMember(member: MemberOption) {
    setQuery(member.name);
    closeDropdown();
    onSelect(member.id);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    // Clear selection when they start typing again
    if (selectedUserId) {
      onSelect("");
    }
  }

  function handleFocus() {
    if (!open && !closing) {
      setOpen(true);
    }
    // Select all text so the user can immediately type a new name
    inputRef.current?.select();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
        return;
      }
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) {
        selectMember(filtered[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      closeDropdown();
    }
  }

  const inputClass =
    "w-full rounded-md border border-zinc-300/80 px-3 py-2 text-sm text-black outline-none ring-offset-1 focus:border-lambert-maroon focus:ring-2 focus:ring-lambert-maroon/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:bg-zinc-900 dark:text-white dark:placeholder-white/55 dark:focus:border-lambert-silver/60 dark:focus:ring-lambert-silver/15";

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        disabled={disabled || loading}
        placeholder={loading ? "Loading members…" : "Type your name…"}
        autoComplete="off"
        className={inputClass}
      />

      {open && !loading && (
        <div
          ref={listRef}
          className={`custom-scrollbar absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-white/15 dark:bg-zinc-900 ${
            closing ? "animate-dropdown-out" : "animate-dropdown-in"
          }`}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-black/40 dark:text-white/40">
              No matches found.
            </div>
          ) : (
            filtered.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMember(m)}
                className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                  i === highlightIndex
                    ? "bg-lambert-maroon/10 font-semibold text-lambert-maroon dark:bg-lambert-maroon/40 dark:text-white"
                    : "text-black/70 hover:bg-black/[0.03] dark:text-white/70 dark:hover:bg-white/5"
                }`}
              >
                {m.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function LoginForm() {
  const teamParam =
    new URLSearchParams(window.location.search).get("team")?.trim() ?? "";

  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [pin, setPin] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);

  // Fetch member list on mount, scoped to the team in the URL (if any).
  // Defaults to the legacy team on the server when no team param is sent.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = teamParam
          ? `/api/auth/members?teamId=${encodeURIComponent(teamParam)}`
          : "/api/auth/members";
        const res = await fetch(url);
        const data = await res.json();
        if (!cancelled && Array.isArray(data.members)) {
          setMembers(data.members);
        }
      } catch {
        // silently fail, list will be empty
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamParam]);

  const handleNameSelect = useCallback((id: string) => {
    setSelectedUserId(id);
    setErrorMessage(null);
    if (id) {
      setTimeout(() => pinRef.current?.focus(), 50);
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isPending || isRedirecting) return;
    setErrorMessage(null);

    if (!selectedUserId) {
      setErrorMessage("Please select your name.");
      return;
    }

    setIsPending(true);

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        LOGIN_TIMEOUT_MS,
      );

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, pin }),
        signal: controller.signal,
      });

      window.clearTimeout(timeoutId);

      let data: LoginApiResponse | null = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        setErrorMessage(
          data?.error ?? "Unable to complete login. Please try again.",
        );
        setPin("");
        return;
      }

      // ManuQueue answers with one of its own pages (like /queue), so go back
      // to the hub home page instead
      setIsRedirecting(true);
      // So the home page's top bar has your buttons in its first frame
      await fetch("/api/auth/me")
        .then(async (res) => res.ok && rememberMe(await res.json()))
        .catch(() => undefined);
      window.setTimeout(() => {
        window.location.assign(hubPath("/"));
      }, 80);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setErrorMessage("Login timed out. Please try again.");
      } else {
        setErrorMessage("Unable to complete login. Please try again.");
      }
    } finally {
      setIsPending(false);
    }
  }

  if (isRedirecting) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-zinc-200 border-t-lambert-maroon dark:border-white/20 dark:border-t-lambert-silver" />
        <p className="text-base font-semibold text-black dark:text-white">
          Verification accepted
        </p>
        <p className="text-sm text-black/65 dark:text-white/65">
          Loading your workspace…
        </p>
      </div>
    );
  }

  const pinInputClass =
    "w-full rounded-md border border-zinc-300/80 px-3 py-2 text-sm text-black text-center tracking-[0.3em] font-mono outline-none ring-offset-1 focus:border-lambert-maroon focus:ring-2 focus:ring-lambert-maroon/20 dark:border-white/20 dark:bg-zinc-900 dark:text-white dark:placeholder-white/55 dark:focus:border-lambert-silver/60 dark:focus:ring-lambert-silver/15";

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full space-y-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 dark:border-white/10 dark:bg-zinc-900"
    >
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-black dark:text-white">
          Login
        </h2>
        <p className="mt-1 text-sm text-black/65 dark:text-white/65">
          Type your name and enter your PIN or password.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-black dark:text-white">
          Name
        </span>
        <NameAutocomplete
          members={members}
          loading={loadingMembers}
          disabled={isPending}
          selectedUserId={selectedUserId}
          onSelect={handleNameSelect}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-black dark:text-white">
          PIN or password
        </span>
        {/* Members have a 4-digit PIN and get the number pad. Admin and
            Leadership can have any password and get the whole keyboard */}
        <input
          ref={pinRef}
          type="password"
          inputMode={
            members.find((m) => m.id === selectedUserId)?.numberPad
              ? "numeric"
              : undefined
          }
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          autoComplete="off"
          required
          disabled={isPending || !selectedUserId}
          placeholder="••••"
          className={pinInputClass}
        />
      </label>

      {errorMessage && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300">
          {errorMessage}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending || !selectedUserId || pin.length === 0}
        className="w-full rounded-md bg-lambert-maroon px-3 py-2.5 text-sm font-semibold text-white hover:bg-lambert-maroon-deep disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Signing in…" : "Sign In"}
      </button>

      <div className="pt-2 text-center space-y-1">
        {/* ManuQueue's registration page; new accounts wait for approval */}
        <a
          href={`${__MANUQUEUE_URL__}/register`}
          className="block text-sm text-lambert-maroon underline hover:text-lambert-maroon-deep dark:text-lambert-silver dark:hover:text-white"
        >
          Create New Account
        </a>
      </div>
    </form>
  );
}
