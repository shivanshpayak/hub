import { useEffect, useState } from "react";
import { TopBar } from "../TopBar";
import { hubPath } from "../paths";
import { MembersLoading } from "./MembersLoading";
import { MembersTable } from "./MembersTable";
import { loadMembersPage, type MembersPageData } from "./api";

// Copied from ManuQueue's members page. The data comes from /api/members
export function MembersPage() {
  const [data, setData] = useState<MembersPageData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadMembersPage()
      .then(({ status, data }) => {
        // Like ManuQueue: signed out goes to sign in, not allowed goes home
        if (status === 401) return window.location.replace(hubPath("/login/"));
        if (status === 403) return window.location.replace(hubPath("/"));
        if (!data) return setFailed(true);
        setData(data);
      })
      .catch(() => setFailed(true));
  }, []);

  return (
    <>
      <TopBar />
      {/* ManuQueue's layout capped this at max-w-5xl; wider here so the
          Roles column fits next to the rest */}
      <main className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
        {failed ? (
          <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/50 dark:border-white/10 dark:bg-white/5 dark:text-white/50">
            Could not load members. Please try again.
          </div>
        ) : !data ? (
          <MembersLoading />
        ) : (
          <div className="mx-auto min-w-0 max-w-[95vw] px-4 py-6 xl:max-w-7xl">
            <div className="mb-6">
              <h1 className="text-xl font-bold text-black dark:text-white">Members</h1>
              <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                {data.canEdit ? "Manage users and permission levels." : "View team members."}
              </p>
              {data.canUpdateScoutingRoster && (
                <a
                  href={hubPath("/scouting-roster/")}
                  className="mt-2 inline-block text-sm text-lambert-maroon underline hover:text-lambert-maroon-deep dark:text-lambert-silver dark:hover:text-white"
                >
                  Scouting roster
                </a>
              )}
            </div>
            <MembersTable
              initialMembers={data.members}
              initialRoles={data.roles}
              currentUserId={data.currentUserId}
              currentUserLevel={data.currentUserLevel}
              canEdit={data.canEdit}
              canEditRoles={data.canEditRoles}
              robots={data.robots}
            />
          </div>
        )}
      </main>
    </>
  );
}
