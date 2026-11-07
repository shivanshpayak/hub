import { useState, useMemo, useTransition } from "react";
import {
  updateMemberProfile,
  updateMemberLevel,
  updateMemberSupervisors,
  deleteMember,
  getMembersAndRoles,
  setMemberRoles,
  type MemberRow,
  type Role,
} from "./api";
import { CustomSelect } from "../manuqueue/CustomSelect";
import { CustomMultiSelect } from "../manuqueue/CustomMultiSelect";
import { levelLabel, normalizeLevel } from "./levels";
import type { TeamRobot } from "./api";

const LEVEL_OPTIONS = [1, 2, 4, 5] as const;

type SortColumn = "name" | "position" | "robot" | "level" | "supervisor" | "roles";
type TextColumn = Exclude<SortColumn, "level">;
type Sort = { column: SortColumn; dir: "asc" | "desc" };

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

/** Compares two A to Z lists name by name, so "Ana" comes before "Ana, Ben" */
function compareLists(a: string[], b: string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const order = compareText(a[i], b[i]);
    if (order) return order;
  }
  return a.length - b.length;
}

/** Level sorts Admin first. The other columns sort by their text, with
 * blanks last either way. Ties fall back to the name so the order is stable */
function sortMembers(
  members: MemberRow[],
  sort: Sort,
  textOf: (m: MemberRow, column: TextColumn) => string[],
): MemberRow[] {
  const { column } = sort;
  const flip = sort.dir === "asc" ? 1 : -1;
  return [...members].sort((a, b) => {
    let order: number;
    if (column === "level") {
      order = normalizeLevel(a.permissionLevel) - normalizeLevel(b.permissionLevel);
    } else {
      const av = textOf(a, column).map((s) => s.trim()).filter(Boolean);
      const bv = textOf(b, column).map((s) => s.trim()).filter(Boolean);
      if (!av.length !== !bv.length) return av.length ? -1 : 1;
      order = compareLists(av, bv);
    }
    return flip * order || compareText(a.nickname, b.nickname);
  });
}

/** A column header that sorts the table when clicked. Clicking the sorted
 * column again flips the direction */
function SortHeader({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: SortColumn;
  sort: Sort;
  onSort: (column: SortColumn) => void;
  className: string;
}) {
  const active = sort.column === column;
  return (
    <th
      className={className}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={`-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lambert-maroon/25 dark:hover:text-white dark:focus-visible:ring-lambert-silver/25 ${active ? "text-black dark:text-white" : ""}`}
      >
        {label}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`h-3.5 w-3.5 ${active ? "text-lambert-maroon dark:text-lambert-silver" : "opacity-35"}`}
        >
          {!active ? (
            <path d="M5 6l3-3 3 3M5 10l3 3 3-3" />
          ) : sort.dir === "asc" ? (
            <path d="M4.5 10l3.5-3.5 3.5 3.5" />
          ) : (
            <path d="M4.5 6l3.5 3.5 3.5-3.5" />
          )}
        </svg>
      </button>
    </th>
  );
}

// In Lambert colours, strongest for Admin. Retired 3 reads as Leadership
const LEADERSHIP_BADGE =
  "bg-lambert-maroon/10 text-lambert-maroon dark:bg-lambert-maroon/35 dark:text-lambert-silver";
const LEVEL_BADGE_COLORS: Record<number, string> = {
  1: "bg-lambert-maroon text-white",
  2: LEADERSHIP_BADGE,
  3: LEADERSHIP_BADGE,
  4: "bg-lambert-silver/45 text-zinc-800 dark:bg-lambert-silver/15 dark:text-lambert-silver",
};
const LEVEL_BADGE_DEFAULT = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

