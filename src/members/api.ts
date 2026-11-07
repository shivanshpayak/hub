// ManuQueue's old /members server actions, as calls to its /api/members
// routes. Same names and results, so MembersTable is a straight copy

export type MemberRow = {
  id: string;
  nickname: string;
  position: string;
  subteam: string;
  robot: string;
  permissionLevel: number;
  supervisorIds: string[];
};

export type TeamRobot = {
  id: string;
  label: string;
  color?: "red" | "blue" | "green" | "amber" | "violet" | "zinc";
};

/** A role and who has it, the same records the Roles page edits */
export type Role = { id: string; name: string; memberIds: string[] };

export type MembersPageData = {
  members: MemberRow[];
  robots: TeamRobot[];
  roles: Role[];
  currentUserId: string;
  /** Edits on people above this level are hidden, and refused by the server */
  currentUserLevel: number;
  canEdit: boolean;
  canEditRoles: boolean;
  /** Shows the link to the Scouting roster page */
  canUpdateScoutingRoster?: boolean;
};

type Result = { ok: true } | { ok: false; error: string };

async function send(method: string, path: string, body?: unknown): Promise<Result> {
  try {
    const res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => null);
    return { ok: false, error: data?.error ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, error: "Could not reach the server. Please try again." };
  }
}

function memberPath(id: string) {
  return `/api/members/${encodeURIComponent(id)}`;
}

/** Everything the page needs, plus the HTTP status so the page can redirect */
export async function loadMembersPage(): Promise<{
  status: number;
  data?: MembersPageData;
}> {
  const res = await fetch("/api/members");
  if (!res.ok) return { status: res.status };
  return { status: res.status, data: await res.json() };
}

/** Fresh members and roles, for after a save */
export async function getMembersAndRoles(): Promise<{
  members: MemberRow[];
  roles: Role[];
}> {
  const res = await fetch("/api/members");
  if (!res.ok) throw new Error("Could not load members");
  const data: MembersPageData = await res.json();
  return { members: data.members, roles: data.roles };
}

/** Makes roleIds exactly the roles this member has */
export function setMemberRoles(id: string, roleIds: string[]): Promise<Result> {
  return send("PATCH", memberPath(id), { roleIds });
}

export function updateMemberProfile(
  id: string,
  data: { nickname: string; position: string; subteam: string; robot: string },
): Promise<Result> {
  return send("PATCH", memberPath(id), { profile: data });
}

export function updateMemberLevel(id: string, level: number): Promise<Result> {
  return send("PATCH", memberPath(id), { permissionLevel: level });
}

export function updateMemberSupervisors(
  id: string,
  supervisorIds: string[],
): Promise<Result> {
  return send("PATCH", memberPath(id), { supervisorIds });
}

export function deleteMember(id: string): Promise<Result> {
  return send("DELETE", memberPath(id));
}
