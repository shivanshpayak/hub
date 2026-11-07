import { useEffect, useState } from "react";
import { TopBar } from "../TopBar";

// The scouting roster, kept from ManuQueue's members. The work is done by
// ManuQueue's /api/scouting/roster (manu-orders/src/lib/scouting-roster.ts)

type Plan = {
  members: { id: string; name: string; team: "lambda" | "gamma" | null }[];
  kept: string[];
  added: string[];
  dropped: string[];
  teamsKept: string[];
  sameName: string[];
  updatedBefore: boolean;
};

type Status = "loading" | "ready" | "signed-out" | "not-allowed" | "error";

function Names({ title, names, note }: { title: string; names: string[]; note?: string }) {
  return (
    <>
      <h2>
        {title} ({names.length})
      </h2>
      {note && names.length > 0 && <p>{note}</p>}
      {names.length === 0 ? (
        <p>None</p>
      ) : (
        <ul>
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ScoutingRosterPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/scouting/roster")
      .then(async (res) => {
        if (res.status === 401) return setStatus("signed-out");
        if (res.status === 403) return setStatus("not-allowed");
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error ?? "Could not read the scouting roster");
          return setStatus("error");
        }
        setPlan(data);
        setStatus("ready");
      })
      .catch(() => {
        setError("Could not read the scouting roster");
        setStatus("error");
      });
  }, []);

  async function update() {
    if (!plan) return;
    if (
      plan.dropped.length > 0 &&
      !window.confirm(
        `This takes ${plan.dropped.length} ${plan.dropped.length === 1 ? "person" : "people"} off the scouting roster. Update anyway?`,
      )
    ) {
      return;
    }
    setUpdating(true);
    setMessage(null);
    try {
      const res = await fetch("/api/scouting/roster", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessage(data?.error ?? "Could not update the roster");
        return;
      }
      const first = !plan.updatedBefore;
      setPlan(data);
      setMessage(
        first
          ? "Updated. From now on, changes on the Members page reach scouting by themselves"
          : "Updated",
      );
    } catch {
      setMessage("Could not update the roster");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <>
      <TopBar />
      <main className="hub-main">
      <h1>Scouting roster</h1>
      <p>
        Everyone approved in ManuQueue goes on the scouting roster. People already on it keep
        their place, so their checkmarks and assignments stay. The checkmarks on each comp still
        decide who scouts.
      </p>

      {status === "loading" && <p>Loading</p>}
      {status === "signed-out" && <p>Sign in to see the scouting roster</p>}
      {status === "not-allowed" && <p>Only Leadership and Admin can update the scouting roster</p>}
      {status === "error" && <p>{error}</p>}

      {status === "ready" && plan && (
        <>
          <p>
            <strong>
              {plan.updatedBefore
                ? "ManuQueue keeps this roster up to date. Changes on the Members page reach scouting by themselves."
                : "Not updated from ManuQueue yet. Until you update it here, scouting keeps its own roster."}
            </strong>
          </p>

          <Names title="Already on the roster, keeping their place" names={plan.kept} />
          <Names title="Added" names={plan.added} />
          <Names
            title="Taken off, no account with this name"
            names={plan.dropped}
            note="If someone should stay, make their name match on the Members page first."
          />
          <Names
            title="No robot in ManuQueue, keeping their scouting team"
            names={plan.teamsKept}
          />
          <Names
            title="Same name as someone else"
            names={plan.sameName}
            note="Scouting shows only one person per name, so give each a different name first."
          />

          <p>
            <button onClick={update} disabled={updating}>
              Update the scouting roster
            </button>{" "}
            {message}
          </p>
        </>
      )}
      </main>
    </>
  );
}
