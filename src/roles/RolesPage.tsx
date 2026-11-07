import { useEffect, useState, type FormEvent } from "react";
import { TopBar } from "../TopBar";

// Roles live on ManuQueue's server, see /api/roles there

type Role = { id: string; name: string; memberIds: string[] };
type Member = { id: string; name: string };

type Status = "loading" | "ready" | "signed-out" | "not-allowed" | "error";

const JSON_HEADERS = { "content-type": "application/json" };

export function RolesPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [newRoleId, setNewRoleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/roles")
      .then(async (res) => {
        if (res.status === 401) return setStatus("signed-out");
        if (res.status === 403) return setStatus("not-allowed");
        if (!res.ok) return setStatus("error");
        const data = await res.json();
        setRoles(data.roles);
        setMembers(data.members);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, []);

  async function createRole() {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(data?.error ?? "Could not create the role");
        return;
      }
      setRoles((current) => [...current, data.role]);
      setNewRoleId(data.role.id);
    } catch {
      setCreateError("Could not create the role");
    } finally {
      setCreating(false);
    }
  }

  function replaceRole(saved: Role) {
    setRoles((current) => current.map((r) => (r.id === saved.id ? saved : r)));
  }

  return (
    <>
      <TopBar />
      <main className="hub-main">
      <h1>Roles</h1>

      {status === "loading" && <p>Loading</p>}
      {status === "signed-out" && <p>Sign in to manage roles</p>}
      {status === "not-allowed" && <p>Only Leadership and Admin can manage roles</p>}
      {status === "error" && <p>Could not load roles</p>}

      {status === "ready" && (
        <>
          <p>
            <button onClick={createRole} disabled={creating}>
              Create role
            </button>{" "}
            {createError}
          </p>

          {roles.length === 0 && <p>No roles yet</p>}

          {roles.map((role) => (
            <RoleEditor
              key={role.id}
              role={role}
              members={members}
              isNew={role.id === newRoleId}
              onSaved={replaceRole}
            />
          ))}
        </>
      )}
      </main>
    </>
  );
}

function RoleEditor({
  role,
  members,
  isNew,
  onSaved,
}: {
  role: Role;
  members: Member[];
  isNew: boolean;
  onSaved: (role: Role) => void;
}) {
  const [name, setName] = useState(role.name);
  const [memberIds, setMemberIds] = useState(() => new Set(role.memberIds));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function toggleMember(id: string) {
    setMemberIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMessage(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name, memberIds: [...memberIds] }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Could not save");
        return;
      }
      onSaved(data.role);
      setName(data.role.name);
      setMessage("Saved");
    } catch {
      setMessage("Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <details open={isNew}>
      <summary>
        {role.name} ({role.memberIds.length})
      </summary>
      <form onSubmit={save}>
        <p>
          <label>
            Name{" "}
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setMessage(null);
              }}
              maxLength={50}
              required
              autoFocus={isNew}
            />
          </label>
        </p>
        <fieldset>
          <legend>Who has this role</legend>
          {members.length === 0 && <p>No members to pick from</p>}
          {members.map((member) => (
            <div key={member.id}>
              <label>
                <input
                  type="checkbox"
                  checked={memberIds.has(member.id)}
                  onChange={() => toggleMember(member.id)}
                />{" "}
                {member.name}
              </label>
            </div>
          ))}
        </fieldset>
        <p>
          <button type="submit" disabled={saving}>
            Save
          </button>{" "}
          {message}
        </p>
      </form>
    </details>
  );
}
