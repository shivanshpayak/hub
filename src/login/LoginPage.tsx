import { TopBar } from "../TopBar";
import { LoginForm } from "./LoginForm";
import { SessionMessage } from "./SessionMessage";

// Copied from ManuQueue's login page. ManuQueue sends people here with
// ?reason= (signed out) or ?demo= (demo failed to start)
export function LoginPage() {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason") ?? undefined;
  const demoRaw = params.get("demo");
  const demoNotice = demoRaw === "busy" || demoRaw === "error" ? demoRaw : null;

  return (
    <>
      <TopBar />
      <main className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-3">
          <SessionMessage reason={reason} />
          {demoNotice ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200">
              {demoNotice === "busy"
                ? "The demo is busy right now. Please try again in a few minutes."
                : "Something went wrong starting the demo. Please try again."}
            </p>
          ) : null}
          {/* A maroon edge on top, in the top bar's colour */}
          <div className="rounded-2xl border border-t-4 border-zinc-200/80 border-t-lambert-maroon bg-white/85 p-4 shadow-lg backdrop-blur-sm sm:p-6 dark:border-white/10 dark:border-t-lambert-maroon dark:bg-white/5">
            <LoginForm />
          </div>
          <p className="pt-1 text-center text-sm text-black/55 dark:text-white/55">
            {" "}
            <a
              href={`${__MANUQUEUE_URL__}/demo`}
              className="font-semibold text-lambert-maroon underline underline-offset-2 hover:text-lambert-maroon-deep dark:text-lambert-silver dark:hover:text-white"
            >
              Explore the live demo →
            </a>
          </p>
        </div>
      </main>
    </>
  );
}
