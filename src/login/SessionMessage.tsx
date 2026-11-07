const MESSAGES: Record<string, string> = {
  "session-changed":
    "You were signed out because another account logged in.",
  "session-expired":
    "Your session has expired. Please sign in again.",
  "access-changed":
    "Your access changed. Please sign in again.",
  "account-deleted":
    "Your account has been removed. Please contact your administrator.",
};

export function SessionMessage({ reason }: { reason?: string }) {
  if (!reason || !MESSAGES[reason]) return null;

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-200">
      {MESSAGES[reason]}
    </div>
  );
}