function LevelBadge({ level }: { level: number }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_BADGE_COLORS[level] ?? LEVEL_BADGE_DEFAULT}`}
    >
      {levelLabel(level)}
    </span>
  );
}

/** A member's roles as small pills, or a hyphen when they have none */
function RoleBadges({ roles }: { roles: Role[] }) {
  if (roles.length === 0) return <>-</>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <span
          key={role.id}
          className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          {role.name}
        </span>
      ))}
    </div>
  );
}

type EditState = {
  id: string;
  nickname: string;
  position: string;
  subteam: string;
  robot: string;
  permissionLevel: number;
  supervisorIds: string[];
  roleIds: string[];
};

type Props = {
  initialMembers: MemberRow[];
  /** The team's roles, the same ones the Roles page edits */
  initialRoles: Role[];
  currentUserId: string;
  /** Edits on people above this level are hidden (the server refuses them too) */
  currentUserLevel: number;
  canEdit: boolean;
  /** Whether the Edit row can change someone's roles */
  canEditRoles: boolean;
  /** The active team's robots, from `getActiveTeam()`. Drives the robot
   * dropdown and the read-only label so robots added in /settings show up
   * here without a code change. */
  robots: TeamRobot[];
};

export function MembersTable({
  initialMembers,
  initialRoles,
  currentUserId,
  currentUserLevel,
  canEdit,
  canEditRoles,
  robots,
}: Props) {
  const [members, setMembers] = useState<MemberRow[]>(initialMembers);
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>({ column: "name", dir: "asc" });

  function handleSort(column: SortColumn) {
    setSort((prev) =>
      prev.column === column
        ? { column, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { column, dir: "asc" },
    );
  }

  // Falls back to the raw id when the stored robot is no longer in the
  // team's list (deleted, or a legacy value), so the assignment stays
  // visible instead of reading as unassigned. Blank when unassigned
  function robotLabelOf(member: MemberRow): string {
    if (!member.robot) return "";
    return robots.find((r) => r.id === member.robot)?.label ?? member.robot;
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [rowPending, startRowTransition] = useTransition();

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Build a lookup map for supervisor names
  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.id, m.nickname);
    }
    return map;
  }, [members]);

  // Lower number is more power. Nobody can edit someone above them, or give
  // out a level above their own
  const myLevel = normalizeLevel(currentUserLevel);
  const isAboveMe = (m: MemberRow) => normalizeLevel(m.permissionLevel) < myLevel;

  // Each member's roles, A to Z
  const rolesByMember = useMemo(() => {
    const map = new Map<string, Role[]>();
    for (const role of [...roles].sort((a, b) => compareText(a.name, b.name))) {
      for (const memberId of role.memberIds) {
        map.set(memberId, [...(map.get(memberId) ?? []), role]);
      }
    }
    return map;
  }, [roles]);

  // A member's supervisors' names, A to Z
  function supervisorNamesOf(member: MemberRow): string[] {
    return (member.supervisorIds ?? [])
      .map((id) => memberNameMap.get(id) ?? "Unknown")
      .sort(compareText);
  }

  // What each text column sorts by, as it reads in the table
  function sortTextOf(member: MemberRow, column: TextColumn): string[] {
    switch (column) {
      case "name":
        return [member.nickname];
      case "position":
        return [member.position];
      case "robot":
        return [robotLabelOf(member)];
      case "supervisor":
        return supervisorNamesOf(member);
      case "roles":
        return (rolesByMember.get(member.id) ?? []).map((r) => r.name);
    }
  }

  function roleIdsOf(memberId: string): string[] {
    return (rolesByMember.get(memberId) ?? []).map((r) => r.id);
  }

  // Supervisor dropdown options (exclude the member being edited)
  function supervisorOptions(excludeId: string) {
    return members
      .filter((m) => m.id !== excludeId && m.permissionLevel <= 4)
      .map((m) => ({ value: m.id, label: m.nickname }));
  }

  const displayMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? members.filter(
          (m) =>
            m.nickname.toLowerCase().includes(q) ||
            m.position.toLowerCase().includes(q) ||
            m.subteam.toLowerCase().includes(q) ||
            levelLabel(m.permissionLevel).toLowerCase().includes(q) ||
            (rolesByMember.get(m.id) ?? []).some((r) =>
              r.name.toLowerCase().includes(q),
            ),
        )
      : members;
    // sortTextOf reads robots, memberNameMap and rolesByMember, all listed below
    return sortMembers(filtered, sort, sortTextOf);
  }, [members, search, sort, rolesByMember, memberNameMap, robots]);

  function startEdit(member: MemberRow) {
    setEditingId(member.id);
    setEditState({
      id: member.id,
      nickname: member.nickname,
      position: member.position,
      subteam: member.subteam,
      robot: member.robot,
      permissionLevel: member.permissionLevel,
      supervisorIds: member.supervisorIds ?? [],
      roleIds: roleIdsOf(member.id),
    });
    setEditError(null);
    setDeleteConfirmId(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditState(null);
    setEditError(null);
  }

  function handleSaveEdit() {
    if (!editState) return;
    setEditError(null);
    startRowTransition(async () => {
      const original = members.find((m) => m.id === editState.id);
      if (!original) return;

      const profileChanged =
        original.nickname !== editState.nickname ||
        original.position !== editState.position ||
        original.subteam !== editState.subteam ||
        original.robot !== editState.robot;
      const levelChanged =
        original.permissionLevel !== editState.permissionLevel;
      const supervisorChanged =
        JSON.stringify(original.supervisorIds) !== JSON.stringify(editState.supervisorIds);
      const rolesChanged =
        canEditRoles &&
        JSON.stringify(roleIdsOf(original.id).sort()) !==
          JSON.stringify([...editState.roleIds].sort());

      if (profileChanged) {
        const result = await updateMemberProfile(editState.id, {
          nickname: editState.nickname,
          position: editState.position,
          subteam: editState.subteam,
          robot: editState.robot,
        });
        if (!result.ok) {
          setEditError(result.error);
          return;
        }
      }

      if (levelChanged) {
        const result = await updateMemberLevel(
          editState.id,
          editState.permissionLevel,
        );
        if (!result.ok) {
          setEditError(result.error);
          return;
        }
      }

      if (supervisorChanged) {
        const result = await updateMemberSupervisors(
          editState.id,
          editState.supervisorIds,
        );
        if (!result.ok) {
          setEditError(result.error);
          return;
        }
      }

      // After the level, so approving someone and giving them roles can
      // happen in one save
      if (rolesChanged) {
        const result = await setMemberRoles(editState.id, editState.roleIds);
        if (!result.ok) {
          setEditError(result.error);
          return;
        }
      }

      // Refresh from Firestore
      const updated = await getMembersAndRoles();
      setMembers(updated.members);
      setRoles(updated.roles);
      setEditingId(null);
      setEditState(null);
    });
  }

  function handleDelete(id: string) {
    setDeleteError(null);
    startDeleteTransition(async () => {
      const result = await deleteMember(id);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setMembers((prev) => prev.filter((m) => m.id !== id));
      setDeleteConfirmId(null);
    });
  }

  const inputClass =
    "w-full rounded border border-black/20 bg-white px-2 py-1 text-sm text-black focus:outline-none focus:ring-2 focus:ring-lambert-maroon/25 dark:border-white/20 dark:bg-white/5 dark:text-white dark:focus:ring-lambert-silver/25";

  return (
    <div className="space-y-4">
      {/* Search. Sorting is done by clicking the column headers */}
      <div className="relative sm:max-w-sm">
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40 dark:text-white/45"
        >
          <circle cx="9" cy="9" r="5.5" />
          <path d="M13 13l4 4" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, position, level..."
          aria-label="Search members"
          className="w-full rounded-md border border-zinc-300/80 bg-white py-2 pl-9 pr-3 text-sm text-black outline-none ring-offset-1 focus:border-lambert-maroon focus:ring-2 focus:ring-lambert-maroon/20 dark:border-white/20 dark:bg-white/5 dark:text-white dark:placeholder-white/55 dark:focus:border-lambert-silver/60 dark:focus:ring-lambert-silver/15"
        />
      </div>

      {/* Table */}
      {members.length === 0 ? (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/50 dark:border-white/10 dark:bg-white/5 dark:text-white/50">
          No users registered yet.
        </div>
      ) : displayMembers.length === 0 ? (
        <div className="rounded-lg border border-black/10 bg-white p-8 text-center text-sm text-black/50 dark:border-white/10 dark:bg-white/5 dark:text-white/50">
          No users match your search.
        </div>
      ) : (
        <div className="custom-scrollbar overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-black/[0.03] dark:border-white/10 dark:bg-white/[0.03]">
                <SortHeader
                  label="Name"
                  column="name"
                  sort={sort}
                  onSort={handleSort}
                  className="min-w-[150px] px-4 py-2.5 text-left font-medium text-black/60 dark:text-white/60"
                />
                <SortHeader
                  label="Position"
                  column="position"
                  sort={sort}
                  onSort={handleSort}
                  className="hidden min-w-[130px] px-4 py-2.5 text-left font-medium text-black/60 sm:table-cell dark:text-white/60"
                />
                <SortHeader
                  label="Robot"
                  column="robot"
                  sort={sort}
                  onSort={handleSort}
                  className="min-w-[120px] px-4 py-2.5 text-left font-medium text-black/60 dark:text-white/60"
                />
                <SortHeader
                  label="Level"
                  column="level"
                  sort={sort}
                  onSort={handleSort}
                  className="min-w-[130px] px-4 py-2.5 text-left font-medium text-black/60 dark:text-white/60"
                />
                <SortHeader
                  label="Supervisor"
                  column="supervisor"
                  sort={sort}
                  onSort={handleSort}
                  className="hidden min-w-[150px] px-4 py-2.5 text-left font-medium text-black/60 sm:table-cell dark:text-white/60"
                />
                <SortHeader
                  label="Roles"
                  column="roles"
                  sort={sort}
                  onSort={handleSort}
                  className="hidden min-w-[150px] px-4 py-2.5 text-left font-medium text-black/60 sm:table-cell dark:text-white/60"
                />
                <th className="px-4 py-2.5 text-right font-medium text-black/60 dark:text-white/60" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 dark:divide-white/5">
              {displayMembers.map((member) => {
                const isEditing = editingId === member.id;
                const isSelf = member.id === currentUserId;
                const cellClass = "px-4 py-2 align-middle";

                if (isEditing && editState) {
                  return (
                    <tr
                      key={member.id}
                      className="bg-black/[0.015] dark:bg-white/[0.03]"
                    >
                      <td className={cellClass}>
                        <input
                          value={editState.nickname}
                          onChange={(e) =>
                            setEditState({
                              ...editState,
                              nickname: e.target.value,
                            })
                          }
                          className={inputClass}
                          placeholder="Name"
                        />
                        <input
                          value={editState.subteam}
                          onChange={(e) =>
                            setEditState({
                              ...editState,
                              subteam: e.target.value,
                            })
                          }
                          className={`${inputClass} mt-1`}
                          placeholder="Subteam"
                        />
                      </td>
                      <td className={`hidden sm:table-cell ${cellClass}`}>
                        <input
                          value={editState.position}
                          onChange={(e) =>
                            setEditState({
                              ...editState,
                              position: e.target.value,
                            })
                          }
                          className={inputClass}
                        />
                      </td>
                      <td className={cellClass}>
                        <CustomSelect
                          name="robot"
                          value={editState.robot}
                          onChange={(v) =>
                            setEditState({
                              ...editState,
                              robot: v,
                            })
                          }
                          options={[
                            { value: "", label: "Unassigned" },
                            ...robots.map((r) => ({
                              value: r.id,
                              label: r.label,
                            })),
                          ]}
                        />
                      </td>
                      <td className={cellClass}>
                        {isSelf ? (
                          <LevelBadge level={member.permissionLevel} />
                        ) : (
                          <CustomSelect
                            name="permissionLevel"
                            value={String(editState.permissionLevel)}
                            onChange={(v) =>
                              setEditState({
                                ...editState,
                                permissionLevel: Number(v),
                              })
                            }
                            options={LEVEL_OPTIONS.filter((l) => l >= myLevel).map((l) => ({
                              value: String(l),
                              label: levelLabel(l),
                            }))}
                            searchable
                          />
                        )}
                      </td>
                      <td className={`hidden sm:table-cell ${cellClass}`}>
                        <CustomMultiSelect
                          name="supervisorIds"
                          value={editState.supervisorIds}
                          onChange={(v) =>
                            setEditState({
                              ...editState,
                              supervisorIds: v,
                            })
                          }
                          options={supervisorOptions(editState.id)}
                        />
                      </td>
                      <td className={`hidden sm:table-cell ${cellClass}`}>
                        {canEditRoles ? (
                          <CustomMultiSelect
                            name="roleIds"
                            value={editState.roleIds}
                            onChange={(v) =>
                              setEditState({
                                ...editState,
                                roleIds: v,
                              })
                            }
                            options={roles.map((r) => ({
                              value: r.id,
                              label: r.name,
                            }))}
                          />
                        ) : (
                          <RoleBadges roles={rolesByMember.get(member.id) ?? []} />
                        )}
                      </td>
                      <td className={`${cellClass} text-right`}>
                        <div className="flex items-center justify-end gap-2">
                          {editError && (
                            <span className="text-xs text-red-600 dark:text-red-400">
                              {editError}
                            </span>
                          )}
                          <button
                            onClick={handleSaveEdit}
                            disabled={rowPending}
                            className="rounded bg-lambert-maroon px-2.5 py-1 text-xs font-semibold text-white hover:bg-lambert-maroon-deep disabled:opacity-50"
                          >
                            {rowPending ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={rowPending}
                            className="rounded border border-black/20 px-2.5 py-1 text-xs font-medium text-black/70 hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:text-white/70 dark:hover:bg-white/10"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                const supervisorName = supervisorNamesOf(member).join(", ") || "-";

                const robotLabel = robotLabelOf(member) || "-";

                return (
                  <tr
                    key={member.id}
                    className="bg-white hover:bg-black/[0.015] dark:bg-transparent dark:hover:bg-white/[0.02]"
                  >
                    <td className={`${cellClass} text-black dark:text-white`}>
                      <div>
                        {member.nickname}
                        {isSelf && (
                          <span className="ml-1.5 text-xs text-black/30 dark:text-white/30">
                            (you)
                          </span>
                        )}
                      </div>
                      {member.subteam && (
                        <div className="text-xs text-black/50 dark:text-white/50">
                          {member.subteam}
                        </div>
                      )}
                    </td>
                    <td
                      className={`hidden sm:table-cell ${cellClass} text-black/70 dark:text-white/70`}
                    >
                      {member.position || "-"}
                    </td>
                    <td
                      className={`${cellClass} text-black/70 dark:text-white/70`}
                    >
                      {robotLabel}
                    </td>
                    <td className={cellClass}>
                      <LevelBadge level={member.permissionLevel} />
                    </td>
                    <td
                      className={`hidden sm:table-cell ${cellClass} text-black/70 dark:text-white/70`}
                    >
                      {supervisorName}
                    </td>
                    <td
                      className={`hidden sm:table-cell ${cellClass} text-black/70 dark:text-white/70`}
                    >
                      <RoleBadges roles={rolesByMember.get(member.id) ?? []} />
                    </td>
                    <td className={`${cellClass} text-right`}>
                      {canEdit && !isAboveMe(member) ? (
                      <div className="flex items-center justify-end gap-2">
                        {!isSelf && (
                        <button
                          onClick={() => startEdit(member)}
                          disabled={rowPending || !!editingId}
                          className="rounded border border-black/15 px-2.5 py-1 text-xs font-medium text-black/70 hover:bg-black/5 disabled:opacity-40 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
                        >
                          Edit
                        </button>
                        )}
                        {!isSelf && (
                          <>
                            <button
                              onClick={() => {
                                setDeleteConfirmId(
                                  deleteConfirmId === member.id
                                    ? null
                                    : member.id,
                                );
                                setDeleteError(null);
                              }}
                              disabled={rowPending || !!editingId}
                              className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                      ) : null}

                      {/* Delete confirmation */}
                      {deleteConfirmId === member.id && (
                        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-left dark:border-red-500/30 dark:bg-red-900/10">
                          <p className="mb-2 text-xs text-red-700 dark:text-red-300">
                            Permanently delete{" "}
                            <strong>{member.nickname}</strong>? This cannot be
                            undone.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDelete(member.id)}
                              disabled={deletePending}
                              className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {deletePending ? "Deleting..." : "Yes, Delete"}
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="text-xs text-red-700/60 hover:text-red-700 dark:text-red-400/60 dark:hover:text-red-400"
                            >
                              Cancel
                            </button>
                          </div>
                          {deleteError && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                              {deleteError}
                            </p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
